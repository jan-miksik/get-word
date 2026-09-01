import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  fetchWordChatContext: vi.fn(),
  saveWordChatPreferences: vi.fn(),
  sendChatMessageStream: vi.fn(),
  requestProposal: vi.fn(),
  translateSelection: vi.fn(),
  generateAudio: vi.fn(),
  commitSession: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}));

// The real error class comes through: the hook's whole failure policy is built
// on its code/retryable classification, so a stub would test nothing.
vi.mock('../../client/api', async () => {
  const actual = await vi.importActual<typeof import('../../client/api')>('../../client/api');
  return {
    WordChatApiError: actual.WordChatApiError,
    fetchWordChatContext: mocks.fetchWordChatContext,
    saveWordChatPreferences: mocks.saveWordChatPreferences,
    sendChatMessageStream: mocks.sendChatMessageStream,
    requestProposal: mocks.requestProposal,
    translateSelection: mocks.translateSelection,
    generateAudio: mocks.generateAudio,
    commitSession: mocks.commitSession,
  };
});
vi.mock('../../client/storage', () => ({
  loadDraft: mocks.loadDraft,
  saveDraft: mocks.saveDraft,
  clearDraft: mocks.clearDraft,
}));

import { WordChatApiError } from '../../client/api';
import { useWordChat } from '../useWordChat';

function temporaryFailure() {
  return new WordChatApiError('nope', 'WORD_CHAT_TEMPORARY', 503, true);
}

function terminalFailure() {
  return new WordChatApiError('nope', 'WORD_CHAT_UNAVAILABLE', 503, false);
}

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider language="en">{children}</I18nProvider>;
}

/**
 * The chat is written in the interface language, so gendered address and the
 * formal/casual split are decided by that language — not by the study pair.
 * English has neither, so anything asserting those preferences needs a UI
 * language that does.
 */
function czechUiWrapper({ children }: { children: ReactNode }) {
  return <I18nProvider language="cs">{children}</I18nProvider>;
}

async function waitForPreferences(result: { current: { preferencesLoading: boolean } }) {
  await waitFor(() => expect(result.current.preferencesLoading).toBe(false));
}

function proposal() {
  return {
    category_name: 'Café',
    topic_label: 'Kavárna',
    review_label: 'Café conversation',
    items: [
      { kind: 'sentence', source: 'generated', text: 'Dám si kávu.', confidence: 0.9 },
      { kind: 'word', source: 'generated', text: 'káva', confidence: 0.8 },
    ],
    ask_visibility: false,
    limits: {
      max_items_per_session: 30,
      soft_item_warning_threshold: 15,
      monthly_used: 0,
      monthly_limit: 60,
      monthly_reset_at: null,
    },
  };
}

