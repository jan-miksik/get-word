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

  it('moves one step back from selection to chat without clearing the session', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    expect(result.current.step).toBe('select');

    act(() => result.current.backToChat());

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
        metadata_valid: true,
        diagnostics: null,
      };
    });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );
    await waitForPreferences(result);

    let turn: Promise<void> | null = null;
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

    expect(mocks.sendChatMessageStream.mock.calls[0][0]).toMatchObject({
      addressRegister: 'formal',
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
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
      incomplete: true,
    });

    await act(() => result.current.retry());

    // The retry re-sends the same turn instead of asking the model to answer a
    // duplicated learner message.
    expect(mocks.sendChatMessageStream.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'Kavárna' },
    ]);
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
    await act(() => result.current.continueToReview());
    expect(mocks.translateSelection).toHaveBeenCalledTimes(1);

    // Back to the selection, then forward again with nothing changed: the rows
    // are still valid, so the expensive call must not repeat.
    act(() => result.current.backToSelect());
    await act(() => result.current.continueToReview());

    expect(mocks.translateSelection).toHaveBeenCalledTimes(1);
    expect(result.current.step).toBe('review');

    // Changing the selection does invalidate them.
    act(() => result.current.toggleSelected(result.current.proposals[0]));
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
      { wrapper },
    );
    await waitForPreferences(result);

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => {
      result.current.setListName('Úřední vietnamština');
      result.current.toggleSelected(result.current.proposals[1]);
    });
    await act(() => result.current.continueToReview());
    await act(() => result.current.commit());

    expect(mocks.commitSession.mock.calls[0][0]).toMatchObject({
      listName: 'Úřední vietnamština',
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
