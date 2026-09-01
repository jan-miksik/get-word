import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ stream: vi.fn(), buffered: vi.fn(), reserve: vi.fn(), spend: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ resolveUserFromRequest: mocks.auth, unauthorizedResponse: () => new Response(null, { status: 401 }) }));
vi.mock('@/features/word-chat/server/chat', () => ({
  streamChatTurn: mocks.stream, runChatTurn: mocks.buffered,
  sanitizeMessages: (value: unknown) => value,
  sanitizeAddressRegister: () => 'casual', sanitizeLanguageLevel: () => 'A0', sanitizeSalutationGender: () => 'neutral',
  WordChatUnavailableError: class extends Error {},
}));
vi.mock('@/features/word-chat/server/personal-list', () => ({ loadLearnerBrief: async () => null }));
vi.mock('@/features/word-chat/server/rate-limit', () => ({ reserveChatTurn: mocks.reserve }));
vi.mock('@/features/word-chat/server/usage', () => ({ assertWordChatSpendAvailable: mocks.spend, WordChatSpendLimitError: class extends Error {} }));
vi.mock('@/features/word-chat/server/commit', () => ({ WordChatCommitError: class extends Error {} }));
vi.mock('@/lib/rate-limit/daily-bucket', () => ({ DailyLimitError: class extends Error {} }));
vi.mock('@/features/word-chat/server/config', () => ({
  WORD_CHAT_CHAT_MODEL: 'test', MAX_WORD_CHAT_ID_CHARS: 120, canSeeWordChatDiagnostics: () => false,
}));
import { OpenRouterChatError } from '@/lib/openrouter-chat';
import { POST } from '../route';
function request(stream = true) {
  return new NextRequest('http://localhost/api/word-chat/message', { method: 'POST', body: JSON.stringify({
    stream, session_id: 'session', language_from: 'cs', language_to: 'vi',
    messages: [{ role: 'user', content: 'nakupování' }],
  }) });
}

describe('message route reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: 'user-1', userRole: 'user' });
    mocks.spend.mockResolvedValue(undefined);
  });

  it.each([401, 402, 403, 502])('maps a provider failure after stream headers with the same policy as buffered HTTP: %i', async (status) => {
    const failure = new OpenRouterChatError('private provider detail', status >= 500, status);
    mocks.stream.mockResolvedValue((async function* () { throw failure; yield; })());
    mocks.buffered.mockRejectedValue(failure);
    const streamed = await POST(request());
    const event = JSON.parse((await streamed.text()).trim());
    const buffered = await POST(request(false));
    expect(event).toEqual({ type: 'error', status: buffered.status, ...await buffered.json() });
    expect(event.code).toBe(status >= 500 ? 'WORD_CHAT_TEMPORARY' : 'WORD_CHAT_UNAVAILABLE');
    expect(event).not.toHaveProperty('detail');
  });

  it('closes successful streams after a single done event and omits private diagnostics', async () => {
    mocks.stream.mockResolvedValue((async function* () {
      yield { type: 'delta', text: 'Ready' };
      yield { type: 'done', reply: 'Ready', suggestions: [], readyToPropose: true,
        contentMode: 'mixed', languageChange: null, metadataValid: true, diagnostics: { request: 'private' } };
    })());
    const response = await POST(request());
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: 'done', metadata_valid: true, diagnostics: null });
    expect(mocks.reserve).toHaveBeenCalledOnce();
  });

  it('does not reserve or call the model without authorization', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});