describe('useWordChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendChatMessageStream.mockReset();
    mocks.requestProposal.mockReset();
    mocks.loadDraft.mockReturnValue(null);
    mocks.fetchWordChatContext.mockResolvedValue({
      has_history: false,
      goals: [],
      covered_topics: [],
      missing_topics: [],
      personal_list_name: null,
      address_register: 'casual',
      salutation_gender: 'neutral',
      language_level: 'A0',
      preferences_complete: { global: true, language: true },
      monthly_used: 0,
      monthly_limit: 60,
      is_editor: false,
      models: null,
    });
    mocks.sendChatMessageStream.mockImplementation(async (_input, handlers) => {
      handlers.onDelta('Připravím návrh.');
      return {
        reply: 'Připravím návrh.',
        suggestions: [],
        ready_to_propose: true,
        content_mode: 'situation',
        language_change: null,
        metadata_valid: true,
        diagnostics: null,
      };
    });
    mocks.requestProposal.mockResolvedValue(proposal());
    mocks.saveWordChatPreferences.mockResolvedValue({
      address_register: 'casual',
      salutation_gender: 'neutral',
      language_level: 'A0',
      preferences_complete: { global: true, language: true },
    });
  });

  it('starts a proposal with nothing selected and supports select/clear all', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));

    expect(result.current.step).toBe('select');
    expect(result.current.selectedCount).toBe(0);

    act(() => result.current.selectAll());
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.clearSelection());
    expect(result.current.selectedCount).toBe(0);
  });

  it('opens on manual entry, with the chat a step forward rather than back', async () => {
    const { result } = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          entryStep: 'manual',
          onCommitted: vi.fn(),
        }),
      { wrapper },
    );

    expect(result.current.step).toBe('select');
    expect(result.current.proposals).toHaveLength(0);
    expect(result.current.categoryName).toBe('My words');
    // Nothing is behind manual entry until the learner opens the chat, so the
    // host keeps its own close action instead of a step-back.
    expect(result.current.canReturnToChat).toBe(false);
    await waitForPreferences(result);
    expect(mocks.sendChatMessageStream).not.toHaveBeenCalled();

    act(() => result.current.openChat());
    expect(result.current.step).toBe('chat');
  });

  it('keeps a category explicitly named in settings while retaining the AI topic', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    act(() => result.current.setCategoryName('Moje návštěva kavárny'));
    await act(() => result.current.sendMessage('Kavárna'));

    expect(result.current.categoryName).toBe('Moje návštěva kavárny');
    expect(result.current.topicLabel).toBe('Kavárna');
  });

  it('replaces an earlier AI category when the conversation moves to a new topic', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    expect(result.current.categoryName).toBe('Café');

    act(() => result.current.openChat());
    mocks.requestProposal.mockResolvedValue({
      ...proposal(),
      category_name: 'Restaurant',
      topic_label: 'Restaurace',
    });
    await act(() => result.current.sendMessage('Teď restaurace'));

    expect(result.current.categoryName).toBe('Restaurant');
    expect(result.current.topicLabel).toBe('Restaurace');
  });

  it('never asks about visibility when the account cannot publish', async () => {
    // Publishing is editor-only until lists are reviewed before going public,
    // so the question has one possible answer and is not asked at all.
    const { result } = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          entryStep: 'manual',
          onCommitted: vi.fn(),
        }),
      { wrapper },
    );
    await waitForPreferences(result);
    expect(result.current.askVisibility).toBe(false);
  });

  it('asks about visibility from manual entry only when there is no personal list yet', async () => {
    mocks.fetchWordChatContext.mockResolvedValue({
      has_history: false,
      goals: [],
      covered_topics: [],
      missing_topics: [],
      personal_list_name: null,
      address_register: 'casual',
      salutation_gender: 'neutral',
      language_level: 'A0',
      preferences_complete: { global: true, language: true },
      monthly_used: 0,
      monthly_limit: 60,
      can_publish_public_lists: true,
      is_editor: false,
      models: null,
    });
    const first = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          entryStep: 'manual',
          onCommitted: vi.fn(),
        }),
      { wrapper },
    );

    // Unknown while the brief is in flight: an unanswered list is saved private,
    // so a question that flashes past is worse than no question.
    expect(first.result.current.askVisibility).toBe(false);
    await waitForPreferences(first.result);
    expect(first.result.current.askVisibility).toBe(true);

    mocks.fetchWordChatContext.mockResolvedValue({
      has_history: false,
      goals: [],
      covered_topics: [],
      missing_topics: [],
      personal_list_name: 'Moje slovíčka — Vietnamština',
      address_register: 'casual',
      salutation_gender: 'neutral',
      language_level: 'A0',
      preferences_complete: { global: true, language: true },
      monthly_used: 0,
      monthly_limit: 60,
      can_publish_public_lists: true,
      is_editor: false,
      models: null,
    });
    const second = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          entryStep: 'manual',
          onCommitted: vi.fn(),
        }),
      { wrapper },
    );
    await waitForPreferences(second.result);

    // The list already exists, so its visibility was settled long ago.
    expect(second.result.current.askVisibility).toBe(false);
  });

  it('moves one step back from selection to chat without clearing the session', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    expect(result.current.step).toBe('select');

    act(() => result.current.openChat());

    expect(result.current.step).toBe('chat');
    expect(result.current.messages).toMatchObject([
      { role: 'user', content: 'Kavárna' },
      { role: 'assistant', content: 'Připravím návrh.' },
    ]);
    expect(result.current.proposals).toHaveLength(2);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });

  it('keeps the streamed bubble identity when the finished reply lands', async () => {
    mocks.sendChatMessageStream.mockReset();
    let releaseReply: () => void = () => {};
    const replyReleased = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    mocks.sendChatMessageStream.mockImplementationOnce(async (_input, handlers) => {
      handlers.onDelta('Připravím ');
      await replyReleased;
      return {
        reply: 'Připravím návrh.',
        suggestions: [],
        ready_to_propose: false,
        content_mode: null,
        metadata_valid: true,
        diagnostics: null,
      };
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    let turn: Promise<boolean> | null = null;
    act(() => {
      turn = result.current.sendMessage('Kavárna');
    });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe('Připravím '));
    const streamedId = result.current.messages[1]?.id;
    expect(streamedId).toBeTruthy();

    await act(async () => {
      releaseReply();
      await turn;
    });

    // Same id as the placeholder it replaces: React updates the bubble in place
    // instead of remounting it with the complete answer.
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Připravím návrh.',
      id: streamedId,
    });
  });

  it('leaves the finished reply awaiting its reveal until the bubble reports back', async () => {
    mocks.sendChatMessageStream.mockReset();
    mocks.sendChatMessageStream.mockImplementationOnce(async () => ({
      reply: 'Připravím návrh.',
      suggestions: [],
      ready_to_propose: false,
      content_mode: null,
      metadata_valid: true,
      diagnostics: null,
    }));

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));

    // Whole, so safe to send back — but not yet drawn, so still owed a reveal.
    // This used to be cleared a frame after the reply landed, which raced the
    // bubble's own mount and cost the typing animation whenever React committed
    // both in one render.
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Připravím návrh.',
      awaitingReveal: true,
    });
    expect(result.current.messages[1]?.incomplete).toBeUndefined();

    act(() => result.current.markReplyRevealed(result.current.messages[1]?.id));
    expect(result.current.messages[1]?.awaitingReveal).toBeUndefined();
  });

  it('sends the chosen chat preferences to the chat endpoint', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper: czechUiWrapper },
    );
    await waitForPreferences(result);

    await act(() =>
      result.current.savePreferences({
        addressRegister: 'formal',
        salutationGender: 'neutral',
        languageLevel: 'A1',
      }),
    );
    expect(mocks.saveWordChatPreferences).toHaveBeenCalledWith({
      addressRegister: 'formal',
      salutationGender: 'neutral',
      languageLevel: 'A1',
      languageFrom: 'cs',
      languageTo: 'vi',
      baseListId: undefined,
    });
    await act(() => result.current.sendMessage('Kavárna'));

    // The chat always addresses the learner informally now, whatever an older
    // account has stored, so the turn goes out casual even after saving formal.
    expect(mocks.sendChatMessageStream.mock.calls[0][0]).toMatchObject({
      addressRegister: 'casual',
      salutationGender: 'neutral',
      languageLevel: 'A1',
    });
  });

  it('writes the chat in the interface language, not the pair source language', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'fr', languageTo: 'es', onCommitted: vi.fn() }),
      { wrapper: czechUiWrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Chci mluvit s partnerkou'));

    expect(mocks.sendChatMessageStream.mock.calls[0][0]).toMatchObject({
      chatLanguage: 'cs',
      languageFrom: 'fr',
      languageTo: 'es',
    });
  });

  it('applies an explicit language change returned by the chat', async () => {
    const onLanguagePairChange = vi.fn();
    mocks.sendChatMessageStream.mockResolvedValueOnce({
      reply: 'Přepínám na češtinu a španělštinu.',
      suggestions: [],
      ready_to_propose: false,
      content_mode: null,
      language_change: { from: 'cs', to: 'es' },
      metadata_valid: true,
      diagnostics: null,
    });

    const { result } = renderHook(
      () =>
        useWordChat({
          languageFrom: 'fr',
          languageTo: 'vi',
          onLanguagePairChange,
          onCommitted: vi.fn(),
        }),
      { wrapper: czechUiWrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Znám česky a chci se učit španělsky.'));

    expect(onLanguagePairChange).toHaveBeenCalledWith({ from: 'cs', to: 'es' });
    expect(mocks.requestProposal).not.toHaveBeenCalled();
  });

  it('stages the selected words for the new pair before the flow remounts', async () => {
    const onLanguagePairChange = vi.fn();
    const { result } = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          onLanguagePairChange,
          onCommitted: vi.fn(),
        }),
      { wrapper },
    );
    await waitForPreferences(result);
    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    expect(result.current.selectedCount).toBe(1);
    mocks.saveDraft.mockClear();

    await act(() =>
      result.current.changeLanguagePair({ from: 'cs', to: 'es' }),
    );

    expect(onLanguagePairChange).toHaveBeenCalledWith({ from: 'cs', to: 'es' });
    const migratedCall = mocks.saveDraft.mock.calls.find(
      ([from, to]) => from === 'cs' && to === 'es',
    );
    expect(migratedCall?.[2]).toMatchObject({
      step: 'select',
      proposals: [
        { source: 'generated', text: 'Dám si kávu.' },
        { source: 'generated', text: 'káva' },
      ],
      reviewItems: [],
    });
    expect(migratedCall?.[2].selectedKeys).toHaveLength(1);
  });

  it('restores the saved chat preferences without asking again', async () => {
    mocks.fetchWordChatContext.mockResolvedValue({
      has_history: true,
      goals: [],
      covered_topics: ['Úřad'],
      missing_topics: [],
      personal_list_name: 'Moje slovíčka',
      address_register: 'formal',
      salutation_gender: 'female',
      language_level: 'B1',
      preferences_complete: { global: true, language: true },
      monthly_used: 0,
      monthly_limit: 60,
      is_editor: false,
      models: null,
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.preferencesLoading).toBe(false));
    expect(result.current.addressRegister).toBe('formal');
    expect(result.current.salutationGender).toBe('female');
    expect(result.current.languageLevel).toBe('B1');
    expect(result.current.preferencesComplete).toBe(true);
  });

  it('re-reads the brief when the parked screen is opened again', async () => {
    // "Add words" stays mounted behind the study stream, so a brief read only on
    // mount kept describing the state before the last batch was saved — and the
    // follow-up chip kept offering a topic that was already on the list.
    mocks.fetchWordChatContext
      .mockResolvedValueOnce({
        has_history: true,
        goals: [],
        situations: [],
        covered_topics: [],
        missing_topics: ['Na úřadě'],
        personal_list_name: 'Moje slovíčka',
        address_register: 'casual',
        salutation_gender: 'neutral',
        language_level: 'A0',
        preferences_complete: { global: true, language: true },
        monthly_used: 0,
        monthly_limit: 60,
        is_editor: false,
        models: null,
      })
      .mockResolvedValueOnce({
        has_history: true,
        goals: [],
        situations: [],
        covered_topics: ['Na úřadě'],
        missing_topics: [],
        personal_list_name: 'Moje slovíčka',
        address_register: 'casual',
        salutation_gender: 'neutral',
        language_level: 'A0',
        preferences_complete: { global: true, language: true },
        monthly_used: 0,
        monthly_limit: 60,
        is_editor: false,
        models: null,
      });

    const { result, rerender } = renderHook(
      ({ active }) =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          onCommitted: vi.fn(),
          active,
        }),
      { initialProps: { active: true }, wrapper },
    );

    await waitFor(() =>
      expect(result.current.history?.missingTopics).toEqual(['Na úřadě']),
    );

    // Parked: no call while the learner is somewhere else.
    rerender({ active: false });
    expect(mocks.fetchWordChatContext).toHaveBeenCalledTimes(1);

    rerender({ active: true });
    await waitFor(() =>
      expect(result.current.history?.coveredTopics).toEqual(['Na úřadě']),
    );
    expect(mocks.fetchWordChatContext).toHaveBeenCalledTimes(2);
  });

  it('reloads the per-target language level when the active list changes', async () => {
    mocks.fetchWordChatContext
      .mockResolvedValueOnce({
        has_history: false,
        goals: [],
        covered_topics: [],
        missing_topics: [],
        personal_list_name: null,
        address_register: 'formal',
        salutation_gender: 'neutral',
        language_level: 'A0',
        preferences_complete: { global: true, language: true },
        monthly_used: 0,
        monthly_limit: 60,
        is_editor: false,
        models: null,
      })
      .mockResolvedValueOnce({
        has_history: false,
        goals: [],
        covered_topics: [],
        missing_topics: [],
        personal_list_name: null,
        address_register: 'formal',
        salutation_gender: 'neutral',
        language_level: 'B1',
        preferences_complete: { global: true, language: true },
        monthly_used: 0,
        monthly_limit: 60,
        is_editor: false,
        models: null,
      });

    const { result, rerender } = renderHook(
      ({ languageTo, baseListId }) =>
        useWordChat({
          languageFrom: 'cs',
          languageTo,
          baseListId,
          onCommitted: vi.fn(),
        }),
      {
        initialProps: { languageTo: 'vi', baseListId: 'list-vi' },
        wrapper,
      },
    );

    await waitFor(() => expect(result.current.languageLevel).toBe('A0'));
    rerender({ languageTo: 'de', baseListId: 'list-de' });
    await waitFor(() => expect(result.current.languageLevel).toBe('B1'));

    expect(mocks.fetchWordChatContext).toHaveBeenNthCalledWith(1, {
      languageFrom: 'cs',
      languageTo: 'vi',
      baseListId: 'list-vi',
    });
    expect(mocks.fetchWordChatContext).toHaveBeenNthCalledWith(2, {
      languageFrom: 'cs',
      languageTo: 'de',
      baseListId: 'list-de',
    });
  });

  it('caps selection to the monthly remainder before review work starts', async () => {
    mocks.requestProposal.mockResolvedValue({
      ...proposal(),
      limits: {
        ...proposal().limits,
        monthly_used: 59,
        monthly_limit: 60,
      },
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));

    act(() => result.current.selectAll());
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.monthlyRemaining).toBe(1);
    expect(result.current.atSelectionLimit).toBe(true);

    act(() => result.current.addCustomItem('ještě jedno'));
    expect(result.current.selectedCount).toBe(1);
  });

  it('shares the session cap with photo rows without charging them to the monthly allowance', async () => {
    const { result } = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          entryStep: 'manual',
          onCommitted: vi.fn(),
        }),
      { wrapper },
    );
    await waitForPreferences(result);

    act(() => result.current.addPretranslatedItems(
      Array.from({ length: 29 }, (_, index) => ({
        textKnown: `known ${index}`,
        textTarget: `target ${index}`,
      })),
    ));

    expect(result.current.selectedCount).toBe(29);
    expect(result.current.translatedSelectionCount).toBe(0);
    expect(result.current.remainingSelections).toBe(1);

    act(() => result.current.addCustomItem('last translated row'));
    expect(result.current.selectedCount).toBe(30);
    expect(result.current.atHardCap).toBe(true);

    act(() => result.current.addCustomItem('does not fit'));
    expect(result.current.selectedCount).toBe(30);
  });

  it('keeps an edited photo pair edited when returning through selection', async () => {
    const { result } = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          entryStep: 'manual',
          onCommitted: vi.fn(),
        }),
      { wrapper },
    );
    await waitForPreferences(result);

    act(() => result.current.addPretranslatedItems([
      { textKnown: 'káva', textTarget: 'cà phê', audioHash: 'old-clip' },
    ]));
    await act(() => result.current.continueToReview());
    act(() => result.current.updateReviewItem(0, { textTarget: 'cà phê sữa' }));
    act(() => result.current.backToSelect());
    await act(() => result.current.continueToReview());

    expect(result.current.reviewItems).toHaveLength(1);
    expect(result.current.reviewItems[0]).toMatchObject({
      textKnown: 'káva',
      textTarget: 'cà phê sữa',
      audioHash: null,
      audioStatus: 'idle',
    });
  });

  it('keeps a selected proposal selected when its text is edited', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    expect(result.current.selectedCount).toBe(1);

    act(() => result.current.updateProposal(result.current.proposals[1], 'silná káva'));

    expect(result.current.proposals[1].text).toBe('silná káva');
    expect(result.current.selectedCount).toBe(1);
  });

  it('turns an edited reused proposal into a generated proposal', async () => {
    mocks.requestProposal.mockResolvedValue({
      ...proposal(),
      items: [
        {
          kind: 'word',
          source: 'corpus',
          corpusItemId: 'corpus-1',
          verified: true,
          text: 'káva',
          confidence: 0.8,
        },
      ],
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[0]));
    act(() => result.current.updateProposal(result.current.proposals[0], 'silná káva'));

    expect(result.current.proposals[0]).toMatchObject({
      source: 'generated',
      text: 'silná káva',
    });
    expect(result.current.selectedCount).toBe(1);
  });

  it('turns a row that offers the other address form into two review rows', async () => {
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'sentence',
          text_known: 'Jak se máš?',
          text_target: 'Wie geht es dir?',
          corpus_item_id: 'corpus-1',
          audio_asset_id: 'asset-1',
          audio_hash: 'hash-1',
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
          address_form: 'familiar',
          address_alternative: { text_target: 'Wie geht es Ihnen?', address_form: 'polite' },
        },
      ],
      translation_diagnostics: {
        model: 'm',
        input_tokens: 1,
        output_tokens: 1,
        estimated_cost_usd: 0,
      },
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'de', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);
    await act(() => result.current.sendMessage('Pozdravy'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    await act(() => result.current.continueToReview());

    const [primary, twin] = result.current.reviewItems;
    expect(result.current.reviewItems).toHaveLength(2);

    expect(primary.textTarget).toBe('Wie geht es dir?');
    expect(primary.addressForm).toEqual({ form: 'familiar' });
    expect(twin.textTarget).toBe('Wie geht es Ihnen?');
    expect(twin.addressForm).toEqual({ form: 'polite' });

    // Both belong to the same transient group, which the server re-validates.
    expect(primary.variantGroupKey).toBeDefined();
    expect(twin.variantGroupKey).toBe(primary.variantGroupKey);

    // The twin says something different, so it cannot borrow the primary's clip,
    // its corpus origin, or its takeover claim.
    expect(twin.audioAssetId).toBeNull();
    expect(twin.audioHash).toBeNull();
    expect(twin.corpusItemId).toBeUndefined();
    expect(twin.audioStatus).toBe('pending');
  });

  it('opens review while fresh audio is still generating in the background', async () => {
    let resolveAudio: (value: unknown) => void = () => {};
    const audioPromise = new Promise((resolve) => {
      resolveAudio = resolve;
    });
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'word',
          text_known: 'káva',
          text_target: 'cà phê',
          corpus_item_id: null,
          audio_asset_id: null,
          audio_hash: null,
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
        },
      ],
      translation_diagnostics: {
        model: 'deepseek/deepseek-v4-flash',
        input_tokens: 100,
        output_tokens: 20,
        estimated_cost_usd: 0.000013,
      },
    });
    mocks.generateAudio.mockReturnValue(audioPromise);

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    // Vietnamese words a phrase differently depending on who it is for, so
    // the batch has to say who before anything can be translated.
    await act(() => result.current.continueToReview());

    expect(result.current.step).toBe('review');
    expect(result.current.reviewItems[0].audioAssetId).toBeNull();
    expect(result.current.reviewItems[0].audioStatus).toBe('pending');
    expect(result.current.translationDiagnostics?.model).toBe(
      'deepseek/deepseek-v4-flash',
    );

    await act(async () => {
      resolveAudio({
        results: [
          {
            key: '0',
            status: 'ok',
            asset_id: 'asset-1',
            content_hash: 'hash-1',
            audio_base64: null,
            error: null,
          },
        ],
        quota_exhausted: null,
      });
      await audioPromise;
      await Promise.resolve();
    });

    expect(mocks.generateAudio).toHaveBeenCalledTimes(1);
    expect(result.current.reviewItems[0].audioAssetId).toBe('asset-1');
    expect(result.current.reviewItems[0].audioHash).toBe('hash-1');
    expect(result.current.reviewItems[0].audioStatus).toBe('ready');
  });

  it('holds the save until the in-flight clip lands, then commits it with the row', async () => {
    let resolveAudio: (value: unknown) => void = () => {};
    const audioPromise = new Promise((resolve) => {
      resolveAudio = resolve;
    });
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'word',
          text_known: 'káva',
          text_target: 'cà phê',
          corpus_item_id: null,
          audio_asset_id: null,
          audio_hash: null,
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
        },
      ],
      translation_diagnostics: {
        model: 'deepseek/deepseek-v4-flash',
        input_tokens: 100,
        output_tokens: 20,
        estimated_cost_usd: 0.000013,
      },
    });
    mocks.generateAudio.mockReturnValue(audioPromise);
    mocks.commitSession.mockResolvedValue({
      list_id: 'list-1',
      category_id: 'category-1',
      item_count: 1,
      already_committed: false,
      monthly_used: 1,
      monthly_limit: 60,
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    await act(() => result.current.continueToReview());

    expect(result.current.reviewItems[0].audioStatus).toBe('pending');

    // Saved while the clip is still being made: without the wait this is the
    // press that stores a word with no audio.
    let commitCall: Promise<void> = Promise.resolve();
    await act(async () => {
      commitCall = result.current.commit();
      await Promise.resolve();
    });
    expect(mocks.commitSession).not.toHaveBeenCalled();
    expect(result.current.busy).toBe('audio');

    await act(async () => {
      resolveAudio({
        results: [
          {
            key: '0',
            status: 'ok',
            asset_id: 'asset-1',
            content_hash: 'hash-1',
            audio_base64: null,
            error: null,
          },
        ],
        quota_exhausted: null,
      });
      await commitCall;
    });

    expect(mocks.commitSession).toHaveBeenCalledTimes(1);
    expect(mocks.commitSession.mock.calls[0][0].items[0]).toMatchObject({
      textTarget: 'cà phê',
      audioAssetId: 'asset-1',
      audioHash: 'hash-1',
    });
  });

  it('starts audio automatically for a manually added item after opening review', async () => {
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'sentence',
          text_known: 'Zavolej Anně.',
          text_target: 'Gọi cho Anna.',
          corpus_item_id: null,
          audio_asset_id: null,
          audio_hash: null,
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
        },
      ],
      translation_diagnostics: {
        model: 'test',
        input_tokens: 10,
        output_tokens: 5,
        estimated_cost_usd: 0,
      },
    });
    mocks.generateAudio.mockResolvedValue({
      results: [
        {
          key: '0',
          status: 'ok',
          asset_id: 'asset-private-reviewed',
          content_hash: 'hash-private-reviewed',
          audio_base64: null,
          error: null,
        },
      ],
      quota_exhausted: null,
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);
    await act(() => result.current.sendMessage('Rodina'));

    act(() => result.current.addCustomItem('Zavolej Anně.'));
    // Vietnamese words a phrase differently depending on who it is for, so
    // the batch has to say who before anything can be translated.
    await act(() => result.current.continueToReview());

    expect(mocks.generateAudio).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(result.current.reviewItems[0]).toMatchObject({
        audioStatus: 'ready',
        audioAssetId: 'asset-private-reviewed',
        audioHash: 'hash-private-reviewed',
      }),
    );
  });

  it('keeps audio muted on the right item when the server drops one', async () => {
    // The server returns only what it managed to translate, in order, and may
    // polish the text it echoes back — so neither the position in the array nor
    // an exact string match identifies the item the learner muted.
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'word',
          text_known: 'Čaj',
          text_target: 'trà',
          corpus_item_id: null,
          audio_asset_id: null,
          audio_hash: null,
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
        },
      ],
      translation_diagnostics: {
        model: 'test',
        input_tokens: 10,
        output_tokens: 5,
        estimated_cost_usd: 0,
      },
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);
    await act(() => result.current.sendMessage('Nápoje'));

    act(() => result.current.addCustomItem('káva'));
    act(() => result.current.addCustomItem('čaj'));
    // Only the second item is muted; the first is the one the server drops.
    act(() => result.current.toggleAudioDisabled('custom:čaj'));
    await act(() => result.current.continueToReview());

    expect(result.current.reviewItems).toHaveLength(1);
    expect(result.current.reviewItems[0]).toMatchObject({
      textKnown: 'Čaj',
      audioStatus: 'idle',
      audioDisabled: true,
    });
    expect(mocks.generateAudio).not.toHaveBeenCalled();
  });

  it('keeps the conversation and offers a retry after a transient failure', async () => {
    mocks.sendChatMessageStream.mockReset();
    mocks.sendChatMessageStream
      .mockRejectedValueOnce(temporaryFailure())
      .mockImplementationOnce(async (_input, handlers) => {
        handlers.onDelta('Připravím návrh.');
        return {
          reply: 'Připravím návrh.',
          suggestions: [],
          ready_to_propose: true,
          content_mode: 'situation',
          metadata_valid: true,
          diagnostics: null,
        };
      });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));

    expect(result.current.unavailable).toBe(false);
    expect(result.current.canRetry).toBe(true);
    expect(result.current.messages).toEqual([{ role: 'user', content: 'Kavárna' }]);

    await act(() => result.current.retry());

    // The retry re-sends the same turn instead of asking the model to answer a
    // duplicated learner message.
    expect(mocks.sendChatMessageStream.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'Kavárna' },
    ]);
    expect(mocks.requestProposal).toHaveBeenLastCalledWith(
      expect.objectContaining({ contentMode: 'situation' }),
    );
    expect(result.current.step).toBe('select');
    expect(result.current.error).toBeNull();
    expect(result.current.canRetry).toBe(false);
  });

  it('offers the ready-made list immediately when the failure is terminal', async () => {
    mocks.sendChatMessageStream.mockReset();
    mocks.sendChatMessageStream.mockRejectedValue(terminalFailure());

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));

    expect(result.current.unavailable).toBe(true);
    expect(result.current.canRetry).toBe(false);
  });

  it('gives up after three transient failures in a row', async () => {
    mocks.sendChatMessageStream.mockReset();
    mocks.sendChatMessageStream.mockRejectedValue(temporaryFailure());

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    expect(result.current.unavailable).toBe(false);
    await act(() => result.current.retry());
    expect(result.current.unavailable).toBe(false);
    await act(() => result.current.retry());

    expect(result.current.unavailable).toBe(true);
    // Still retryable: the fallback screen leads with Try again, because the
    // conversation is intact and the outage may already be over.
    expect(result.current.canRetry).toBe(true);
  });

  it('keeps local recovery actionable across reload and only proposes after explicit confirmation', async () => {
    mocks.sendChatMessageStream.mockResolvedValueOnce({
      reply: 'Check the selected languages, then continue.', suggestions: [],
      ready_to_propose: false, content_mode: null, language_change: null,
      recovery_required: true, metadata_valid: true,
    });
    const onLanguagePairChange = vi.fn();
    const options = { languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn(), onLanguagePairChange };
    const first = renderHook(() => useWordChat(options), { wrapper });
    await waitForPreferences(first.result);
    await act(() => first.result.current.sendMessage('nakupování'));
    expect(first.result.current.error).toBeNull();
    expect(first.result.current.canContinueToProposal).toBe(true);
    expect(mocks.requestProposal).not.toHaveBeenCalled();
    expect(onLanguagePairChange).not.toHaveBeenCalled();
    const saved = mocks.saveDraft.mock.calls.at(-1)?.[2];
    expect(saved.recoveryRequired).toBe(true);
    first.unmount();
    mocks.loadDraft.mockReturnValue(saved);
    const second = renderHook(() => useWordChat(options), { wrapper });
    await waitForPreferences(second.result);
    expect(second.result.current.canContinueToProposal).toBe(true);
    expect(second.result.current.error).toBeNull();
    expect(mocks.sendChatMessageStream).toHaveBeenCalledOnce();
    await act(() => second.result.current.continueToProposal());
    expect(mocks.requestProposal).toHaveBeenCalledOnce();
    expect(mocks.requestProposal).toHaveBeenCalledWith(expect.objectContaining({
      languageFrom: 'cs', languageTo: 'vi', messages: expect.arrayContaining([{ role: 'user', content: 'nakupování' }]),
    }));
    expect(second.result.current.step).toBe('select');
    expect(second.result.current.recoveryRequired).toBe(false);
  });

  it('carries local recovery to a new language pair chosen in settings', async () => {
    mocks.sendChatMessageStream.mockResolvedValueOnce({
      reply: 'Check the languages.', suggestions: [], ready_to_propose: false,
      content_mode: null, language_change: null, metadata_valid: true, recovery_required: true,
    });
    const { result } = renderHook(() => useWordChat({
      languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn(), onLanguagePairChange: vi.fn(),
    }), { wrapper });
    await waitForPreferences(result);
    await act(() => result.current.sendMessage('Spanish instead'));
    await act(() => result.current.changeLanguagePair({ from: 'cs', to: 'es' }));
    expect(mocks.saveDraft).toHaveBeenCalledWith('cs', 'es', expect.objectContaining({
      recoveryRequired: true, step: 'chat',
    }));
  });

  it('can send a turn in browsers without crypto.randomUUID', async () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', {});
    try {
      const { result } = renderHook(() => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }), { wrapper });
      await waitForPreferences(result);
      await act(() => result.current.sendMessage('nakupování'));
      expect(result.current.step).toBe('select');
    } finally { vi.stubGlobal('crypto', original); }
  });

  it('removes the cancelled placeholder when moving to manual entry and back', async () => {
    let finish!: (value: unknown) => void;
    mocks.sendChatMessageStream.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }), { wrapper });
    await waitForPreferences(result);
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.sendMessage('nakupování'); });
    act(() => result.current.startManualEntry());
    act(() => result.current.openChat());
    expect(result.current.messages).toEqual([{ role: 'user', content: 'nakupování' }]);
    await act(async () => { finish({ reply: 'Late', ready_to_propose: false, metadata_valid: true }); await pending; });
    expect(result.current.messages).toHaveLength(1);
  });

  it('continues directly to proposals after a chat failure with all learner answers', async () => {
    mocks.sendChatMessageStream.mockRejectedValueOnce(temporaryFailure());
    const { result } = renderHook(() => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }), { wrapper });
    await waitForPreferences(result);
    await act(() => result.current.sendMessage('nakupování'));
    expect(result.current.canContinueToProposal).toBe(true);
    await act(() => result.current.continueToProposal());
    expect(mocks.requestProposal).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'nakupování' }], contentMode: 'mixed',
    }));
    expect(result.current.step).toBe('select');
    expect(result.current.busy).toBeNull();
    expect(mocks.sendChatMessageStream).toHaveBeenCalledOnce();
  });

  it('does not send two paid turns on a double submit before React rerenders', async () => {
    let finish!: (value: unknown) => void;
    mocks.sendChatMessageStream.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }), { wrapper });
    await waitForPreferences(result);
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.sendMessage('nakupování'); void result.current.sendMessage('nakupování'); });
    expect(mocks.sendChatMessageStream).toHaveBeenCalledOnce();
    await act(async () => { finish({ reply: 'Kde?', suggestions: [], ready_to_propose: false, metadata_valid: true }); await pending; });
    expect(result.current.messages.filter((message) => message.role === 'user')).toHaveLength(1);
  });

  it('ignores a late reply after reset without clearing the next request spinner', async () => {
    const finishes: ((value: unknown) => void)[] = [];
    mocks.sendChatMessageStream.mockImplementation(() => new Promise((resolve) => { finishes.push(resolve); }));
    const { result } = renderHook(() => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }), { wrapper });
    await waitForPreferences(result);
    let first!: Promise<boolean>; let second!: Promise<boolean>;
    act(() => { first = result.current.sendMessage('old'); });
    act(() => result.current.reset());
    act(() => { second = result.current.sendMessage('new'); });
    await act(async () => { finishes[0]({ reply: 'Old answer', ready_to_propose: true, content_mode: 'mixed', metadata_valid: true }); await first; });
    expect(result.current.busy).toBe('chat');
    expect(result.current.messages[0].content).toBe('new');
    expect(mocks.requestProposal).not.toHaveBeenCalled();
    await act(async () => { finishes[1]({ reply: 'New answer', suggestions: [], ready_to_propose: false, metadata_valid: true }); await second; });
    expect(result.current.busy).toBeNull();
    expect(result.current.messages.at(-1)?.content).toBe('New answer');
  });

  it('does not reopen selection when a cancelled proposal completes after manual entry', async () => {
    let finish!: (value: unknown) => void;
    mocks.requestProposal.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }), { wrapper });
    await waitForPreferences(result);
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.sendMessage('nakupování'); });
    await waitFor(() => expect(result.current.busy).toBe('propose'));
    act(() => result.current.startManualEntry());
    await act(async () => { finish(proposal()); await pending; });
    expect(result.current.proposals).toEqual([]);
    expect(result.current.manualEntry).toBe(true);
    expect(result.current.busy).toBeNull();
  });

  it.each(['chat', 'propose'] as const)('restores an interrupted %s without paying again until Retry', async (kind) => {
    // Use the actual saved snapshot rather than building a draft by hand.
    if (kind === 'chat') mocks.sendChatMessageStream.mockRejectedValueOnce(temporaryFailure());
    else mocks.requestProposal.mockRejectedValueOnce(temporaryFailure());
    const options = { languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() };
    const first = renderHook(() => useWordChat(options), { wrapper });
    await waitForPreferences(first.result);
    await act(() => first.result.current.sendMessage('nakupování'));
    const saved = mocks.saveDraft.mock.calls.at(-1)?.[2];
    expect(saved.pendingChatAction.kind).toBe(kind);
    first.unmount();
    mocks.loadDraft.mockReturnValue(saved);
    const chatCount = mocks.sendChatMessageStream.mock.calls.length;
    const proposalCount = mocks.requestProposal.mock.calls.length;
    const second = renderHook(() => useWordChat(options), { wrapper });
    await waitForPreferences(second.result);
    expect(second.result.current.canRetry).toBe(true);
    expect(mocks.sendChatMessageStream).toHaveBeenCalledTimes(chatCount);
    expect(mocks.requestProposal).toHaveBeenCalledTimes(proposalCount);
    mocks.sendChatMessageStream.mockResolvedValue({ reply: 'Ready', suggestions: [], ready_to_propose: true, content_mode: 'mixed', metadata_valid: true });
    mocks.requestProposal.mockResolvedValue(proposal());
    await act(() => second.result.current.retry());
    expect(second.result.current.step).toBe('select');
    if (kind === 'propose') expect(mocks.sendChatMessageStream).toHaveBeenCalledTimes(chatCount);
    expect(mocks.requestProposal).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: saved.sessionId }));
  });

  it('does not re-translate when the learner goes back and forward unchanged', async () => {
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'word',
          text_known: 'káva',
          text_target: 'cà phê',
          corpus_item_id: null,
          audio_asset_id: 'asset-1',
          audio_hash: 'hash-1',
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
        },
      ],
      translation_diagnostics: {
        model: 'deepseek/deepseek-v4-flash',
        input_tokens: 100,
        output_tokens: 20,
        estimated_cost_usd: 0.000013,
      },
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    // Vietnamese words a phrase differently depending on who it is for, so
    // the batch has to say who before anything can be translated.
    await act(() => result.current.continueToReview());
    expect(mocks.translateSelection).toHaveBeenCalledTimes(1);

    // Back to the selection, then forward again with nothing changed: the rows
    // are still valid, so the expensive call must not repeat.
    act(() => result.current.backToSelect());
    // Vietnamese words a phrase differently depending on who it is for, so
    // the batch has to say who before anything can be translated.
    await act(() => result.current.continueToReview());

    expect(mocks.translateSelection).toHaveBeenCalledTimes(1);
    expect(result.current.step).toBe('review');

    // Changing the selection does invalidate them.
    act(() => result.current.toggleSelected(result.current.proposals[0]));
    // Vietnamese words a phrase differently depending on who it is for, so
    // the batch has to say who before anything can be translated.
    await act(() => result.current.continueToReview());
    expect(mocks.translateSelection).toHaveBeenCalledTimes(2);
  });

  it('commits a renamed personal dictionary name', async () => {
    const onCommitted = vi.fn();
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'word',
          text_known: 'káva',
          text_target: 'cà phê',
          corpus_item_id: null,
          audio_asset_id: 'asset-1',
          audio_hash: 'hash-1',
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
        },
      ],
      translation_diagnostics: {
        model: 'deepseek/deepseek-v4-flash',
        input_tokens: 100,
        output_tokens: 20,
        estimated_cost_usd: 0.000013,
      },
    });
    mocks.commitSession.mockResolvedValue({
      list_id: 'list-1',
      category_id: 'category-1',
      item_count: 1,
      already_committed: false,
      monthly_used: 1,
      monthly_limit: 60,
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted }),
      { wrapper: czechUiWrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => {
      result.current.setListName('Úřední vietnamština');
      result.current.toggleSelected(result.current.proposals[1]);
    });
    // Vietnamese words a phrase differently depending on who it is for, so
    // the batch has to say who before anything can be translated.
    await act(() => result.current.continueToReview());
    await act(() => result.current.commit());

    expect(mocks.commitSession.mock.calls[0][0]).toMatchObject({
      listName: 'Úřední vietnamština',
      chatLanguage: 'cs',
      topicLabel: 'Kavárna',
    });
    expect(onCommitted).toHaveBeenCalledWith({
      listId: 'list-1',
      categoryId: 'category-1',
      itemCount: 1,
      takeoverCount: 0,
      upgradedTakeoverCount: 0,
    });
  });

  it('retries only the snapshot after a successful commit', async () => {
    const refreshAfterCommit = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'word',
          text_known: 'káva',
          text_target: 'cà phê',
          corpus_item_id: null,
          audio_asset_id: 'asset-1',
          audio_hash: 'hash-1',
          known_audio_asset_id: null,
          warnings: [],
          reused: false,
          takeover: null,
        },
      ],
      translation_diagnostics: {
        model: 'test',
        input_tokens: 1,
        output_tokens: 1,
        estimated_cost_usd: 0,
      },
    });
    mocks.commitSession.mockResolvedValue({
      list_id: 'personal-list',
      category_id: 'category-1',
      item_count: 1,
      takeover_count: 0,
      upgraded_takeover_count: 0,
      already_committed: false,
      monthly_used: 1,
      monthly_limit: 60,
    });

    const { result } = renderHook(
      () =>
        useWordChat({
          languageFrom: 'cs',
          languageTo: 'vi',
          onCommitted: vi.fn(),
          refreshAfterCommit,
      }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    // Vietnamese words a phrase differently depending on who it is for, so
    // the batch has to say who before anything can be translated.
    await act(() => result.current.continueToReview());
    await act(() => result.current.commit());

    expect(result.current.step).toBe('done');
    expect(result.current.refreshStatus).toBe('error');
    expect(mocks.commitSession).toHaveBeenCalledTimes(1);

    await act(() => result.current.retryRefresh());

    expect(result.current.refreshStatus).toBe('success');
    expect(refreshAfterCommit).toHaveBeenCalledTimes(2);
    expect(mocks.commitSession).toHaveBeenCalledTimes(1);
  });
});
