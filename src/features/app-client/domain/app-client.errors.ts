import { AppError } from "../../../core/errors.js";

export class AppClientInactiveError extends AppError {
  constructor() {
    super("App client is inactive", 401, "app_client_inactive");
  }
}
