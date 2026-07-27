import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  fetchWordChatContext: vi.fn(),
  sendChatMessage: vi.fn(),
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
    sendChatMessage: mocks.sendChatMessage,
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
      monthly_used: 0,
      monthly_limit: 60,
      is_editor: false,
      models: null,
    });
    mocks.sendChatMessage.mockResolvedValue({
      reply: 'Připravím návrh.',
      suggestions: [],
      ready_to_propose: true,
    });
    mocks.requestProposal.mockResolvedValue(proposal());
  });

  it('starts a proposal with nothing selected and supports select/clear all', async () => {
    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );

    await act(() => result.current.sendMessage('Kavárna'));

    expect(result.current.step).toBe('select');
    expect(result.current.selectedCount).toBe(0);

    act(() => result.current.selectAll());
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.clearSelection());
    expect(result.current.selectedCount).toBe(0);
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

    await act(() => result.current.sendMessage('Kavárna'));

    act(() => result.current.selectAll());
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.monthlyRemaining).toBe(1);
    expect(result.current.atSelectionLimit).toBe(true);

    act(() => result.current.addCustomItem('ještě jedno'));
    expect(result.current.selectedCount).toBe(1);
  });

  it('retries transient audio errors before opening review', async () => {
    mocks.translateSelection.mockResolvedValue({
      items: [
        {
          kind: 'word',
          text_known: 'káva',
          text_target: 'cà phê',
          corpus_item_id: null,
          audio_asset_id: null,
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
    mocks.generateAudio
      .mockResolvedValueOnce({
        results: [{ key: '0', status: 'error', asset_id: null, error: 'temporary' }],
        quota_exhausted: null,
      })
      .mockResolvedValueOnce({
        results: [{ key: '0', status: 'ok', asset_id: 'asset-1', error: null }],
        quota_exhausted: null,
      });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );

    await act(() => result.current.sendMessage('Kavárna'));
    act(() => result.current.toggleSelected(result.current.proposals[1]));
    await act(() => result.current.continueToReview());

    expect(mocks.generateAudio).toHaveBeenCalledTimes(2);
    expect(result.current.step).toBe('review');
    expect(result.current.reviewItems[0].audioAssetId).toBe('asset-1');
    expect(result.current.translationDiagnostics?.model).toBe(
      'deepseek/deepseek-v4-flash',
    );
  });

  it('keeps the conversation and offers a retry after a transient failure', async () => {
    mocks.sendChatMessage.mockReset();
    mocks.sendChatMessage
      .mockRejectedValueOnce(temporaryFailure())
      .mockResolvedValueOnce({ reply: 'Připravím návrh.', suggestions: [], ready_to_propose: true });

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );

    await act(() => result.current.sendMessage('Kavárna'));

    expect(result.current.unavailable).toBe(false);
    expect(result.current.canRetry).toBe(true);
    expect(result.current.messages).toHaveLength(1);

    await act(() => result.current.retry());

    // The retry re-sends the same turn instead of asking the model to answer a
    // duplicated learner message.
    expect(mocks.sendChatMessage.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: 'Kavárna' },
    ]);
    expect(result.current.step).toBe('select');
    expect(result.current.error).toBeNull();
    expect(result.current.canRetry).toBe(false);
  });

  it('offers the ready-made list immediately when the failure is terminal', async () => {
    mocks.sendChatMessage.mockReset();
    mocks.sendChatMessage.mockRejectedValue(terminalFailure());

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );

    await act(() => result.current.sendMessage('Kavárna'));

    expect(result.current.unavailable).toBe(true);
    expect(result.current.canRetry).toBe(false);
  });

  it('gives up after three transient failures in a row', async () => {
    mocks.sendChatMessage.mockReset();
    mocks.sendChatMessage.mockRejectedValue(temporaryFailure());

    const { result } = renderHook(
      () => useWordChat({ languageFrom: 'cs', languageTo: 'vi', onCommitted: vi.fn() }),
      { wrapper },
    );

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
});
