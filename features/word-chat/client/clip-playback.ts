'use client';

// Compatibility entrypoint for the word-chat feature. Photo Lab now uses the
// same shared content-hash cache, so a clip warmed anywhere is instant elsewhere.
export {
  forgetClip,
  getWarmedClipUrl,
  prefetchClips,
  resolveClipUrl,
  storeClipBytes,
} from '@/lib/audio-clip-playback';
