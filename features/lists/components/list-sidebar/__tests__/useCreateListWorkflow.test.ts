import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCreateListWorkflow } from '../useCreateListWorkflow';

describe('useCreateListWorkflow', () => {
  it('opens for a new signal and adopts supplied language defaults', () => {
    const { result, rerender } = renderHook(
      ({ signal, from, to }) => useCreateListWorkflow({
        openSignal: signal,
        initialLanguageFrom: from,
        initialLanguageTo: to,
      }),
      { initialProps: { signal: 0, from: 'cs', to: 'vi' } },
    );

    expect(result.current.isOpen).toBe(false);
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);

    rerender({ signal: 1, from: 'en', to: 'de' });
    expect(result.current).toMatchObject({
      isOpen: true,
      languageFrom: 'en',
      languageTo: 'de',
    });
  });
});
