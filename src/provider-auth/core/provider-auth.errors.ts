import { AppError, NotFoundError, UnauthorizedError } from "../../core/errors.js";

export class ProviderAuthStrategyNotFoundError extends AppError {
  constructor(provider: string) {
    super(`Provider auth strategy not found for ${provider}`, 404, "provider_auth_strategy_not_found");
  }
}

export class ProviderConnectionNotFoundError extends NotFoundError {
  constructor(connectionId: string) {
    super(`Provider connection ${connectionId} not found`);
  }
}

export class ProviderConnectionNotConnectedError extends AppError {
  constructor(provider: string) {
    super(`Provider connection for ${provider} is not connected`, 409, "provider_connection_not_connected");
  }
}

export class ProviderAuthStateInvalidError extends UnauthorizedError {
  constructor() {
    super("Invalid OAuth state");
  }
}

export class ProviderAuthStateExpiredError extends UnauthorizedError {
  constructor() {
    super("OAuth state expired");
  }
}

export class ProviderConnectionExpiredError extends AppError {
  constructor(connectionId: string) {
    super(`Provider connection ${connectionId} expired`, 401, "provider_connection_expired");
  }
}

export class ProviderConnectionRefreshFailedError extends AppError {
  constructor(connectionId: string, cause?: unknown) {
    super(
      cause instanceof Error && cause.message
        ? `Provider connection ${connectionId} refresh failed: ${cause.message}`
        : `Provider connection ${connectionId} refresh failed`,
      401,
      "provider_connection_refresh_failed",
    );
  }
}

export class ProviderConnectionRevokedError extends AppError {
  constructor(connectionId: string, cause?: unknown) {
    super(
      cause instanceof Error && cause.message
        ? `Provider connection ${connectionId} was revoked: ${cause.message}`
        : `Provider connection ${connectionId} was revoked`,
      401,
      "provider_connection_revoked",
    );
  }
}

export class ProviderConnectionReconnectRequiredError extends AppError {
  constructor(connectionId: string, reason: "refresh_failed" | "disabled" | "error") {
    super(
      `Provider connection ${connectionId} requires reconnect (${reason})`,
      409,
      "provider_connection_reconnect_required",
    );
  }
}
