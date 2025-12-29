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
const SYNC_DELAY = 1000; // 1 second

export function debouncedSync(data: Parameters<typeof syncUserData>[0]) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  
  syncTimeout = window.setTimeout(() => {
    syncUserData(data).catch((error) => {
      console.error('Sync failed:', error);
      // Could implement retry logic or offline queue here
    });
  }, SYNC_DELAY);
}

