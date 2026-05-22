// Client-side sync utilities
import { getDeviceId } from "./device-id";
import { getSessionId } from "./session-id";
import {
  clearAppliedReviewEvents,
  type ReviewEventPayload,
} from "./review-events";
import type {
  SyncMutationPayload,
  SyncResponse,
} from "@/features/sync/types";

export type {
  ProgressData,
  SyncMutationPayload,
  SyncProgressItem,
  SyncRequest,
  SyncResponse,
  SyncCategory,
  SyncWordListItem,
} from "@/features/sync/types";

// In-memory only: set from API responses, passed as hint to API. No localStorage.
let lastKnownUserId: string | null = null;
let authRequired = false;
// True once we've successfully applied a server snapshot at least once this
// session. Used to gate preference syncs so failed-hydration defaults can't
// overwrite remote state.
let hasServerSnapshot = false;

const AUTH_REQUIRED_TEXT = "Authentication required";

async function readResponseError(
  response: Response,
  fallback: string
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (typeof data?.error === "string" && data.error.trim()) {
        return data.error.trim();
      }
      if (typeof data?.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
    } else {
      const text = (await response.text()).trim();
      if (text) {
        return summarizeTextError(text, fallback);
      }
    }
  } catch {
    // Fall back to status-based message below.
  }

  return fallback;
}

function summarizeTextError(text: string, fallback: string): string {
  const looksLikeHtml = /^<!doctype html/i.test(text) || /^<html[\s>]/i.test(text);
  if (!looksLikeHtml) {
    return text.length > 500 ? `${text.slice(0, 497)}...` : text;
  }

  const nextData = text.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextData) {
    try {
      const parsed = JSON.parse(nextData) as {
        err?: { message?: string; statusCode?: number };
        props?: { pageProps?: { statusCode?: number } };
      };
      const statusCode = parsed.err?.statusCode ?? parsed.props?.pageProps?.statusCode;
      const message = parsed.err?.message;
      if (statusCode && message) return `${fallback}. Server returned ${statusCode}: ${message}`;
      if (message) return `${fallback}. Server returned an HTML error page: ${message}`;
    } catch {
      // Keep the compact fallback below.
    }
  }

  return `${fallback}. Server returned an HTML error page instead of JSON.`;
}

function toNetworkErrorMessage(context: string, error: unknown): string {
  if (error instanceof Error) {
    return `${context}: ${error.message}`;
  }
  return `${context}: ${String(error)}`;
}

export class AuthRequiredError extends Error {
  constructor(context: string) {
    super(`${context}: ${AUTH_REQUIRED_TEXT}`);
    this.name = "AuthRequiredError";
  }
}

export function isAuthRequiredError(error: unknown): boolean {
  if (error instanceof AuthRequiredError) return true;
  return error instanceof Error && error.message.includes(AUTH_REQUIRED_TEXT);
}

/** Clears in-memory user hint so subsequent syncs don't attach to the previous user. */
export function resetSyncIdentity(): void {
  lastKnownUserId = null;
  authRequired = false;
  hasServerSnapshot = false;
}

/** True once a server snapshot has been applied this session. */
export function hasReceivedServerSnapshot(): boolean {
  return hasServerSnapshot;
}

/** Called by the hydration layer after a server payload is successfully applied. */
export function markServerSnapshotApplied(): void {
  hasServerSnapshot = true;
}

// Fetch data from server (DB-only; no localStorage).
export async function fetchUserData(): Promise<SyncResponse> {
  const deviceId = getDeviceId();
  const sessionId = getSessionId();
  const params = new URLSearchParams();
  if (deviceId) params.set('deviceId', deviceId);
  if (sessionId) params.set('sessionId', sessionId);
  if (lastKnownUserId) params.set('userId', lastKnownUserId);

  try {
    const response = await fetch(`/api/sync?${params.toString()}`);

    if (!response.ok) {
      if (response.status === 401) {
        authRequired = true;
        throw new AuthRequiredError("Failed to fetch user data");
      }
      const errorMessage = await readResponseError(
        response,
        `Failed to fetch user data: ${response.status} ${response.statusText}`
      );
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch user data: Unknown error');
    }
    if (data.user?.id) {
      lastKnownUserId = data.user.id;
      authRequired = false;
    }
    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(toNetworkErrorMessage("Failed to fetch user data", error));
  }
}

