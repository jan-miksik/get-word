import type { WordList, WordListItem } from '@/features/lists/types';

export type AudioSide = 'target' | 'known';
export type AudioSortMode = 'default' | 'repair' | 'missing' | 'latest';

export type AudioVariant = {
  assetId: string;
  contentHash?: string;
  audioUrl: string | null;
  arweaveUrl?: string | null;
  arweaveUrls: string[];
  storageRef?: string | null;
  provider?: string | null;
  voiceId?: string | null;
  sizeBytes?: number;
};

export type AudioRow = {
  id: string;
  audioAssetId: string | null;
  knownText: string;
  targetText: string;
  audioText: string;
  supportingText: string;
  language: string;
  audioUrl: string | null;
  arweaveUrl?: string | null;
  arweaveUrls: string[];
  storageRef?: string | null;
  generationVoiceId?: string | null;
  audioCreatedAt?: string | null;
  reusableOptions: AudioVariant[];
  selectedReusableAssetId: string | null;
  reuseStatus: 'unchecked' | 'checking' | 'found' | 'missing' | 'error';
  audioStatus: 'none' | 'pending' | 'ready' | 'failed';
  source?: 'dedup' | 'generated';
};

export type AudioReuseMatch = {
  asset_id: string;
  content_hash?: string;
  audio_url: string | null;
  arweave_url?: string | null;
  arweave_urls?: string[];
  storage_ref?: string | null;
  provider?: string | null;
  voice_id?: string | null;
  size_bytes?: number;
};

export type AudioSourceCandidate = {
  kind: 'linked' | 'reusable';
  audioUrl: string;
  arweaveUrl?: string | null;
  arweaveUrls: string[];
  storageRef?: string | null;
};

export function toAudioVariant(match: AudioReuseMatch): AudioVariant {
  return {
    assetId: match.asset_id,
    contentHash: match.content_hash,
    audioUrl: match.audio_url,
    arweaveUrl: match.arweave_url ?? null,
    arweaveUrls: match.arweave_urls ?? [],
    storageRef: match.storage_ref ?? null,
    provider: match.provider ?? null,
    voiceId: match.voice_id ?? null,
    sizeBytes: match.size_bytes,
  };
}

export function buildAudioRows(items: WordListItem[], list: WordList, audioSide: AudioSide): AudioRow[] {
  const isKnownSide = audioSide === 'known';

  return items
    .filter((item) => Boolean(isKnownSide ? item.textKnown : item.textTarget))
    .map((item) => {
      const audioUrl = isKnownSide ? item.knownAudioUrl ?? null : item.audioUrl ?? null;
      const rawAudioStatus = (isKnownSide ? item.knownAudioStatus : item.audioStatus ?? 'none') as AudioRow['audioStatus'];
      return {
        id: item.id,
        audioAssetId: isKnownSide ? item.knownAudioAssetId ?? null : item.audioAssetId ?? null,
        knownText: item.textKnown,
        targetText: item.textTarget ?? '',
        audioText: isKnownSide ? item.textKnown : item.textTarget ?? '',
        supportingText: isKnownSide ? item.textTarget ?? '' : item.textKnown,
        language: isKnownSide ? list.languageFrom : list.languageTo,
        audioUrl,
        arweaveUrl: isKnownSide ? item.knownAudioArweaveUrl ?? null : item.audioArweaveUrl ?? null,
        arweaveUrls: isKnownSide ? item.knownAudioArweaveUrls ?? [] : item.audioArweaveUrls ?? [],
        storageRef: isKnownSide ? item.knownAudioStorageRef ?? null : item.audioStorageRef ?? null,
        generationVoiceId: isKnownSide ? item.knownAudioVoiceId ?? null : item.audioVoiceId ?? null,
        audioCreatedAt: isKnownSide ? item.knownAudioCreatedAt ?? null : item.audioCreatedAt ?? null,
        reusableOptions: [],
        selectedReusableAssetId: isKnownSide ? item.knownAudioAssetId ?? null : item.audioAssetId ?? null,
        reuseStatus: 'unchecked',
        audioStatus: rawAudioStatus === 'ready' && !audioUrl ? 'none' : rawAudioStatus,
      };
    });
}

export function getSelectedReusableOption(row: AudioRow): AudioVariant | null {
  if (row.reusableOptions.length === 0) return null;
  if (!row.selectedReusableAssetId) return row.reusableOptions[0] ?? null;
  return (
    row.reusableOptions.find((option) => option.assetId === row.selectedReusableAssetId)
    ?? row.reusableOptions[0]
    ?? null
  );
}

export function getPreviewSource(row: AudioRow): AudioSourceCandidate | null {
  if (row.audioStatus === 'ready' && row.audioUrl) {
    return {
      kind: 'linked',
      audioUrl: row.audioUrl,
      arweaveUrl: row.arweaveUrl ?? null,
      arweaveUrls: row.arweaveUrls ?? [],
      storageRef: row.storageRef ?? null,
    };
  }

  const selectedOption = getSelectedReusableOption(row);
  if (!selectedOption?.audioUrl) return null;

  return {
    kind: 'reusable',
    audioUrl: selectedOption.audioUrl,
    arweaveUrl: selectedOption.arweaveUrl ?? null,
    arweaveUrls: selectedOption.arweaveUrls,
    storageRef: selectedOption.storageRef ?? null,
  };
}

function dateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function compareAudioRows(
  left: AudioRow,
  right: AudioRow,
  mode: AudioSortMode,
  context: {
    repairIds?: Set<string>;
    playbackErrors?: Record<string, string>;
    qualityWarnings?: Record<string, string>;
  } = {},
): number {
  if (mode === 'repair') {
    const repairRank = (row: AudioRow) => {
      if (context.repairIds?.has(row.id)) return 0;
      if (row.audioStatus === 'failed') return 1;
      if (context.playbackErrors?.[row.id]) return 2;
      if (context.qualityWarnings?.[row.id]) return 3;
      return 4;
    };
    return repairRank(left) - repairRank(right);
  }

  if (mode === 'missing') {
    const missingRank = (row: AudioRow) => (row.audioStatus === 'none' ? 0 : 1);
    return missingRank(left) - missingRank(right);
  }

  if (mode === 'latest') {
    return dateValue(right.audioCreatedAt) - dateValue(left.audioCreatedAt);
  }

  return 0;
}
