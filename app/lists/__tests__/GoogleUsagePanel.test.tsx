import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { GoogleUsagePanel } from '../GoogleUsagePanel';

describe('GoogleUsagePanel', () => {
  it('renders account and global Google usage bars with pause messaging', () => {
    render(
      <I18nProvider language="en">
        <GoogleUsagePanel
          usage={{
            period_start: '2026-04-01T00:00:00.000Z',
            inspected_user_id: 'user-1',
            account: [
              {
                scope: 'translate',
                used_units: 25000,
                request_count: 12,
                account_limit: 25000,
                free_monthly_units: 500000,
                paused: true,
                limit_message:
                  'This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.',
              },
              {
                scope: 'tts',
                used_units: 12000,
                request_count: 5,
                account_limit: 50000,
                free_monthly_units: 1000000,
                paused: false,
              },
            ],
            global: [
              {
                scope: 'translate',
                used_units: 130000,
                request_count: 52,
                account_count: 8,
                free_monthly_units: 500000,
              },
            ],
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('Google API usage')).toBeInTheDocument();
    expect(screen.getByText('This account')).toBeInTheDocument();
    expect(screen.getByText('All accounts')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText(/25,000 \/ 25,000 free characters on this account/i)).toBeInTheDocument();
    expect(screen.getByText(/130,000 \/ 500,000 free characters across accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/Reach out to us for more usage/i)).toBeInTheDocument();
  });
});
