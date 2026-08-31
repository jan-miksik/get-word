import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/components/I18nProvider';
import { SessionTimeTransitionCard } from '../SessionTimeTransitionCard';

describe('SessionTimeTransitionCard', () => {
  it('holds the new-to-review seam until the learner continues', () => {
    const onContinue = vi.fn();
    render(
      <I18nProvider language="cs">
        <SessionTimeTransitionCard onContinue={onContinue} />
      </I18nProvider>,
    );

    expect(screen.getByText('Nová slovíčka dokončena')).toBeInTheDocument();
    expect(screen.getByText('Teď opakování')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
