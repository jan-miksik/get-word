import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguagePairChangedBanner } from '../LanguagePairChangedBanner';

describe('LanguagePairChangedBanner', () => {
  it('shows the localized pair and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(
      <I18nProvider language="cs">
        <LanguagePairChangedBanner
          pair={{ from: 'fr', to: 'es' }}
          onDismiss={onDismiss}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Studijní jazyky změněny: francouzština → španělština.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
