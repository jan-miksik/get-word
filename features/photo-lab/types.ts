/**
 * Photo Lab uses an AI vision model to label objects in a
 * user's photo with the known-language word (shown) and the learning-language
 * word (revealed on tap). Sessions live only on the device (IndexedDB).
 */

/** One labeled object. Coordinates are normalized 0–1 relative to the image. */
export type PhotoLabLabel = {
  id: string;
  /** Word in the user's known language (visible side). */
  known: string;
  /** Word in the learning/target language (hidden side). */
  target: string;
  /** Center of the detected object's bounding box. */
  x: number;
  y: number;
  /** Bounding box size — kept so future modes can outline the object. */
  w: number;
  h: number;
};

/**
 * One analyzed photo. Mode-agnostic: stores only content, so sessions saved
 * under tap-to-reveal replay unchanged in future typing/scratch modes.
 */
export type PhotoLabSession = {
  id: string;
  createdAt: number;
  languageFrom: string;
  languageTo: string;
  /** SHA-256 of the downscaled photo blob; key into the photos store. */
  photoHash: string;
  labels: PhotoLabLabel[];
  /**
   * label.id → TTS audio content hash (served by /api/audio/[hash]).
   * Absent = audio was never successfully requested; `{}` = requested but
   * nothing was available. Filled in asynchronously after analysis.
   */
  audioHashes?: Record<string, string>;
};
