import type { I18nKey } from '@/lib/i18n/messages';
import type { AudioReuseMatch } from './rows';

export type TranslateFn = (key: I18nKey, values?: Record<string, string | number>) => string;

export type AudioGenerationResult = {
  id: string;
  content_hash?: string;
  audio_url: string | null;
  arweave_url?: string | null;
  arweave_urls?: string[];
  storage_ref?: string | null;
  voice_id?: string | null;
  size_bytes?: number;
  status: string;
  source?: string;
  /** Soft "please check the audio" note from the quality autofix; not a failure. */
  audio_quality_warning?: string;
  /** Freshly-synthesized bytes (base64) for instant local playback; may be absent. */
  audio_base64?: string;
  error?: string;
};

export type AudioReuseResult = {
  id: string;
  content_hash?: string;
  asset_id?: string;
  selected_asset_id?: string;
  audio_url: string | null;
  arweave_url?: string | null;
  arweave_urls?: string[];
  storage_ref?: string | null;
  voice_id?: string | null;
  size_bytes?: number;
  status: 'found' | 'missing' | 'error';
  linked?: boolean;
  error?: string;
  matches?: AudioReuseMatch[];
};

export type DebugResponsePayload = {
  status: number;
  statusText: string;
  url: string;
  contentType: string;
  rawText: string;
  json: unknown;
};

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function readDebugResponse(response: Response): Promise<DebugResponsePayload> {
  const contentType = response.headers.get('content-type') ?? '';
  const rawText = await response.text();
  let json: unknown = null;

  if (rawText.trim()) {
    try {
      json = JSON.parse(rawText);
    } catch {
      // Leave json as null so callers can surface a user-facing error.
    }
  }

  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    contentType,
    rawText,
    json,
  };
}

export function getErrorFromPayload(payload: DebugResponsePayload, t: TranslateFn): string {
  if (
    payload.json &&
    typeof payload.json === 'object' &&
    'error' in payload.json &&
    typeof payload.json.error === 'string'
  ) {
    const detail =
      'detail' in payload.json && typeof payload.json.detail === 'string'
        ? payload.json.detail
        : null;
    const requestId =
      'request_id' in payload.json && typeof payload.json.request_id === 'string'
        ? payload.json.request_id
        : null;
    const code =
      'code' in payload.json && typeof payload.json.code === 'string'
        ? payload.json.code
        : null;
    const hint =
      'hint' in payload.json && typeof payload.json.hint === 'string'
        ? payload.json.hint
        : null;

    return [
      payload.json.error,
      detail ? `Detail: ${detail}` : null,
      code ? `Code: ${code}` : null,
      hint ? `Hint: ${hint}` : null,
      requestId ? `Request: ${requestId}` : null,
    ].filter(Boolean).join(' ');
  }

  const bodyPreview = payload.rawText.trim().slice(0, 160);
  return bodyPreview
    ? `${t('lists.audioGenerateGenericFailed')} (${payload.status}): ${bodyPreview}`
    : `${t('lists.audioGenerateGenericFailed')} (${payload.status} ${payload.statusText})`;
}
