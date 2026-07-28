import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockRequestPhotoLabUsage = vi.fn();
const mockRequestPhotoAnalysis = vi.fn();
const mockDownscalePhoto = vi.fn();
const mockQueuePendingLearningLanguagePair = vi.fn();
const mockStoreLearningLanguagePair = vi.fn();

vi.mock('../../client/usage', () => ({
  requestPhotoLabUsage: (...args: unknown[]) => mockRequestPhotoLabUsage(...args),
}));

vi.mock('../../client/analyze', () => ({
  requestPhotoAnalysis: (...args: unknown[]) => mockRequestPhotoAnalysis(...args),
  PhotoLabRequestError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

vi.mock('../../client/downscale', () => ({
  downscalePhoto: (...args: unknown[]) => mockDownscalePhoto(...args),
}));

vi.mock('../../client/audio', () => ({ requestPhotoLabAudio: vi.fn() }));

vi.mock('@/features/shared/languages/learningPairStorage', () => ({
  readLearningLanguagePair: () => ({ from: 'cs', to: 'en' }),
  storeLearningLanguagePair: (...args: unknown[]) =>
    mockStoreLearningLanguagePair(...args),
}));
vi.mock('@/features/shared/languages/learningPairSync', () => ({
  queuePendingLearningLanguagePair: (...args: unknown[]) =>
    mockQueuePendingLearningLanguagePair(...args),
}));

vi.mock('../../client/photoStore', () => ({
  cleanupPhotoLab: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  getPhoto: vi.fn().mockResolvedValue(null),
  listSessions: vi.fn().mockResolvedValue([]),
  putPhoto: vi.fn().mockResolvedValue(true),
  putSession: vi.fn().mockResolvedValue(undefined),
  updateSessionAudioHashes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/local-first/stores', () => ({ getPrefsRow: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/browser-id', () => ({ createBrowserId: () => 'session-1' }));

import { usePhotoLabStudio } from '../usePhotoLabStudio';

function fileChangeEvent() {
  const input = { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })], value: 'x' };
  return { target: input } as unknown as React.ChangeEvent<HTMLInputElement>;
}

describe('usePhotoLabStudio allowance gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownscalePhoto.mockResolvedValue({ blob: new Blob(), dataUrl: 'data:,', hash: 'h1' });
    mockRequestPhotoAnalysis.mockResolvedValue([]);
    mockQueuePendingLearningLanguagePair.mockResolvedValue(undefined);
  });

  it('reports the allowance as spent once nothing remains', async () => {
    mockRequestPhotoLabUsage.mockResolvedValue({
      used: 5,
      limit: 5,
      remaining: 0,
      reset_at: '2026-07-27T00:00:00.000Z',
      period: 'week',
    });

    const { result } = renderHook(() => usePhotoLabStudio());

    await waitFor(() => expect(result.current.limitReached).toBe(true));
  });

  it('refuses a picked photo instead of starting an analysis that can only fail', async () => {
    mockRequestPhotoLabUsage.mockResolvedValue({
      used: 5,
      limit: 5,
      remaining: 0,
      reset_at: '2026-07-27T00:00:00.000Z',
      period: 'week',
    });

    const { result } = renderHook(() => usePhotoLabStudio());
    await waitFor(() => expect(result.current.limitReached).toBe(true));

    await act(async () => {
      await result.current.handleFileChange(fileChangeEvent());
    });

    expect(mockRequestPhotoAnalysis).not.toHaveBeenCalled();
    expect(result.current.analyzing).toBe(false);
    expect(result.current.errorCode).toBe('limit');
  });

  it('does not block while the allowance is still unknown', async () => {
    // Offline or on a failed usage read the server stays the authority; the
    // button must not lock the user out on a missing number.
    mockRequestPhotoLabUsage.mockResolvedValue(null);

    const { result } = renderHook(() => usePhotoLabStudio());

    await waitFor(() => expect(mockRequestPhotoLabUsage).toHaveBeenCalled());
    expect(result.current.limitReached).toBe(false);

    await act(async () => {
      await result.current.handleFileChange(fileChangeEvent());
    });

    expect(mockRequestPhotoAnalysis).toHaveBeenCalled();
  });

  it('shares controlled language changes with the app and follows changes from chat', async () => {
    mockRequestPhotoLabUsage.mockResolvedValue(null);
    const onLanguagePairChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ from, to }) =>
        usePhotoLabStudio(true, {
          languageFrom: from,
          languageTo: to,
          onLanguagePairChange,
        }),
      { initialProps: { from: 'fr', to: 'es' } },
    );

    expect(result.current.langFrom).toBe('fr');
    expect(result.current.langTo).toBe('es');

    act(() => result.current.changeLanguagePair({ from: 'cs', to: 'vi' }));
    expect(result.current.langFrom).toBe('cs');
    expect(result.current.langTo).toBe('vi');
    expect(onLanguagePairChange).toHaveBeenCalledWith({ from: 'cs', to: 'vi' });

    rerender({ from: 'de', to: 'en' });
    expect(result.current.langFrom).toBe('de');
    expect(result.current.langTo).toBe('en');
  });

  it('persists standalone language changes as the shared app preference', async () => {
    mockRequestPhotoLabUsage.mockResolvedValue(null);
    const { result } = renderHook(() => usePhotoLabStudio());
    await waitFor(() => expect(result.current.languagesReady).toBe(true));

    act(() => result.current.changeLanguagePair({ from: 'fr', to: 'es' }));

    expect(mockStoreLearningLanguagePair).toHaveBeenCalledWith({ from: 'fr', to: 'es' });
    expect(mockQueuePendingLearningLanguagePair).toHaveBeenCalledWith({
      from: 'fr',
      to: 'es',
      changedAt: expect.any(String),
    });
  });

  it('pauses the ETA timer while hidden but lets one analysis finish in the background', async () => {
    mockRequestPhotoLabUsage.mockResolvedValue(null);
    let resolveAnalysis: ((labels: []) => void) | undefined;
    mockRequestPhotoAnalysis.mockImplementation(
      () =>
        new Promise<[]>((resolve) => {
          resolveAnalysis = resolve;
        }),
    );
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const interval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const photo = { blob: new Blob(), dataUrl: 'data:,', hash: 'h1' };

    const { result, rerender } = renderHook(
      ({ active }) => usePhotoLabStudio(active),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(result.current.languagesReady).toBe(true));

    act(() => {
      void result.current.analyze(photo);
    });
    await waitFor(() => expect(result.current.analyzing).toBe(true));
    expect(interval).toHaveBeenCalled();

    rerender({ active: false });
    expect(clearInterval).toHaveBeenCalled();

    now.mockReturnValue(7_000);
    rerender({ active: true });
    await waitFor(() => expect(result.current.analysisElapsedSeconds).toBe(6));

    rerender({ active: false });
    await act(async () => {
      resolveAnalysis?.([]);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.analyzing).toBe(false));
    expect(result.current.current?.session.id).toBe('session-1');
    expect(mockRequestPhotoAnalysis).toHaveBeenCalledTimes(1);

    now.mockRestore();
    interval.mockRestore();
    clearInterval.mockRestore();
  });
});
