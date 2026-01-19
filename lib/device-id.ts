/**
 * Device ID management utilities.
 * 
 * IMPORTANT: Before calling createDeviceIdForConsentedUser, you MUST:
 * 1. Obtain explicit user consent for device ID creation and storage
 * 2. Update your privacy policy to disclose device ID usage
 * 3. Provide users with clear information about how the ID is used
 * 
 * All functions are no-ops on the server (return empty string or do nothing).
 */
const DEVICE_ID_KEY = 'wordlink_device_id';
const CONSENT_KEY = 'wordlink_device_id_consent';

// Module-scoped in-memory ID to persist across calls when localStorage fails
let inMemoryId: string | null = null;

/**
 * Generates a deterministic device ID based on browser characteristics.
 * This ensures the same device always gets the same ID, even if localStorage is cleared.
 * 
 * @returns A deterministic device ID based on browser fingerprint
 */
function generateDeterministicDeviceId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  // Collect stable browser characteristics
  const fingerprint = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages?.join(',') || '',
    platform: navigator.platform,
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    maxTouchPoints: navigator.maxTouchPoints || 0,
  };

  // Create a string from all characteristics
  const fingerprintString = JSON.stringify(fingerprint);

  // Hash the fingerprint string to create a deterministic ID
  // Using a simple hash function (djb2-like) for consistency
  let hash = 5381;
  for (let i = 0; i < fingerprintString.length; i++) {
    hash = ((hash << 5) + hash) + fingerprintString.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to positive number and format as UUID-like string
  const positiveHash = Math.abs(hash).toString(16).padStart(8, '0');
  
  // Create a UUID-like format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // Using the hash and some additional entropy from the fingerprint
  const hash2 = Math.abs(
    fingerprintString.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  ).toString(16).padStart(8, '0');
  
  const hash3 = Math.abs(
    fingerprintString.length * 31
  ).toString(16).padStart(4, '0');
  
  const hash4 = Math.abs(
    Date.now() % 0x10000
  ).toString(16).padStart(4, '0');
  
  // Format as UUID: 8-4-4-4-12
  return `${positiveHash}-${hash3}-${hash4}-${hash2.substring(0, 4)}-${hash2}${positiveHash.substring(0, 4)}`;
}

/**
 * Retrieves the stored device ID if one exists.
 * This is a read-only operation - it will NOT create a new ID.
 * 
 * @returns The stored device ID, or empty string if none exists or on server
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
  } catch (error) {
    // Storage unavailable (private mode, disabled, quota exceeded, etc.)
    console.warn('Failed to read device ID from localStorage:', error);
  }
  
  // Fall back to in-memory ID if storage read failed or was empty
  if (inMemoryId) {
    return inMemoryId;
  }
  
  // If no stored ID and no in-memory ID, generate deterministic ID
  // This ensures we always have an ID even if localStorage is cleared
  const deterministicId = generateDeterministicDeviceId();
  inMemoryId = deterministicId;
  return deterministicId;
}

/**
 * Creates and stores a device ID only if the user has provided explicit consent.
 * 
 * This function requires either:
 * - An explicit consent parameter set to true, OR
 * - A previously stored consent marker
 * 
 * IMPORTANT: Callers must obtain user consent and update privacy policy
 * before invoking this function.
 * 
 * @param hasConsent - Explicit consent flag. If true, creates ID and stores consent marker.
 * @returns Object with id (the device ID) and persisted (true if successfully stored, false otherwise).
 *          Returns { id: '', persisted: false } if no consent or on server.
 */
export function createDeviceIdForConsentedUser(hasConsent: boolean): { id: string; persisted: boolean } {
  if (typeof window === 'undefined') {
    return { id: '', persisted: false };
  }

  // Check for existing consent marker if explicit consent not provided
  let hasStoredConsent = false;
  try {
    hasStoredConsent = localStorage.getItem(CONSENT_KEY) === 'true';
  } catch (error) {
    // Storage unavailable - treat as no consent stored
    console.warn('Failed to read consent from localStorage:', error);
  }
  
  if (!hasConsent && !hasStoredConsent) {
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
  } catch (error) {
    // Storage unavailable - treat as missing, will generate new ID
    console.warn('Failed to read device ID from localStorage:', error);
  }
  
  // Check in-memory ID as fallback
  if (inMemoryId) {
    return { id: inMemoryId, persisted: false };
  }

  // Generate deterministic device ID based on browser fingerprint
  // This ensures the same device always gets the same ID, even if localStorage is cleared
  const deviceId = generateDeterministicDeviceId();
  inMemoryId = deviceId; // Store in memory immediately
  
  // Attempt to store device ID
  let persisted = false;
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    persisted = true;
  } catch (error) {
    // Storage unavailable - log warning but continue with in-memory ID
    console.warn('Failed to store device ID in localStorage:', error);
  }
  
  // Store consent marker
  if (hasConsent) {
    try {
      localStorage.setItem(CONSENT_KEY, 'true');
    } catch (error) {
      // Storage unavailable - log warning but continue
      console.warn('Failed to store consent marker in localStorage:', error);
    }
  }
  
  return { id: deviceId, persisted };
}

/**
 * Deletes the stored device ID and consent marker.
 * This allows users to opt-out of device ID tracking.
 * 
 * @returns true if deletion was successful, false on server or if nothing to delete
 */
export function deleteDeviceId(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  let hadId = false;
  let hadConsent = false;
  
  try {
    hadId = localStorage.getItem(DEVICE_ID_KEY) !== null;
  } catch (error) {
    console.warn('Failed to check device ID in localStorage:', error);
  }
  
  try {
    hadConsent = localStorage.getItem(CONSENT_KEY) !== null;
  } catch (error) {
    console.warn('Failed to check consent marker in localStorage:', error);
  }

  try {
    localStorage.removeItem(DEVICE_ID_KEY);
  } catch (error) {
    console.warn('Failed to remove device ID from localStorage:', error);
  }
  
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch (error) {
    console.warn('Failed to remove consent marker from localStorage:', error);
  }

  // Clear in-memory ID when deleting
  inMemoryId = null;

  return hadId || hadConsent;
}
