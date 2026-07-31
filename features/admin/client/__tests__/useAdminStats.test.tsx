import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminStats } from '@/features/admin/client/useAdminStats';

describe('useAdminStats', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const window = url.includes('activityWindow=calendar') ? 'calendar' : 'rolling';
        return new Response(
          JSON.stringify({ generatedAt: '2026-07-18T00:00:00.000Z', activity: { window } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('loads rolling stats and reloads when the activity window changes', async () => {
    const { result } = renderHook(() => useAdminStats());

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/stats?activityWindow=rolling',
      expect.objectContaining({ credentials: 'same-origin' }),
    );

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

  it('maps authorization failures to an explicit client state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
    const { result } = renderHook(() => useAdminStats());

    await waitFor(() => expect(result.current.state.status).toBe('forbidden'));
  });
});
