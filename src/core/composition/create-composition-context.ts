import { createLogger } from "../logger.js";
import { createProviderGatewayDatabaseContext } from "../database.js";
import type { ProviderGatewayModuleOptions } from "../provider-gateway-options.js";
import { ApiKeyHasherService } from "../../features/app-client/infrastructure/api-key-hasher.service.js";
import { DrizzleAppClientRepository } from "../../features/app-client/infrastructure/drizzle-app-client.repository.js";
import { DrizzleSubscriptionPlanRepository } from "../../features/subscription/infrastructure/drizzle-subscription-plan.repository.js";
import { DrizzleAppSubscriptionRepository } from "../../features/subscription/infrastructure/drizzle-app-subscription.repository.js";
import { DrizzleProviderRepository } from "../../features/provider/infrastructure/drizzle-provider.repository.js";
import { CredentialCipherService } from "../../features/credential/infrastructure/credential-cipher.service.js";
import { DrizzleCredentialRepository } from "../../features/credential/infrastructure/drizzle-credential.repository.js";
import { DrizzleProviderOAuthSessionRepository } from "../../features/credential/infrastructure/drizzle-provider-oauth-session.repository.js";
import { FileOAuthAuditRecorder } from "../../features/credential/infrastructure/file-oauth-audit-recorder.js";
import { NoopOAuthAuditRecorder } from "../../features/credential/infrastructure/noop-oauth-audit-recorder.js";
import { FileCodexRequestAuditRecorder } from "../../features/codex/infrastructure/file-codex-request-audit-recorder.js";
import { NoopCodexRequestAuditRecorder } from "../../features/codex/infrastructure/noop-codex-request-audit-recorder.js";
import { FileCodexAccountModelDiscoveryReader } from "../../features/codex/infrastructure/file-codex-account-model-discovery-reader.js";
import { NoopCodexAccountModelDiscoveryReader } from "../../features/codex/infrastructure/noop-codex-account-model-discovery-reader.js";
import { FileGeminiRequestAuditRecorder } from "../../features/gemini/infrastructure/file-gemini-request-audit-recorder.js";
import { AntigravityGeminiModelCatalog, FallbackGeminiModelCatalog, ResilientGeminiModelCatalog } from "../../features/gemini/infrastructure/antigravity-gemini-model-catalog.js";
import { NoopGeminiRequestAuditRecorder } from "../../features/gemini/infrastructure/noop-gemini-request-audit-recorder.js";
import { FileClaudeRequestAuditRecorder } from "../../features/claude/infrastructure/file-claude-request-audit-recorder.js";
import { NoopClaudeRequestAuditRecorder } from "../../features/claude/infrastructure/noop-claude-request-audit-recorder.js";
import { TokenRefreshDeduper } from "../../features/credential/application/services/token-refresh-deduper.js";
import { ProviderAdapterRegistry } from "../../features/gateway/infrastructure/provider-adapter-registry.js";
import { OpenAICompatibleAdapter } from "../../integrations/provider-adapters/openai-compatible-adapter.js";
import { MiniMaxAdapter } from "../../integrations/provider-adapters/minimax-adapter.js";
import { KimiAdapter } from "../../integrations/provider-adapters/kimi-adapter.js";
import { CodexSubscriptionAdapter } from "../../integrations/provider-adapters/codex-subscription-adapter.js";
import { CodexOAuthClient } from "../../integrations/oauth/codex-oauth-client.js";
import { GeminiOAuthClient } from "../../integrations/oauth/gemini-oauth-client.js";
import { OpenAIAdapterStub } from "../../integrations/provider-adapters/openai-adapter.stub.js";
import { GeminiAntigravityRuntimeAdapter } from "../../integrations/provider-adapters/gemini-antigravity-runtime-adapter.js";
import { SupervisedGeminiCliRunner } from "../../integrations/provider-adapters/supervised-gemini-cli-runner.js";
import { DEFAULT_ANTIGRAVITY_CLI_BIN, DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS, resolveGeminiRuntimeSurface } from "../../shared/provider-runtime/gemini-runtime.js";
import { AntigravityCliLocator } from "../../integrations/antigravity-cli/antigravity-cli-locator.js";
import { NodeAntigravityCliRunner } from "../../integrations/antigravity-cli/antigravity-cli-runner.js";
import { AntigravityCliCapabilitiesInspector } from "../../integrations/antigravity-cli/antigravity-cli-capabilities.js";
import { AntigravityCliStatusService } from "../../integrations/antigravity-cli/antigravity-cli-status.service.js";
import { AntigravityAuthFlowManager } from "../../integrations/antigravity-cli/antigravity-auth-flow-manager.js";
import { NodeAntigravityInteractiveProcessLauncher } from "../../integrations/antigravity-cli/antigravity-auth-process.js";
import { ClaudeCodeSetupTokenRuntimeAdapter } from "../../integrations/provider-adapters/claude-code-setup-token-runtime-adapter.js";
import { NodeClaudeCliRunner } from "../../integrations/provider-adapters/claude-cli-runner.js";
import { DEFAULT_CLAUDE_CLI_BIN, DEFAULT_CLAUDE_CLI_TIMEOUT_MS, resolveClaudeRuntimeSurface } from "../../shared/provider-runtime/claude-runtime.js";
import { ClaudeCliLocator } from "../../integrations/claude-cli/claude-cli-locator.js";
import { ClaudeCliCapabilitiesInspector } from "../../integrations/claude-cli/claude-cli-capabilities.js";
import { ClaudeCliStatusService } from "../../integrations/claude-cli/claude-cli-status.service.js";
import { ClaudeAuthFlowManager } from "../../integrations/claude-cli/claude-auth-flow-manager.js";
import { NodeClaudeInteractiveProcessLauncher } from "../../integrations/claude-cli/claude-auth-process.js";
import { ClaudeLocalAuthConnectionSyncService } from "../../features/claude/application/services/claude-local-auth-connection-sync.service.js";
import { LocalQwenAdapterStub } from "../../integrations/provider-adapters/local-qwen-adapter.stub.js";
import { SupervisedClaudeCliRunner } from "../../integrations/provider-adapters/supervised-claude-cli-runner.js";
import { CursorCliLocator } from "../../integrations/cursor-cli/cursor-cli-locator.js";
import { CursorCliCommandRunner } from "../../integrations/cursor-cli/cursor-cli-command-runner.js";
import { CursorCliCapabilitiesInspector } from "../../integrations/cursor-cli/cursor-cli-capabilities.js";
import { CursorCliStatusService } from "../../integrations/cursor-cli/cursor-cli-status.service.js";
import { CursorAuthFlowManager } from "../../integrations/cursor-cli/cursor-auth-flow-manager.js";
import { NodeCursorInteractiveProcessLauncher } from "../../integrations/cursor-cli/cursor-auth-process.js";
import { CursorCliModelCatalog } from "../../integrations/cursor-cli/cursor-cli-model-catalog.js";
import { CursorWorkspaceManager } from "../../integrations/cursor-cli/cursor-workspace-manager.js";
import { CursorCliRuntimeAdapter } from "../../integrations/provider-adapters/cursor-cli-runtime-adapter.js";
import { SupervisedCursorCliRunner } from "../../integrations/provider-adapters/supervised-cursor-cli-runner.js";
import { FileCursorRequestAuditRecorder } from "../../features/cursor/infrastructure/file-cursor-request-audit-recorder.js";
import { NoopCursorRequestAuditRecorder } from "../../features/cursor/infrastructure/noop-cursor-request-audit-recorder.js";
import { ensureDefaultCursorProvider } from "../../features/cursor/application/services/cursor-local-provider-record.js";
import { UsageTrackerService } from "../../features/usage/application/services/usage-tracker.service.js";
import { DrizzleUsageEventRepository } from "../../features/usage/infrastructure/drizzle-usage-event.repository.js";
import { DrizzleRequestLogRepository } from "../../features/request-log/infrastructure/drizzle-request-log.repository.js";
import { SseUsageEventBus } from "../../features/gateway/infrastructure/sse-usage-event-bus.js";
import { DrizzleProviderConnectionRepository } from "../../provider-auth/infrastructure/drizzle-provider-connection.repository.js";
import { DrizzleOAuthStateRepository } from "../../provider-auth/infrastructure/drizzle-oauth-state.repository.js";
import { FileProviderConnectionLifecycleAuditRecorder } from "../../provider-auth/infrastructure/file-provider-connection-lifecycle-audit-recorder.js";
import { NoopProviderConnectionLifecycleAuditRecorder } from "../../provider-auth/infrastructure/noop-provider-connection-lifecycle-audit-recorder.js";
import { LocalCliProcessSupervisor } from "../../shared/local-cli-runtime/local-cli-process-supervisor.js";

