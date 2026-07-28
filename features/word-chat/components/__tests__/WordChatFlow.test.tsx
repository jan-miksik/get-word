import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    backToChat: vi.fn(),
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
        onDone={onDone}
        onCommitted={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe('WordChatFlow completion', () => {
  it('resets the mounted flow and returns to study after the snapshot refresh succeeds', async () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('success', reset));

    renderFlow(onDone);

    await waitFor(() => {
      expect(reset).toHaveBeenCalledOnce();
      expect(onDone).toHaveBeenCalledOnce();
    });
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
      onDone.mock.invocationCallOrder[0],
    );
  });

  it('stays on the completion step when refreshing the study stream fails', () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('error', reset));

    renderFlow(onDone);

    expect(reset).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
