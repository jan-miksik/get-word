import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import type {
  ProposedItem,
  ReviewItem,
  WordChatMessage,
} from '../types';

/**
 * Error carrying the server's machine-readable code so the UI can tell
 * "you hit a limit" (actionable, explain it) from "the model is down"
 * (fall back to the ready-made list) without matching on message text.
 */
export class WordChatApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
    /**
     * The server's own verdict on whether a second attempt could work. A model
     * call that timed out or came back truncated is worth retrying; a rejected
     * key is not.
     */
    readonly retryable = false,
    /** Real cause, sent to editors and dev builds only. Never shown to learners. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'WordChatApiError';
  }

  /**
   * The chat cannot be used at all right now — offer the ready-made list.
   * A bare 503 with no code is something in front of the app (proxy, edge), so
   * it counts too, but an explicitly transient failure never does.
   */
  get isUnavailable(): boolean {
    if (this.code === 'WORD_CHAT_UNAVAILABLE') return true;
    return this.status === 503 && this.code === null;
  }

  /** Worth offering a Retry button for, without losing the conversation. */
  get isTemporary(): boolean {
    return this.retryable && !this.isUnavailable;
  }

  get isLimitReached(): boolean {
    return this.status === 429 || this.code === 'DAILY_LIMIT_REACHED';
  }
}

function toApiError(data: Record<string, unknown>, status: number): WordChatApiError {
  const error = new WordChatApiError(
    typeof data.error === 'string' ? data.error : 'Request failed',
    typeof data.code === 'string' ? data.code : null,
    status,
    data.retryable === true,
    typeof data.detail === 'string' ? data.detail : null,
  );
  // The detail exists to be seen: in dev and for editors it is the only place
  // the provider's actual status shows up on the client side.
  if (error.detail) console.warn('[word-chat] server detail:', error.detail);
  return error;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await deviceJsonFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (err) {
    // A dropped connection is the most retryable failure there is; it must not
    // reach the UI as an unknown error and end the session.
    throw new WordChatApiError(
      err instanceof Error ? err.message : 'Network request failed',
      'WORD_CHAT_NETWORK',
      0,
      true,
    );
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw toApiError(data, response.status);
  return data as T;
}

/** One model call, as reported back for the editor debug panel. */
export type CallDiagnostics = {
  call_type: 'chat' | 'proposal' | 'translation';
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
  request: {
    maxTokens: number;
    provider: unknown;
    messages: { role: string; content: string }[];
  } | null;
};

export type WordChatContextResponse = {
  has_history: boolean;
  goals: string[];
  covered_topics: string[];
  missing_topics: string[];
  monthly_used: number;
  monthly_limit: number;
  is_editor: boolean;
  models: {
    defaults: { chat: string; proposal: string; translation: string };
    selectable: {
      id: string;
      input_price_per_million: number;
      output_price_per_million: number;
    }[];
  } | null;
};

/**
 * What the chat already knows about this learner. Deterministic and model-free,
 * so it is safe to call every time the screen opens.
 */
export async function fetchWordChatContext(input: {
  languageFrom: string;
  languageTo: string;
}): Promise<WordChatContextResponse> {
  const response = await deviceJsonFetch(
    `/api/word-chat/context?from=${encodeURIComponent(input.languageFrom)}&to=${encodeURIComponent(input.languageTo)}`,
  );
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw toApiError(data, response.status);
  return data as WordChatContextResponse;
}

export type ChatMessageResponse = {
  reply: string;
  suggestions: string[];
  ready_to_propose: boolean;
  diagnostics: CallDiagnostics | null;
};

export function sendChatMessage(input: {
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  messages: WordChatMessage[];
  /** Editor-only model override; ignored by the server for everyone else. */
  model?: string | null;
}) {
  return post<ChatMessageResponse>('/api/word-chat/message', {
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    chat_language: input.chatLanguage,
    messages: input.messages,
    ...(input.model ? { model: input.model } : {}),
  });
}

export type ProposeResponse = {
  diagnostics: CallDiagnostics | null;
  category_name: string;
  review_label: string;
  items: ProposedItem[];
  ask_visibility: boolean;
  limits: {
    max_items_per_session: number;
    soft_item_warning_threshold: number;
    monthly_used: number;
    monthly_limit: number;
    monthly_reset_at: string;
  };
};

export function requestProposal(input: {
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  messages: WordChatMessage[];
  model?: string | null;
}) {
  return post<ProposeResponse>('/api/word-chat/propose', {
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    chat_language: input.chatLanguage,
    messages: input.messages,
    ...(input.model ? { model: input.model } : {}),
  });
}

export type TranslateResponse = {
  items: {
    kind: 'sentence' | 'word';
    text_known: string;
    text_target: string;
    corpus_item_id: string | null;
    audio_asset_id: string | null;
    audio_hash: string | null;
    known_audio_asset_id: string | null;
    warnings: string[];
    reused: boolean;
  }[];
  translation_diagnostics: {
    model: string;
    input_tokens: number;
    output_tokens: number;
    estimated_cost_usd: number;
  };
  diagnostics: CallDiagnostics | null;
};

export function translateSelection(input: {
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  items: { kind: 'sentence' | 'word'; text: string; corpusItemId?: string }[];
  model?: string | null;
}) {
  return post<TranslateResponse>('/api/word-chat/translate', {
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    ...(input.model ? { model: input.model } : {}),
    items: input.items.map((item) => ({
      kind: item.kind,
      text: item.text,
      corpus_item_id: item.corpusItemId ?? null,
    })),
  });
}

export type AudioResponse = {
  results: {
    key: string;
    status: 'ok' | 'error' | 'skipped';
    asset_id: string | null;
    content_hash: string | null;
    /** Fresh bytes for instant playback; null for reused clips. */
    audio_base64: string | null;
    error: string | null;
  }[];
  quota_exhausted: string | null;
};

export function generateAudio(input: {
  items: { key: string; text: string; language: string }[];
}) {
  return post<AudioResponse>('/api/word-chat/audio', { items: input.items });
}

export type CommitResponse = {
  list_id: string;
  category_id: string;
  item_count: number;
  already_committed: boolean;
  monthly_used: number;
  monthly_limit: number;
};

export function commitSession(input: {
  creationKey: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  categoryName: string;
  reviewLabel: string;
  isPublic: boolean;
  items: ReviewItem[];
  messages: WordChatMessage[];
}) {
  return post<CommitResponse>('/api/word-chat/commit', {
    creation_key: input.creationKey,
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    category_name: input.categoryName,
    review_label: input.reviewLabel,
    is_public: input.isPublic,
    review_opt_in: true,
    items: input.items.map((item) => ({
      kind: item.kind,
      text_known: item.textKnown,
      text_target: item.textTarget,
      corpus_item_id: item.corpusItemId ?? null,
      audio_asset_id: item.audioAssetId ?? null,
      known_audio_asset_id: item.knownAudioAssetId ?? null,
    })),
    messages: input.messages,
  });
}
