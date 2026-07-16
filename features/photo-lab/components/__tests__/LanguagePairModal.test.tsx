import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguagePairModal } from '@/features/photo-lab/components/LanguagePairModal';

describe('LanguagePairModal', () => {
  it('focuses the dialog without opening a mobile combobox keyboard', () => {
    render(
      <LanguagePairModal
        isOpen
        languages={[]}
        loading={false}
        from="cs"
        to="vi"
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(screen.getByRole('combobox', { name: 'I know language' })).not.toHaveFocus();
  });
});
