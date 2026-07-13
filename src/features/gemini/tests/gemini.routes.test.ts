import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderGatewayModule } from "../../../core/create-provider-gateway-module.js";
import { providerGatewayPlugin } from "../../../fastify/provider-gateway.plugin.js";
import { createTestDatabaseUrl } from "../../../test/helpers/test-db.js";
import type { GeminiCliRunnerResult } from "../../../shared/provider-runtime/gemini-runtime.js";

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

function createMissingLocator() {
  return {
    locate: vi.fn(async () => ({
      installed: false as const,
      searchedLocations: ["/usr/local/bin/agy", "/opt/homebrew/bin/agy"],
    })),
  };
}

function createHealthyAntigravityRunner() {
  return {
    run: vi.fn(async (args: string[]) => {
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
          stdout: [
            "Gemini 3.5 Flash (Medium)",
            "Gemini 3.1 Pro (High)",
            "Claude Sonnet 4.6 (Thinking)",
          ].join("\n"),
          stderr: "",
          timedOut: false,
          signal: null,
        };
      }
      return {
        exitCode: 0,
        stdout: "conectado\n",
        stderr: "",
        timedOut: false,
        signal: null,
      };
    }),
  };
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

describe("gemini routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PROVIDER_AUTH_LIFECYCLE_AUDIT_DIR;
  });

  it("returns disconnected gemini status before auth", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      antigravityCliLocator: createMissingLocator(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const response = await app.inject({ method: "GET", url: "/gemini/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connected: false,
      reconnectRequired: true,
      reason: "not_connected",
      message: "Provider is not connected",
      providerId: null,
      runtimeSurface: "antigravity",
      runtimeStatus: "not_connected",
      executionMode: "local-cli",
      concurrency: {
        activeCount: 0,
        queuedCount: 0,
        maxConcurrent: 2,
        maxQueueSize: 20,
      },
      localCliState: "cli_not_installed",
      cli: {
        installed: false,
      },
    });
    await app.close();
  });

  it("connects, exposes status, and disconnects gemini through localhost facade", async () => {
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-gemini-lifecycle-audit-"));
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      providerAuthLifecycleAuditDir: auditDirectory,
      publicBaseUrl: "http://127.0.0.1:20128",
      providerAuthPublicBaseUrl: "http://127.0.0.1:20128",
      antigravityCliLocator: createInstalledLocator(),
      antigravityCliRunner: createHealthyAntigravityRunner(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/gemini/connect" });
    expect(connectResponse.statusCode).toBe(302);
    const location = connectResponse.headers.location;
    expect(location).toBeTruthy();
    const authorizationUrl = new URL(String(location));
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const state = authorizationUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({
          access_token: "gemini-access-token",
          refresh_token: "gemini-refresh-token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
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

    const callbackResponse = await app.inject({
      method: "GET",
      url: `/auth/gemini/callback?state=${encodeURIComponent(String(state))}&code=gemini-code-123`,
    });
    expect(callbackResponse.statusCode).toBe(200);
    expect(callbackResponse.json()).toMatchObject({
      connected: true,
      connection: {
        providerType: "gemini",
        authType: "oauth_token",
        status: "connected",
      },
    });

    const statusResponse = await app.inject({ method: "GET", url: "/gemini/status" });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      connected: true,
      reconnectRequired: false,
      reason: null,
      message: "Connection active",
      concurrency: {
        activeCount: 0,
        queuedCount: 0,
        maxConcurrent: 2,
        maxQueueSize: 20,
      },
      runtimeReady: true,
      accountEmail: "gemini@example.com",
      accountName: "Gemini User",
      googleSubject: "google-sub-123",
      integrationVariant: "gemini-cli-code-assist",
      executionMode: "local-cli",
      localCliState: "ready",
      localCliAuthenticated: true,
      cli: {
        installed: true,
        path: "/usr/local/bin/agy",
        version: "agy 1.2.3",
      },
      capabilities: {
        supportsModelListing: true,
        supportsModelArgument: true,
        supportsPrintMode: true,
      },
      codeAssist: {
        probeStatus: "succeeded",
        eligibility: "eligible",
        runtimeStatus: "untested",
        projectId: "project-123",
      },
      runtimeSurface: "antigravity",
      runtimeStatus: "untested",
    });

    const files = await fs.readdir(auditDirectory);
    const completedAuditFile = files.find((file) => file.includes("connection_completed"));
    expect(completedAuditFile).toBeTruthy();
    const payload = JSON.parse(await fs.readFile(path.join(auditDirectory, String(completedAuditFile)), "utf8")) as Record<string, unknown>;
    expect(payload.event).toBe("connection_completed");
    expect(JSON.stringify(payload)).toContain("\"accountEmail\":\"gemini@example.com\"");
    expect(JSON.stringify(payload)).toContain("\"projectId\":\"project-123\"");
    expect(JSON.stringify(payload)).not.toContain("gemini-access-token");
    expect(JSON.stringify(payload)).not.toContain("gemini-refresh-token");

    const disconnectResponse = await app.inject({ method: "DELETE", url: "/gemini/disconnect" });
    expect(disconnectResponse.statusCode).toBe(200);
    expect(disconnectResponse.json()).toMatchObject({
      disconnected: true,
    });

    const disconnectedStatusResponse = await app.inject({ method: "GET", url: "/gemini/status" });
    expect(disconnectedStatusResponse.statusCode).toBe(200);
    expect(disconnectedStatusResponse.json()).toMatchObject({
      connected: false,
      reason: "not_connected",
    });

    await app.close();
  });

  it("exposes Antigravity CLI capabilities for Gemini local runtime", async () => {
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      antigravityCliLocator: createInstalledLocator(),
      antigravityCliRunner: createHealthyAntigravityRunner(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const response = await app.inject({ method: "GET", url: "/gemini/capabilities" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "antigravity",
      executionMode: "local-cli",
      state: "ready",
      cli: {
        installed: true,
        path: "/usr/local/bin/agy",
      },
      capabilities: {
        supportsModelListing: true,
        supportsLoginCommand: true,
        supportsLogoutCommand: true,
      },
    });

    await app.close();
  });

  it("starts, inspects, writes input, and cancels a local Antigravity auth flow", async () => {
    const fakeAuth = createFakeAuthLauncher();
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      antigravityCliLocator: createInstalledLocator(),
      antigravityCliRunner: createHealthyAntigravityRunner(),
      antigravityAuthProcessLauncher: fakeAuth.launcher,
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const startResponse = await app.inject({ method: "POST", url: "/gemini/auth/start" });
    expect(startResponse.statusCode).toBe(200);
    const flowId = startResponse.json().flowId as string;
    expect(flowId).toBeTruthy();

    fakeAuth.emitStdout("Open https://example.com/login and paste verification code:");

    const snapshotResponse = await app.inject({ method: "GET", url: `/gemini/auth/${flowId}` });
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

    const inputResponse = await app.inject({
      method: "POST",
      url: `/gemini/auth/${flowId}/input`,
      payload: { value: "123456" },
    });
    expect(inputResponse.statusCode).toBe(200);
    expect(fakeAuth.writes).toEqual(["123456\n"]);

    const cancelResponse = await app.inject({ method: "POST", url: `/gemini/auth/${flowId}/cancel` });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({ status: "cancelled" });
    expect(fakeAuth.kills[0]).toBe("SIGTERM");

    await app.close();
  });

  it("uses Antigravity runtime for Gemini requests", async () => {
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
      antigravityCliRunner: createHealthyAntigravityRunner(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/gemini/connect" });
    const location = connectResponse.headers.location;
    const authorizationUrl = new URL(String(location));
    const state = authorizationUrl.searchParams.get("state");

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

    await app.inject({
      method: "GET",
      url: `/auth/gemini/callback?state=${encodeURIComponent(String(state))}&code=gemini-code-123`,
    });

    const statusResponse = await app.inject({ method: "GET", url: "/gemini/status" });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      connected: true,
      reconnectRequired: false,
      reason: null,
      concurrency: {
        activeCount: 0,
        queuedCount: 0,
        maxConcurrent: 2,
        maxQueueSize: 20,
      },
      runtimeReady: true,
      runtimeSurface: "antigravity",
      runtimeStatus: "untested",
    });
    expect(statusResponse.json().message).toBe("Connection active");

    const testConnectionResponse = await app.inject({ method: "POST", url: "/gemini/test-connection" });
    expect(testConnectionResponse.statusCode).toBe(200);
    expect(testConnectionResponse.json()).toMatchObject({
      ok: true,
      status: "healthy",
      message: "Antigravity CLI reachable (agy)",
    });

    const testMessageResponse = await app.inject({
      method: "POST",
      url: "/gemini/test-message",
      payload: { message: "Respondé solo: conectado", model: "gemini-2.5-pro" },
    });
    expect(testMessageResponse.statusCode).toBe(200);
    expect(testMessageResponse.json()).toMatchObject({
      ok: true,
      content: "conectado",
      runtimeModel: "pro",
    });

    await app.close();
  });

  it("lists Gemini Antigravity static model catalog", async () => {
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-gemini-request-audit-"));
    const module = createProviderGatewayModule({
      databaseUrl: createTestDatabaseUrl(),
      appApiKeyPepper: "test-pepper",
      credentialEncryptionKey: "test-encryption-secret",
      allowInsecureCredentialStorage: false,
      logLevel: "error",
      appEnv: "test",
      geminiRequestAuditDir: auditDirectory,
      publicBaseUrl: "http://127.0.0.1:20128",
      providerAuthPublicBaseUrl: "http://127.0.0.1:20128",
      antigravityCliLocator: createInstalledLocator(),
      antigravityCliRunner: createHealthyAntigravityRunner(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/gemini/connect" });
    const location = connectResponse.headers.location;
    const authorizationUrl = new URL(String(location));
    const state = authorizationUrl.searchParams.get("state");

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

    await app.inject({
      method: "GET",
      url: `/auth/gemini/callback?state=${encodeURIComponent(String(state))}&code=gemini-code-123`,
    });

    const modelsResponse = await app.inject({ method: "GET", url: "/gemini/models" });
    expect(modelsResponse.statusCode).toBe(200);
    expect(modelsResponse.json()).toMatchObject({
      projectId: "project-123",
      runtimeSurface: "antigravity",
      runtimeStatus: "untested",
      discoverySource: "antigravity_cli_models",
      knownModels: [
        "Gemini 3.5 Flash (Medium)",
        "Gemini 3.1 Pro (High)",
        "Claude Sonnet 4.6 (Thinking)",
      ],
      verifiedWorkingModels: [],
      recommendedLabels: {
        fast: "Gemini 3.5 Flash (Medium)",
        quality: "Gemini 3.1 Pro (High)",
      },
    });
    expect(modelsResponse.json().notes).toContain("agy models");

    const auditFiles = await fs.readdir(auditDirectory);
    expect(auditFiles.some((file) => file.includes("models_discovery_success"))).toBe(true);
    const modelsAuditFile = auditFiles.find((file) => file.includes("models_discovery_success"));
    expect(modelsAuditFile).toBeTruthy();
    const modelsAuditPayload = JSON.parse(await fs.readFile(path.join(auditDirectory, String(modelsAuditFile)), "utf8")) as Record<string, unknown>;
    expect(JSON.stringify(modelsAuditPayload)).toContain('"runtimeSurface":"antigravity"');
    expect(JSON.stringify(modelsAuditPayload)).toContain('Gemini 3.1 Pro (High)');
    expect(JSON.stringify(modelsAuditPayload)).toContain('"gemini-3.1-pro"');

    await app.close();
  });

  it("records Gemini runtime saturation and cancellation with explicit error codes", async () => {
    const auditDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "pgw-gemini-request-audit-errors-"));
    const releases = [deferred<void>(), deferred<void>()];
    let runIndex = 0;
    const runnerStarted = vi.fn();
    const antigravityCliRunner = {
      run: vi.fn(async (args: string[], options?: { signal?: AbortSignal }) => {
        if (args.includes("--help")) {
          return { exitCode: 0, stdout: "Usage: agy --model --print", stderr: "", timedOut: false, signal: null };
        }
        if (args.includes("--version")) {
          return { exitCode: 0, stdout: "agy 1.2.3\n", stderr: "", timedOut: false, signal: null };
        }
        if (args[0] === "models") {
          return { exitCode: 0, stdout: "Gemini 3.1 Pro (High)\n", stderr: "", timedOut: false, signal: null };
        }
        runnerStarted();
        const currentRelease = releases[runIndex]!;
        runIndex += 1;
        return await new Promise<GeminiCliRunnerResult>((resolve, reject) => {
          if (options?.signal?.aborted) {
            reject(options.signal.reason ?? new Error("aborted"));
            return;
          }
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
          void currentRelease.promise.then(() => resolve({
            exitCode: 0,
            stdout: "conectado\n",
            stderr: "",
            timedOut: false,
            signal: null,
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
      geminiRequestAuditDir: auditDirectory,
      publicBaseUrl: "http://127.0.0.1:20128",
      providerAuthPublicBaseUrl: "http://127.0.0.1:20128",
      antigravityCliLocator: createInstalledLocator(),
      antigravityCliRunner,
      antigravityCliMaxConcurrentProcesses: 1,
      antigravityCliMaxQueuedProcesses: 0,
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/gemini/connect" });
    const authorizationUrl = new URL(String(connectResponse.headers.location));
    const state = authorizationUrl.searchParams.get("state");
    stubGeminiOAuthFetch();

    await app.inject({
      method: "GET",
      url: `/auth/gemini/callback?state=${encodeURIComponent(String(state))}&code=gemini-code-123`,
    });

    const firstPromise = module.gemini.testMessage.execute({
      message: "Primero",
      model: "gemini-2.5-pro",
    });
    await vi.waitFor(() => expect(runnerStarted).toHaveBeenCalledTimes(1));

    await expect(module.gemini.testMessage.execute({
      message: "Segundo",
      model: "gemini-2.5-pro",
    })).rejects.toMatchObject({
      code: "provider_busy",
      statusCode: 502,
    });

    const statusWhileBusy = await app.inject({ method: "GET", url: "/gemini/status" });
    expect(statusWhileBusy.json()).toMatchObject({
      concurrency: { activeCount: 1, queuedCount: 0, maxConcurrent: 1, maxQueueSize: 0 },
    });

    releases[0]!.resolve();
    await expect(firstPromise).resolves.toMatchObject({ ok: true });

    const controller = new AbortController();
    controller.abort(new Error("Client disconnected"));
    const cancelledPromise = module.gemini.testMessage.execute({
      message: "Cancelado",
      model: "gemini-2.5-pro",
      signal: controller.signal,
    });
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

  it("persists working Antigravity runtime status after test connection", async () => {
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
      antigravityCliRunner: createHealthyAntigravityRunner(),
    });
    const app = Fastify({ logger: false });
    await app.register(providerGatewayPlugin, {
      module,
      prefix: "",
      appApiKeyPepper: "test-pepper",
    });

    const connectResponse = await app.inject({ method: "GET", url: "/gemini/connect" });
    const authorizationUrl = new URL(String(connectResponse.headers.location));
    const state = authorizationUrl.searchParams.get("state");

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 3600 }), { status: 200 });
      }
      if (url.startsWith("https://www.googleapis.com/oauth2/v1/userinfo")) {
        return new Response(JSON.stringify({ email: "gemini@example.com" }), { status: 200 });
      }
      if (url === "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist") {
        return new Response(JSON.stringify({ cloudaicompanionProject: { id: "project-123" } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch url ${url}`);
    }));

    await app.inject({
      method: "GET",
      url: `/auth/gemini/callback?state=${encodeURIComponent(String(state))}&code=gemini-code-123`,
    });

    const response = await app.inject({ method: "POST", url: "/gemini/test-connection" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      status: "healthy",
    });

    const status = await app.inject({ method: "GET", url: "/gemini/status" });
    expect(status.json()).toMatchObject({
      reason: null,
      runtimeSurface: "antigravity",
      cliAvailable: true,
      runtimeReady: true,
      runtimeStatus: "working",
    });

    await app.close();
  });
});
