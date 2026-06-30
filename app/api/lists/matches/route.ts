import { NextRequest, NextResponse } from "next/server";
import {
  getUserListsByLanguagePair,
  pickRecommendedWordList,
  getWordListItemCountsByListIds,
} from "@/lib/db";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const rawFrom = request.nextUrl.searchParams.get("from");
  const rawTo = request.nextUrl.searchParams.get("to");
  if (!rawFrom || !rawTo) {
    return NextResponse.json(
      { error: "from and to are required and must be different" },
      { status: 400 },
    );
  }
  const languageFrom = normalizeLanguageCode(rawFrom);
  const languageTo = normalizeLanguageCode(rawTo);
  if (languageFrom === languageTo) {
    return NextResponse.json(
      { error: "from and to are required and must be different" },
      { status: 400 },
    );
  }

  const lists = await getUserListsByLanguagePair(user.id, languageFrom, languageTo);
  const recommended = pickRecommendedWordList(lists, languageFrom, languageTo, null, user.id);
  const countIds = [...new Set([
    ...lists.map((list) => list.id),
    ...(recommended ? [recommended.list.id] : []),
  ])];
  const itemCounts = await getWordListItemCountsByListIds(countIds);

  const serializeList = (list: typeof lists[number]) => ({
    ...list,
    isOwner: list.ownerId === user.id,
    itemCount: itemCounts.get(list.id) ?? 0,
  });

  return NextResponse.json({
    lists: lists.map(serializeList),
    recommendedList: recommended ? serializeList(recommended.list) : null,
    recommendedReason: recommended?.reason ?? null,
  });
}
