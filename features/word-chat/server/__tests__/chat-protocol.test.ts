import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provider: vi.fn(), reserve: vi.fn(), record: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ resolveUserFromRequest: async () => ({ id: 'test-user', userRole: 'user' }) }));
vi.mock('../personal-list', () => ({ loadLearnerBrief: async () => null }));
vi.mock('../rate-limit', () => ({ reserveChatTurn: async () => {} }));
vi.mock('../usage', () => ({
  assertWordChatSpendAvailable: async () => {},
  reserveWordChatSpend: mocks.reserve,
  recordWordChatUsage: mocks.record,
  aggregateWordChatUsage: (metas: unknown[]) => metas.at(-1) ?? {},
  WordChatSpendLimitError: class extends Error {},
}));
vi.mock('../commit', () => ({ WordChatCommitError: class extends Error {} }));
vi.mock('@/lib/rate-limit/daily-bucket', () => ({
  parsePositiveIntEnv: (_value: unknown, fallback: number) => fallback,
  DailyLimitError: class extends Error {},
}));
vi.mock('../config', async (original) => ({
  ...await original<typeof import('../config')>(),
  getServerApiKey: () => 'synthetic-test-key',
  canSeeWordChatDiagnostics: () => false,
  OPENROUTER_RETRY_BASE_DELAY_MS: 1,
}));
vi.mock('@/features/shared/http/device-json-fetch', () => ({
  deviceJsonFetch: async (_path: string, init: RequestInit) => {
    const { NextRequest } = await import('next/server');
    const { POST } = await import('@/app/api/word-chat/message/route');
    return POST(new NextRequest('http://localhost/api/word-chat/message', { ...init, signal: init.signal ?? undefined }));
  },
}));

// No mocking of the provider parser, feature parser, route serializer, or client parser:
// a synthetic provider response traverses the complete production protocol.
import { sendChatMessageStream } from '../../client/api';
const input = {
  sessionId: 'test-session', languageFrom: 'cs', languageTo: 'vi', chatLanguage: 'cs',
  addressRegister: 'casual' as const, salutationGender: 'neutral' as const, languageLevel: 'A0' as const,
  messages: [
    { role: 'user' as const, content: 'časté slova' },
    { role: 'assistant' as const, content: 'Pro běžnou konverzaci, cestování nebo nakupování?' },
    { role: 'user' as const, content: 'nakupování' },
  ],
};
function answer(content: string) {
  mocks.provider.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body);
    if (!body.stream) return Response.json({ choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 30, completion_tokens: 20 } });
    return new Response([
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ finish_reason: 'stop', delta: {} }], usage: { prompt_tokens: 30, completion_tokens: 20 } })}\n\n`,
      'data: [DONE]\n\n',
    ].join(''), { headers: { 'Content-Type': 'text/event-stream' } });
  });
}

describe('full chat protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserve.mockResolvedValue({ id: 'reservation', reservedUsd: 0.1, maxAttempts: 2, model: 'test' });
    vi.stubGlobal('fetch', mocks.provider);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { reply: 'Připravím návrh.', languageChange: null },
    { reply: '', readyToPropose: true, languageChange: null },
    { reply: 'Připravím návrh.', ready_to_propose: 'true', content_mode: 'situation', language_change: null },
  ])('continues the reported conversation despite schema drift: %j', async (payload) => {
    answer(JSON.stringify(payload));
    const result = await sendChatMessageStream(input, { onDelta: vi.fn() });
    expect(result).toMatchObject({ ready_to_propose: true, metadata_valid: true, language_change: null });
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.record).toHaveBeenCalledOnce();
  });

  it.each(['', 'plain text instead of JSON', '{"reply":"unfinished',
    JSON.stringify({ reply: { text: 'broken' }, readyToPropose: 'unknown', languageChange: null }),
    JSON.stringify({ reply: 'Switching language', readyToPropose: true, languageChange: { from: 'bad', to: 'unknown' } }),
  ])('returns safe local continuation when both model attempts are unusable: %s', async (content) => {
    answer(content);
    const result = await sendChatMessageStream(input, { onDelta: vi.fn() });
    expect(result).toMatchObject({ recovery_required: true, ready_to_propose: false, language_change: null, content_mode: null, metadata_valid: true });
    expect(result.reply).toContain('Zkontroluj vybrané jazyky');
    expect(mocks.provider).toHaveBeenCalledTimes(2);
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.record).toHaveBeenCalledOnce();
  });

  it('offers local recovery when both provider responses hit the output limit', async () => {
    mocks.provider.mockImplementation(async () => Response.json({
      choices: [{ finish_reason: 'length', message: { content: '{"reply":"partial' } }],
    }));
    const result = await sendChatMessageStream(input, { onDelta: vi.fn() });
    expect(result).toMatchObject({ recovery_required: true, ready_to_propose: false, language_change: null });
    expect(mocks.provider).toHaveBeenCalledTimes(2);
  });

  it('does not mask provider authentication failures as successful local recovery', async () => {
    mocks.provider.mockResolvedValue(new Response('Invalid key', { status: 401 }));
    await expect(sendChatMessageStream(input, { onDelta: vi.fn() })).rejects.toMatchObject({ code: 'WORD_CHAT_UNAVAILABLE', retryable: false });
    expect(mocks.provider).toHaveBeenCalledOnce();
  });
});
