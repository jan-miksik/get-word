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
  it('holds the practice back until the stream carrying those words is rebuilt', () => {
    const { rerender } = renderStep({
      refreshStatus: 'pending',
      practiceOffer: <p>practice offer</p>,
    });

    expect(screen.queryByText('practice offer')).not.toBeInTheDocument();

    rerender(
      <I18nProvider language="en">
        <DoneStep
          result={result}
          refreshStatus="success"
          onRetryRefresh={async () => {}}
          practiceOffer={<p>practice offer</p>}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('practice offer')).toBeInTheDocument();
  });

  it('leaves both exits open beside the practice', () => {
    const onAddMore = vi.fn();
    const onDone = vi.fn();
    renderStep({ practiceOffer: <p>practice offer</p>, onAddMore, onDone });

    expect(screen.getByRole('button', { name: /add more words/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to study/i })).toBeInTheDocument();
  });

  it('says the stream is ready when there is nothing to practise with', () => {
    renderStep({ onDone: vi.fn() });

    expect(screen.getByRole('status')).toHaveTextContent(/study stream is ready/i);
  });
});
