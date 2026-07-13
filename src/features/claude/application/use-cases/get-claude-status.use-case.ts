import type { ProviderRepositoryPort } from "../../../provider/application/ports/provider-repository.port.js";
import type { ProviderConnectionStorePort } from "../../../../provider-auth/core/ports/provider-connection-store.port.js";
import type { ProviderConnection, ProviderCredentialMetadata } from "../../../../provider-auth/core/provider-auth.types.js";
import {
  getConnectionStatusReason,
  getConnectionStatusMessage,
  parseMetadata,
  shouldReconnectForStatus,
} from "../../../../provider-auth/core/provider-auth.utils.js";
import type { ClaudeRuntimeSurface } from "../../../../shared/provider-runtime/claude-runtime.js";
import { LOCAL_OS_USER_IDENTITY_MODEL } from "../../../../shared/local-cli-runtime/local-cli-runtime.types.js";
import type { ClaudeRuntimeIntrospectionPort } from "../ports/claude-runtime-introspection.port.js";
import type { ClaudeConcurrencyInspectorPort } from "../ports/claude-concurrency-inspector.port.js";
import { findDefaultClaudeProvider } from "../services/claude-local-provider-record.js";

function getMetadata(connection: ProviderConnection | null) {
  return (parseMetadata(connection?.metadataJson) ?? {}) as ProviderCredentialMetadata;
}

export class GetClaudeStatusUseCase {
  constructor(
    private readonly providerRepository: ProviderRepositoryPort,
    private readonly connectionStore: ProviderConnectionStorePort,
    private readonly runtimeSurface: ClaudeRuntimeSurface,
    private readonly complianceStatus: string,
    private readonly runtimeIntrospection: ClaudeRuntimeIntrospectionPort,
    private readonly concurrencyInspector: ClaudeConcurrencyInspectorPort,
  ) {}

  async execute() {
    const cliStatus = await this.runtimeIntrospection.inspect();
    const concurrency = this.concurrencyInspector.getSnapshot();
    const providers = await this.providerRepository.findAll();
    const provider = findDefaultClaudeProvider(providers);
    if (!provider) {
      return {
        connected: false,
        reconnectRequired: true,
        message: "Provider is not connected",
        reason: "not_connected",
        providerId: null,
        connectionId: null,
        authMethod: "claude_setup_token",
        runtimeSurface: this.runtimeSurface,
        executionMode: cliStatus.executionMode,
        identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
        cli: cliStatus.cli,
        concurrency,
        capabilities: cliStatus.capabilities,
        localCliState: cliStatus.state,
        localCliActions: cliStatus.actions,
        localCliMessage: cliStatus.message,
        localCliAuthenticated: cliStatus.authentication.authenticated,
        runtimeStatus: "not_connected",
        complianceStatus: this.complianceStatus,
        tokenExists: false,
        verifiedWorkingModels: [],
      };
    }

    const connection = await this.connectionStore.findDefaultByProviderId(provider.id);
    if (!connection) {
      return {
        connected: false,
        reconnectRequired: true,
        message: "Provider is not connected",
        reason: "not_connected",
        providerId: provider.id,
        connectionId: null,
        authMethod: "claude_setup_token",
        runtimeSurface: this.runtimeSurface,
        executionMode: cliStatus.executionMode,
        identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
        cli: cliStatus.cli,
        concurrency,
        capabilities: cliStatus.capabilities,
        localCliState: cliStatus.state,
        localCliActions: cliStatus.actions,
        localCliMessage: cliStatus.message,
        localCliAuthenticated: cliStatus.authentication.authenticated,
        runtimeStatus: "not_connected",
        complianceStatus: this.complianceStatus,
        tokenExists: false,
        verifiedWorkingModels: [],
      };
    }

    const metadata = getMetadata(connection);
    const runtimeStatus = typeof metadata.runtimeStatus === "string" ? metadata.runtimeStatus : "untested";
    const verifiedWorkingModels = Array.isArray(metadata.verifiedWorkingModels)
      ? metadata.verifiedWorkingModels.filter((value): value is string => typeof value === "string")
      : [];

    return {
      connected: connection.status === "connected",
      reconnectRequired: shouldReconnectForStatus(connection.status),
      message: getConnectionStatusMessage(connection.status),
      reason: getConnectionStatusReason(connection.status),
      providerId: provider.id,
      connectionId: connection.id,
      authMethod: typeof metadata.authMethod === "string" ? metadata.authMethod : "claude_setup_token",
      runtimeSurface: typeof metadata.runtimeSurface === "string" ? metadata.runtimeSurface : this.runtimeSurface,
      executionMode: cliStatus.executionMode,
      identityModel: LOCAL_OS_USER_IDENTITY_MODEL,
      cli: cliStatus.cli,
      concurrency,
      capabilities: cliStatus.capabilities,
      localCliState: cliStatus.state,
      localCliActions: cliStatus.actions,
      localCliMessage: cliStatus.message,
      localCliAuthenticated: cliStatus.authentication.authenticated,
      runtimeStatus,
      complianceStatus: typeof metadata.complianceStatus === "string" ? metadata.complianceStatus : this.complianceStatus,
      tokenExists: Boolean(connection.encryptedAccessToken),
      maskedValue: typeof metadata.maskedValue === "string" ? metadata.maskedValue : null,
      lastRuntimeError: typeof metadata.lastRuntimeError === "string" ? metadata.lastRuntimeError : null,
      verifiedWorkingModels,
      connection: {
        id: connection.id,
        providerId: connection.providerId,
        providerType: connection.providerType,
        authType: connection.authType,
        name: connection.name,
        status: connection.status,
        isDefault: connection.isDefault,
        metadataJson: connection.metadataJson,
        tokenExpiresAt: connection.tokenExpiresAt,
        lastRefreshAt: connection.lastRefreshAt,
        lastAuthCheckAt: connection.lastAuthCheckAt,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    };
  }
}
