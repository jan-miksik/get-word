/**
 * The bearer session the native client authenticates with, held in memory so
 * that every shared API call can read it synchronously. The durable copy lives
 * in the Keychain (`secure-session.ts`); this is the value handed to
 * `configureApiRuntime` at boot.
 */
let sessionToken: string | null = null;

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setSessionToken(next: string | null): void {
  sessionToken = next;
}
