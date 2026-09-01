import { withRequestDeadline } from './request-deadline';
import type { AddressFormValue } from '@/lib/word-item-address-form';
import { deviceJsonFetch } from '@/features/shared/http/device-json-fetch';
import type {
  WordChatAddressRegister,
  WordChatContentMode,
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
   * A bare gateway 503 remains retryable; only an explicit service verdict
   * can declare the chat unavailable.
   */
  get isUnavailable(): boolean {
    return this.code === 'WORD_CHAT_UNAVAILABLE';
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
    data.retryable === true || (data.retryable === undefined && (status >= 500 || status === 408)),
    typeof data.detail === 'string' ? data.detail : null,
  );
  // The detail exists to be seen: in dev and for editors it is the only place
  // the provider's actual status shows up on the client side.
  if (error.detail) console.warn('[word-chat] server detail:', error.detail);
  return error;
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await deviceJsonFetch(path, {
      method: 'POST',
      signal,
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
  personal_list_id: string | null;
  personal_list_is_public: boolean | null;
  address_register: WordChatAddressRegister | null;
  salutation_gender: WordChatSalutationGender | null;
  language_level: WordChatLanguageLevel | null;
  preferences_complete: {
    global: boolean;
    language: boolean;
  };
  monthly_used: number;
  monthly_limit: number;
  can_publish_public_lists: boolean;
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
  return withRequestDeadline(undefined, 10_000, async (signal) => {
    const response = await deviceJsonFetch(`/api/word-chat/context?${params.toString()}`, { signal });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw toApiError(data, response.status);
    return data as WordChatContextResponse;
  });
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
  recovery_required?: boolean;
  reply: string;
  suggestions: string[];
  ready_to_propose: boolean;
  content_mode: WordChatContentMode | null;
  language_change: { from: string; to: string } | null;
  diagnostics: CallDiagnostics | null;
};

export type ChatMessageStreamResponse = ChatMessageResponse & {
  metadata_valid: boolean;
};

type RawChatStreamEvent = Record<string, unknown>;

function parseChatResponse(raw: unknown): ChatMessageStreamResponse {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
  const pair = data?.language_change;
  const validPair = pair && typeof pair === 'object' && 'from' in pair && 'to' in pair &&
    typeof pair.from === 'string' && typeof pair.to === 'string' &&
    /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i.test(pair.from) &&
    /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i.test(pair.to) && pair.from !== pair.to
      ? { from: pair.from, to: pair.to } : null;
  const mode = data?.content_mode === 'category_inventory' || data?.content_mode === 'situation' || data?.content_mode === 'mixed'
    ? data.content_mode : null;
  if (!data || data.metadata_valid !== true || typeof data.reply !== 'string' || !data.reply.trim() ||
      typeof data.ready_to_propose !== 'boolean' || (pair != null && !validPair) ||
      (data.ready_to_propose && (!mode || pair != null)) ||
      (data.recovery_required === true && (data.ready_to_propose || pair != null))) {
    throw new WordChatApiError('Invalid chat response', 'WORD_CHAT_STREAM', 502, true);
  }
  return {
    ...(data.recovery_required === true ? { recovery_required: true } : {}),
    reply: data.reply,
    suggestions: data.ready_to_propose ? [] : Array.isArray(data.suggestions)
      ? data.suggestions.filter((entry): entry is string => typeof entry === 'string').slice(0, 3) : [],
    ready_to_propose: data.ready_to_propose,
    content_mode: data.ready_to_propose ? mode : null,
    language_change: validPair,
    metadata_valid: true,
    diagnostics: (data.diagnostics ?? null) as CallDiagnostics | null,
  };
}

export async function readNdjsonStream<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => unknown,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handleLine = (line: string) => {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1).trim() : line.trim();
    if (!trimmed) return;
    return onEvent(JSON.parse(trimmed) as T);
  };

  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    signal?.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (handleLine(line) === false) return;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);
  } finally {
    signal?.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export type ChatMessageInput = {
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
};
type ChatHandlers = { onDelta: (text: string) => void };

export async function sendChatMessageStream(
  input: ChatMessageInput,
  handlers: ChatHandlers,
): Promise<ChatMessageStreamResponse> {
  // A transport failure is ambiguous: the server may already have completed
  // and paid for the model call before the browser lost the final bytes. A
  // second automatic POST would reserve another turn and another spend row.
  // Preserve the transcript and let the learner explicitly retry instead.
  try {
    return await withRequestDeadline(input.signal, 40_000, (signal) =>
      sendChatMessageAttempt({ ...input, signal }, handlers),
    );
  } catch (err) {
    if (input.signal?.aborted) {
      throw new WordChatApiError('Request cancelled', 'WORD_CHAT_ABORTED', 0, false);
    }
    if (err instanceof WordChatApiError) throw err;
    throw new WordChatApiError(
      'The word chat request timed out.',
      'WORD_CHAT_TIMEOUT',
      0,
      true,
    );
  }
}

async function sendChatMessageAttempt(
  input: ChatMessageInput,
  handlers: ChatHandlers,
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
      if (input.signal?.reason instanceof DOMException && input.signal.reason.name === 'TimeoutError') {
        throw new WordChatApiError('The word chat request timed out.', 'WORD_CHAT_TIMEOUT', 0, true);
      }
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
    throw new WordChatApiError('Stream did not start', 'WORD_CHAT_STREAM', 503, true);
  }

  const result: { done?: ChatMessageStreamResponse } = {};
  try {
    await readNdjsonStream<RawChatStreamEvent>(response.body, (event) => {
      if (event.type === 'delta') {
        if (typeof event.text === 'string' && event.text) handlers.onDelta(event.text);
        return;
      }
      if (event.type === 'error') {
        throw toApiError(event as unknown as Record<string, unknown>,
          typeof event.status === 'number' ? event.status : 503);
      }
      if (event.type === 'done') {
        result.done = parseChatResponse(event);
        return false; // `done` is terminal; never wait for a proxy to close TCP.
      }
    }, input.signal);
  } catch (err) {
    if (err instanceof WordChatApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      if (input.signal?.reason instanceof DOMException && input.signal.reason.name === 'TimeoutError') {
        throw new WordChatApiError('The word chat request timed out.', 'WORD_CHAT_TIMEOUT', 0, true);
      }
      throw new WordChatApiError('Request cancelled', 'WORD_CHAT_ABORTED', 0, false);
    }
    throw new WordChatApiError(
      'The word chat stream could not be read.',
      'WORD_CHAT_STREAM',
      503,
      true,
    );
  }

  const done = result.done;
  if (!done?.reply) {
    throw new WordChatApiError('Stream did not finish', 'WORD_CHAT_STREAM', 503, true);
  }
  return done;
}

