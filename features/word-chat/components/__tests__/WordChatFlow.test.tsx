import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { useWordChat } from '../../hooks/useWordChat';
import { WordChatFlow } from '../WordChatFlow';

vi.mock('../ChatStep', () => ({ ChatStep: () => <div /> }));

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
  it('keeps the saved receipt visible until the learner returns to study', () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('success', reset));

    renderFlow(onDone);

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Studijní stream je připravený.');
    expect(screen.getByRole('button', { name: 'Zpět ke studiu' })).toBeEnabled();
    expect(reset).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows progress only while the study stream refresh is pending', () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('pending', reset));

    renderFlow(onDone);

    expect(
      screen.getByRole('progressbar', { name: 'Připravuji studijní stream…' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zpět ke studiu' })).toBeDisabled();
  });

  it('resets the mounted flow and returns to study after explicit confirmation', () => {
    const reset = vi.fn();
    const onDone = vi.fn();
    mockedUseWordChat.mockReturnValue(doneChat('success', reset));

    renderFlow(onDone);
    fireEvent.click(screen.getByRole('button', { name: 'Zpět ke studiu' }));

    expect(reset).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
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


describe('WordChatFlow recovery', () => {
  it('offers a ready-made list on the first temporary error without erasing the chat', () => {
    const onUseReadyMade = vi.fn();
    const continueToProposal = vi.fn();
    const reset = vi.fn();
    mockedUseWordChat.mockReturnValue({
      ...doneChat('success', reset), step: 'chat', busy: null,
      error: 'Temporary error', canRetry: true, retry: vi.fn(),
      canContinueToProposal: true, continueToProposal,
    } as ReturnType<typeof useWordChat>);
    render(<I18nProvider language="cs"><WordChatFlow languageFrom="cs" languageTo="vi"
      onLanguagePairChange={vi.fn()} onCommitted={vi.fn()} onUseReadyMade={onUseReadyMade} /></I18nProvider>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Navrhnout slovíčka z konverzace' }));
    expect(continueToProposal).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Přidat tento seznam' }));
    expect(onUseReadyMade).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it('shows the continuation button for local recovery even though there is no error', () => {
    const continueToProposal = vi.fn();
    mockedUseWordChat.mockReturnValue({
      ...doneChat('success', vi.fn()), step: 'chat', busy: null, error: null,
      recoveryRequired: true, canContinueToProposal: true, continueToProposal,
    } as ReturnType<typeof useWordChat>);
    renderFlow(vi.fn());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Navrhnout slovíčka z konverzace' }));
    expect(continueToProposal).toHaveBeenCalledOnce();
  });

  it('keeps manual entry available during an outage without a ready-made list', () => {
    const startManualEntry = vi.fn();
    mockedUseWordChat.mockReturnValue({ ...doneChat('success', vi.fn()), unavailable: true, busy: null, startManualEntry } as ReturnType<typeof useWordChat>);
    renderFlow(vi.fn());
    fireEvent.click(screen.getByRole('button', { name: 'Už mám vlastní slovíčka' }));
    expect(startManualEntry).toHaveBeenCalledOnce();
  });
});
