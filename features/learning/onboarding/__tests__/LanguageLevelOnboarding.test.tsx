import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguageLevelOnboarding } from '../LanguageLevelOnboarding';

function renderStep(initialLevel: 'A0' | 'B1' | null = null, onBack?: () => void) {
  const onSubmit = vi.fn();
  render(
    <I18nProvider language="en">
      <LanguageLevelOnboarding
        targetLanguage="es"
        initialLevel={initialLevel}
        onBack={onBack}
        onSubmit={onSubmit}
      />
    </I18nProvider>,
  );
  return { onSubmit };
}

describe('LanguageLevelOnboarding', () => {
  it('offers the whole scale with nothing chosen for the learner', () => {
    renderStep();

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(6);
    for (const option of options) {
      expect(option).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('will not move on until a level has actually been picked', () => {
    renderStep();

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /understand almost nothing/i }));

    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  it('names the language being learnt, in the interface language', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'How well do you know Spanish?' }))
      .toBeInTheDocument();
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

  // Back comes from the shared onboarding frame, so this also covers the level
  // step being wired into it rather than drawing its own page.
  it('offers a way back when there is a step to go back to', () => {
    const onBack = vi.fn();
    renderStep(null, onBack);

    fireEvent.click(screen.getByRole('button', { name: /back/i }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('offers no way back when there is nothing before this step', () => {
    renderStep();

    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
  });
});