export type ProposeResponse = {
  diagnostics: CallDiagnostics | null;
  category_name: string;
  topic_label: string;
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
  contentMode: WordChatContentMode;
  messages: WordChatMessage[];
  baseListId?: string | null;
  model?: string | null;
  signal?: AbortSignal;
}) {
  return withRequestDeadline(input.signal, 120_000, (signal) => post<ProposeResponse>('/api/word-chat/propose', {
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    chat_language: input.chatLanguage,
    language_level: input.languageLevel,
    content_mode: input.contentMode,
    messages: input.messages,
    ...(input.baseListId ? { base_list_id: input.baseListId } : {}),
    ...(input.model ? { model: input.model } : {}),
  }, signal));
}

export type SimilarWordsResponse = {
  diagnostics: CallDiagnostics | null;
  items: { text_known: string; text_target: string }[];
};

/**
 * Words that are easy to confuse with one the learner is studying. Both sides
 * come back translated, so there is no separate translate step: similarity is a
 * property of the target-language pair, and re-deriving one side from the other
 * would not preserve it.
 */
export function requestSimilarWords(input: {
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  seedKnown: string;
  seedTarget: string;
  model?: string | null;
}) {
  return post<SimilarWordsResponse>('/api/word-chat/similar', {
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    chat_language: input.chatLanguage,
    seed_known: input.seedKnown,
    seed_target: input.seedTarget,
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
    /** Form of address this row uses, when the target has a binary system. */
    address_form: AddressFormValue | null;
    /** The other form, when the source left the choice open. Becomes a second row. */
    address_alternative: { text_target: string; address_form: AddressFormValue } | null;
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
  chatLanguage: string;
  baseListId?: string;
  listName: string;
  categoryName: string;
  topicLabel: string;
  reviewLabel: string;
  isPublic: boolean;
  /**
   * Whether the words in this batch may reach the editor review queue. Left
   * unset it stays true, as every typed or proposed batch has been; the photo
   * tab passes false so pairs the learner was never asked about keep Photo
   * Lab's own conservative answer.
   */
  reviewOptIn?: boolean;
  items: ReviewItem[];
  messages: WordChatMessage[];
}) {
  return post<CommitResponse>('/api/word-chat/commit', {
    creation_key: input.creationKey,
    session_id: input.sessionId,
    language_from: input.languageFrom,
    language_to: input.languageTo,
    chat_language: input.chatLanguage,
    base_list_id: input.baseListId ?? null,
    list_name: input.listName,
    category_name: input.categoryName,
    topic_label: input.topicLabel,
    review_label: input.reviewLabel,
    is_public: input.isPublic,
    review_opt_in: input.reviewOptIn !== false,
    items: input.items.map((item) => ({
      kind: item.kind,
      text_known: item.textKnown,
      text_target: item.textTarget,
      corpus_item_id: item.corpusItemId ?? null,
      takeover: item.takeover ?? null,
      audio_asset_id: item.audioAssetId ?? null,
      // Photo rows only know the clip's content hash; the server turns it into
      // the asset id so the saved word keeps the sound it already had.
      audio_hash: item.audioHash ?? null,
      known_audio_asset_id: item.knownAudioAssetId ?? null,
      address_form: item.addressForm?.form ?? null,
      variant_group_key: item.variantGroupKey ?? null,
    })),
    messages: input.messages,
  });
}
