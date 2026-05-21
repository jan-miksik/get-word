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
  isEditor,
} from "@/lib/auth";
import { getAudioUrl } from "@/lib/audio";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";
import { normalizeLanguageCode } from "@/lib/i18n/languages";

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
  const body = await request.json();
  const commonRequested = typeof body.is_common === "boolean";
  const recommendedRequested = typeof body.is_recommended === "boolean";
  const rawLanguageFrom = typeof body.language_from === "string" ? body.language_from : undefined;
  const rawLanguageTo = typeof body.language_to === "string" ? body.language_to : undefined;
  const languageFrom = rawLanguageFrom ? normalizeLanguageCode(rawLanguageFrom) : undefined;
  const languageTo = rawLanguageTo ? normalizeLanguageCode(rawLanguageTo) : undefined;
  if (languageFrom && languageTo && languageFrom === languageTo) {
    return NextResponse.json(
      { error: "language_from and language_to must be different" },
      { status: 400 },
    );
  }
  if ((languageFrom && languageFrom === list.languageTo && !languageTo) || (languageTo && languageTo === list.languageFrom && !languageFrom)) {
    return NextResponse.json(
      { error: "language_from and language_to must be different" },
      { status: 400 },
    );
  }
  const canEditMetadata = list.ownerId === user.id || isEditor(user);
  if (!canEditMetadata) {
    return forbiddenResponse("Only the list owner can update it");
  }
  if ((commonRequested || recommendedRequested) && !isEditor(user)) {
    return forbiddenResponse("Editor role required");
  }

  const updated = await updateList(id, {
    name: body.name,
    description: body.description,
    isPublic: body.is_public,
    ...(commonRequested ? { isCommon: body.is_common } : {}),
    ...(recommendedRequested ? { isRecommended: body.is_recommended } : {}),
    ...(languageFrom ? { languageFrom } : {}),
    ...(languageTo ? { languageTo } : {}),
  });

  const clearedSides = [
    languageFrom && languageFrom !== normalizeLanguageCode(list.languageFrom) ? "known" : null,
    languageTo && languageTo !== normalizeLanguageCode(list.languageTo) ? "target" : null,
  ].filter((side): side is "known" | "target" => Boolean(side));

  return NextResponse.json({ list: updated, cleared_sides: clearedSides });
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
