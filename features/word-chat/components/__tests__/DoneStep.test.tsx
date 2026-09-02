import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { DoneStep } from '../DoneStep';
import type { CommitResult } from '../../types';

const result: CommitResult = {
  listId: 'list',
  categoryId: 'category',
  itemCount: 6,
  takeoverCount: 0,
  upgradedTakeoverCount: 0,
  alreadyCommitted: false,
  monthlyUsed: 6,
  monthlyLimit: 60,
};

function renderStep(props: Partial<React.ComponentProps<typeof DoneStep>> = {}) {
  return render(
    <I18nProvider language="en">
      <DoneStep
        result={result}
        refreshStatus="success"
        onRetryRefresh={async () => {}}
        {...props}
      />
    </I18nProvider>,
  );
}

describe('DoneStep', () => {
  it('says the words are still being prepared until the stream is rebuilt', () => {
    const { rerender } = renderStep({ refreshStatus: 'pending' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(
      <I18nProvider language="en">
        <DoneStep result={result} refreshStatus="success" onRetryRefresh={async () => {}} />
      </I18nProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/study stream is ready/i);
  });

  it('leaves both exits open', () => {
    const onAddMore = vi.fn();
    const onDone = vi.fn();
    renderStep({ onAddMore, onDone });

    expect(screen.getByRole('button', { name: /add words/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to study/i })).toBeInTheDocument();
  });
});
