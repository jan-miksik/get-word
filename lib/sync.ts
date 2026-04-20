// Client-side sync utilities
import { getDeviceId } from "./device-id";

// In-memory only: set from API responses, passed as hint to API. No localStorage.
let lastKnownUserId: string | null = null;
let authRequired = false;

const AUTH_REQUIRED_TEXT = "Authentication required";
const SHOULD_LOG_TIMING = process.env.NEXT_PUBLIC_DEBUG_TIMING === "1";

function logClientTiming(label: string, startMs: number): void {
  if (!SHOULD_LOG_TIMING) return;
  console.info(`[timing] ${label} ${(performance.now() - startMs).toFixed(1)}ms`);
}

function logServerTimingHeader(response: Response, endpoint: string): void {
  if (!SHOULD_LOG_TIMING) return;
  const header = response.headers.get("server-timing");
  if (header) {
    console.info(`[timing] ${endpoint} server-timing: ${header}`);
  }
}

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
        return text;
      }
    }
  } catch {
    // Fall back to status-based message below.
  }

  return fallback;
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
}

/** API request shape for progress items. */
export interface SyncProgressItem {
  word_id?: string; // legacy: old word ID like "w000"
  word_list_item_id?: string; // new: UUID from word_list_items
  stage_index: number;
  known_count: number;
  unknown_count: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
  next_due_at: number | null;
}

/** Word list item from the API (matches DB word_list_items table). */
export interface SyncWordListItem {
  id: string;
  listId: string;
  categoryId: string | null;
  position: number;
  textKnown: string;
  textTarget: string | null;
  translationStatus: string;
  audioAssetId: string | null;
  audioStatus: string;
  notes: string | null;
}

/** Category info returned alongside word_list_items. */
export interface SyncCategory {
  name: string;
  position: number;
}

/** App-side progress shape (stageIndex, camelCase). Used by useAppState, WordCard, etc. */
export interface ProgressData {
  stageIndex: number;
  knownCount: number;
  unknownCount: number;
  lastKnownAt?: number;
  lastUnknownAt?: number;
  nextDueAt?: number;
}

export interface SyncResponse {
  success: boolean;
  user: {
    id: string;
    role: "cz" | "vi";
    user_role?: "user" | "editor";
    show_english?: boolean;
    show_category_badges?: boolean;
    show_pronunciation?: boolean;
    memory_hooks_enabled?: boolean;
    memory_hook_disable_from_stage?: number;
    wallet_address?: string | null;
    email?: string | null;
    auth_provider?: string | null;
    game_score?: number;
    category_order?: string[];
  };
  progress: Record<
    string,
    {
      id: string;
      userId: string;
      wordId: string | null;
      wordListItemId: string | null;
      stageIndex: number;
      knownCount: number;
      unknownCount: number;
      lastKnownAt: string | null;
      lastUnknownAt: string | null;
      nextDueAt: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >;
  memory_hooks: Record<string, string>;
  category_filters: string[];
  word_list_items?: SyncWordListItem[];
  categories?: Record<string, SyncCategory>;
  lists?: { id: string; name: string }[];
}

// Fetch data from server (DB-only; no localStorage).
export async function fetchUserData(): Promise<SyncResponse> {
  const startedAt = performance.now();
  const deviceId = getDeviceId();
  const params = new URLSearchParams();
  if (deviceId) params.set('deviceId', deviceId);
  if (lastKnownUserId) params.set('userId', lastKnownUserId);

  try {
    const fetchStart = performance.now();
    const response = await fetch(`/api/sync?${params.toString()}`);
    logClientTiming("fetchUserData.fetch", fetchStart);
    logServerTimingHeader(response, "/api/sync GET");

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

    const parseStart = performance.now();
    const data = await response.json();
    logClientTiming("fetchUserData.parseJson", parseStart);
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch user data: Unknown error');
    }
    if (data.user?.id) {
      lastKnownUserId = data.user.id;
      authRequired = false;
    }
    logClientTiming("fetchUserData.total", startedAt);
    return data;
  } catch (error) {
    logClientTiming("fetchUserData.totalFailed", startedAt);
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
  const startedAt = performance.now();
  const deviceId = getDeviceId();

  try {
    const fetchStart = performance.now();
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
    logClientTiming("linkWallet.fetch", fetchStart);
    logServerTimingHeader(response, "/api/auth/link-wallet POST");

    if (!response.ok) {
      logClientTiming("linkWallet.totalFailed", startedAt);
      const errorMessage = await readResponseError(
        response,
        `Failed to link wallet: ${response.status} ${response.statusText}`
      );
      throw new Error(errorMessage);
    }

    const parseStart = performance.now();
    const result = await response.json();
    logClientTiming("linkWallet.parseJson", parseStart);
    if (!result.success) {
      logClientTiming("linkWallet.totalFailed", startedAt);
      throw new Error(result.error || 'Failed to link wallet: Unknown error');
    }
    if (result.user?.id) {
      lastKnownUserId = result.user.id;
      authRequired = false;
    }
    logClientTiming("linkWallet.total", startedAt);
    return result;
  } catch (error) {
    logClientTiming("linkWallet.totalFailed", startedAt);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(toNetworkErrorMessage("Failed to link wallet", error));
  }
}

// Sync data to server (DB-only; no localStorage).
export async function syncUserData(data: {
  role?: "cz" | "vi";
  show_english?: boolean;
  show_category_badges?: boolean;
  show_pronunciation?: boolean;
  memory_hooks_enabled?: boolean;
  memory_hook_disable_from_stage?: number;
  game_score?: number;
  category_order?: string[];
  progress?: SyncProgressItem[];
  memory_hooks?: Record<string, string | null>;
  category_filters?: string[];
}): Promise<SyncResponse> {
  if (authRequired) {
    throw new AuthRequiredError("Failed to sync data");
  }
  const deviceId = getDeviceId();

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      userId: lastKnownUserId,
      ...data,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      authRequired = true;
      throw new AuthRequiredError("Failed to sync data");
    }
    let errorMessage = `Failed to sync data: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = `Failed to sync data: ${errorData.error}`;
      }
    } catch {
      // Ignore JSON parse failures and keep status-based message
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();
  if (result.user?.id) {
    lastKnownUserId = result.user.id;
    authRequired = false;
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
