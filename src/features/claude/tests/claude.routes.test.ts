import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { createProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { providerGatewayPlugin } from "../../../fastify/provider-gateway.plugin.js";
import { createTestDatabaseUrl } from "../../../test/helpers/test-db.js";
import type { ClaudeCliRunnerResult } from "../../../shared/provider-runtime/claude-runtime.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFakeClaudeAuthLauncher() {
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

describe("claude routes", () => {
  it("imports setup token, tests runtime, lists models, and disconnects without leaking secrets", async () => {
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-claude-request-audit-"));
    const claudeCliRunner = {
      run: vi.fn(async (args: string[], options: { env?: NodeJS.ProcessEnv }) => {
        if (options.env?.CLAUDE_CODE_OAUTH_TOKEN !== "claude-setup-token") {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "oauth token expired",
          };
        }
        if (args.includes("Respond with only: connected")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ result: "connected" }),
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            result: "claude conectado",
            usage: {
              input_tokens: 11,
              output_tokens: 7,
              total_tokens: 18,
            },
          }),
          stderr: "",
        };
      }),
    };
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      claudeRequestAuditDir: auditDirectory,
      claudeCliRunner,
      claudeCliStatusService: {
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
            detectedArguments: ["--model", "--output-format"],
          },
          actions: [],
          message: "Claude CLI detectado y sesión local disponible.",
        })),
      },
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const disconnected = await app.inject({ method: "GET", url: "/claude/status" });
    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.json()).toMatchObject({
      connected: false,
      reason: "not_connected",
      runtimeStatus: "not_connected",
      executionMode: "local-cli",
      concurrency: {
        activeCount: 0,
        queuedCount: 0,
        maxConcurrent: 1,
        maxQueueSize: 10,
      },
      identityModel: {
        scope: "local_os_user",
        sharedByAllClients: true,
      },
      cli: {
        installed: true,
        path: "/usr/local/bin/claude",
      },
      localCliState: "ready",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/claude/connect" });
    expect(connectResponse.statusCode).toBe(200);
    expect(connectResponse.json()).toMatchObject({
      authMethod: "claude-subscription",
      preferredAuthMode: "local_cli_login",
      runtimeSurface: "claude_code_cli",
      importUrl: "/claude/import-token",
      authStartUrl: "/claude/auth/start",
    });

    const importResponse = await app.inject({
      method: "POST",
      url: "/claude/import-token",
      payload: {
        token: "claude-setup-token",
        name: "Claude Setup Token",
      },
    });
    expect(importResponse.statusCode).toBe(200);
    expect(importResponse.json()).toMatchObject({
      connected: true,
      authMethod: "claude_setup_token",
      tokenExists: true,
      runtimeSurface: "claude_code_cli",
    });
    expect(JSON.stringify(importResponse.json())).not.toContain("claude-setup-token");

    const statusResponse = await app.inject({ method: "GET", url: "/claude/status" });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      connected: true,
      authMethod: "claude_setup_token",
      runtimeStatus: "untested",
      tokenExists: true,
      executionMode: "local-cli",
      concurrency: {
        activeCount: 0,
        queuedCount: 0,
        maxConcurrent: 1,
        maxQueueSize: 10,
      },
      cli: {
        installed: true,
        path: "/usr/local/bin/claude",
      },
      localCliAuthenticated: true,
    });

    const modelsResponse = await app.inject({ method: "GET", url: "/claude/models" });
    expect(modelsResponse.statusCode).toBe(200);
    expect(modelsResponse.json()).toMatchObject({
      discoverySource: "static_claude_cli_catalog",
      knownModels: expect.arrayContaining(["Claude Sonnet", "Claude Opus"]),
    });

    const testConnectionResponse = await app.inject({ method: "POST", url: "/claude/test-connection" });
    expect(testConnectionResponse.statusCode).toBe(200);
    expect(testConnectionResponse.json()).toMatchObject({
      ok: true,
      status: "healthy",
      message: "Claude CLI reachable (claude)",
    });

    const testMessageResponse = await app.inject({
      method: "POST",
      url: "/claude/test-message",
      payload: {
        message: "Respondé solo: conectado",
        model: "claude-sonnet-4-6",
      },
    });
    expect(testMessageResponse.statusCode).toBe(200);
    expect(testMessageResponse.json()).toMatchObject({
      ok: true,
      model: "Claude Sonnet",
      requestedModel: "claude-sonnet-4-6",
      runtimeModel: "sonnet",
      catalogModelKey: "claude-sonnet",
      content: "claude conectado",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      },
    });

    const files = await fs.readdir(auditDirectory);
    expect(files.length).toBeGreaterThan(0);
    const payloads = await Promise.all(files.map(async (file) =>
      JSON.parse(await fs.readFile(path.join(auditDirectory, file), "utf8")) as Record<string, unknown>,
    ));
    const stringified = JSON.stringify(payloads);
    expect(stringified).toContain("\"selectedLabel\":\"Claude Sonnet\"");
    expect(stringified).toContain("\"runtimeModel\":\"sonnet\"");
    expect(stringified).not.toContain("claude-setup-token");
    expect(stringified).not.toContain("Respondé solo: conectado");
    expect(stringified).not.toContain("claude conectado");

    const disconnectResponse = await app.inject({ method: "DELETE", url: "/claude/disconnect" });
    expect(disconnectResponse.statusCode).toBe(200);
    expect(disconnectResponse.json()).toMatchObject({
      disconnected: true,
    });

    const statusAfterDisconnect = await app.inject({ method: "GET", url: "/claude/status" });
    expect(statusAfterDisconnect.statusCode).toBe(200);
    expect(statusAfterDisconnect.json()).toMatchObject({
      connected: false,
      reason: "not_connected",
    });

    await app.close();
  });

  it("marks reconnect required when claude runtime reports auth failure", async () => {
    const claudeCliRunner = {
      run: vi.fn(async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "oauth token expired",
      })),
    };
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      claudeCliRunner,
      claudeCliStatusService: {
        inspect: vi.fn(async () => ({
          provider: "claude-cli-subscription" as const,
          executionMode: "local-cli" as const,
          state: "authentication_required" as const,
          cli: {
            installed: true,
            path: "/usr/local/bin/claude",
            version: "1.0.0",
            searchedLocations: ["/usr/local/bin/claude"],
          },
          authentication: { authenticated: false, method: "unknown" as const },
          capabilities: null,
          actions: [{ type: "IMPORT_SETUP_TOKEN" as const, label: "Importar setup-token" }],
          message: "Authentication required",
        })),
      },
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    await app.inject({
      method: "POST",
      url: "/claude/import-token",
      payload: { token: "invalid-token" },
    });

    const response = await app.inject({ method: "POST", url: "/claude/test-connection" });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "provider_connection_reconnect_required",
      connectUrl: "/claude/connect",
    });

    const status = await app.inject({ method: "GET", url: "/claude/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      connected: false,
      reconnectRequired: true,
      reason: "error",
      runtimeStatus: "failed",
      localCliState: "authentication_required",
    });

    await app.close();
  });

  it("records rejected and cancelled Claude test-message audits with explicit error codes", async () => {
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-claude-request-audit-errors-"));
    const releases = [deferred<void>(), deferred<void>()];
    let runIndex = 0;
    const runnerStarted = vi.fn();
    const claudeCliRunner = {
      run: vi.fn(async (_args: string[], options: { signal?: AbortSignal }) => {
        runnerStarted();
        const currentRelease = releases[runIndex]!;
        runIndex += 1;
        return await new Promise<ClaudeCliRunnerResult>((resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
          void currentRelease.promise.then(() => resolve({
            exitCode: 0,
            stdout: JSON.stringify({ result: "ok" }),
            stderr: "",
          }));
        });
      }),
    };
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      claudeRequestAuditDir: auditDirectory,
      claudeCliRunner,
      claudeCliMaxConcurrentProcesses: 1,
      claudeCliMaxQueuedProcesses: 0,
      claudeCliStatusService: {
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
            detectedArguments: ["--model", "--output-format"],
          },
          actions: [],
          message: "Claude CLI detectado y sesión local disponible.",
        })),
      },
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    await app.inject({
      method: "POST",
      url: "/claude/import-token",
      payload: { token: "claude-setup-token" },
    });

    const firstPromise = module.claude.testMessage.execute({
      message: "Primero",
      model: "claude-sonnet-4-6",
    });
    await vi.waitFor(() => expect(runnerStarted).toHaveBeenCalledTimes(1));

    await expect(module.claude.testMessage.execute({
      message: "Segundo",
      model: "claude-sonnet-4-6",
    })).rejects.toMatchObject({
      code: "provider_busy",
      statusCode: 502,
    });

    releases[0]!.resolve();
    await expect(firstPromise).resolves.toMatchObject({ ok: true });

    const controller = new AbortController();
    const cancelledPromise = module.claude.testMessage.execute({
      message: "Cancelado",
      model: "claude-sonnet-4-6",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(runnerStarted).toHaveBeenCalledTimes(2));
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

    await app.close();
  });

  it("starts, inspects, writes input, and cancels a local Claude auth flow", async () => {
    const fakeAuth = createFakeClaudeAuthLauncher();
    const inspect = vi.fn(async () => ({
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
        detectedArguments: ["auth", "login"],
      },
      actions: [],
      message: "Claude CLI detectado y sesión local disponible.",
    }));

    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      claudeCliStatusService: { inspect },
      claudeAuthProcessLauncher: fakeAuth.launcher,
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/claude/connect" });
    expect(connectResponse.statusCode).toBe(200);
    expect(connectResponse.json()).toMatchObject({
      preferredAuthMode: "local_cli_login",
      authStartUrl: "/claude/auth/start",
      importUrl: "/claude/import-token",
    });

    const startResponse = await app.inject({ method: "POST", url: "/claude/auth/start" });
    expect(startResponse.statusCode).toBe(200);
    const flowId = startResponse.json().flowId as string;
    expect(flowId).toBeTruthy();

    fakeAuth.emitStdout("Open https://claude.ai/login?code=secret and paste verification code:");

    const snapshotResponse = await app.inject({ method: "GET", url: `/claude/auth/${flowId}` });
    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json()).toMatchObject({
      flowId,
      status: "running",
      events: expect.arrayContaining([
        expect.objectContaining({ type: "started" }),
        expect.objectContaining({ type: "open_url" }),
        expect.objectContaining({ type: "input_required", inputType: "code" }),
      ]),
    });
    expect(JSON.stringify(snapshotResponse.json())).not.toContain("secret");

    const inputResponse = await app.inject({
      method: "POST",
      url: `/claude/auth/${flowId}/input`,
      payload: { value: "123456" },
    });
    expect(inputResponse.statusCode).toBe(200);
    expect(fakeAuth.writes).toEqual(["123456\n"]);

    const cancelResponse = await app.inject({ method: "POST", url: `/claude/auth/${flowId}/cancel` });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({ status: "cancelled" });
    expect(fakeAuth.kills[0]).toBe("SIGTERM");

    await app.close();
  });

  it("persists a local Claude session after auth flow exit and uses it without setup-token", async () => {
    const fakeAuth = createFakeClaudeAuthLauncher();
    const inspect = vi.fn(async () => ({
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
        detectedArguments: ["auth", "login"],
      },
      actions: [],
      message: "Claude CLI detectado y sesión local disponible.",
    }));
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-claude-local-session-audit-"));
    const claudeCliRunner = {
      run: vi.fn(async (args: string[], options: { env?: NodeJS.ProcessEnv }) => {
        expect(options.env?.ANTHROPIC_API_KEY).toBeUndefined();
        if (args.includes("Respond with only: connected")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ result: "connected" }),
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: [
            JSON.stringify({ type: "response.created", id: "msg_123" }),
            JSON.stringify({ type: "content.delta", text: "conec" }),
            JSON.stringify({ type: "content.delta", text: "tado" }),
            JSON.stringify({ type: "response.completed", usage: { input_tokens: 9, output_tokens: 3, total_tokens: 12 } }),
          ].join("\n"),
          stderr: "",
        };
      }),
    };

    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      claudeRequestAuditDir: auditDirectory,
      claudeCliStatusService: { inspect },
      claudeAuthProcessLauncher: fakeAuth.launcher,
      claudeCliRunner,
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const startResponse = await app.inject({ method: "POST", url: "/claude/auth/start" });
    const flowId = startResponse.json().flowId as string;
    fakeAuth.emitExit(0, null);
    await vi.waitFor(async () => {
      const status = await app.inject({ method: "GET", url: "/claude/status" });
      expect(status.json()).toMatchObject({
        connected: true,
        authMethod: "claude-subscription-local-cli",
      });
    });

    const flowSnapshot = await app.inject({ method: "GET", url: `/claude/auth/${flowId}` });
    expect(flowSnapshot.statusCode).toBe(200);
    expect(flowSnapshot.json()).toMatchObject({
      status: "authenticated",
      events: expect.arrayContaining([expect.objectContaining({ type: "authenticated" })]),
    });

    const testConnection = await app.inject({ method: "POST", url: "/claude/test-connection" });
    expect(testConnection.statusCode).toBe(200);
    expect(testConnection.json()).toMatchObject({
      ok: true,
      status: "healthy",
    });
    expect(claudeCliRunner.run).toHaveBeenCalled();
    expect(JSON.stringify(claudeCliRunner.run.mock.calls)).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");

    const testMessage = await app.inject({
      method: "POST",
      url: "/claude/test-message",
      payload: {
        message: "Respondé solo: conectado",
        model: "claude-sonnet-4-6",
      },
    });
    expect(testMessage.statusCode).toBe(200);
    expect(testMessage.json()).toMatchObject({
      ok: true,
      model: "Claude Sonnet",
      requestedModel: "claude-sonnet-4-6",
      runtimeModel: "sonnet",
      content: "conectado",
      usage: {
        promptTokens: 9,
        completionTokens: 3,
        totalTokens: 12,
      },
    });

    const auditFiles = await fs.readdir(auditDirectory);
    const successAuditFile = auditFiles.find((file) => file.includes("test_message_success"));
    expect(successAuditFile).toBeTruthy();
    const successAudit = JSON.parse(await fs.readFile(path.join(auditDirectory, String(successAuditFile)), "utf8")) as Record<string, unknown>;
    expect(JSON.stringify(successAudit)).toContain("\"authMethod\":\"claude-subscription-local-cli\"");
    expect(JSON.stringify(successAudit)).toContain("response.created");
    expect(JSON.stringify(successAudit)).toContain("response.completed");
    expect(JSON.stringify(successAudit)).not.toContain("Respondé solo: conectado");

    await app.close();
  });
});
