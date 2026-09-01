import { describe, expect, it } from 'vitest';
import { parseChatTurn, WordChatFormatError } from '../chat-response';

const options = { requireProposal: true, chatLanguage: 'cs' };
const base = { reply: 'Připravím návrh.', readyToPropose: true, contentMode: 'situation', languageChange: null, suggestions: [] };

describe('chat response normalization', () => {
  it('uses the conversation policy when readyToPropose is missing after the follow-up', () => {
    const missing = { reply: base.reply, contentMode: base.contentMode, languageChange: null, suggestions: [] };
    expect(parseChatTurn(JSON.stringify(missing), options)).toMatchObject({ readyToPropose: true, contentMode: 'situation', languageChange: null });
  });

  it('asks for explicit continuation if readiness is unknown on the first turn', () => {
    expect(parseChatTurn(JSON.stringify({ reply: 'Some answer', languageChange: null }), { ...options, requireProposal: false })).toMatchObject({
      readyToPropose: false, contentMode: null, languageChange: null, recoveryRequired: true,
    });
  });

  it.each(['true', ' TRUE ', 'false'])('normalizes a string boolean %s without retrying', (ready) => {
    expect(parseChatTurn(JSON.stringify({ ...base, readyToPropose: ready }), options).readyToPropose).toBe(true);
  });

  it('accepts snake_case without losing a language action', () => {
    expect(parseChatTurn(JSON.stringify({ reply: 'Přepínám jazyky.', ready_to_propose: true, content_mode: 'mixed', language_change: { from: 'cs', to: 'es' } }), options)).toMatchObject({
      readyToPropose: false, languageChange: { from: 'cs', to: 'es' }, contentMode: null,
    });
  });

  it.each([undefined, '', null, 17])('supplies a local handoff when a confirmed proposal has no usable reply: %s', (reply) => {
    expect(parseChatTurn(JSON.stringify({ ...base, reply }), options)).toMatchObject({ reply: 'Mám dost informací pro návrh slovíček.', readyToPropose: true });
  });

  it.each([
    { ...base, languageChange: undefined },
    { ...base, languageChange: { from: 'bad code', to: 'es' } },
    { ...base, language_change: { from: 'cs', to: 'es' } },
    { ...base, ready_to_propose: false },
    { ...base, readyToPropose: 'yes' },
    { ...base, reply: '', readyToPropose: false },
  ])('does not guess navigation from ambiguous fields: %j', (payload) => {
    expect(() => parseChatTurn(JSON.stringify(payload), { ...options, requireProposal: false })).toThrow(WordChatFormatError);
  });

  it('never includes raw provider output in format diagnostics', () => {
    expect(() => parseChatTurn('private provider text', options)).toThrow('Word chat response format: expected_object.');
  });
});