export function createCompositionContext(options: ProviderGatewayModuleOptions) {
  const logger = options.logger ?? createLogger(options.logLevel ?? "info");
  const database = options.database ?? createProviderGatewayDatabaseContext({
    ...(options.databaseUrl !== undefined ? { databaseUrl: options.databaseUrl } : {}),
    ...(options.sqlite !== undefined ? { sqlite: options.sqlite } : {}),
  });

  if (options.runMigrations ?? true) {
    database.migrate();
  }

  const geminiOAuthClient = new GeminiOAuthClient();
  const geminiRuntimeSurface = resolveGeminiRuntimeSurface(options.geminiRuntimeSurface);
  const antigravityCliBin = options.antigravityCliBin ?? DEFAULT_ANTIGRAVITY_CLI_BIN;
  const antigravityCliTimeoutMs = options.antigravityCliTimeoutMs ?? DEFAULT_ANTIGRAVITY_CLI_TIMEOUT_MS;
  const localCliProcessSupervisor = new LocalCliProcessSupervisor({
    maxConcurrent: options.antigravityCliMaxConcurrentProcesses ?? options.localCliMaxConcurrentProcesses ?? 2,
    maxQueueSize: options.antigravityCliMaxQueuedProcesses ?? options.localCliMaxQueuedProcesses ?? 20,
  });
  const antigravityCliLocator = options.antigravityCliLocator ?? (options.antigravityCliRunner
    ? {
        async locate() {
          return {
            installed: true as const,
            executablePath: antigravityCliBin,
            version: "test-double",
            searchedLocations: [antigravityCliBin],
          };
        },
      }
    : new AntigravityCliLocator({
        explicitBinaryName: antigravityCliBin,
        ...(antigravityCliBin.includes("/") || antigravityCliBin.includes("\\") ? { explicitPath: antigravityCliBin } : {}),
      }));
  const antigravityCliRunner = new SupervisedGeminiCliRunner(
    options.antigravityCliRunner ?? new NodeAntigravityCliRunner(antigravityCliLocator),
    localCliProcessSupervisor,
  );
  const antigravityCliCapabilities = new AntigravityCliCapabilitiesInspector(
    antigravityCliLocator,
    antigravityCliRunner,
    Math.min(antigravityCliTimeoutMs, 4_000),
  );
  const antigravityCliStatus = new AntigravityCliStatusService(
    antigravityCliLocator,
    antigravityCliRunner,
    { capabilitiesInspector: antigravityCliCapabilities, timeoutMs: Math.min(antigravityCliTimeoutMs, 5_000) },
  );
  const antigravityAuthProcessLauncher = options.antigravityAuthProcessLauncher ?? new NodeAntigravityInteractiveProcessLauncher(
    antigravityCliLocator,
  );
  const antigravityAuthFlowManager = new AntigravityAuthFlowManager(
    antigravityAuthProcessLauncher,
    antigravityCliStatus,
    {
      ...(options.antigravityAuthFlowTimeoutMs !== undefined ? { flowTimeoutMs: options.antigravityAuthFlowTimeoutMs } : {}),
      ...(options.antigravityAuthFlowTtlMs !== undefined ? { flowTtlMs: options.antigravityAuthFlowTtlMs } : {}),
    },
  );
  const geminiFallbackModelLabels = [
    "Gemini 3.5 Flash (Medium)",
    "Gemini 3.5 Flash (High)",
    "Gemini 3.5 Flash (Low)",
    "Gemini 3.1 Pro (Low)",
    "Gemini 3.1 Pro (High)",
  ];
  const geminiRuntimeAdapter = new GeminiAntigravityRuntimeAdapter({
    cliBin: antigravityCliBin,
    timeoutMs: antigravityCliTimeoutMs,
    runner: antigravityCliRunner,
  });

  const geminiModelCatalog = new ResilientGeminiModelCatalog(
    new AntigravityGeminiModelCatalog({
      cliBin: antigravityCliBin,
      timeoutMs: antigravityCliTimeoutMs,
      runner: antigravityCliRunner,
    }),
    new FallbackGeminiModelCatalog(geminiRuntimeSurface, geminiFallbackModelLabels),
  );
  const claudeRuntimeSurface = resolveClaudeRuntimeSurface(options.claudeRuntimeSurface);
  const claudeCliBin = options.claudeCliBin ?? DEFAULT_CLAUDE_CLI_BIN;
  const claudeCliTimeoutMs = options.claudeCliTimeoutMs ?? DEFAULT_CLAUDE_CLI_TIMEOUT_MS;
  const claudeCliProcessSupervisor = new LocalCliProcessSupervisor({
    maxConcurrent: options.claudeCliMaxConcurrentProcesses ?? options.localCliMaxConcurrentProcesses ?? 1,
    maxQueueSize: options.claudeCliMaxQueuedProcesses ?? options.localCliMaxQueuedProcesses ?? 10,
  });
  const claudeCliLocator = options.claudeCliLocator ?? (options.claudeCliRunner
    ? {
        async locate() {
          return {
            installed: true as const,
            executablePath: claudeCliBin,
            version: "test-double",
            searchedLocations: [claudeCliBin],
          };
        },
      }
    : new ClaudeCliLocator({
        explicitBinaryName: claudeCliBin,
        ...(claudeCliBin.includes("/") || claudeCliBin.includes("\\") ? { explicitPath: claudeCliBin } : {}),
      }));
  const claudeCliRunner = new SupervisedClaudeCliRunner(
    options.claudeCliRunner ?? new NodeClaudeCliRunner(claudeCliBin),
    claudeCliProcessSupervisor,
  );
  const claudeCliCapabilities = new ClaudeCliCapabilitiesInspector(
    claudeCliLocator,
    claudeCliRunner,
    Math.min(claudeCliTimeoutMs, 4_000),
  );
  const claudeCliStatus = options.claudeCliStatusService ?? new ClaudeCliStatusService(
    claudeCliLocator,
    claudeCliRunner,
    { capabilitiesInspector: claudeCliCapabilities, timeoutMs: Math.min(claudeCliTimeoutMs, 5_000) },
  );
  const claudeAuthProcessLauncher = options.claudeAuthProcessLauncher ?? new NodeClaudeInteractiveProcessLauncher(
    claudeCliLocator,
  );
  const providerRepository = new DrizzleProviderRepository(database.db);
  const providerConnectionRepository = new DrizzleProviderConnectionRepository(database.db);
  const providerConnectionLifecycleAuditRecorder = options.providerAuthLifecycleAuditDir
    ? new FileProviderConnectionLifecycleAuditRecorder(options.providerAuthLifecycleAuditDir)
    : new NoopProviderConnectionLifecycleAuditRecorder();
  const claudeLocalAuthConnectionSync = new ClaudeLocalAuthConnectionSyncService(
    providerRepository,
    providerConnectionRepository,
    claudeRuntimeSurface,
    providerConnectionLifecycleAuditRecorder,
  );
  const claudeAuthFlowManager = new ClaudeAuthFlowManager(
    claudeAuthProcessLauncher,
    claudeCliStatus,
    {
      ...(options.claudeAuthFlowTimeoutMs !== undefined ? { flowTimeoutMs: options.claudeAuthFlowTimeoutMs } : {}),
      ...(options.claudeAuthFlowTtlMs !== undefined ? { flowTtlMs: options.claudeAuthFlowTtlMs } : {}),
      onAuthenticated: async () => {
        await claudeLocalAuthConnectionSync.syncAuthenticatedSession();
      },
    },
  );
  const cursorCliTimeoutMs = options.cursorCliTimeoutMs ?? 5_000;
  const cursorCliProcessSupervisor = new LocalCliProcessSupervisor({
    maxConcurrent: options.cursorCliMaxConcurrentProcesses ?? options.localCliMaxConcurrentProcesses ?? 1,
    maxQueueSize: options.cursorCliMaxQueuedProcesses ?? options.localCliMaxQueuedProcesses ?? 10,
  });
  const cursorCliLocator = options.cursorCliLocator ?? new CursorCliLocator({
    ...(options.cursorCliPath?.trim() ? { explicitPath: options.cursorCliPath.trim() } : {}),
  });
  const cursorCliRunner = options.cursorCliRunner ?? new CursorCliCommandRunner(cursorCliLocator);
  const cursorCliRuntimeRunner = new SupervisedCursorCliRunner(
    cursorCliRunner,
    cursorCliProcessSupervisor,
  );
  const cursorCliCapabilities = new CursorCliCapabilitiesInspector(
    cursorCliLocator,
    cursorCliRunner,
    Math.min(cursorCliTimeoutMs, 4_000),
  );
  const cursorCliStatus = options.cursorCliStatusService ?? new CursorCliStatusService(
    cursorCliLocator,
    cursorCliRunner,
    { capabilitiesInspector: cursorCliCapabilities, timeoutMs: cursorCliTimeoutMs },
  );
  const cursorAuthProcessLauncher = options.cursorAuthProcessLauncher ?? new NodeCursorInteractiveProcessLauncher(
    cursorCliLocator,
  );
  const cursorAuthFlowManager = new CursorAuthFlowManager(
    cursorAuthProcessLauncher,
    cursorCliStatus,
    cursorCliCapabilities,
    {
      ...(options.cursorAuthFlowTimeoutMs !== undefined ? { flowTimeoutMs: options.cursorAuthFlowTimeoutMs } : {}),
      ...(options.cursorAuthFlowTtlMs !== undefined ? { flowTtlMs: options.cursorAuthFlowTtlMs } : {}),
      onAuthenticated: async () => {
        await ensureDefaultCursorProvider(providerRepository);
      },
    },
  );
  const cursorModelCatalog = new CursorCliModelCatalog(
    cursorCliStatus,
    cursorCliRunner,
    cursorCliTimeoutMs,
  );
  const cursorWorkspaceManager = new CursorWorkspaceManager();
  const cursorRequestAuditRecorder = options.cursorRequestAuditDir
    ? new FileCursorRequestAuditRecorder(options.cursorRequestAuditDir)
    : new NoopCursorRequestAuditRecorder();

  return {
    logger,
    database,
    codexClientId: options.codexClientId ?? "",
    appClientRepository: new DrizzleAppClientRepository(database.db),
    appClientHasher: new ApiKeyHasherService(options.appApiKeyPepper),
    subscriptionPlanRepository: new DrizzleSubscriptionPlanRepository(database.db),
    appSubscriptionRepository: new DrizzleAppSubscriptionRepository(database.db),
    providerRepository,
    credentialRepository: new DrizzleCredentialRepository(database.db),
    oauthSessionRepository: new DrizzleProviderOAuthSessionRepository(database.db),
    credentialCipher: new CredentialCipherService({
      credentialEncryptionKey: options.credentialEncryptionKey ?? "",
      allowInsecureCredentialStorage: options.allowInsecureCredentialStorage ?? false,
    }),
    codexOAuthClient: new CodexOAuthClient(),
    geminiOAuthClient,
    geminiRuntimeSurface,
    localCliProcessSupervisor,
    antigravityCliLocator,
    antigravityCliRunner,
    antigravityCliCapabilities,
    antigravityCliStatus,
    antigravityAuthFlowManager,
    geminiModelCatalog,
    antigravityCliBin,
    antigravityCliTimeoutMs,
    claudeRuntimeSurface,
    claudeCliBin,
    claudeCliTimeoutMs,
    claudeCliProcessSupervisor,
    claudeCliLocator,
    claudeCliRunner,
    claudeCliCapabilities,
    claudeCliStatus,
    claudeAuthFlowManager,
    cursorCliTimeoutMs,
    cursorCliProcessSupervisor,
    cursorCliLocator,
    cursorCliRunner,
    cursorCliCapabilities,
    cursorCliStatus,
    cursorAuthFlowManager,
    cursorModelCatalog,
    cursorRequestAuditRecorder,
    providerConnectionRepository,
    oauthStateRepository: new DrizzleOAuthStateRepository(database.db),
    providerAuthRefreshSkewMs: options.providerAuthRefreshSkewMs ?? 5 * 60 * 1000,
    providerConnectionLifecycleAuditRecorder,
    oauthAuditRecorder: options.codexOAuthAuditDir
      ? new FileOAuthAuditRecorder(options.codexOAuthAuditDir)
      : new NoopOAuthAuditRecorder(),
    codexRequestAuditRecorder: options.codexRequestAuditDir
      ? new FileCodexRequestAuditRecorder(options.codexRequestAuditDir)
      : new NoopCodexRequestAuditRecorder(),
    codexAccountModelDiscoveryReader: options.codexAccountDiscoveryDir
      ? new FileCodexAccountModelDiscoveryReader(options.codexAccountDiscoveryDir)
      : new NoopCodexAccountModelDiscoveryReader(),
    geminiRequestAuditRecorder: options.geminiRequestAuditDir
      ? new FileGeminiRequestAuditRecorder(options.geminiRequestAuditDir)
      : new NoopGeminiRequestAuditRecorder(),
    claudeRequestAuditRecorder: options.claudeRequestAuditDir
      ? new FileClaudeRequestAuditRecorder(options.claudeRequestAuditDir)
      : new NoopClaudeRequestAuditRecorder(),
    refreshDeduper: new TokenRefreshDeduper(),
    adapterRegistry: new ProviderAdapterRegistry([
      new OpenAICompatibleAdapter(),
      new MiniMaxAdapter(),
      new KimiAdapter(),
      new CodexSubscriptionAdapter(),
      new OpenAIAdapterStub(),
      geminiRuntimeAdapter,
      new ClaudeCodeSetupTokenRuntimeAdapter({
        cliBin: claudeCliBin,
        timeoutMs: claudeCliTimeoutMs,
        runner: claudeCliRunner,
      }),
      new CursorCliRuntimeAdapter(
        cursorCliRuntimeRunner,
        cursorCliStatus,
        cursorModelCatalog,
        cursorWorkspaceManager,
        cursorCliTimeoutMs,
      ),
      new LocalQwenAdapterStub(),
    ]),
    usageEventRepository: new DrizzleUsageEventRepository(database.db),
    requestLogRepository: new DrizzleRequestLogRepository(database.db),
    usageTracker: new UsageTrackerService(),
    eventBus: new SseUsageEventBus(),
    providerAuthCallbackMode: options.providerAuthCallbackMode ?? "local-cli" as "host" | "local-cli",
    providerAuthPublicBaseUrl: options.providerAuthPublicBaseUrl ?? options.publicBaseUrl,
    providerAuthPrefix: options.providerAuthPrefix ?? "/auth",
  };
}

export type CompositionContext = ReturnType<typeof createCompositionContext>;
