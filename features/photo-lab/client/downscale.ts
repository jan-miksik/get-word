'use client';

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

export type DownscaledPhoto = {
  blob: Blob;
  /** data:image/jpeg;base64 payload sent to the analyze API. */
  dataUrl: string;
  /** SHA-256 hex of the blob; key into the local photo store. */
  hash: string;
};

async function decodeImage(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  // createImageBitmap honours EXIF orientation, so phone portrait photos come
  // out upright. Fall back to <img> decoding where it's unavailable.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // fall through to the <img> path
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image.'));
      el.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function toJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Deterministic non-cryptographic fallback for insecure development origins.
 * Android exposes Web Crypto on HTTPS and device-local localhost, but not when
 * a dev server is opened over plain HTTP on a LAN address. The hash is only an
 * IndexedDB dedupe key; it is never used as a security boundary.
 */
export function fallbackPhotoHash(bytes: Uint8Array): string {
  const seeds = [
    0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35,
    0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5,
  ];
  const hashes = seeds.map((seed) => seed >>> 0);
  for (const byte of bytes) {
    for (let index = 0; index < hashes.length; index += 1) {
      hashes[index] = Math.imul(hashes[index] ^ (byte + index), 0x01000193) >>> 0;
    }
  }
  return hashes.map((hash) => hash.toString(16).padStart(8, '0')).join('');
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error('Could not read image.'));
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function hashPhotoBlob(blob: Blob): Promise<string> {
  const buffer = await readBlobArrayBuffer(blob);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fall through for partially implemented mobile Web Crypto APIs.
    }
  }
  return fallbackPhotoHash(new Uint8Array(buffer));
}

/**
 * Decode a picked/captured photo, scale its longest side to ≤1280px, and
 * re-encode as JPEG. Keeps upload payloads (and vision-model cost) small and
 * normalizes away HEIC/EXIF quirks from phone cameras.
 */
export async function downscalePhoto(file: File): Promise<DownscaledPhoto> {
  const { source, width, height, cleanup } = await decodeImage(file);
  try {
    if (!width || !height) throw new Error('Could not decode image.');
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not decode image.');
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await toJpegBlob(canvas);
    const [dataUrl, hash] = await Promise.all([toDataUrl(blob), hashPhotoBlob(blob)]);
    return { blob, dataUrl, hash };
  } finally {
    cleanup();
  }
}
