/**
 * Device ID management utilities.
 *
 * This is the only remaining client-side persistence (localStorage) in the app.
 * All other user data (progress, role, memory hooks, category filters,
 * show_english, show_category_badges) is stored in the DB only.
 *
 * Device IDs are used for:
 * - Identifying the device when calling /api/sync (get or create user by deviceId)
 * - Syncing learning progress, preferences, and spaced repetition state
 *
 * Under GDPR/ePrivacy, this qualifies as "strictly necessary" storage.
 * Users can delete their device ID via deleteDeviceId().
 *
 * All functions are no-ops on the server (return empty string or do nothing).
 */
const DEVICE_ID_KEY = 'get_word_device_id';

// Module-scoped in-memory ID to persist across calls when localStorage fails
let inMemoryId: string | null = null;

/**
 * Gets or creates a device ID.
 * 
 * If no device ID exists, one will be automatically created and stored.
 * This is essential functionality for the app, so no consent is required.
 * 
 * @returns The device ID, or empty string on server
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      // Update in-memory ID if we successfully read from storage
      inMemoryId = stored;
      return stored;
    }
  } catch {
    // Storage unavailable (private mode, disabled, quota exceeded, etc.)
  }
  
  // Fall back to in-memory ID if available
  if (inMemoryId) {
    return inMemoryId;
  }

  // No ID exists, create one automatically
  const { id } = getOrCreateDeviceId();
  return id;
}

/**
 * Gets or creates a device ID.
 * 
 * This function automatically creates and stores a device ID if one doesn't exist.
 * No consent is required as this is essential functionality for the app to work.
 * 
 * @returns Object with id (the device ID) and persisted (true if successfully stored, false otherwise).
 *          Returns { id: '', persisted: false } on server.
 */
export function getOrCreateDeviceId(): { id: string; persisted: boolean } {
  if (typeof window === 'undefined') {
    return { id: '', persisted: false };
  }

  // Check if device ID already exists
  let existingId: string | null = null;
  try {
    existingId = localStorage.getItem(DEVICE_ID_KEY);
    if (existingId) {
      // Update in-memory ID if we successfully read from storage
      inMemoryId = existingId;
      return { id: existingId, persisted: true };
    }
  } catch {
    // Storage unavailable - treat as missing, will generate new ID
  }
  
  // Check in-memory ID as fallback
  if (inMemoryId) {
    return { id: inMemoryId, persisted: false };
  }

  // Generate new device ID
  const deviceId = crypto.randomUUID();
  inMemoryId = deviceId; // Store in memory immediately
  
  // Attempt to store device ID
  let persisted = false;
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    persisted = true;
  } catch {
    // Storage unavailable - log warning but continue with in-memory ID
  }
  
  return { id: deviceId, persisted };
}

/**
 * Deletes the stored device ID.
 * This allows users to reset their device identity and start fresh.
 * 
 * Note: Deleting the device ID will cause the user to appear as a new user
 * on the next sync, potentially creating a new user account.
 * 
 * @returns true if deletion was successful, false on server or if nothing to delete
 */
export function deleteDeviceId(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  let hadId = false;
  
  try {
    hadId = localStorage.getItem(DEVICE_ID_KEY) !== null;
  } catch {
  }

  try {
    localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
  }

  // Clear in-memory ID when deleting
  inMemoryId = null;

  return hadId;
}
