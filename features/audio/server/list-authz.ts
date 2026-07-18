import { isEditor } from "@/lib/auth";
import { getItemListAuthz, type ItemListAuthz, type User } from "@/lib/db";

function canEditAudioForItemList(row: ItemListAuthz, user: User) {
  return row.isCommon || row.isRecommended
    ? isEditor(user)
    : row.ownerId === user.id;
}

export async function findUnauthorizedAudioItemIds(itemIds: string[], user: User) {
  const authz = await getItemListAuthz(itemIds);
  const authzById = new Map(authz.map((row) => [row.itemId, row]));

  return itemIds.filter((id) => {
    const row = authzById.get(id);
    return !row || !canEditAudioForItemList(row, user);
  });
}
