import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import { apiFetch } from '@/features/shared/http/api-runtime';
import {
  resetBackgroundTargetAudioRepairForTests,
  useBackgroundTargetAudioRepair,
} from '../useBackgroundTargetAudioRepair';

vi.mock('@/features/shared/http/api-runtime', () => ({
  apiFetch: vi.fn(),
}));

function word(id: string, viAudio?: string): NormalizedWord {
  return {
    id,
    listId: 'personal-list',
    category: ['word'],
    cz: `known ${id}`,
    en: '',
    vi: `target ${id}`,
    languageTo: 'vi',
    ...(viAudio ? { viAudio } : {}),
  };
}

describe('useBackgroundTargetAudioRepair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBackgroundTargetAudioRepairForTests();
  });

  it('sends at most five genuinely missing target clips and refreshes after success', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [{ id: 'missing-1', status: 'ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const words = [
      ...Array.from({ length: 6 }, (_, index) => word(`missing-${index}`)),
      word('already-loaded', '/api/audio/already-loaded'),
    ];

    renderHook(() => useBackgroundTargetAudioRepair({ words, enabled: true, onRefresh: refresh }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0]?.[1]?.body));
    expect(request.items).toHaveLength(5);
    expect(request.items.map((item: { id: string }) => item.id)).toEqual([
      'missing-0',
      'missing-1',
      'missing-2',
      'missing-3',
      'missing-4',
    ]);
    expect(request.audio_field).toBe('target');
    expect(request.provider).toBe('google_tts');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('does not duplicate a batch when the study state rerenders while it is pending', async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    vi.mocked(apiFetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const words = [word('pending')];
    const { rerender } = renderHook(() =>
      useBackgroundTargetAudioRepair({
        words,
        enabled: true,
        onRefresh: vi.fn().mockResolvedValue(undefined),
      }),
    );

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    rerender();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    resolveRequest(new Response(JSON.stringify({ results: [] }), { status: 200 }));
  });
});
