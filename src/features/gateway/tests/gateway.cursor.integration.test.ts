import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { providerGatewayPlugin } from "../../../fastify/provider-gateway.plugin.js";
import { createTestDatabaseUrl } from "../../../test/helpers/test-db.js";

function createInstalledCursorLocator(pathname = "/usr/local/bin/agent", executableName: "agent" | "cursor-agent" = "agent") {
  return {
    locate: vi.fn(async () => ({
      installed: true as const,
      executableName,
      executablePath: pathname,
      version: "Cursor CLI 1.0.0",
      searchedCandidates: [executableName],
      searchedLocations: [pathname],
    })),
  };
}

function createCursorCliRunner(
  implementation: (args: string[], options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    signal: NodeJS.Signals | null;
  }>,
) {
  let authenticated = true;
  return {
    run: vi.fn(async (args: string[], options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string } = {}) => {
      const command = args.join(" ");
      if (command === "--help") {
        return {
          exitCode: 0,
          stdout: "Usage: agent\nCommands: status login models logout\n--model --print --json",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "status --help") {
        return {
          exitCode: 0,
          stdout: "status --json",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "login --help") {
        return {
          exitCode: 0,
          stdout: "login",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "models --help") {
        return {
          exitCode: 0,
          stdout: "models --json",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "logout --help" || command === "--version") {
        return {
          exitCode: 0,
          stdout: "Cursor CLI 1.0.0",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "logout") {
        authenticated = false;
        return {
          exitCode: 0,
          stdout: "logged out",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "models --json") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            models: [
              { id: "cursor-fast", displayName: "Cursor Fast" },
              { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6" },
            ],
          }),
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "status --json") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ authenticated, models: authenticated ? ["cursor-fast"] : [] }),
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      return await implementation(args, options);
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function createCursorGatewayApp(options?: {
  cursorCliRunner?: { run: ReturnType<typeof vi.fn> };
  cursorCliMaxConcurrentProcesses?: number;
  cursorCliMaxQueuedProcesses?: number;
}) {
  const module = createProviderGatewayModule({
    databaseUrl: createTestDatabaseUrl(),
    appApiKeyPepper: "test-pepper",
    credentialEncryptionKey: "test-encryption-secret",
    allowInsecureCredentialStorage: false,
    logLevel: "error",
    appEnv: "test",
    cursorCliLocator: createInstalledCursorLocator(),
    ...(options?.cursorCliRunner ? { cursorCliRunner: options.cursorCliRunner } : {}),
    ...(options?.cursorCliMaxConcurrentProcesses !== undefined ? { cursorCliMaxConcurrentProcesses: options.cursorCliMaxConcurrentProcesses } : {}),
    ...(options?.cursorCliMaxQueuedProcesses !== undefined ? { cursorCliMaxQueuedProcesses: options.cursorCliMaxQueuedProcesses } : {}),
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

  const providerResponse = await app.inject({
    method: "POST",
    url: "/providers",
    payload: {
      name: "Cursor CLI Subscription",
      providerType: "cursor",
      accessMode: "local",
      isEnabled: true,
      isDefault: false,
      supportsUsageReporting: false,
      supportsStreaming: false,
    },
  });
  expect(providerResponse.statusCode).toBe(201);

  return { app, module, apiKey: appClientPayload.apiKey };
}

describe("gateway cursor local integration", () => {
  it("routes cursor local through /v1/chat/completions", async () => {
    const cursorCliRunner = createCursorCliRunner(async (args: string[], options) => {
      expect(args).toEqual(expect.arrayContaining(["--model", "cursor-fast"]));
      expect(options.cwd).toBeTruthy();
      return {
        exitCode: 0,
        stdout: JSON.stringify({ content: "hola cursor" }),
        stderr: "",
        timedOut: false,
        signal: null,
      };
    });
    const { app, apiKey } = await createCursorGatewayApp({ cursorCliRunner });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "cursor/Cursor Fast",
        messages: [{ role: "user", content: "Decí hola cursor" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      model: "cursor-fast",
      choices: [{ index: 0, message: { role: "assistant", content: "hola cursor" } }],
      usage: {
        prompt_tokens: expect.any(Number),
        completion_tokens: expect.any(Number),
      },
    });

    await app.close();
  });

  it("maps cursor local timeout to gateway_timeout on /v1/chat/completions", async () => {
    const cursorCliRunner = createCursorCliRunner(async () => {
      const error = new Error("Cursor CLI timed out after 10ms");
      (error as Error & { code?: string }).code = "ETIMEDOUT";
      throw error;
    });
    const { app, apiKey } = await createCursorGatewayApp({ cursorCliRunner });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "cursor/Cursor Fast",
        messages: [{ role: "user", content: "Decí hola" }],
      },
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toMatchObject({
      error: "gateway_timeout",
    });

    await app.close();
  });

  it("rejects concurrent cursor executions when the local queue is saturated", async () => {
    const firstRelease = deferred<void>();
    const firstStarted = vi.fn();
    const cursorCliRunner = createCursorCliRunner(async () => {
      firstStarted();
      await firstRelease.promise;
      return {
        exitCode: 0,
        stdout: JSON.stringify({ content: "primero" }),
        stderr: "",
        timedOut: false,
        signal: null,
      };
    });
    const { app, apiKey } = await createCursorGatewayApp({
      cursorCliRunner,
      cursorCliMaxConcurrentProcesses: 1,
      cursorCliMaxQueuedProcesses: 0,
    });

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "cursor/Cursor Fast",
        messages: [{ role: "user", content: "Primero" }],
      },
    });
    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledTimes(1));

    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: "cursor/Cursor Fast",
        messages: [{ role: "user", content: "Segundo" }],
      },
    });

    expect(secondResponse.statusCode).toBe(502);
    expect(secondResponse.json()).toMatchObject({
      error: "provider_busy",
      message: "Local CLI provider is busy and queueing is disabled",
    });

    const statusWhileBusy = await app.inject({ method: "GET", url: "/cursor/status" });
    expect(statusWhileBusy.json()).toMatchObject({
      concurrency: { activeCount: 1, queuedCount: 0, maxConcurrent: 1, maxQueueSize: 0 },
    });

    firstRelease.resolve();
    await expect(firstResponsePromise).resolves.toMatchObject({ statusCode: 200 });

    await app.close();
  });

  it("cancels cursor local execution when the request signal is aborted", async () => {
    const started = deferred<void>();
    const cursorCliRunner = createCursorCliRunner(async (_args: string[], options) => {
      started.resolve();
      return await new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
      });
    });
    const { app, module, apiKey } = await createCursorGatewayApp({ cursorCliRunner });
    const controller = new AbortController();

    const requestPromise = module.gateway.handleChatCompletion.execute({
      authorizationHeader: `Bearer ${apiKey}`,
      signal: controller.signal,
      body: {
        model: "cursor/Cursor Fast",
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

  it("returns queue_full when the Cursor queue capacity is exhausted", async () => {
    const firstRelease = deferred<void>();
    const secondRelease = deferred<void>();
    const started: string[] = [];
    const cursorCliRunner = createCursorCliRunner(async (_args: string[], options) => {
      const label = started.length === 0 ? "first" : "second";
      started.push(label);
      const gate = label === "first" ? firstRelease : secondRelease;
      return await new Promise((resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
        void gate.promise.then(() => resolve({
          exitCode: 0,
          stdout: JSON.stringify({ content: label }),
          stderr: "",
          timedOut: false,
          signal: null,
        }));
      });
    });
    const { app, apiKey } = await createCursorGatewayApp({
      cursorCliRunner,
      cursorCliMaxConcurrentProcesses: 1,
      cursorCliMaxQueuedProcesses: 1,
    });

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { model: "cursor/Cursor Fast", messages: [{ role: "user", content: "Primero" }] },
    });
    await vi.waitFor(() => expect(started).toEqual(["first"]));

    const secondResponsePromise = app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { model: "cursor/Cursor Fast", messages: [{ role: "user", content: "Segundo" }] },
    });

    await vi.waitFor(async () => {
      const status = await app.inject({ method: "GET", url: "/cursor/status" });
      expect(status.json()).toMatchObject({
        concurrency: { activeCount: 1, queuedCount: 1, maxConcurrent: 1, maxQueueSize: 1 },
      });
    });

    const thirdResponse = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { model: "cursor/Cursor Fast", messages: [{ role: "user", content: "Tercero" }] },
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
