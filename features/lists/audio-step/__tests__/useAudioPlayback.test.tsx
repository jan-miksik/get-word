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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useAudioPlayback', () => {
  it('marks a linked row failed without replaying a URL that preload already rejected', async () => {
    const fetchMock = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const audioMock = vi.fn();
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

    await waitFor(() => {
      expect(result.current.playbackErrors[row.id]).toContain('Generate a new file');
    });
    expect(onLinkedSourceFailed).toHaveBeenCalledWith(row.id);
    expect(audioMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/audio/hash-dead', expect.any(Object));
  });
});
