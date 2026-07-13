import Fastify from "fastify";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { providerGatewayPlugin } from "../../../fastify/provider-gateway.plugin.js";
import type { CursorCliCommandRunnerPort } from "../../../integrations/cursor-cli/cursor-cli.types.js";
import { createTestDatabaseUrl } from "../../../test/helpers/test-db.js";

function createMissingLocator() {
  return {
    locate: vi.fn(async () => ({
      installed: false as const,
      searchedCandidates: ["agent", "cursor-agent"],
      searchedLocations: ["/usr/local/bin/agent", "/opt/homebrew/bin/cursor-agent"],
    })),
  };
}

function createInstalledLocator(pathname = "/usr/local/bin/agent", executableName: "agent" | "cursor-agent" = "agent") {
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

function createCursorRunnerReady(initiallyAuthenticated = true) {
  let authenticated = initiallyAuthenticated;
  return {
    run: vi.fn(async (args: string[]) => {
      const command = args.join(" ");
      if (command === "--help") {
        return { exitCode: 0, stdout: "Usage: agent\nCommands: status login models\n--model --print", stderr: "", timedOut: false, signal: null };
      }
      if (command === "status --help") {
        return { exitCode: 0, stdout: "status --json", stderr: "", timedOut: false, signal: null };
      }
      if (command === "login --help") {
        return { exitCode: 0, stdout: "login", stderr: "", timedOut: false, signal: null };
      }
      if (command === "models --help") {
        return { exitCode: 0, stdout: "models", stderr: "", timedOut: false, signal: null };
      }
      if (command === "logout --help" || command === "--version") {
        return { exitCode: 0, stdout: "Cursor CLI 1.0.0", stderr: "", timedOut: false, signal: null };
      }
      if (command === "logout") {
        authenticated = false;
        return { exitCode: 0, stdout: "logged out", stderr: "", timedOut: false, signal: null };
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
      if (command.includes("--print")) {
        return {
          exitCode: 0,
          stdout: command.includes("--json")
            ? JSON.stringify({ content: "conectado" })
            : "conectado",
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      return { exitCode: 0, stdout: "", stderr: "", timedOut: false, signal: null };
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

function createFakeAuthLauncher() {
  let stdoutListener: ((chunk: string) => void) | null = null;
  let stderrListener: ((chunk: string) => void) | null = null;
  let exitListener: ((input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
  const writes: string[] = [];
  const kills: Array<NodeJS.Signals | undefined> = [];

  return {
    writes,
    kills,
    launcher: {
      launch: vi.fn(async () => ({
        write(input: string) {
          writes.push(input);
        },
        end() {},
        kill(signal?: NodeJS.Signals) {
          kills.push(signal);
        },
        onStdout(listener: (chunk: string) => void) {
          stdoutListener = listener;
        },
        onStderr(listener: (chunk: string) => void) {
          stderrListener = listener;
        },
        onExit(listener: (input: { exitCode: number | null; signal: NodeJS.Signals | null }) => void) {
          exitListener = listener;
        },
        onError() {},
      })),
    },
    emitStdout(text: string) {
      stdoutListener?.(text);
    },
    emitStderr(text: string) {
      stderrListener?.(text);
    },
    emitExit(exitCode = 0, signal: NodeJS.Signals | null = null) {
      exitListener?.({ exitCode, signal });
    },
  };
}

describe("cursor routes", () => {
  it("returns cli_not_installed when cursor cli is missing", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      cursorCliLocator: createMissingLocator(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const response = await app.inject({ method: "GET", url: "/cursor/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "cursor-cli-subscription",
      connected: false,
      reconnectRequired: true,
      state: "cli_not_installed",
      cli: {
        installed: false,
      },
      authentication: {
        authenticated: false,
      },
    });
    await app.close();
  });

  it("returns ready status and capabilities when cursor cli is available", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      cursorCliLocator: createInstalledLocator(),
      cursorCliRunner: createCursorRunnerReady(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const statusResponse = await app.inject({ method: "GET", url: "/cursor/status" });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      provider: "cursor-cli-subscription",
      connected: true,
      reconnectRequired: false,
      state: "ready",
      concurrency: {
        activeCount: 0,
        queuedCount: 0,
        maxConcurrent: 1,
        maxQueueSize: 10,
      },
      cli: {
        installed: true,
        executable: "agent",
      },
    });

    const capabilitiesResponse = await app.inject({ method: "GET", url: "/cursor/capabilities" });
    expect(capabilitiesResponse.statusCode).toBe(200);
    expect(capabilitiesResponse.json()).toMatchObject({
      provider: "cursor-cli-subscription",
      state: "ready",
      capabilities: {
        supportsStatus: true,
        supportsStatusJson: true,
        supportsModelArgument: true,
        supportsPrintMode: true,
      },
    });
    await app.close();
  });

  it("supports local auth flow start, input and disconnect", async () => {
    const auth = createFakeAuthLauncher();
    const runner = createCursorRunnerReady(true);
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      cursorCliLocator: createInstalledLocator(),
      cursorCliRunner: runner,
      cursorAuthProcessLauncher: auth.launcher,
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/cursor/connect" });
    expect(connectResponse.statusCode).toBe(200);
    expect(connectResponse.json()).toMatchObject({
      authStartUrl: "/cursor/auth/start",
    });

    const startResponse = await app.inject({ method: "POST", url: "/cursor/auth/start" });
    expect(startResponse.statusCode).toBe(200);
    const flowId = startResponse.json().flowId as string;
    expect(flowId).toBeTruthy();

    auth.emitStdout("Open https://cursor.example/login?code=secret");
    const snapshotResponse = await app.inject({ method: "GET", url: `/cursor/auth/${flowId}` });
    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "open_url" }),
    ]));

    const inputResponse = await app.inject({
      method: "POST",
      url: `/cursor/auth/${flowId}/input`,
      payload: { value: "123456" },
    });
    expect(inputResponse.statusCode).toBe(200);
    expect(auth.writes).toEqual(["123456\n"]);

    auth.emitExit(0, null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const disconnectResponse = await app.inject({ method: "DELETE", url: "/cursor/disconnect" });
    expect(disconnectResponse.statusCode).toBe(200);
    expect(disconnectResponse.json()).toMatchObject({
      loggedOut: true,
    });
    await app.close();
  });

  it("lists cursor models from the local cli", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      cursorCliLocator: createInstalledLocator(),
      cursorCliRunner: createCursorRunnerReady(true),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const response = await app.inject({ method: "GET", url: "/cursor/models" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "cursor-cli-subscription",
      discoverySource: "cursor_cli_models",
      knownModelIds: ["cursor-fast", "claude-sonnet-4-6"],
    });
    await app.close();
  });

  it("tests cursor connection and sends a test message", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      cursorCliLocator: createInstalledLocator(),
      cursorCliRunner: createCursorRunnerReady(true),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectionResponse = await app.inject({ method: "POST", url: "/cursor/test-connection" });
    expect(connectionResponse.statusCode).toBe(200);
    expect(connectionResponse.json()).toMatchObject({
      ok: true,
      status: "healthy",
    });

    const messageResponse = await app.inject({
      method: "POST",
      url: "/cursor/test-message",
      payload: {
        message: "Respondé solo: conectado",
        model: "Cursor Fast",
      },
    });
    expect(messageResponse.statusCode).toBe(200);
    expect(messageResponse.json()).toMatchObject({
      ok: true,
      model: "Cursor Fast",
      requestedModel: "Cursor Fast",
      runtimeModel: "cursor-fast",
      content: "conectado",
    });
    await app.close();
  });

  it("records provider_busy and process_cancelled in Cursor audit", async () => {
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cursor-audit-"));
    const firstRelease = deferred<void>();
    const runnerStarted = vi.fn();
    const runner = {
      run: vi.fn(async (args: string[], options: { signal?: AbortSignal }) => {
        const command = args.join(" ");
        if (command === "--help") {
          return { exitCode: 0, stdout: "Usage: agent\nCommands: status login models logout\n--model --print --json", stderr: "", timedOut: false, signal: null };
        }
        if (command === "status --help") {
          return { exitCode: 0, stdout: "status --json", stderr: "", timedOut: false, signal: null };
        }
        if (command === "login --help") {
          return { exitCode: 0, stdout: "login", stderr: "", timedOut: false, signal: null };
        }
        if (command === "models --help") {
          return { exitCode: 0, stdout: "models", stderr: "", timedOut: false, signal: null };
        }
        if (command === "logout --help" || command === "--version") {
          return { exitCode: 0, stdout: "Cursor CLI 1.0.0", stderr: "", timedOut: false, signal: null };
        }
        if (command === "models --json") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ models: [{ id: "cursor-fast", displayName: "Cursor Fast" }] }),
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }
        if (command === "status --json") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ authenticated: true, models: ["cursor-fast"] }),
            stderr: "",
            timedOut: false,
            signal: null,
          };
        }
        runnerStarted();
        return await new Promise((resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
          void firstRelease.promise.then(() => resolve({
            exitCode: 0,
            stdout: JSON.stringify({ content: "primero" }),
            stderr: "",
            timedOut: false,
            signal: null,
          }));
        });
      }),
    } as unknown as CursorCliCommandRunnerPort & { run: ReturnType<typeof vi.fn> };

    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      cursorCliLocator: createInstalledLocator(),
      cursorCliRunner: runner,
      cursorRequestAuditDir: auditDirectory,
      cursorCliMaxConcurrentProcesses: 1,
      cursorCliMaxQueuedProcesses: 0,
    });

    const firstPromise = module.cursor.testMessage.execute({
      message: "Primero",
      model: "Cursor Fast",
    });
    await vi.waitFor(() => expect(runnerStarted).toHaveBeenCalledTimes(1));

    await expect(module.cursor.testMessage.execute({
      message: "Segundo",
      model: "Cursor Fast",
    })).rejects.toMatchObject({
      code: "provider_busy",
      statusCode: 502,
    });

    firstRelease.resolve();
    await expect(firstPromise).resolves.toMatchObject({ ok: true });

    const cancelStarted = deferred<void>();
    let cancellationMode = true;
    runner.run.mockImplementation(async (args: string[], options: { signal?: AbortSignal }) => {
      const command = args.join(" ");
      if (command === "--help") {
        return { exitCode: 0, stdout: "Usage: agent\nCommands: status login models logout\n--model --print --json", stderr: "", timedOut: false, signal: null };
      }
      if (command === "status --help") {
        return { exitCode: 0, stdout: "status --json", stderr: "", timedOut: false, signal: null };
      }
      if (command === "login --help") {
        return { exitCode: 0, stdout: "login", stderr: "", timedOut: false, signal: null };
      }
      if (command === "models --help") {
        return { exitCode: 0, stdout: "models", stderr: "", timedOut: false, signal: null };
      }
      if (command === "logout --help" || command === "--version") {
        return { exitCode: 0, stdout: "Cursor CLI 1.0.0", stderr: "", timedOut: false, signal: null };
      }
      if (command === "models --json") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ models: [{ id: "cursor-fast", displayName: "Cursor Fast" }] }),
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (command === "status --json") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ authenticated: true, models: ["cursor-fast"] }),
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      if (cancellationMode && command.includes("--print")) {
        cancellationMode = false;
        cancelStarted.resolve();
        return await new Promise((_, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
        });
      }
      return { exitCode: 0, stdout: JSON.stringify({ content: "ok" }), stderr: "", timedOut: false, signal: null };
    });

    const controller = new AbortController();
    const cancelledPromise = module.cursor.testMessage.execute({
      message: "Cancelado",
      model: "Cursor Fast",
      signal: controller.signal,
    });
    await cancelStarted.promise;
    controller.abort(new Error("Client disconnected"));
    await expect(cancelledPromise).rejects.toMatchObject({
      code: "process_cancelled",
      statusCode: 502,
    });

    const files = await fs.readdir(auditDirectory);
    const payloads = await Promise.all(files.map(async (file) =>
      JSON.parse(await fs.readFile(path.join(auditDirectory, file), "utf8")) as Record<string, unknown>,
    ));
    expect(payloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: "test_message_rejected",
        data: expect.objectContaining({ errorCode: "provider_busy" }),
      }),
      expect.objectContaining({
        phase: "test_message_cancelled",
        data: expect.objectContaining({ errorCode: "process_cancelled" }),
      }),
    ]));
  });
});
