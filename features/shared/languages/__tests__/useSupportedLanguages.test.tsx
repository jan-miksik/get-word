import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSupportedLanguages } from '../useSupportedLanguages';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSupportedLanguages', () => {
  it('loads the shared language catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ languages: [{ code: 'cs', name: 'Czech' }] }),
      }),
    );

    const { result } = renderHook(() => useSupportedLanguages());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.languages).toEqual([{ code: 'cs', name: 'Czech' }]);
  });

  it('finishes with an empty catalog after a request failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { result } = renderHook(() => useSupportedLanguages());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.languages).toEqual([]);
  });
});
