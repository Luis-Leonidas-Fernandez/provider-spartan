import { AppError } from "../../../core/errors.js";

export class CodexNotConnectedError extends AppError {
  readonly connectUrl = "/codex/connect";

  constructor() {
    super("Codex is not connected", 409, "codex_not_connected");
  }
}

export class CodexLocalOnlyError extends AppError {
  constructor() {
    super("Codex convenience endpoints are only available on localhost", 403, "codex_local_only");
  }
}
