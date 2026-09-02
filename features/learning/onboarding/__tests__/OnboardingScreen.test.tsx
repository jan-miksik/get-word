import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';

vi.mock('@/components/RisingLettersBackground', () => ({
  RisingLettersBackground: () => <div data-testid="rising-letters" />,
}));

vi.mock('@/components/ScratchField', () => ({
  ScratchField: () => <canvas data-testid="scratch-field" />,
  ScratchFieldBase: () => <canvas data-testid="scratch-base" />,
  ScratchFieldRevealTint: () => <div data-testid="scratch-tint" />,
  useLettersLayer: () => 'base',
}));

vi.mock('@/components/SupportButton', () => ({
  SupportButton: () => null,
}));

import { OnboardingBackdropHost, OnboardingScreen } from '../OnboardingScreen';

describe('OnboardingScreen layering', () => {
  it('keeps the transparent scroll viewport above the hosted scratch canvas', () => {
    const { container } = render(
      <I18nProvider language="en">
        <OnboardingBackdropHost>
          <OnboardingScreen>Goal setup</OnboardingScreen>
        </OnboardingBackdropHost>
      </I18nProvider>,
    );

    const screen = container.querySelector('.onboarding-screen');
    const ground = container.querySelector('.bg-paper-glow');

    expect(screen).toHaveClass('relative', 'z-[4]');
    expect(ground).toHaveClass('fixed', 'z-0');
    expect(container.querySelectorAll('[data-testid="scratch-field"]')).toHaveLength(1);
  });
});
