import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAudioPlayback } from '../useAudioPlayback';
import type { AudioRow, AudioSourceCandidate } from '../rows';

const t = (key: string, values?: Record<string, unknown>) => {
  if (key === 'lists.audioGatewayLoadFailed') return 'Audio could not be loaded from any gateway';
  if (key === 'lists.audioFile') return 'audio file';
  if (key === 'lists.audioPlaybackGenericReason') return 'Playback failed';
  if (key === 'lists.audioFileLoadFailed') return 'Audio failed to load';
  if (key === 'lists.audioLoadFailed') return `Failed to load ${values?.file}: ${values?.reason}`;
  if (key === 'lists.audioPlaybackFailed') return `Could not play ${values?.file}: ${values?.reason}`;
  if (key === 'lists.audioLinkedFailureAction') return `${values?.message} Generate a new file to replace it.`;
  if (key === 'lists.audioReusableFailureAction') return `${values?.message} Pick another reusable file.`;
  return key;
};

const row: AudioRow = {
  id: 'row-1',
  audioAssetId: 'asset-1',
  knownText: 'body',
  targetText: 'тіло',
  audioText: 'тіло',
  supportingText: 'body',
  language: 'uk',
  audioUrl: '/api/audio/hash-dead',
  arweaveUrl: 'https://turbo-gateway.com/tx-dead',
  arweaveUrls: ['https://turbo-gateway.com/tx-dead', 'https://arweave.net/tx-dead'],
  storageRef: 'tx-dead',
  reusableOptions: [],
  selectedReusableAssetId: null,
  reuseStatus: 'unchecked',
  audioStatus: 'ready',
};

const source: AudioSourceCandidate = {
  kind: 'linked',
  audioUrl: '/api/audio/hash-dead',
  arweaveUrl: row.arweaveUrl,
  arweaveUrls: row.arweaveUrls,
  storageRef: row.storageRef,
};

function stubObjectUrl(value = 'blob:audio') {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => value),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
}

function createAudioMock() {
  const instances: Array<{
    preload: string;
    error: MediaError | null;
    networkState: number;
    readyState: number;
    onended: (() => void) | null;
    onerror: (() => void) | null;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn<() => Promise<void>>>;
  }> = [];

  const audioMock = vi.fn(function AudioMock(url: string) {
    void url;
    const instance = {
      preload: '',
      error: null,
      networkState: 3,
      readyState: 0,
      onended: null,
      onerror: null,
      pause: vi.fn(),
      play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    };
    instances.push(instance);
    return instance;
  });

  return { audioMock, instances };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useAudioPlayback', () => {
  it('falls back from the app proxy to gateway URLs as media sources on click playback', async () => {
    const fetchMock = vi.fn();
    const { audioMock, instances } = createAudioMock();
    const onLinkedSourceFailed = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('Audio', audioMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useAudioPlayback({
        rows: [row],
        t,
        onLinkedSourceFailed,
      }),
    );

    await act(async () => {
      await result.current.playSingle(row, source);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(audioMock).toHaveBeenCalledTimes(1);
    expect(audioMock).toHaveBeenNthCalledWith(1, '/api/audio/hash-dead');

    await act(async () => {
      instances[0].onerror?.();
    });

    expect(audioMock).toHaveBeenCalledTimes(2);
    expect(audioMock).toHaveBeenNthCalledWith(2, 'https://turbo-gateway.com/tx-dead');
    expect(onLinkedSourceFailed).not.toHaveBeenCalled();
    expect(result.current.playbackErrors[row.id]).toBeUndefined();
  });

  it('marks a linked row failed after every media playback candidate fails', async () => {
    const { audioMock, instances } = createAudioMock();
    const onLinkedSourceFailed = vi.fn();
    vi.stubGlobal('Audio', audioMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useAudioPlayback({
        rows: [row],
        t,
        onLinkedSourceFailed,
      }),
    );

    await act(async () => {
      await result.current.playSingle(row, source);
    });
    await act(async () => {
      instances[0].onerror?.();
    });
    await act(async () => {
      instances[1].onerror?.();
    });
    await act(async () => {
      instances[2].onerror?.();
    });

    await waitFor(() => {
      expect(result.current.playbackErrors[row.id]).toContain('Generate a new file');
    });
    expect(onLinkedSourceFailed).toHaveBeenCalledWith(row.id);
    expect(audioMock).toHaveBeenCalledTimes(3);
    expect(audioMock).toHaveBeenNthCalledWith(1, '/api/audio/hash-dead');
    expect(audioMock).toHaveBeenNthCalledWith(2, 'https://turbo-gateway.com/tx-dead');
    expect(audioMock).toHaveBeenNthCalledWith(3, 'https://arweave.net/tx-dead');
  });

  it('falls back to direct gateway candidates for non-proxy audio URLs', async () => {
    stubObjectUrl();
    const remoteSource: AudioSourceCandidate = {
      ...source,
      audioUrl: 'https://cdn.example.test/missing.mp3',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      );
    const onLinkedSourceFailed = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useAudioPlayback({
        rows: [row],
        t,
        onLinkedSourceFailed,
      }),
    );

    let playbackUrl: string | undefined;
    await act(async () => {
      playbackUrl = await result.current.preloadAudio(row.id, remoteSource);
    });

    expect(playbackUrl).toBe('blob:audio');
    expect(onLinkedSourceFailed).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://cdn.example.test/missing.mp3', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://turbo-gateway.com/tx-dead', expect.any(Object));
  });
});
