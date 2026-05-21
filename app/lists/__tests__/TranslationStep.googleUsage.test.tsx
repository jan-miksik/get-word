import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { TranslationStep } from '../TranslationStep';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TranslationStep Google usage gating', () => {
  const originalFetch = global.fetch;
  const providerStorageKey = 'wordlink-list-translation-provider';

  beforeEach(() => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/providers/openrouter/status')) {
        return Promise.resolve(jsonResponse({ state: 'not_connected' }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.localStorage.clear();
  });

  it('disables Google auto-translate when the free account share is paused', () => {
    render(
      <I18nProvider language="en">
        <TranslationStep
          list={{
            id: 'list-1',
            ownerId: 'user-1',
            name: 'My list',
            description: null,
            languageFrom: 'cz',
            languageTo: 'vi',
            isPublic: false,
          }}
          pendingItems={[
            {
              id: 'item-1',
              text_known: 'hello',
              text_target: null,
              position: 0,
            },
          ]}
          inputLanguage="known"
          googleUsage={{
            period_start: '2026-04-01T00:00:00.000Z',
            inspected_user_id: 'user-1',
            account: [
              {
                scope: 'translate',
                used_units: 25000,
                request_count: 15,
                account_limit: 25000,
                free_monthly_units: 500000,
                paused: true,
                limit_message:
                  'This account has reached the free Google API usage limit. Reach out to us for more usage, or use your own API keys.',
              },
              {
                scope: 'tts',
                used_units: 0,
                request_count: 0,
                account_limit: 50000,
                free_monthly_units: 1000000,
                paused: false,
              },
            ],
          }}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('button', { name: /auto-translate \(1\)/i })).toBeDisabled();
    expect(screen.getByText(/reached the free Google API usage limit/i)).toBeInTheDocument();
  });

  it('keeps the selected translation provider for later edit rounds', async () => {
    render(
      <I18nProvider language="en">
        <TranslationStep
          list={{
            id: 'list-1',
            ownerId: 'user-1',
            name: 'My list',
            description: null,
            languageFrom: 'cz',
            languageTo: 'vi',
            isPublic: false,
          }}
          pendingItems={[
            {
              id: 'item-1',
              text_known: 'hello',
              text_target: null,
              position: 0,
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'openrouter' },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(providerStorageKey)).toBe('openrouter');
    });
  });

  it('restores the saved translation provider on mount', () => {
    window.localStorage.setItem(providerStorageKey, 'openrouter');

    render(
      <I18nProvider language="en">
        <TranslationStep
          list={{
            id: 'list-1',
            ownerId: 'user-1',
            name: 'My list',
            description: null,
            languageFrom: 'cz',
            languageTo: 'vi',
            isPublic: false,
          }}
          pendingItems={[
            {
              id: 'item-1',
              text_known: 'hello',
              text_target: null,
              position: 0,
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole('combobox')).toHaveValue('openrouter');
  });
});
