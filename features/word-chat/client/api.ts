import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import type {
  WordChatAddressRegister,
  WordChatLanguageLevel,
  ProposedItem,
  ReviewItem,
  WordChatSalutationGender,
  TakeoverReference,
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
  situations: string[];
  covered_topics: string[];
  missing_topics: string[];
  personal_list_name: string | null;
  address_register: WordChatAddressRegister | null;
  salutation_gender: WordChatSalutationGender | null;
  language_level: WordChatLanguageLevel | null;
  preferences_complete: {
    global: boolean;
    language: boolean;
  };
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
  baseListId?: string | null;
}): Promise<WordChatContextResponse> {
  const params = new URLSearchParams({
    from: input.languageFrom,
    to: input.languageTo,
  });
  if (input.baseListId) params.set('base_list_id', input.baseListId);
  const response = await deviceJsonFetch(
    `/api/word-chat/context?${params.toString()}`,
  );
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw toApiError(data, response.status);
  return data as WordChatContextResponse;
}

export function saveWordChatPreferences(input: {
  addressRegister?: WordChatAddressRegister;
  salutationGender?: WordChatSalutationGender;
  languageLevel?: WordChatLanguageLevel;
  languageFrom: string;
  languageTo: string;
  baseListId?: string | null;
}) {
  return post<{
    address_register: WordChatAddressRegister | null;
    salutation_gender: WordChatSalutationGender | null;
    language_level: WordChatLanguageLevel | null;
    preferences_complete: {
      global: boolean;
      language: boolean;
    };
  }>(
    '/api/word-chat/context',
    {
      ...(input.addressRegister ? { address_register: input.addressRegister } : {}),
      ...(input.salutationGender ? { salutation_gender: input.salutationGender } : {}),
      ...(input.languageLevel ? { language_level: input.languageLevel } : {}),
      language_from: input.languageFrom,
      language_to: input.languageTo,
      ...(input.baseListId ? { base_list_id: input.baseListId } : {}),
    },
  );
}

type ChatMessageResponse = {
  reply: string;
  suggestions: string[];
  ready_to_propose: boolean;
  language_change: { from: string; to: string } | null;
  diagnostics: CallDiagnostics | null;
};

export type ChatMessageStreamResponse = ChatMessageResponse & {
  metadata_valid: boolean;
};

type RawChatStreamEvent =
  | { type: 'delta'; text?: unknown }
  | {
      type: 'done';
      reply?: unknown;
      suggestions?: unknown;
      ready_to_propose?: unknown;
      language_change?: unknown;
      metadata_valid?: unknown;
      diagnostics?: unknown;
    }
  | { type: 'error'; error?: unknown; code?: unknown; retryable?: unknown };

export async function readNdjsonStream<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handleLine = (line: string) => {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1).trim() : line.trim();
    if (!trimmed) return;
    onEvent(JSON.parse(trimmed) as T);
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);
  } finally {
    reader.releaseLock();
  }
}