/** Link a wallet (and optionally email/auth provider) to the current device user. */
export async function linkWallet(
  walletAddress: string,
  opts?: { email?: string | null; authProvider?: string | null }
): Promise<SyncResponse> {
  const deviceId = getDeviceId();

  try {
    const response = await fetch('/api/auth/link-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        walletAddress,
        ...(opts?.email != null && { email: opts.email }),
        ...(opts?.authProvider != null && { authProvider: opts.authProvider }),
      }),
    });

    if (!response.ok) {
      const errorMessage = await readResponseError(
        response,
        `Failed to link wallet: ${response.status} ${response.statusText}`
      );
      throw new Error(errorMessage);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to link wallet: Unknown error');
    }
    if (result.user?.id) {
      lastKnownUserId = result.user.id;
      authRequired = false;
    }
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(toNetworkErrorMessage("Failed to link wallet", error));
  }
}

// Sync data to server (DB-only; no localStorage).
export async function syncUserData(
  data: SyncMutationPayload & { review_events?: ReviewEventPayload[] }
): Promise<SyncResponse> {
  if (authRequired) {
    throw new AuthRequiredError("Failed to sync data");
  }
  const deviceId = getDeviceId();
  const sessionId = getSessionId();

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      sessionId,
      userId: lastKnownUserId,
      ...data,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      authRequired = true;
      throw new AuthRequiredError("Failed to sync data");
    }
    const errorMessage = await readResponseError(
      response,
      `Failed to sync data: ${response.status} ${response.statusText}`
    );
    throw new Error(errorMessage);
  }

  const result = await response.json();
  if (result.user?.id) {
    lastKnownUserId = result.user.id;
    authRequired = false;
  }
  clearAppliedReviewEvents(result.applied_review_event_ids);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("wordlink:server-sync", { detail: result })
    );
  }
  return result;
}

// Debounced sync helper
let syncTimeout: number | null = null;
let pendingPromise: Promise<void> | null = null;
let resolvePending: (() => void) | null = null;
let rejectPending: ((error: unknown) => void) | null = null;
let latestData: Parameters<typeof syncUserData>[0] | null = null;
const SYNC_DELAY = 2500; // 2.5 seconds

/** Clears any pending debounced sync so the next sync uses fresh state (e.g. after user switch). */
export function clearPendingSync(): void {
  if (syncTimeout !== null) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  latestData = null;
  if (resolvePending) {
    resolvePending();
    resolvePending = null;
    rejectPending = null;
    pendingPromise = null;
  }
}

function executeSync(): void {
  if (!latestData || !resolvePending || !rejectPending) return;

  // Capture locals and immediately reset module state so concurrent
  // calls to debouncedSync get a fresh promise instead of sharing these handlers.
  const data = latestData;
  const resolve = resolvePending;
  const reject = rejectPending;

  pendingPromise = null;
  resolvePending = null;
  rejectPending = null;
  syncTimeout = null;
  latestData = null;

  syncUserData(data)
    .then(() => resolve())
    .catch((error) => {
      if (isAuthRequiredError(error)) {
        resolve();
        return;
      }
      reject(error);
    });
}

export function debouncedSync(
  data: Parameters<typeof syncUserData>[0]
): Promise<void> {
  // Merge into pending payload so we don't overwrite e.g. game_score when progress sync runs
  latestData = latestData ? { ...latestData, ...data } : data;

  // If there's already a pending promise, return it (callers get the same promise)
  if (pendingPromise) {
    // Clear the existing timeout and recreate it with the latest data
    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }

    // Recreate the timeout with the latest data
    syncTimeout = window.setTimeout(executeSync, SYNC_DELAY);

    return pendingPromise;
  }

  // Create a new promise and its resolve/reject handlers
  pendingPromise = new Promise<void>((resolve, reject) => {
    resolvePending = resolve;
    rejectPending = reject;
  });

  // Schedule the timeout
  syncTimeout = window.setTimeout(executeSync, SYNC_DELAY);

  return pendingPromise;
}
