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

function createClaudeCliStatusService() {
  return {
    inspect: vi.fn(async () => ({
      provider: "claude-cli-subscription" as const,
      executionMode: "local-cli" as const,
      state: "ready" as const,
      cli: {
        installed: true,
        path: "/usr/local/bin/claude",
        version: "1.0.0",
        searchedLocations: ["/usr/local/bin/claude"],
      },
      authentication: { authenticated: true, method: "claude-subscription" as const },
      capabilities: {
        supportsAuthStatus: true,
        supportsAuthLogin: true,
        supportsPrintMode: true,
        supportsStdinInput: false,
        supportsStreamJsonInput: false,
        supportsStreamJsonOutput: true,
        supportsModelArgument: true,
        supportsSessionId: false,
        supportsResume: false,
        detectedArguments: ["auth", "login", "--model", "--output-format"],
      },
      actions: [],
      message: "Claude CLI detectado y sesión local disponible.",
    })),
  };
}

function createFakeClaudeAuthLauncher() {
  let exitListener: ((input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void) | null = null;

  return {
    launcher: {
      launch: vi.fn(async () => ({
        write() {},
        end() {},
        kill() {},
        onStdout() {},
        onStderr() {},
        onExit(listener: (input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void) {
          exitListener = listener;
        },
        onError() {},
      })),
    },
    emitExit(exitCode = 0, signal: NodeJS.Signals | null = null) {
      exitListener?.({ exitCode, signal });
    },
  };
}

async function createClaudeGatewayApp(options?: {
  claudeCliRunner?: { run: ReturnType<typeof vi.fn> };
  claudeCliMaxConcurrentProcesses?: number;
  claudeCliMaxQueuedProcesses?: number;
}) {
  const fakeAuth = createFakeClaudeAuthLauncher();
  const module = createProviderGatewayModule({
    databaseUrl: createTestDatabaseUrl(),
    appApiKeyPepper: "test-pepper",
    credentialEncryptionKey: "test-encryption-secret",
    allowInsecureCredentialStorage: false,
    logLevel: "error",
    appEnv: "test",
    claudeCliStatusService: createClaudeCliStatusService(),
    claudeAuthProcessLauncher: fakeAuth.launcher,
    ...(options?.claudeCliRunner ? { claudeCliRunner: options.claudeCliRunner } : {}),
    ...(options?.claudeCliMaxConcurrentProcesses !== undefined ? { claudeCliMaxConcurrentProcesses: options.claudeCliMaxConcurrentProcesses } : {}),
    ...(options?.claudeCliMaxQueuedProcesses !== undefined ? { claudeCliMaxQueuedProcesses: options.claudeCliMaxQueuedProcesses } : {}),
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

  const startResponse = await app.inject({ method: "POST", url: "/claude/auth/start" });
  expect(startResponse.statusCode).toBe(200);
  fakeAuth.emitExit(0, null);

  await vi.waitFor(async () => {
    const status = await app.inject({ method: "GET", url: "/claude/status" });
    expect(status.json()).toMatchObject({
      connected: true,
      authMethod: "claude-subscription-local-cli",
    });
  });

  return { app, module, apiKey: appClientPayload.apiKey };
}

describe("gateway claude local integration", () => {
  it("routes claude local through /v1/chat/completions", async () => {
    const claudeCliRunner = {
      run: vi.fn(async (args: string[], options: { env?: NodeJS.ProcessEnv }) => {
        expect(args).toEqual(expect.arrayContaining(["--model", "sonnet"]));
        expect(options.env?.ANTHROPIC_API_KEY).toBeUndefined();
        expect(options.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
        return {
          exitCode: 0,
          stdout: [
            JSON.stringify({ type: "response.created", id: "msg_123" }),
            JSON.stringify({ type: "content.delta", text: "hola" }),
            JSON.stringify({ type: "response.completed", usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 } }),
          ].join("\n"),
          stderr: "",
        };
      }),
    };
    const { app, apiKey } = await createClaudeGatewayApp({ claudeCliRunner });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "claude/sonnet",
        messages: [{ role: "user", content: "Decí hola" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      model: "sonnet",
      choices: [{ index: 0, message: { role: "assistant", content: "hola" } }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 5,
        total_tokens: 17,
      },
    });

    const usageEventsResponse = await app.inject({ method: "GET", url: "/usage/events", headers: { authorization: `Bearer ${apiKey}` } });
    const usageEvents = usageEventsResponse.json() as Array<{ usageSource: string; totalTokens: number }>;
    expect(usageEvents[0]?.usageSource).toBe("provider_reported");
    expect(usageEvents[0]?.totalTokens).toBe(17);

    await app.close();
  });

  it("maps claude local timeout to gateway_timeout on /v1/chat/completions", async () => {
    const claudeCliRunner = {
      run: vi.fn(async () => {
        const error = new Error("Claude CLI timed out after 10ms");
        (error as Error & { code?: string }).code = "ETIMEDOUT";
        throw error;
      }),
    };
    const { app, apiKey } = await createClaudeGatewayApp({ claudeCliRunner });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "claude/sonnet",
        messages: [{ role: "user", content: "Decí hola" }],
      },
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toMatchObject({
      error: "gateway_timeout",
    });

    await app.close();
  });

  it("rejects concurrent claude executions when the local queue is saturated", async () => {
    const firstRelease = deferred<void>();
    const firstStarted = vi.fn();
    const claudeCliRunner = {
      run: vi.fn(async () => {
        firstStarted();
        await firstRelease.promise;
        return {
          exitCode: 0,
          stdout: JSON.stringify({ result: "hola" }),
          stderr: "",
        };
      }),
    };
    const { app, apiKey } = await createClaudeGatewayApp({
      claudeCliRunner,
      claudeCliMaxConcurrentProcesses: 1,
      claudeCliMaxQueuedProcesses: 0,
    });

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "claude/sonnet",
        messages: [{ role: "user", content: "Primero" }],
      },
    });
    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledTimes(1));

    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "claude/sonnet",
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

  it("cancels claude local execution when the request signal is aborted", async () => {
    const started = deferred<void>();
    const claudeCliRunner = {
      run: vi.fn(async (_args: string[], options: { signal?: AbortSignal }) => {
        options.signal?.addEventListener("abort", () => undefined, { once: true });
        started.resolve();
        return await new Promise((_, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
        });
      }),
    };
    const { app, module, apiKey } = await createClaudeGatewayApp({ claudeCliRunner });
    const controller = new AbortController();

    const requestPromise = module.gateway.handleChatCompletion.execute({
      authorizationHeader: `Bearer ${apiKey}`,
      signal: controller.signal,
      body: {
        model: "claude/sonnet",
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

  it("returns queue_full when the Claude queue capacity is exhausted", async () => {
    const firstRelease = deferred<void>();
    const secondRelease = deferred<void>();
    const started: string[] = [];
    const claudeCliRunner = {
      run: vi.fn(async (_args: string[], options: { signal?: AbortSignal }) => {
        const label = started.length === 0 ? "first" : "second";
        started.push(label);
        const gate = label === "first" ? firstRelease : secondRelease;
        return await new Promise((resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
          void gate.promise.then(() => resolve({
            exitCode: 0,
            stdout: JSON.stringify({ result: label }),
            stderr: "",
          }));
        });
      }),
    };

    const { app, apiKey } = await createClaudeGatewayApp({
      claudeCliRunner,
      claudeCliMaxConcurrentProcesses: 1,
      claudeCliMaxQueuedProcesses: 1,
    });

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { model: "claude/sonnet", messages: [{ role: "user", content: "Primero" }] },
    });
    await vi.waitFor(() => expect(started).toEqual(["first"]));

    const secondResponsePromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { model: "claude/sonnet", messages: [{ role: "user", content: "Segundo" }] },
    });

    await vi.waitFor(async () => {
      const status = await app.inject({ method: "GET", url: "/claude/status" });
      expect(status.json()).toMatchObject({
        concurrency: { activeCount: 1, queuedCount: 1, maxConcurrent: 1, maxQueueSize: 1 },
      });
    });

    const thirdResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { model: "claude/sonnet", messages: [{ role: "user", content: "Tercero" }] },
    });

    expect(thirdResponse.statusCode).toBe(502);
    expect(thirdResponse.json()).toMatchObject({
      error: "queue_full",
      message: "Local CLI process queue is full",
    });

    firstRelease.resolve();
    await expect(firstResponsePromise).resolves.toMatchObject({ statusCode: 200 });
    await vi.waitFor(() => expect(started).toEqual(["first", "second"]));
    secondRelease.resolve();
    await expect(secondResponsePromise).resolves.toMatchObject({ statusCode: 200 });

    await app.close();
  });
});
