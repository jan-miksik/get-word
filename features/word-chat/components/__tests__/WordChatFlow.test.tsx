import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { useWordChat } from '../../hooks/useWordChat';
import { WordChatFlow } from '../WordChatFlow';

vi.mock('../../hooks/useWordChat', () => ({
  useWordChat: vi.fn(),
}));

const mockedUseWordChat = vi.mocked(useWordChat);

function doneChat(
  refreshStatus: 'pending' | 'success' | 'error',
  reset: () => void,
): ReturnType<typeof useWordChat> {
  return {
    step: 'done',
    refreshStatus,
    reset,
    unavailable: false,
    isEditor: false,
    error: null,
    commitResult: {
      listId: 'personal-list',
      categoryId: 'category-1',
      itemCount: 1,
      takeoverCount: 0,
      upgradedTakeoverCount: 0,
      alreadyCommitted: false,
      monthlyUsed: 1,
      monthlyLimit: 60,
    },
    openChat: vi.fn(),
    canReturnToChat: true,
    backToSelect: vi.fn(),
    retryRefresh: vi.fn(),
  } as unknown as ReturnType<typeof useWordChat>;
}

function renderFlow(onDone: () => void) {
  return render(
    <I18nProvider language="cs">
      <WordChatFlow
        languageFrom="cs"
        languageTo="vi"
        onLanguagePairChange={vi.fn()}
        onDone={onDone}
        onCommitted={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe('WordChatFlow completion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets the mounted flow and returns to study after the snapshot refresh succeeds', async () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('success', reset));

    renderFlow(onDone);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(reset).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
      onDone.mock.invocationCallOrder[0],
    );
  });

  it('shows the saved words for a beat before handing over to study', async () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('success', reset));

    renderFlow(onDone);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('stays on the completion step when refreshing the study stream fails', async () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('error', reset));

    renderFlow(onDone);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(reset).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
