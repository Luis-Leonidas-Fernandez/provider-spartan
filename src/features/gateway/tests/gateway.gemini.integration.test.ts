import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { providerGatewayPlugin } from "../../../fastify/provider-gateway.plugin.js";
import { createTestDatabaseUrl } from "../../../test/helpers/test-db.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stubGeminiOAuthFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({
        access_token: "gemini-access-token",
        refresh_token: "gemini-refresh-token",
        expires_in: 3600,
        scope: "openid https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://www.googleapis.com/oauth2/v1/userinfo")) {
      return new Response(JSON.stringify({
        email: "gemini@example.com",
        name: "Gemini User",
        id: "google-sub-123",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist") {
      return new Response(JSON.stringify({
        cloudaicompanionProject: { id: "project-123" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected fetch url ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createInstalledLocator(pathname = "/usr/local/bin/agy", version = "agy 1.2.3") {
  return {
    locate: vi.fn(async () => ({
      installed: true as const,
      executablePath: pathname,
      version,
      searchedLocations: [pathname],
    })),
  };
}

function createGeminiCliTestRunner(
  implementation: (args: string[], options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    signal: NodeJS.Signals | null;
  }>,
) {
  return {
    run: vi.fn(async (args: string[], options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv } = {}) => {
      if (args.includes("--help")) {
        return {
          exitCode: 0,
          stdout: "Usage: agy [options]\n  models\n  login\n  logout\n  --model <id>\n  --print <prompt>\n  --json\n",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (args.includes("--version")) {
        return {
          exitCode: 0,
          stdout: "agy 1.2.3\n",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (args[0] === "models") {
        return {
          exitCode: 0,
          stdout: "Gemini 3.5 Flash (Medium)\nGemini 3.1 Pro (High)\n",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      return await implementation(args, options);
    }),
  };
}

async function createGeminiGatewayApp(options?: {
  antigravityCliRunner?: { run: ReturnType<typeof vi.fn> };
  antigravityCliMaxConcurrentProcesses?: number;
  antigravityCliMaxQueuedProcesses?: number;
}) {
  stubGeminiOAuthFetch();

  const module = createProviderGatewayModule({
    databaseUrl: createTestDatabaseUrl(),
    appApiKeyPepper: "test-pepper",
    credentialEncryptionKey: "test-encryption-secret",
    allowInsecureCredentialStorage: false,
    logLevel: "error",
    appEnv: "test",
    publicBaseUrl: "http://127.0.0.1:20128",
    providerAuthPublicBaseUrl: "http://127.0.0.1:20128",
    antigravityCliLocator: createInstalledLocator(),
    ...(options?.antigravityCliRunner ? { antigravityCliRunner: options.antigravityCliRunner } : {}),
    ...(options?.antigravityCliMaxConcurrentProcesses !== undefined ? { antigravityCliMaxConcurrentProcesses: options.antigravityCliMaxConcurrentProcesses } : {}),
    ...(options?.antigravityCliMaxQueuedProcesses !== undefined ? { antigravityCliMaxQueuedProcesses: options.antigravityCliMaxQueuedProcesses } : {}),
  });

  const app = Fastify({ logger: false });
  await app.register(providerGatewayPlugin, {
    module,
    prefix: "",
    appApiKeyPepper: "test-pepper",
  });

  const appClientResponse = await app.inject({ method: "POST", url: "/app-clients", payload: { name: "police" } });
  const appClientPayload = appClientResponse.json() as { appClient: { id: string }; apiKey: string };

  const planResponse = await app.inject({
    method: "POST",
    url: "/subscription-plans",
    payload: {
      name: "starter",
      monthlyRequestLimit: 100,
      monthlyTokenLimit: 100000,
      monthlyBudgetUsd: 20,
      allowedProvidersJson: "[]",
      allowedModelsJson: "[]",
      isActive: true,
    },
  });
  const plan = planResponse.json() as { id: string };

  await app.inject({
    method: "POST",
    url: "/app-subscriptions",
    payload: {
      appClientId: appClientPayload.appClient.id,
      planId: plan.id,
      status: "active",
      startsAt: "2024-01-01T00:00:00.000Z",
    },
  });

  const connectResponse = await app.inject({
    method: "GET",
    url: "/gemini/connect",
    headers: { host: "127.0.0.1:20128" },
    remoteAddress: "127.0.0.1",
  });
  expect(connectResponse.statusCode).toBe(302);
  const location = connectResponse.headers.location;
  expect(location).toBeTruthy();
  const state = location ? new URL(location).searchParams.get("state") : null;
  expect(state).toBeTruthy();

  const callbackResponse = await app.inject({
    method: "GET",
    url: `/auth/gemini/callback?state=${encodeURIComponent(String(state))}&code=gemini-code-123`,
  });
  expect(callbackResponse.statusCode).toBe(200);

  return { app, module, apiKey: appClientPayload.apiKey };
}

describe("gateway gemini antigravity integration", () => {
  it("routes gemini through /v1/chat/completions", async () => {
    const antigravityCliRunner = createGeminiCliTestRunner(async (args: string[]) => {
        expect(args).toEqual(expect.arrayContaining(["--model", "pro"]));
        return {
          exitCode: 0,
          stdout: "conectado\n",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      });
    const { app, apiKey } = await createGeminiGatewayApp({ antigravityCliRunner });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "gemini/gemini-2.5-pro",
        messages: [{ role: "user", content: "Respondé conectado" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      model: "gemini-2.5-pro",
      choices: [{ index: 0, message: { role: "assistant", content: "conectado" } }],
    });

    const usageEventsResponse = await app.inject({ method: "GET", url: "/usage/events", headers: { authorization: `Bearer ${apiKey}` } });
    const usageEvents = usageEventsResponse.json() as Array<{ usageSource: string }>;
    expect(usageEvents[0]?.usageSource).toBe("estimated");

    await app.close();
  });

  it("maps gemini local timeout to gateway_timeout on /v1/chat/completions", async () => {
    const antigravityCliRunner = createGeminiCliTestRunner(async () => {
        const error = new Error("Antigravity CLI timed out after 10ms");
        (error as Error & { code?: string }).code = "ETIMEDOUT";
        throw error;
      });
    const { app, apiKey } = await createGeminiGatewayApp({ antigravityCliRunner });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "gemini/gemini-2.5-pro",
        messages: [{ role: "user", content: "Decí hola" }],
      },
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toMatchObject({
      error: "gateway_timeout",
    });

    await app.close();
  });

  it("rejects concurrent gemini executions when the local queue is saturated", async () => {
    const firstRelease = deferred<void>();
    const firstStarted = vi.fn();
    const antigravityCliRunner = createGeminiCliTestRunner(async () => {
        firstStarted();
        await firstRelease.promise;
        return {
          exitCode: 0,
          stdout: "primero\n",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      });
    const { app, apiKey } = await createGeminiGatewayApp({
      antigravityCliRunner,
      antigravityCliMaxConcurrentProcesses: 1,
      antigravityCliMaxQueuedProcesses: 0,
    });

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "gemini/gemini-2.5-pro",
        messages: [{ role: "user", content: "Primero" }],
      },
    });
    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledTimes(1));

    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "gemini/gemini-2.5-pro",
        messages: [{ role: "user", content: "Segundo" }],
      },
    });

    expect(secondResponse.statusCode).toBe(502);
    expect(secondResponse.json()).toMatchObject({
      error: "provider_busy",
      message: "Local CLI provider is busy and queueing is disabled",
    });

    firstRelease.resolve();
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.statusCode).toBe(200);

    await app.close();
  });

  it("cancels gemini local execution when the request signal is aborted", async () => {
    const started = deferred<void>();
    const antigravityCliRunner = createGeminiCliTestRunner(async (_args: string[], options: { signal?: AbortSignal }) => {
        started.resolve();
        return await new Promise((_, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
        });
      });
    const { app, module, apiKey } = await createGeminiGatewayApp({ antigravityCliRunner });
    const controller = new AbortController();

    const requestPromise = module.gateway.handleChatCompletion.execute({
      authorizationHeader: `Bearer ${apiKey}`,
      signal: controller.signal,
      body: {
        model: "gemini/gemini-2.5-pro",
        messages: [{ role: "user", content: "Cancelame" }],
      },
    });

    await started.promise;
    controller.abort(new Error("Client disconnected"));

    await expect(requestPromise).rejects.toMatchObject({
      code: "process_cancelled",
      statusCode: 502,
    });

    await app.close();
  });

  it("returns queue_full when the Gemini queue capacity is exhausted", async () => {
    const firstRelease = deferred<void>();
    const started: string[] = [];
    const antigravityCliRunner = createGeminiCliTestRunner(async (_args: string[], options: { signal?: AbortSignal }) => {
        const label = started.length === 0 ? "first" : "second";
        started.push(label);
        return await new Promise((resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
          if (label === "first") {
            void firstRelease.promise.then(() => resolve({
              exitCode: 0,
              stdout: `${label}\n`,
              stderr: "",
              timedOut: false,
              signal: null,
            }));
            return;
          }
        });
      });

    const { app, module, apiKey } = await createGeminiGatewayApp({
      antigravityCliRunner,
      antigravityCliMaxConcurrentProcesses: 1,
      antigravityCliMaxQueuedProcesses: 1,
    });

    const firstResponsePromise = module.gateway.handleChatCompletion.execute({
      authorizationHeader: `Bearer ${apiKey}`,
      body: { model: "gemini/gemini-2.5-pro", messages: [{ role: "user", content: "Primero" }] },
    });
    await vi.waitFor(() => expect(started).toEqual(["first"]));

    const secondController = new AbortController();
    const secondResponsePromise = module.gateway.handleChatCompletion.execute({
      authorizationHeader: `Bearer ${apiKey}`,
      signal: secondController.signal,
      body: { model: "gemini/gemini-2.5-pro", messages: [{ role: "user", content: "Segundo" }] },
    });

    await expect(module.gateway.handleChatCompletion.execute({
      authorizationHeader: `Bearer ${apiKey}`,
      body: { model: "gemini/gemini-2.5-pro", messages: [{ role: "user", content: "Tercero" }] },
    })).rejects.toMatchObject({
      code: "queue_full",
      statusCode: 502,
      message: "Local CLI process queue is full",
    });

    firstRelease.resolve();
    await expect(firstResponsePromise).resolves.toMatchObject({ model: "gemini-2.5-pro" });
    secondController.abort(new Error("cleanup"));
    await Promise.allSettled([secondResponsePromise]);

    await app.close();
  });
});
