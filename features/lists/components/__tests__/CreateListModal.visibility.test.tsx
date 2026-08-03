import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { CreateListModal } from '../CreateListModal';

const languages = [
  { code: 'cs', name: 'Czech' },
  { code: 'vi', name: 'Vietnamese' },
];

function renderModal(canPublish: boolean) {
  render(
    <I18nProvider language="en">
      <CreateListModal
        isOpen
        languages={languages}
        initialLangFrom="cs"
        initialLangTo="vi"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        canPublish={canPublish}
      />
    </I18nProvider>,
  );
}

describe('CreateListModal visibility', () => {
  it('offers no public option to an account that cannot publish', () => {
    renderModal(false);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText(/reviewed first/i)).toBeTruthy();
  });

  it('offers the private/public choice to an account that can publish', () => {
    renderModal(true);
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
});
