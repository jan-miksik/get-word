import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { TranslationStep } from '../TranslationStep';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const LIST = {
  id: 'list-1',
  ownerId: 'user-1',
  name: 'My list',
  description: null,
  languageFrom: 'cz',
  languageTo: 'vi',
  isPublic: false,
};

const PENDING_ITEMS = [
  { id: 'item-1', text_known: 'dobrý', text_target: 'tốt', position: 0 },
  { id: 'item-2', text_known: 'pes', text_target: 'chó', position: 1 },
];

function renderStep(overrides: Partial<React.ComponentProps<typeof TranslationStep>> = {}) {
  return render(
    <I18nProvider language="en">
      <TranslationStep
        list={LIST}
        pendingItems={PENDING_ITEMS}
        inputLanguage="known"
        googleUsage={null}
        onComplete={vi.fn(async () => {})}
        onSkip={vi.fn(async () => {})}
        {...overrides}
      />
    </I18nProvider>,
  );
}

const bulkButton = () => screen.getByRole('button', { name: /suggest for the whole list/i });

describe('TranslationStep bulk accepted answers', () => {
  const originalFetch = global.fetch;
  let fetchCalls: { url: string; body: unknown }[] = [];

  function mockFetch(handlers: Record<string, (body: unknown) => Response | Promise<Response>>) {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      fetchCalls.push({ url, body });
      for (const [fragment, handler] of Object.entries(handlers)) {
        if (url.includes(fragment)) return handler(body);
      }
      return jsonResponse({});
    }) as typeof fetch;
  }

  beforeEach(() => {
    fetchCalls = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    window.localStorage.clear();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });

  it('keeps advanced actions collapsed and moves accepted-translation inputs into the row menu', () => {
    window.localStorage.setItem(
      'get-word-list-openrouter-model',
      'deepseek/deepseek-v2-flash',
    );
    mockFetch({
      '/api/providers/openrouter/status': () => jsonResponse({ state: 'not_connected' }),
    });
    renderStep();

    const details = screen.getByText('More options').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('Model: deepseek/deepseek-v2-flash')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Add another translation…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^AI$/i })).not.toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Note')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Row options' })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Other correct translations' }));
    expect(screen.getAllByRole('textbox', { name: 'Add another translation…' })).toHaveLength(2);
  });

  it('keeps existing accepted translations visible in the row', () => {
    mockFetch({
      '/api/providers/openrouter/status': () => jsonResponse({ state: 'not_connected' }),
    });
    renderStep({
      pendingItems: [
        {
          ...PENDING_ITEMS[0],
          accepted_known: ['dobrá', 'dobré'],
          accepted_target: ['tột'],
        },
      ],
    });

    expect(screen.getAllByText('Also:')).toHaveLength(2);
    expect(screen.getByText('dobrá')).toBeInTheDocument();
    expect(screen.getByText('dobré')).toBeInTheDocument();
    expect(screen.getByText('tột')).toBeInTheDocument();
  });

  it('disables the bulk button while OpenRouter is not connected', async () => {
    mockFetch({
      '/api/providers/openrouter/status': () => jsonResponse({ state: 'not_connected' }),
    });
    renderStep();
    await waitFor(() => {
      expect(fetchCalls.some((call) => call.url.includes('/openrouter/status'))).toBe(true);
    });
    expect(bulkButton()).toBeDisabled();
  });

  it('persists rows, previews suggestions, and applies only the selected ones', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    mockFetch({
      '/api/providers/openrouter/status': () => jsonResponse({ state: 'connected' }),
      '/accepted-answers/bulk-suggest': () =>
        jsonResponse({
          suggestions: [
            { item_id: 'item-1', known: ['dobrá'], target: ['tệt'] },
            { item_id: 'item-2', known: [], target: ['mèo'] },
          ],
          skipped_item_ids: [],
        }),
      '/accepted-answers/bulk-apply': () =>
        jsonResponse({
          applied_item_ids: ['item-1'],
          skipped_item_ids: [],
          items: [{ item_id: 'item-1', known: ['dobrá'], target: ['tệt'] }],
        }),
    });
    renderStep();
    await waitFor(() => expect(bulkButton()).toBeEnabled());

    fireEvent.click(bulkButton());

    // The review modal lists every suggestion, checked by default.
    expect(await screen.findByText('Other correct translations to add')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy overview' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('dobrý → tốt\nCzech: dobrá\nVietnamese: tệt'),
      );
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    // Rows were saved before generation started.
    const translationsIndex = fetchCalls.findIndex((call) =>
      call.url.includes('/items/translations'),
    );
    const suggestIndex = fetchCalls.findIndex((call) => call.url.includes('/bulk-suggest'));
    expect(translationsIndex).toBeGreaterThanOrEqual(0);
    expect(translationsIndex).toBeLessThan(suggestIndex);
    expect(fetchCalls[suggestIndex].body).toEqual({
      item_ids: ['item-1', 'item-2'],
      translation_model: 'anthropic/claude-sonnet-5',
    });

    // Uncheck item-2's suggestion, then apply the rest.
    fireEvent.click(screen.getByRole('checkbox', { name: /mèo/i }));
    expect(screen.getByText('2 of 3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add selected \(2\)/i }));

    await waitFor(() => {
      const applyCall = fetchCalls.find((call) => call.url.includes('/bulk-apply'));
      expect(applyCall).toBeTruthy();
      expect(applyCall!.body).toEqual({
        items: [{ item_id: 'item-1', known: ['dobrá'], target: ['tệt'] }],
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('Other correct translations to add')).not.toBeInTheDocument();
    });
    // The applied alternative shows up in the row editor chips.
    expect(screen.getByText('dobrá')).toBeInTheDocument();
  });

  it('keeps partial results and reports failed items separately from no-suggestion items', async () => {
    mockFetch({
      '/api/providers/openrouter/status': () => jsonResponse({ state: 'connected' }),
      '/accepted-answers/bulk-suggest': () => jsonResponse({ error: 'boom' }, 500),
    });
    renderStep();
    await waitFor(() => expect(bulkButton()).toBeEnabled());

    fireEvent.click(bulkButton());

    // Both items sat in the single failed chunk; the modal still opens and
    // reports them instead of silently dropping the run.
    const modalTitle = await screen.findByText('Other correct translations to add');
    const modal = modalTitle.closest('div')?.parentElement as HTMLElement;
    expect(screen.getByText(/generation failed for 2 items/i)).toBeInTheDocument();
    expect(within(modal).getByText('boom')).toBeInTheDocument();
    expect(within(modal).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('warns before leaving while generation results still exist only in memory', async () => {
    let finishSuggestionRequest!: (response: Response) => void;
    const suggestionResponse = new Promise<Response>((resolve) => {
      finishSuggestionRequest = resolve;
    });
    const onSkip = vi.fn(async () => {});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockFetch({
      '/api/providers/openrouter/status': () => jsonResponse({ state: 'connected' }),
      '/accepted-answers/bulk-suggest': () => suggestionResponse,
    });
    renderStep({ onSkip });
    await waitFor(() => expect(bulkButton()).toBeEnabled());

    fireEvent.click(bulkButton());
    await waitFor(() => expect(screen.getByText(/generating… 0\/1/i)).toBeInTheDocument());

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Generation is still running'),
    );
    expect(onSkip).not.toHaveBeenCalled();

    finishSuggestionRequest(jsonResponse({
      suggestions: [{ item_id: 'item-1', known: ['dobrá'], target: [] }],
      skipped_item_ids: [],
    }));
    expect(await screen.findByText('Other correct translations to add')).toBeInTheDocument();

    confirm.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();

    // Explicit cancellation discards the in-memory preview and releases the guard.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    confirm.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
