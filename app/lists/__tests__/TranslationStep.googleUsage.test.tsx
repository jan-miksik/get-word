import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { MAX_COMMENT_TEXT_LENGTH } from '@/lib/word-item-comment';
import { TranslationStep } from '../TranslationStep';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TranslationStep Google usage gating', () => {
  const originalFetch = global.fetch;
  const providerStorageKey = 'get-word-list-translation-provider';

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
    vi.unstubAllGlobals();
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

    fireEvent.change(screen.getByRole('combobox', { name: /translation provider/i }), {
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

    expect(screen.getByRole('combobox', { name: /translation provider/i })).toHaveValue('openrouter');
  });

  it('clears a translation warning after the user edits the result', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/providers/openrouter/status')) {
        return Promise.resolve(jsonResponse({ state: 'not_connected' }));
      }
      if (url.includes('/api/translate/batch')) {
        return Promise.resolve(jsonResponse({
          results: [{
            id: 'item-1',
            translated_text: 'suspicious result',
            status: 'ok',
            source: 'api',
            warning: 'Output may be untranslated (unexpected script).',
          }],
        }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;

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
          pendingItems={[{
            id: 'item-1',
            text_known: 'hello',
            text_target: null,
            position: 0,
          }]}
          inputLanguage="known"
          googleUsage={null}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /auto-translate \(1\)/i }));
    expect(await screen.findByTitle(/unexpected script/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/vietnamese: translation/i), {
      target: { value: 'corrected result' },
    });

    expect(screen.queryByTitle(/unexpected script/i)).not.toBeInTheDocument();
  });

  it('warns before clearing target texts and saves them as empty for regeneration', async () => {
    const onInputLanguageChange = vi.fn();
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
              text_target: 'xin chào',
              position: 0,
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onInputLanguageChange={onInputLanguageChange}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /clear vietnamese texts/i }));

    expect(screen.getByText(/mark them for translation again/i)).toBeInTheDocument();

    const modal = screen
      .getByRole('heading', { name: /clear vietnamese texts/i })
      .closest('div') as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: /clear texts/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/lists/list-1/items/translations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            translations: [
              {
                id: 'item-1',
                text_target: null,
                status: 'manual',
              },
            ],
          }),
        }),
      );
    });

    expect(screen.getByLabelText(/vietnamese: translation/i)).toHaveValue('');
    expect(onInputLanguageChange).toHaveBeenCalledWith('known');
  });

  it('clears the known column and points generation at it', async () => {
    const onInputLanguageChange = vi.fn();
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
              text_target: 'xin chào',
              position: 0,
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onInputLanguageChange={onInputLanguageChange}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /clear czech texts/i }));

    const modal = screen
      .getByRole('heading', { name: /clear czech texts/i })
      .closest('div') as HTMLElement;
    fireEvent.click(within(modal).getByRole('button', { name: /clear texts/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/lists/list-1/items/translations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            translations: [
              {
                id: 'item-1',
                text_known: null,
                status: 'manual',
              },
            ],
          }),
        }),
      );
    });

    expect(screen.getByLabelText(/czech: source text/i)).toHaveValue('');
    expect(onInputLanguageChange).toHaveBeenCalledWith('target');
  });

  it('copies source and translated texts in row order', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

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
              text_target: 'xin chào',
              position: 0,
            },
            {
              id: 'item-2',
              text_known: 'world',
              text_target: 'thế giới',
              position: 1,
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy source + target' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('hello\txin chào\nworld\tthế giới');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('copies source, translated texts, and notes when notes exist', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

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
              text_target: 'xin chào',
              comment: 'a greeting',
              position: 0,
            },
            {
              id: 'item-2',
              text_known: 'world',
              text_target: 'thế giới',
              position: 1,
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy source + target + notes' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('hello\txin chào\ta greeting\nworld\tthế giới\t');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('shows an existing study note and saves an edited note', async () => {
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
              text_target: 'xin chào',
              position: 0,
              comment: 'Existing note',
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    const noteInput = screen.getByLabelText('Study note for this item');
    expect(noteInput).toHaveValue('Existing note');
    expect(noteInput).toHaveAttribute('maxLength', String(MAX_COMMENT_TEXT_LENGTH));
    expect(screen.queryByText(`13 / ${MAX_COMMENT_TEXT_LENGTH} characters`)).not.toBeInTheDocument();

    fireEvent.focus(noteInput);
    expect(screen.getByText(`13 / ${MAX_COMMENT_TEXT_LENGTH} characters`)).toBeInTheDocument();

    fireEvent.change(noteInput, { target: { value: 'Updated note' } });
    expect(screen.getByText(`12 / ${MAX_COMMENT_TEXT_LENGTH} characters`)).toBeInTheDocument();
    fireEvent.blur(noteInput);
    expect(screen.queryByText(`12 / ${MAX_COMMENT_TEXT_LENGTH} characters`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm translations/i }));

    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/items/translations'),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.translations[0]).toEqual({
        id: 'item-1',
        text_target: 'xin chào',
        text_known: 'hello',
        status: 'translated',
        comment: 'Updated note',
      });
    });
  });

  it('limits manually edited study notes to the stored maximum length', async () => {
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
              text_target: 'xin chào',
              position: 0,
              comment: '',
            },
          ]}
          inputLanguage="known"
          googleUsage={null}
          onComplete={vi.fn(async () => {})}
          onSkip={vi.fn(async () => {})}
        />
      </I18nProvider>,
    );

    const noteInput = screen.getByLabelText('Study note for this item');
    fireEvent.focus(noteInput);
    const tooLongNote = 'a'.repeat(MAX_COMMENT_TEXT_LENGTH + 20);
    fireEvent.change(noteInput, { target: { value: tooLongNote } });

    expect(noteInput).toHaveValue('a'.repeat(MAX_COMMENT_TEXT_LENGTH));
    expect(
      screen.getByText(`${MAX_COMMENT_TEXT_LENGTH} / ${MAX_COMMENT_TEXT_LENGTH} characters`),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm translations/i }));

    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url]) => String(url).includes('/items/translations'),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.translations[0].comment).toBe('a'.repeat(MAX_COMMENT_TEXT_LENGTH));
    });
  });
});