export async function sendChatMessageStream(
  input: {
    sessionId: string;
    languageFrom: string;
    languageTo: string;
    chatLanguage: string;
    addressRegister: WordChatAddressRegister;
    salutationGender: WordChatSalutationGender | null;
    languageLevel: WordChatLanguageLevel;
    messages: WordChatMessage[];
    model?: string | null;
    signal?: AbortSignal;
  },
  handlers: { onDelta: (text: string) => void },
): Promise<ChatMessageStreamResponse> {
  let response: Response;
  try {
    response = await deviceJsonFetch('/api/word-chat/message', {
      method: 'POST',
      signal: input.signal,
      body: JSON.stringify({
        stream: true,
        session_id: input.sessionId,
        language_from: input.languageFrom,
        language_to: input.languageTo,
        chat_language: input.chatLanguage,
        address_register: input.addressRegister,
        salutation_gender: input.salutationGender,
        language_level: input.languageLevel,
        messages: input.messages,
        ...(input.model ? { model: input.model } : {}),
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WordChatApiError('Request cancelled', 'WORD_CHAT_ABORTED', 0, false);
    }
    throw new WordChatApiError(
      err instanceof Error ? err.message : 'Network request failed',
      'WORD_CHAT_NETWORK',
      0,
      true,
    );
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw toApiError(data, response.status);
  }
  if (!response.body) {
    throw new WordChatApiError('Stream did not start', 'WORD_CHAT_TEMPORARY', 503, true);
  }

  const result: { done?: ChatMessageStreamResponse } = {};
  try {
    await readNdjsonStream<RawChatStreamEvent>(response.body, (event) => {
      if (event.type === 'delta') {
        if (typeof event.text === 'string' && event.text) handlers.onDelta(event.text);
        return;
      }
      if (event.type === 'error') {
        throw new WordChatApiError(
          typeof event.error === 'string' ? event.error : 'The word chat could not answer.',
          typeof event.code === 'string' ? event.code : 'WORD_CHAT_TEMPORARY',
          503,
          event.retryable !== false,
        );
      }
      if (event.type === 'done') {
        const rawLanguageChange =
          event.language_change && typeof event.language_change === 'object'
            ? (event.language_change as { from?: unknown; to?: unknown })
            : null;
        result.done = {
          reply: typeof event.reply === 'string' ? event.reply : '',
          suggestions: Array.isArray(event.suggestions)
            ? event.suggestions.filter((entry): entry is string => typeof entry === 'string')
            : [],
          ready_to_propose: event.ready_to_propose === true,
          language_change:
            rawLanguageChange &&
            typeof rawLanguageChange.from === 'string' &&
            typeof rawLanguageChange.to === 'string'
              ? { from: rawLanguageChange.from, to: rawLanguageChange.to }
              : null,
          metadata_valid: event.metadata_valid === true,
          diagnostics: event.diagnostics as CallDiagnostics | null,
        };
      }
    });
  } catch (err) {
    if (err instanceof WordChatApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WordChatApiError('Request cancelled', 'WORD_CHAT_ABORTED', 0, false);
    }
    throw new WordChatApiError(
      'The word chat stream could not be read.',
      'WORD_CHAT_TEMPORARY',
      503,
      true,
    );
  }

  const done = result.done;
  if (!done?.reply) {
    throw new WordChatApiError('Stream did not finish', 'WORD_CHAT_TEMPORARY', 503, true);
  }
  return done;
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
  languageLevel: WordChatLanguageLevel;
  messages: WordChatMessage[];
  baseListId?: string | null;
  model?: string | null;
}) {
  return post<ProposeResponse>('/api/word-chat/propose', {
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    chat_language: input.chatLanguage,
    language_level: input.languageLevel,
    messages: input.messages,
    ...(input.baseListId ? { base_list_id: input.baseListId } : {}),
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
    takeover: ReviewItem['takeover'] | null;
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
  items: {
    kind: 'sentence' | 'word';
    text: string;
    corpusItemId?: string;
    takeoverCandidate?: TakeoverReference;
  }[];
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
      takeover_candidate: item.takeoverCandidate ?? null,
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
  category_id: string | null;
  item_count: number;
  takeover_count: number;
  upgraded_takeover_count: number;
  already_committed: boolean;
  monthly_used: number;
  monthly_limit: number;
};

export function commitSession(input: {
  creationKey: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  baseListId?: string;
  listName: string;
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
    base_list_id: input.baseListId ?? null,
    list_name: input.listName,
    category_name: input.categoryName,
    review_label: input.reviewLabel,
    is_public: input.isPublic,
    review_opt_in: true,
    items: input.items.map((item) => ({
      kind: item.kind,
      text_known: item.textKnown,
      text_target: item.textTarget,
      corpus_item_id: item.corpusItemId ?? null,
      takeover: item.takeover ?? null,
      audio_asset_id: item.audioAssetId ?? null,
      known_audio_asset_id: item.knownAudioAssetId ?? null,
    })),
    messages: input.messages,
  });
}
