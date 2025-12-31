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
    return localStorage.getItem(DEVICE_ID_KEY) || '';
  } catch (error) {
    // Storage unavailable (private mode, disabled, quota exceeded, etc.)
    // Treat as missing key and return empty string
    console.warn('Failed to read device ID from localStorage:', error);
    return '';
  }
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
 * @returns The created or existing device ID, or empty string if no consent or on server
 */
export function createDeviceIdForConsentedUser(hasConsent: boolean): string {
  if (typeof window === 'undefined') {
    return '';
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
    return '';
  }

  // Check if device ID already exists
  let existingId: string | null = null;
  try {
    existingId = localStorage.getItem(DEVICE_ID_KEY);
  } catch (error) {
    // Storage unavailable - treat as missing, will generate new ID
    console.warn('Failed to read device ID from localStorage:', error);
  }
  
  if (existingId) {
    return existingId;
  }

  // Generate new device ID
  const deviceId = crypto.randomUUID();
  
  // Attempt to store device ID
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch (error) {
    // Storage unavailable - log warning but continue with in-memory ID
    console.warn('Failed to store device ID in localStorage:', error);
    // Return the generated ID anyway so the app continues to work
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
  
  return deviceId;
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

  return hadId || hadConsent;
}

