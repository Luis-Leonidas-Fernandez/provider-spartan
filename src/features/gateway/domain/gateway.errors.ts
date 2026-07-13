import { BadGatewayError, ForbiddenError } from "../../../core/errors.js";

export class SubscriptionInactiveError extends ForbiddenError {
  constructor() {
    super("App client subscription is not active");
  }
}

export class ProviderDisabledError extends ForbiddenError {
  constructor() {
    super("Provider is disabled");
  }
}

export class ProviderCredentialMissingError extends ForbiddenError {
  constructor() {
    super("Provider credential is required but not configured");
  }
}

export class DefaultProviderNotConfiguredError extends BadGatewayError {
  constructor() {
    super("No default provider is configured", "default_provider_missing");
  }
}
