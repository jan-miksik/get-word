import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguageLevelOnboarding } from '../LanguageLevelOnboarding';
import { OnboardingProgressNavigationProvider } from '../OnboardingProgressNavigation';

function renderStep(
  initialLevel: 'A0' | 'B1' | null = null,
  onBack?: () => void,
  onNavigate = vi.fn(),
) {
  const onSubmit = vi.fn();
  render(
    <I18nProvider language="en">
      <OnboardingProgressNavigationProvider onNavigate={onNavigate}>
        <LanguageLevelOnboarding
          targetLanguage="es"
          initialLevel={initialLevel}
          onBack={onBack}
          onSubmit={onSubmit}
        />
      </OnboardingProgressNavigationProvider>
    </I18nProvider>,
  );
  return { onSubmit, onNavigate };
}

describe('LanguageLevelOnboarding', () => {
  it('offers three broad ranges with nothing chosen for the learner', () => {
    renderStep();

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    for (const option of options) {
      expect(option).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.getByRole('radio', { name: /almost nothing, A1/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /already know some, A2–B1/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /quite a lot, B2–C1/i })).toBeInTheDocument();
  });

  it('submits immediately when a range is picked', () => {
    const { onSubmit } = renderStep();

    fireEvent.click(screen.getByRole('radio', { name: /already know some/i }));

    expect(onSubmit).toHaveBeenCalledWith('A2');
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('names the language being learnt, in the interface language', () => {
    renderStep();

    expect(screen.getByRole('heading', { name: 'How well do you know Spanish?' }))
      .toBeInTheDocument();
  });

  it('stores the conservative lower bound of a newly chosen range', () => {
    const { onSubmit } = renderStep();

    fireEvent.click(screen.getByRole('radio', { name: /quite a lot/i }));

    expect(onSubmit).toHaveBeenCalledWith('B2');
  });

  it('keeps an existing exact level when its range is chosen again', () => {
    const { onSubmit } = renderStep('B1');

    const middleRange = screen.getByRole('radio', { name: /already know some/i });
    expect(middleRange).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(middleRange);

    expect(onSubmit).toHaveBeenCalledWith('B1');
  });

  it('lets a learner revisit a completed step from progress', () => {
    const { onNavigate } = renderStep();

    fireEvent.click(screen.getByRole('button', { name: /back: languages/i }));

    expect(onNavigate).toHaveBeenCalledWith('language');
  });

  // Back comes from the shared onboarding frame, so this also covers the level
  // step being wired into it rather than drawing its own page.
  it('offers a way back when there is a step to go back to', () => {
    const onBack = vi.fn();
    renderStep(null, onBack);

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('offers no way back when there is nothing before this step', () => {
    renderStep();

    expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument();
  });
});
