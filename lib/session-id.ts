const SESSION_ID_KEY = "wordlink_session_id";

let inMemorySessionId: string | null = null;

export function getSessionId(): string {
  if (typeof window === "undefined") return "";

  try {
    const stored = sessionStorage.getItem(SESSION_ID_KEY);
    if (stored) {
      inMemorySessionId = stored;
      return stored;
    }
  } catch {
    // sessionStorage may be unavailable in hardened/private contexts.
  }

  if (inMemorySessionId) return inMemorySessionId;

  const sessionId = crypto.randomUUID();
  inMemorySessionId = sessionId;

  try {
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  } catch {
    // In-memory fallback is enough for the lifetime of this tab.
  }

  return sessionId;
}
