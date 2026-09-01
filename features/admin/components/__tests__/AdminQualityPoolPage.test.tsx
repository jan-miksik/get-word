import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QualityPoolResponse, QualityPoolRow } from '@/features/admin/quality-types';

const apiFetch = vi.fn();

vi.mock('@/features/shared/http/api-runtime', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock('@/features/shared/languages/useSettingsLanguage', () => ({
  useSettingsLanguage: () => 'en',
}));

import { AdminQualityPoolPage } from '../AdminQualityPoolPage';

function row(overrides: Partial<QualityPoolRow> = {}): QualityPoolRow {
  return {
    pool_key: 'p1:aaa',
    language_from: 'cs',
    language_to: 'en',
    text_known: 'pes',
    text_target: 'dog',
    occurrences: 12,
    list_count: 7,
    topics: [],
    known: {
      ready_count: 4,
      missing_count: 8,
      failed_count: 0,
      pending_count: 0,
      legacy_count: 0,
      assets: [],
    },
    target: {
      ready_count: 12,
      missing_count: 0,
      failed_count: 0,
      pending_count: 0,
      legacy_count: 0,
      assets: [],
    },
    heuristic_flags: [],
    heuristic_version: 1,
    llm_score: null,
    llm_reason: null,
    llm_suggested_target: null,
    llm_audit_version: null,
    verdict: 'unreviewed',
    reviewed_heuristic_version: null,
    reviewed_llm_audit_version: null,
    suggested_known: null,
    suggested_target: null,
    suggestion_note: null,
    suggestion_version: 0,
    reviewed_at: null,
    verdict_stale: false,
    suspicion: 0,
    ...overrides,
  };
}

function respondWith(rows: QualityPoolRow[]) {
  const body: QualityPoolResponse = {
    rows,
    total: rows.length,
    limit: 50,
    offset: 0,
    heuristic_version: 1,
    llm_audit_version: 1,
  };
  apiFetch.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => body,
  });
}

/**
 * Pool reads answered from `rows`, every write answered as a success. Lets a
 * test assert what a bulk action actually posted.
 */
function respondWithWrites(rows: QualityPoolRow[]) {
  const body: QualityPoolResponse = {
    rows,
    total: rows.length,
    limit: 50,
    offset: 0,
    heuristic_version: 1,
    llm_audit_version: 1,
  };
  apiFetch.mockImplementation(async (url: string) => ({
    status: 200,
    ok: true,
    json: async () => (url.startsWith('/api/admin/quality?') ? body : { linked_items: 1 }),
  }));
}

function writesTo(path: string): unknown[] {
  return apiFetch.mock.calls
    .filter((call) => String(call[0]) === path)
    .map((call) => JSON.parse(String((call[1] as { body?: string }).body)));
}

beforeEach(() => {
  apiFetch.mockReset();
  vi.useRealTimers();
});

/**
 * Wait for the table body and scope assertions to it.
 *
 * The filter dropdowns render every verdict label as an `<option>`, so a bare
 * `getByText('Marked fine')` matches the filter before any data has loaded and
 * a test can pass — or look ready — while the table is still empty.
 */
async function tableBody(container: HTMLElement): Promise<HTMLElement> {
  return waitFor(() => {
    const body = container.querySelector('tbody');
    if (!body || body.children.length === 0) throw new Error('no rows yet');
    return body as HTMLElement;
  });
}

