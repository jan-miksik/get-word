import { getAudioUrl } from "@/lib/audio";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";

type AudioAssetLike = {
  contentHash: string;
  storageType: string;
  storageRef: string;
  voiceId?: string | null;
};

export type PlayableAudioFields = {
  url: string | null;
  arweaveUrl: string | null;
  arweaveUrls: string[];
  storageRef: string | null;
  voiceId: string | null;
};

function hasRemoteStorageRef(storageRef: string): boolean {
  return /^https?:\/\//.test(storageRef);
}

export function isPlayableAudioAsset<T extends AudioAssetLike>(
  asset: T | null | undefined,
): asset is T {
  if (!asset) return false;
  if (asset.storageType === "arweave") return true;
  if (hasRemoteStorageRef(asset.storageRef)) return true;
  // Legacy "r2" rows are intentionally not playable: R2 has been removed and the
  // serve route returns 404 for them, so the UI must not offer playback.
  return asset.storageType === "object_store";
}

export function getPlayableAudioFields(
  asset: AudioAssetLike | null | undefined,
): PlayableAudioFields {
  const storageRef = asset?.storageRef ?? null;
  const voiceId = asset?.voiceId ?? null;
  if (!isPlayableAudioAsset(asset)) {
    return {
      url: null,
      arweaveUrl: null,
      arweaveUrls: [],
      storageRef,
      voiceId,
    };
  }

  const arweaveUrls =
    asset.storageType === "arweave"
      ? getArweaveGatewayUrls(asset.storageRef)
      : [];

  return {
    url: getAudioUrl(asset.contentHash),
    arweaveUrl: arweaveUrls[0] ?? null,
    arweaveUrls,
    storageRef: asset.storageRef,
    voiceId,
  };
}
