export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVITE_INVALID"
  | "MAX_USES_REACHED"
  | "INSUFFICIENT_POINTS"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json({ code: error.code, message: error.message }, { status: error.status });
  }
  return Response.json({ code: "INTERNAL_ERROR", message: "Internal server error" }, { status: 500 });
}
