import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IosAppStoreMigrationCard } from '../IosAppStoreMigrationCard';

describe('IosAppStoreMigrationCard', () => {
  it('spells out the step that stops reminders arriving twice', () => {
    render(<IosAppStoreMigrationCard url="https://apps.apple.com/app/id1" onDismiss={vi.fn()} />);
    expect(screen.getByText(/remove this old icon/i)).toBeInTheDocument();
  });

  it('links to the store and treats opening it as an answer', async () => {
    const onDismiss = vi.fn();
    render(<IosAppStoreMigrationCard url="https://apps.apple.com/app/id1" onDismiss={onDismiss} />);

    const link = screen.getByRole('link', { name: /app store/i });
    expect(link).toHaveAttribute('href', 'https://apps.apple.com/app/id1');
    await userEvent.click(link);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('can be waved away', async () => {
    const onDismiss = vi.fn();
    render(<IosAppStoreMigrationCard url="https://apps.apple.com/app/id1" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /keep using this version/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
