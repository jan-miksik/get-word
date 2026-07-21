import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSchoolStats } from '@/features/schools/client/useSchoolStats';

const TEACHER_ENDPOINT = '/api/schools/me/stats';
const ADMIN_ENDPOINT = '/api/admin/schools/school-b/stats';

function statsResponse(url: string) {
  const window = url.includes('activityWindow=calendar') ? 'calendar' : 'rolling';
  const schoolId = url.startsWith(ADMIN_ENDPOINT) ? 'school-b' : 'school-a';
  return new Response(
    JSON.stringify({
      generatedAt: '2026-07-18T00:00:00.000Z',
      school: { id: schoolId },
      activity: { window },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('useSchoolStats', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => statsResponse(String(input))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('loads the endpoint it was given and reloads on window change', async () => {
    const { result } = renderHook(() => useSchoolStats(TEACHER_ENDPOINT));

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetch).toHaveBeenCalledWith(`${TEACHER_ENDPOINT}?activityWindow=rolling`, {
      credentials: 'same-origin',
    });

    act(() => result.current.changeActivityWindow('calendar'));
    expect(result.current.state.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.activityWindow).toBe('calendar');
      expect(result.current.state).toMatchObject({
        status: 'ready',
        stats: { activity: { window: 'calendar' } },
      });
    });
  });

  it('refetches when the endpoint changes', async () => {
    const { result, rerender } = renderHook(({ endpoint }) => useSchoolStats(endpoint), {
      initialProps: { endpoint: TEACHER_ENDPOINT },
    });

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ stats: { school: { id: 'school-a' } } }),
    );

    rerender({ endpoint: ADMIN_ENDPOINT });

    await waitFor(() =>
      expect(result.current.state).toMatchObject({ stats: { school: { id: 'school-b' } } }),
    );
  });

  it('discards a response that arrives after a newer request', async () => {
    // The teacher request hangs until we release it; the admin one resolves at once.
    let resolveTeacher: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith(TEACHER_ENDPOINT)) {
        return new Promise<Response>((resolve) => {
          resolveTeacher = resolve;
        });
      }
      return Promise.resolve(statsResponse(url));
    });

    const { result, rerender } = renderHook(({ endpoint }) => useSchoolStats(endpoint), {
      initialProps: { endpoint: TEACHER_ENDPOINT },
    });

    await waitFor(() => expect(resolveTeacher).toBeDefined());
    rerender({ endpoint: ADMIN_ENDPOINT });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ stats: { school: { id: 'school-b' } } }),
    );

    // The stale teacher response lands last and must not overwrite the newer one.
    await act(async () => {
      resolveTeacher?.(statsResponse(TEACHER_ENDPOINT));
      await Promise.resolve();
    });

    expect(result.current.state).toMatchObject({ stats: { school: { id: 'school-b' } } });
  });

  it('maps authorization failures to explicit client states', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
    const { result } = renderHook(() => useSchoolStats(TEACHER_ENDPOINT));

    await waitFor(() => expect(result.current.state.status).toBe('forbidden'));
  });

  it('maps a missing school to notFound', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    const { result } = renderHook(() => useSchoolStats(TEACHER_ENDPOINT));

    await waitFor(() => expect(result.current.state.status).toBe('notFound'));
  });
});
