import Fastify from "fastify";
import { createProviderGatewayModule } from "./src/core/create-provider-gateway-module.ts";
import { providerGatewayPlugin } from "./src/fastify/provider-gateway.plugin.ts";
import { createTestDatabaseUrl } from "./src/test/helpers/test-db.ts";

function createClaudeCliStatusService() {
  return { inspect: async () => ({ provider:"claude-cli-subscription", executionMode:"local-cli", state:"ready", cli:{installed:true,path:"/usr/local/bin/claude",version:"1.0.0",searchedLocations:["/usr/local/bin/claude"]}, authentication:{authenticated:true,method:"claude-subscription"}, capabilities:{supportsAuthStatus:true,supportsAuthLogin:true,supportsPrintMode:true,supportsStdinInput:false,supportsStreamJsonInput:false,supportsStreamJsonOutput:true,supportsModelArgument:true,supportsSessionId:false,supportsResume:false,detectedArguments:["auth","login","--model","--output-format"]}, actions:[], message:"ok" }) };
}
function createFakeClaudeAuthLauncher() {
  let exitListener = null;
  return {
    launcher: {
      launch: async () => ({ write(){}, end(){}, kill(){}, onStdout(){}, onStderr(){}, onExit(listener){ exitListener=listener; }, onError(){} })
    },
    emitExit(code=0, signal=null){ exitListener?.({exitCode:code, signal}); }
  };
}
const fakeAuth=createFakeClaudeAuthLauncher();
const module = createProviderGatewayModule({
  databaseUrl: createTestDatabaseUrl(),
  appApiKeyPepper: "test-pepper",
  credentialEncryptionKey: "test-encryption-secret",
  allowInsecureCredentialStorage: false,
  logLevel: "error",
  appEnv: "test",
  claudeCliStatusService: createClaudeCliStatusService(),
  claudeAuthProcessLauncher: fakeAuth.launcher,
  claudeCliRunner: { run: async ()=>({exitCode:0,stdout:[JSON.stringify({type:"response.created",id:"msg_1"}),JSON.stringify({type:"content.delta",text:"hola"}),JSON.stringify({type:"response.completed",usage:{input_tokens:1,output_tokens:1,total_tokens:2}})].join("\n"),stderr:""}) }
});
const app = Fastify({logger:false});
await app.register(providerGatewayPlugin,{module,prefix:"",appApiKeyPepper:"test-pepper"});
let r = await app.inject({method:"POST",url:"/app-clients",payload:{name:"police"}});
const appClient = r.json();
r = await app.inject({method:"POST",url:"/subscription-plans",payload:{name:"starter",monthlyRequestLimit:100,monthlyTokenLimit:100000,monthlyBudgetUsd:20,allowedProvidersJson:"[]",allowedModelsJson:"[]",isActive:true}});
const plan = r.json();
await app.inject({method:"POST",url:"/app-subscriptions",payload:{appClientId:appClient.appClient.id,planId:plan.id,status:"active",startsAt:"2024-01-01T00:00:00.000Z"}});
r = await app.inject({method:"POST",url:"/claude/auth/start"});
console.log("start", r.statusCode, r.body);
fakeAuth.emitExit(0,null);
for (let i=0;i<10;i++) {
  const s = await app.inject({method:"GET",url:"/claude/status"});
  console.log("status", s.statusCode, s.body);
  const providers = await app.inject({method:"GET",url:"/providers"});
  console.log("providers", providers.statusCode, providers.body);
  if (JSON.parse(s.body).connected) break;
  await new Promise(r=>setTimeout(r,50));
}
r = await app.inject({method:"POST",url:"/v1/chat/completions",headers:{authorization:`Bearer ${appClient.apiKey}`},payload:{model:"claude/sonnet",messages:[{role:"user",content:"hola"}]}});
console.log("chat", r.statusCode, r.body);
await app.close();
