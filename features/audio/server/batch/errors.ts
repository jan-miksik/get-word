export function getErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown error";
  const cause = err.cause;
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  if (
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message;
  }
  return err.message;
}
