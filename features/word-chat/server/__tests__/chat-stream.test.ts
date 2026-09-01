import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stream: vi.fn(), buffered: vi.fn(), record: vi.fn(),
  reserve: vi.fn(async () => ({ id: 'reservation-1', model: 'test/chat', reservedUsd: 0.1, maxAttempts: 2 })),
}));
vi.mock('@/lib/openrouter-chat', async (original) => ({
  ...await original<typeof import('@/lib/openrouter-chat')>(),
  streamOpenRouterCompletion: mocks.stream,
  callOpenRouterChatParsedWithMeta: mocks.buffered,
}));
vi.mock('../usage', () => ({
  aggregateWordChatUsage: (metas: unknown[]) => metas.at(-1) ?? {},
  recordWordChatUsage: mocks.record,
  reserveWordChatSpend: mocks.reserve,
}));
vi.mock('@/lib/rate-limit/daily-bucket', () => ({ parsePositiveIntEnv: (_value: unknown, fallback: number) => fallback }));
vi.mock('../config', async (original) => ({
  ...await original<typeof import('../config')>(),
  OPENROUTER_RETRY_BASE_DELAY_MS: 1,
  WORD_CHAT_CHAT_MODEL: 'test/chat',
  getServerApiKey: () => 'test-key',
}));

import { OpenRouterChatError } from '@/lib/openrouter-chat';
import { streamChatTurn } from '../chat';
import type { WordChatMessage } from '../../types';

const input = {
  userId: 'user-1', sessionId: 'session-1', languageFrom: 'cs', languageTo: 'vi', chatLanguage: 'cs',
  addressRegister: 'casual' as const, salutationGender: 'neutral' as const, languageLevel: 'A0' as const, brief: null,
  messages: [{ role: 'user', content: 'časté slova' }] as WordChatMessage[],
};
const answeredFollowUp: WordChatMessage[] = [...input.messages,
  { role: 'assistant', content: 'Běžná konverzace, cestování nebo nakupování?' },
  { role: 'user', content: 'nakupování' },
];
const reply = { reply: 'Jaký obchod?', readyToPropose: false, contentMode: null, suggestions: ['Potraviny'], languageChange: null };
function streamReply(content: string) {
  mocks.stream.mockImplementation(async (options) => {
    options.onAttemptStart();
    return (async function* () {
      yield { type: 'delta', text: content.slice(0, 20) };
      yield { type: 'delta', text: content.slice(20) };
      options.onResponse({ usage: { prompt_tokens: 10, completion_tokens: 20 } });
    })();
  });
}
async function collect(overrides: Partial<Parameters<typeof streamChatTurn>[0]> = {}) {
  const events = [];
  for await (const event of await streamChatTurn({ ...input, ...overrides })) events.push(event);
  return events;
}

describe('chat reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.record.mockReset();
    mocks.buffered.mockReset();
    mocks.buffered.mockImplementation(async (options, parse) => {
      options.onAttemptStart();
      options.onResponse({ usage: { prompt_tokens: 11, completion_tokens: 21 } });
      return { value: parse(JSON.stringify(reply)), meta: {} };
    });
    streamReply(JSON.stringify(reply));
  });

  it('finishes the reported shopping conversation without another paid retry', async () => {
    const events = await collect({ messages: answeredFollowUp });
    expect(events).toEqual([
      { type: 'delta', text: 'Mám dost informací pro návrh slovíček.' },
      expect.objectContaining({ type: 'done', readyToPropose: true, contentMode: 'mixed', suggestions: [], metadataValid: true }),
    ]);
    expect(mocks.buffered).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledOnce();
  });

  it('lets the first turn ask one follow-up', async () => {
    expect((await collect()).at(-1)).toMatchObject({ readyToPropose: false, suggestions: ['Potraviny'], contentMode: null });
  });

  it.each([
    { readyToPropose: true, contentMode: null, suggestions: ['unnecessary'] },
    { readyToPropose: true, contentMode: 'mixed', suggestions: null },
  ])('repairs harmless final metadata: %j', async (patch) => {
    streamReply(JSON.stringify({ ...reply, ...patch }));
    expect((await collect()).at(-1)).toMatchObject({ readyToPropose: true, contentMode: 'mixed', suggestions: [], metadataValid: true });
    expect(mocks.buffered).not.toHaveBeenCalled();
  });

  it('preserves a valid selected content mode', async () => {
    streamReply(JSON.stringify({ ...reply, readyToPropose: true, contentMode: 'category_inventory' }));
    expect((await collect()).at(-1)).toMatchObject({ readyToPropose: true, contentMode: 'category_inventory' });
  });

  it('prioritizes a validated pair change over conflicting proposal flags', async () => {
    streamReply(JSON.stringify({ ...reply, readyToPropose: true, languageChange: { from: 'cs', to: 'es' } }));
    expect((await collect({ messages: answeredFollowUp })).at(-1)).toMatchObject({
      languageChange: { from: 'cs', to: 'es' }, readyToPropose: false, contentMode: null,
    });
  });

  it.each(['not json', '{"readyToPropose":false,"reply":"Partial', '{"reply":"Hello"}',
    JSON.stringify({ ...reply, languageChange: { from: 'not a code', to: 'es' } }),
  ])('uses buffered fallback for malformed or truncated output without exposing it: %s', async (content) => {
    streamReply(content);
    const events = await collect();
    expect(mocks.stream).toHaveBeenCalledOnce();
    expect(mocks.buffered).toHaveBeenCalledOnce();
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(events).toEqual([{ type: 'delta', text: reply.reply }, expect.objectContaining({ type: 'done', metadataValid: true })]);
    expect(mocks.buffered).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 1, timeoutMs: 15_000 }), expect.any(Function));
  });

  it('uses the fallback after a provider transport failure', async () => {
    mocks.stream.mockRejectedValue(new OpenRouterChatError('timeout', true, undefined, 'transport'));
    expect((await collect()).at(-1)).toMatchObject({ type: 'done' });
    expect(mocks.buffered).toHaveBeenCalledOnce();
  });

  it('stops after the reserved attempts', async () => {
    streamReply('invalid');
    mocks.buffered.mockRejectedValue(new OpenRouterChatError('still unavailable', true));
    await expect(collect()).rejects.toThrow('still unavailable');
    expect(mocks.stream).toHaveBeenCalledOnce();
    expect(mocks.buffered).toHaveBeenCalledOnce();
    // Neither response completed: keep the conservative reservation intact.
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.reserve).toHaveBeenCalledOnce();
  });

  it.each([401, 402, 403])('does not retry a terminal provider failure %i', async (status) => {
    mocks.stream.mockRejectedValue(new OpenRouterChatError('rejected', false, status));
    await expect(collect()).rejects.toMatchObject({ status });
    expect(mocks.buffered).not.toHaveBeenCalled();
  });

  it('does not repeat a paid call when usage persistence fails', async () => {
    mocks.record.mockRejectedValue(new Error('database unavailable'));
    await expect(collect()).rejects.toThrow('database unavailable');
    expect(mocks.stream).toHaveBeenCalledOnce();
    expect(mocks.buffered).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledOnce();
  });

  it('does not start a model call for an already cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(collect({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.buffered).not.toHaveBeenCalled();
  });
});
