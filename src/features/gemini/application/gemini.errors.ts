import { AppError } from "../../../core/errors.js";

export class GeminiRuntimeReconnectRequiredError extends AppError {
  constructor(connectionId: string, missingScopes: string[]) {
    super(
      `Gemini connection ${connectionId} requires reconnect to grant Gemini runtime scopes: ${missingScopes.join(", ")}`,
      409,
      "provider_connection_reconnect_required",
    );
  }
}
