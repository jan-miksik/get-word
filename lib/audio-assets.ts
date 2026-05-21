import { getAudioUrl } from "@/lib/audio";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";

type AudioAssetLike = {
  contentHash: string;
  storageType: string;
  storageRef: string;
};

export type PlayableAudioFields = {
  url: string | null;
  arweaveUrl: string | null;
  arweaveUrls: string[];
  storageRef: string | null;
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
  return asset.storageType === "r2" && Boolean(process.env.MEDIA_PROXY_WORKER_URL);
}

export function getPlayableAudioFields(
  asset: AudioAssetLike | null | undefined,
): PlayableAudioFields {
  const storageRef = asset?.storageRef ?? null;
  if (!isPlayableAudioAsset(asset)) {
    return {
      url: null,
      arweaveUrl: null,
      arweaveUrls: [],
      storageRef,
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
  };
}
