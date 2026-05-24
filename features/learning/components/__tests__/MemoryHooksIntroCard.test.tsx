import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { MemoryHooksIntroCard } from '../MemoryHooksIntroCard';

describe('MemoryHooksIntroCard', () => {
  it('continues with memory hooks enabled by default', () => {
    const onEnableMemoryHooks = vi.fn();

    render(
      <I18nProvider language="cs">
        <MemoryHooksIntroCard
          onEnableMemoryHooks={onEnableMemoryHooks}
          onDisableMemoryHooks={vi.fn()}
          learningLanguageFrom="cs"
          learningLanguageTo="vi"
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /pokračovat/i }));

    expect(onEnableMemoryHooks).toHaveBeenCalledTimes(1);
  });

  it('opens the learn-more modal from the intro link', () => {
    render(
      <I18nProvider language="cs">
        <MemoryHooksIntroCard
          onEnableMemoryHooks={vi.fn()}
          onDisableMemoryHooks={vi.fn()}
          learningLanguageFrom="cs"
          learningLanguageTo="vi"
        />
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /zjistit víc/i }));

    expect(document.querySelector('.memory-hooks-panel')).toHaveClass('is-open');
    expect(screen.getByRole('heading', { name: 'Mnemotechnické pomůcky' })).toBeInTheDocument();
  });
});
