import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/features/shared/http/device-json-fetch', () => ({ deviceJsonFetch: mocks.fetch }));
import { WordChatApiError, sendChatMessageStream, fetchWordChatContext } from '../api';

const input = {
  sessionId: 'session-1', languageFrom: 'cs', languageTo: 'vi', chatLanguage: 'cs',
  addressRegister: 'casual' as const, salutationGender: 'neutral' as const, languageLevel: 'A0' as const,
  messages: [{ role: 'user' as const, content: 'nakupování' }],
};
const reply = { reply: 'Připravím návrh.', suggestions: [], ready_to_propose: true, content_mode: 'mixed', language_change: null, diagnostics: null };
function stream(events: unknown[], close = true) {
  return new Response(new ReadableStream({ start(controller) {
    for (const event of events) controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`));
    if (close) controller.close();
  } }));
}
const done = { type: 'done', ...reply, metadata_valid: true };

describe('chat transport recovery', () => {
  beforeEach(() => { mocks.fetch.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it('reads a language-pair action and stops at done even if the connection stays open', async () => {
    mocks.fetch.mockResolvedValue(stream([{ ...done, ready_to_propose: false, content_mode: null, language_change: { from: 'cs', to: 'es' } }], false));
    expect((await sendChatMessageStream(input, { onDelta: vi.fn() })).language_change).toEqual({ from: 'cs', to: 'es' });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ['broken JSON', 'WORD_CHAT_STREAM'],
    ['missing done', 'WORD_CHAT_STREAM'],
    ['network', 'WORD_CHAT_NETWORK'],
    ['gateway', null],
  ])('keeps %s retryable without issuing a second paid request', async (failure, code) => {
    if (failure === 'broken JSON') mocks.fetch.mockResolvedValueOnce(new Response('provider_internal_secret'));
    if (failure === 'missing done') mocks.fetch.mockResolvedValueOnce(stream([{ type: 'delta', text: 'Partial' }]));
    if (failure === 'network') mocks.fetch.mockRejectedValueOnce(new TypeError('offline'));
    if (failure === 'gateway') mocks.fetch.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }));
    await expect(sendChatMessageStream(input, { onDelta: vi.fn() })).rejects.toMatchObject({
      code,
      retryable: true,
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('rejects incomplete metadata without multiplying the server turn', async () => {
    mocks.fetch.mockResolvedValueOnce(stream([{ ...done, metadata_valid: false }]));
    await expect(sendChatMessageStream(input, { onDelta: vi.fn() })).rejects.toMatchObject({
      code: 'WORD_CHAT_STREAM',
      retryable: true,
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('does not treat a malformed response as success or expose provider text', async () => {
    mocks.fetch.mockImplementation(async () => new Response('provider_internal_secret'));
    const request = sendChatMessageStream(input, { onDelta: vi.fn() });
    await expect(request).rejects.toMatchObject({ code: 'WORD_CHAT_STREAM', retryable: true });
    await expect(request).rejects.not.toMatchObject({ message: expect.stringContaining('provider_internal_secret') });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { code: 'WORD_CHAT_UNAVAILABLE', status: 503, retryable: false },
    { code: 'WORD_CHAT_MONTHLY_SPEND_LIMIT', status: 429, retryable: false },
    { code: 'WORD_CHAT_TEMPORARY', status: 503, retryable: true },
  ])('preserves stream error classification and does not multiply server retries: $code', async (error) => {
    mocks.fetch.mockResolvedValue(stream([{ type: 'error', error: 'Failed', ...error }]));
    await expect(sendChatMessageStream(input, { onDelta: vi.fn() })).rejects.toMatchObject(error);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('bounds a response stalled after HTTP headers without issuing a second request', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValueOnce(stream([], false));
    const pending = sendChatMessageStream(input, { onDelta: vi.fn() });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'WORD_CHAT_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(40_000);
    await assertion;
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('bounds the request when no response ever arrives', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    const pending = sendChatMessageStream(input, { onDelta: vi.fn() });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'WORD_CHAT_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(40_000);
    await assertion;
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an active body read without starting fallback', async () => {
    const controller = new AbortController();
    mocks.fetch.mockResolvedValue(stream([], false));
    const pending = sendChatMessageStream({ ...input, signal: controller.signal }, { onDelta: vi.fn() });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'WORD_CHAT_ABORTED', retryable: false });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('bounds context loading so a stalled request cannot block onboarding preferences forever', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    const pending = fetchWordChatContext({ languageFrom: 'cs', languageTo: 'vi' });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('rejects a malformed navigation action', async () => {
    mocks.fetch.mockResolvedValueOnce(stream([{
      ...done,
      ready_to_propose: false,
      content_mode: null,
      language_change: 'es',
    }]));
    await expect(sendChatMessageStream(input, { onDelta: vi.fn() })).rejects.toMatchObject({ code: 'WORD_CHAT_STREAM' });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('does not send an already cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(sendChatMessageStream({ ...input, signal: controller.signal }, { onDelta: vi.fn() })).rejects.toBeInstanceOf(WordChatApiError);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
