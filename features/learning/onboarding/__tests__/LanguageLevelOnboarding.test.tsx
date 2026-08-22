import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguageLevelOnboarding } from '../LanguageLevelOnboarding';

function renderStep(initialLevel: 'A0' | 'B1' | null = null) {
  const onSubmit = vi.fn();
  render(
    <I18nProvider language="en">
      <LanguageLevelOnboarding
        targetLanguage="es"
        initialLevel={initialLevel}
        onSubmit={onSubmit}
      />
    </I18nProvider>,
  );
  return { onSubmit };
}

describe('LanguageLevelOnboarding', () => {
  it('offers the whole scale and starts at the bottom of it', () => {
    renderStep();

    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('radio', { name: /understand almost nothing/i }))
      .toHaveAttribute('aria-checked', 'true');
  });

  it('names the language being learnt, in the interface language', () => {
    renderStep();

    expect(screen.getByText('Spanish')).toBeInTheDocument();
  });

  it('submits the chosen level', () => {
    const { onSubmit } = renderStep();

    fireEvent.click(screen.getByRole('radio', { name: /everyday conversation/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onSubmit).toHaveBeenCalledWith('B1');
  });

  it('opens on a level the learner already recorded', () => {
    const { onSubmit } = renderStep('B1');

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onSubmit).toHaveBeenCalledWith('B1');
  });
});
