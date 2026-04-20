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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
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

  const mediaAssets = await getMediaAssetsByIds(
    items
      .map((item) => item.audioAssetId)
      .filter((id): id is string => Boolean(id)),
  );

  return NextResponse.json({
    list,
    categories,
    items: items.map((item) => ({
      ...item,
      audioUrl: item.audioAssetId
        ? (() => {
            const asset = mediaAssets.get(item.audioAssetId);
            return asset ? getAudioUrl(asset.contentHash) : null;
          })()
        : null,
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
