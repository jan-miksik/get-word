// Client-side sync utilities
import { getDeviceId } from "./device-id";

const USER_ID_KEY = 'wordlink_user_id';

export interface ProgressData {
  word_id: string;
  stage_index: number;
  known_count: number;
  unknown_count: number;
  last_known_at: number | null;
  last_unknown_at: number | null;
  next_due_at: number | null;
}

export interface SyncResponse {
  success: boolean;
  user: {
    id: string;
    role: "cz" | "vi";
  };
  progress: Record<
    string,
    {
      id: string;
      userId: string;
      wordId: string;
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
}

// Store user ID in localStorage for persistence
function storeUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_ID_KEY, userId);
  } catch (error) {
    console.warn('Failed to store user ID in localStorage:', error);
  }
}

// Get stored user ID from localStorage
export function getStoredUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch (error) {
    console.warn('Failed to read user ID from localStorage:', error);
    return null;
  }
}

// Fetch data from server
export async function fetchUserData(): Promise<SyncResponse> {
  const deviceId = getDeviceId();
  const userId = getStoredUserId(); // Get stored user ID as fallback
  
  // Build query string with both device ID and user ID (if available)
  const params = new URLSearchParams();
  if (deviceId) params.set('deviceId', deviceId);
  if (userId) params.set('userId', userId);
  
  const response = await fetch(`/api/sync?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch user data: ${response.statusText}`);
  }

  const data = await response.json();
  // Store user ID for persistence
  if (data.user?.id) {
    storeUserId(data.user.id);
  }
  return data;
}

// Sync data to server
export async function syncUserData(data: {
  role?: "cz" | "vi";
  progress?: ProgressData[];
  memory_hooks?: Record<string, string | null>;
  category_filters?: string[];
}): Promise<SyncResponse> {
  const deviceId = getDeviceId();
  const userId = getStoredUserId(); // Get stored user ID as fallback
  
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceId,
      userId, // Include user ID as fallback
      ...data,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }

  const result = await response.json();
  // Store user ID for persistence
  if (result.user?.id) {
    storeUserId(result.user.id);
  }
  return result;
}

// Debounced sync helper
let syncTimeout: number | null = null;
let pendingPromise: Promise<void> | null = null;
let resolvePending: (() => void) | null = null;
let rejectPending: ((error: unknown) => void) | null = null;
let latestData: Parameters<typeof syncUserData>[0] | null = null;
const SYNC_DELAY = 1000; // 1 second

function executeSync(): void {
  if (latestData && resolvePending && rejectPending) {
    try {
      syncUserData(latestData)
        .then(() => {
          resolvePending!();
        })
        .catch((error) => {
          rejectPending!(error);
        })
        .finally(() => {
          pendingPromise = null;
          resolvePending = null;
          rejectPending = null;
          syncTimeout = null;
          latestData = null;
        });
    } catch (error) {
      rejectPending!(error);
      pendingPromise = null;
      resolvePending = null;
      rejectPending = null;
      syncTimeout = null;
      latestData = null;
    }
  }
}

export function debouncedSync(
  data: Parameters<typeof syncUserData>[0]
): Promise<void> {
  // Store the latest data to sync
  latestData = data;

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
