import { createHash } from "crypto";

/**
 * Stable, non-reversible pseudonymous handle for an app user id, e.g.
 * `user_8a3f1c2d9e0b`. Shown by default in the admin "who to write to" table so
 * the operator sees behaviour without a name until they deliberately reveal the
 * e-mail. Deterministic (same user id → same handle across reloads); the 12 hex
 * chars of a SHA-256 give ample separation for the dashboard's scale.
 */
export function userHandle(userId: string): string {
  const digest = createHash("sha256").update(userId).digest("hex");
  return `user_${digest.slice(0, 12)}`;
}