describe('AdminQualityPoolPage', () => {
  /**
   * The half-done case is the reason the API returns counts instead of a
   * boolean, so the UI has to actually show it. "4/12" must not collapse into
   * a tick that says the pair is finished.
   */
  it('shows partial audio coverage as a fraction, not as done', async () => {
    respondWith([row()]);
    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);

    expect(within(body).getByText('4/12')).toBeTruthy();
    expect(within(body).getByText('12/12')).toBeTruthy();
  });

  it('renders the pair and its usage counts', async () => {
    respondWith([row()]);
    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);

    expect(within(body).getByText(/pes/)).toBeTruthy();
    expect(within(body).getByText(/dog/)).toBeTruthy();
    expect(within(body).getByText('/ 7')).toBeTruthy();
  });

  /**
   * `divergent_targets` fires on legitimate polysemy, so it is styled as a
   * neutral notice. `dominated_minority` is the code that actually accuses.
   */
  it('styles a notice flag differently from a high-severity one', async () => {
    respondWith([
      row({
        pool_key: 'p1:notice',
        heuristic_flags: [{ code: 'divergent_targets', weight: 'notice' }],
      }),
      row({
        pool_key: 'p1:high',
        text_known: 'být',
        text_target: 'to be and to have',
        heuristic_flags: [{ code: 'dominated_minority', weight: 'high' }],
      }),
    ]);
    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);

    const notice = within(body).getByText('Several translations exist — worth a look');
    const severe = within(body).getByText('Rare outlier against a dominant translation');

    expect(notice.className).toContain('italic');
    expect(notice.className).not.toContain('danger');
    expect(severe.className).toContain('danger');
  });

  it('marks a verdict that predates the current generation of the checks', async () => {
    respondWith([
      row({
        verdict: 'ok',
        reviewed_heuristic_version: 0,
        verdict_stale: true,
      }),
    ]);
    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);

    expect(within(body).getByText('Marked fine')).toBeTruthy();
    expect(within(body).getByText('Checks have changed since')).toBeTruthy();
  });

  it('reports an editor-only page to a non-editor instead of an empty table', async () => {
    apiFetch.mockResolvedValue({ status: 403, ok: false, json: async () => ({}) });
    render(<AdminQualityPoolPage />);

    await waitFor(() => expect(screen.getByText('Editor role required.')).toBeTruthy());
  });

  /**
   * The count on a bulk button is what the action would actually change, not
   * how many rows are ticked. `row()` is already fully recorded on the target
   * side, so selecting it offers a known-side repair and nothing on the target
   * — otherwise pressing it would post a request per row and collect 422s for
   * pairs that needed nothing.
   */
  it('counts only the selected pairs a bulk action can change', async () => {
    respondWithWrites([row()]);
    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);

    const checkbox = within(body).getByRole('checkbox');
    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record known side (1)' })).toBeTruthy();
    const targetButton = screen.getByRole('button', {
      name: 'Record target side (0)',
    }) as HTMLButtonElement;
    expect(targetButton.disabled).toBe(true);
  });

  /** Select-all covers the page, and each pair is its own request. */
  it('records the known side of every selected pair, one request each', async () => {
    respondWithWrites([
      row({ pool_key: 'p1:a' }),
      row({ pool_key: 'p1:b', text_known: 'kočka', text_target: 'cat' }),
    ]);
    const { container } = render(<AdminQualityPoolPage />);
    await tableBody(container);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Select every row on this page'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record known side (2)' }));
    });

    await waitFor(() =>
      expect(writesTo('/api/admin/quality/audio')).toEqual([
        { poolKey: 'p1:a', side: 'known' },
        { poolKey: 'p1:b', side: 'known' },
      ]),
    );
    // The selection is spent once the run finishes.
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull());
  });

  /** The AI check runs over whatever the editor selected, in one request. */
  it('sends the whole selection to the AI check at once', async () => {
    respondWithWrites([row({ pool_key: 'p1:a' }), row({ pool_key: 'p1:b' })]);
    const { container } = render(<AdminQualityPoolPage />);
    await tableBody(container);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Select every row on this page'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'AI check (2)' }));
    });

    await waitFor(() =>
      expect(writesTo('/api/admin/quality/audit')).toEqual([
        { poolKeys: ['p1:a', 'p1:b'], maxItems: 2 },
      ]),
    );
  });

  /**
   * Re-recording under the automatic voice would resolve to the same voice,
   * hash to the same asset and change nothing audible. The button says so
   * rather than firing a request that looks like it worked.
   */
  it('offers re-recording only once a voice or the mix is chosen', async () => {
    respondWithWrites([row()]);
    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);

    await act(async () => {
      fireEvent.click(within(body).getByText(/pes/));
    });

    const reRecord = screen.getAllByRole('button', {
      name: 'Record again',
    }) as HTMLButtonElement[];
    expect(reRecord.every((button) => button.disabled)).toBe(true);

    // The target side is fully recorded; its select is the second one.
    const selects = screen.getAllByRole('combobox');
    const targetVoice = selects[selects.length - 1];
    await act(async () => {
      fireEvent.change(targetVoice, { target: { value: 'random' } });
    });

    const enabled = screen.getAllByRole('button', {
      name: 'Record again',
    }) as HTMLButtonElement[];
    expect(enabled.some((button) => !button.disabled)).toBe(true);
  });

  /** Replacing a clip changes what learners hear, so it confirms first. */
  it('replaces a recording with a random voice after confirmation', async () => {
    respondWithWrites([row()]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);

    await act(async () => {
      fireEvent.click(within(body).getByText(/pes/));
    });
    const selects = screen.getAllByRole('combobox');
    await act(async () => {
      fireEvent.change(selects[selects.length - 1], { target: { value: 'random' } });
    });
    const button = (screen.getAllByRole('button', { name: 'Record again' }) as HTMLButtonElement[])
      .find((candidate) => !candidate.disabled)!;
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() =>
      expect(writesTo('/api/admin/quality/audio')).toEqual([
        {
          poolKey: 'p1:aaa',
          side: 'target',
          mode: 'replace',
          voice: { mode: 'random' },
        },
      ]),
    );
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  /**
   * The history is the only record that a pair was re-recorded at all — the
   * pool row itself keeps just the latest state.
   */
  it('loads the editor history only when it is opened', async () => {
    respondWithWrites([row()]);
    apiFetch.mockImplementation(async (url: string) => ({
      status: 200,
      ok: true,
      json: async () =>
        url.startsWith('/api/admin/quality?')
          ? {
              rows: [row()],
              total: 1,
              limit: 50,
              offset: 0,
              heuristic_version: 1,
              llm_audit_version: 1,
            }
          : url.endsWith('/history')
            ? {
                events: [
                  {
                    id: 'e1',
                    action: 'audio_replaced',
                    side: 'target',
                    detail: { voice_id: 'cs-CZ-Chirp3-HD-Puck', linked_items: 12 },
                    actor: 'editor@example.com',
                    created_at: '2026-08-18T10:00:00.000Z',
                  },
                ],
              }
            : { linked_items: 1 },
    }));

    const { container } = render(<AdminQualityPoolPage />);
    const body = await tableBody(container);
    await act(async () => {
      fireEvent.click(within(body).getByText(/pes/));
    });

    expect(
      apiFetch.mock.calls.some((call) => String(call[0]).endsWith('/history')),
    ).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show history' }));
    });

    await waitFor(() => expect(screen.getByText('Audio re-recorded')).toBeTruthy());
    expect(screen.getByText(/cs-CZ-Chirp3-HD-Puck/)).toBeTruthy();
    expect(screen.getByText(/editor@example.com/)).toBeTruthy();
  });
});
