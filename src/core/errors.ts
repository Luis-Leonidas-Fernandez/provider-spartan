export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "app_error",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "not_found");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, "forbidden");
  }
}

export class BadGatewayError extends AppError {
  constructor(message: string, code = "bad_gateway") {
    super(message, 502, code);
  }
}

export class GatewayTimeoutError extends AppError {
  constructor(message = "Provider request timed out") {
    super(message, 504, "gateway_timeout");
  }
}
