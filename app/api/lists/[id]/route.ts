import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  getListCategories,
  getListItems,
  updateList,
  deleteList,
  getMediaAssetsByIds,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getAudioUrl } from "@/lib/audio";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";

type RouteContext = { params: Promise<{ id: string }> };

function hydrateSingleAudioAsset(
  audioAssetId: string | null | undefined,
  mediaAssets: Awaited<ReturnType<typeof getMediaAssetsByIds>>,
) {
  if (!audioAssetId) {
    return {
      url: null,
      arweaveUrl: null,
      arweaveUrls: [] as string[],
      storageRef: null,
    };
  }

  const asset = mediaAssets.get(audioAssetId);
  if (!asset) {
    return {
      url: null,
      arweaveUrl: null,
      arweaveUrls: [] as string[],
      storageRef: null,
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

function getHydratedAudioFields(
  knownAudioAssetId: string | null | undefined,
  targetAudioAssetId: string | null | undefined,
  mediaAssets: Awaited<ReturnType<typeof getMediaAssetsByIds>>,
) {
  const known = hydrateSingleAudioAsset(knownAudioAssetId, mediaAssets);
  const target = hydrateSingleAudioAsset(targetAudioAssetId, mediaAssets);

  return {
    knownAudioUrl: known.url,
    knownAudioArweaveUrl: known.arweaveUrl,
    knownAudioArweaveUrls: known.arweaveUrls,
    knownAudioStorageRef: known.storageRef,
    audioUrl: target.url,
    audioArweaveUrl: target.arweaveUrl,
    audioArweaveUrls: target.arweaveUrls,
    audioStorageRef: target.storageRef,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const includeMedia = request.nextUrl.searchParams.get("include_media") !== "false";
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  if (!list.isPublic && list.ownerId !== user.id) {
    return forbiddenResponse("Not authorized to view this list");
  }

  const [categories, items] = await Promise.all([
    getListCategories(id),
    getListItems(id),
  ]);

  const mediaAssets = includeMedia
    ? await getMediaAssetsByIds(
        items
          .flatMap((item) => [item.knownAudioAssetId, item.audioAssetId])
          .filter((id): id is string => Boolean(id)),
      )
    : new Map();

  return NextResponse.json({
    list,
    categories,
    items: items.map((item) => ({
      ...item,
      ...(includeMedia
        ? getHydratedAudioFields(item.knownAudioAssetId, item.audioAssetId, mediaAssets)
        : {
            knownAudioUrl: null,
            knownAudioArweaveUrl: null,
            knownAudioArweaveUrls: [],
            knownAudioStorageRef: null,
            audioUrl: null,
            audioArweaveUrl: null,
            audioArweaveUrls: [],
            audioStorageRef: null,
          }),
    })),
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (list.ownerId !== user.id) {
    return forbiddenResponse("Only the list owner can update it");
  }

  const body = await request.json();
  const updated = await updateList(id, {
    name: body.name,
    description: body.description,
    isPublic: body.is_public,
  });

  return NextResponse.json({ list: updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (list.ownerId !== user.id) {
    return forbiddenResponse("Only the list owner can delete it");
  }

  await deleteList(id);
  return NextResponse.json({ success: true });
}
