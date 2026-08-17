import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    ai_consent: false,
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

  it('says so when a pair may not be sent for AI review', async () => {
    respondWith([row({ ai_consent: false })]);
    const { container } = render(<AdminQualityPoolPage />);

    const pairRow = await waitFor(() => {
      const found = container.querySelector('tbody tr');
      if (!found) throw new Error('no row yet');
      return found as HTMLElement;
    });
    pairRow.click();

    await waitFor(() =>
      expect(
        screen.getByText(/at least one owner of this pair has not allowed it/),
      ).toBeTruthy(),
    );
  });
});
