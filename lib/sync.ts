// Client-side sync utilities
import { getDeviceId } from './device-id';

export interface ProgressData {
  word_index: number;
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
    role: 'cz' | 'vi';
  };
  progress: Record<number, ProgressData & { user_id: string; updated_at: number }>;
  memory_hooks: Record<number, string>;
  category_filters: string[];
}

// Fetch data from server
export async function fetchUserData(): Promise<SyncResponse> {
  const deviceId = getDeviceId();
  const response = await fetch(`/api/sync?deviceId=${encodeURIComponent(deviceId)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch user data: ${response.statusText}`);
  }
  
  return response.json();
}

// Sync data to server
export async function syncUserData(data: {
  role?: 'cz' | 'vi';
  progress?: ProgressData[];
  memory_hooks?: Record<number, string | null>;
  category_filters?: string[];
}): Promise<SyncResponse> {
  const deviceId = getDeviceId();
  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deviceId,
      ...data,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to sync data: ${response.statusText}`);
  }
  
  return response.json();
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
  }
}

export function debouncedSync(data: Parameters<typeof syncUserData>[0]): Promise<void> {
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

