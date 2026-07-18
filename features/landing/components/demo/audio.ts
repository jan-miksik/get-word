import type { AudioPlaybackDebugEvent } from '@/lib/audio-playback';
import type { DemoAudioSource } from './types';

function stripDebugParam(url: string): string {
  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const parsed = new URL(url, base);
    parsed.searchParams.delete('debug');
    return parsed.toString();
  } catch {
    return url;
  }
}

function sourceMatchesCandidate(sourceUrl: string, candidateUrl: string): boolean {
  const normalizedSource = stripDebugParam(sourceUrl);
  const normalizedCandidate = stripDebugParam(candidateUrl);
  if (normalizedSource === normalizedCandidate) return true;

  try {
    const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const source = new URL(normalizedSource, base);
    const candidate = new URL(normalizedCandidate, base);
    return source.pathname === candidate.pathname && source.search === candidate.search;
  } catch {
    return false;
  }
}

function findAudioSource(
  sources: readonly DemoAudioSource[] | undefined,
  candidateUrl: string,
): DemoAudioSource | null {
  return sources?.find((source) => sourceMatchesCandidate(source.url, candidateUrl)) ?? null;
}

export function logLandingDemoAudio(
  event: AudioPlaybackDebugEvent | { type: 'speech-fallback'; reason: string },
  context: {
    text: string;
    lang: string;
    sources?: readonly DemoAudioSource[];
  },
) {
  const src = 'src' in event ? event.src : null;
  const source = src ? findAudioSource(context.sources, src) : null;
  const details = {
    text: context.text,
    lang: context.lang,
    event: event.type,
    source: source?.source ?? (src ? 'unknown' : 'speechSynthesis'),
    generatedBy: source?.generatedBy ?? (src ? 'unknown' : 'browser speechSynthesis'),
    provider: source?.provider ?? null,
    voice: source?.voice ?? null,
    contentHash: source?.contentHash ?? null,
    storageType: source?.storageType ?? null,
    storageProvider: source?.storageProvider ?? null,
    storageRef: source?.storageRef ?? null,
    sizeBytes: source?.sizeBytes ?? null,
    createdAt: source?.createdAt ?? null,
    candidateIndex: 'candidateIndex' in event ? event.candidateIndex : null,
    url: src,
    reason: 'reason' in event ? event.reason : null,
    error: 'error' in event ? event.error : null,
  };

  if (event.type === 'error' || event.type === 'rejected' || event.type === 'exhausted') {
    console.warn('[Get Word landing demo audio]', details);
    return;
  }

  console.log('[Get Word landing demo audio]', details);
}
