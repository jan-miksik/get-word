import { listsApiFetch } from "@/features/lists/api";
import type {
  ConfirmResult,
  DiffResult,
  WordCategory,
  WordList,
  WordListItem,
} from "@/features/lists/types";

export type ListDetails = {
  categories: WordCategory[];
  items: WordListItem[];
};

export async function fetchListDetails(
  listId: string,
  options: { includeMedia?: boolean; signal?: AbortSignal } = {},
): Promise<ListDetails> {
  const includeMedia = options.includeMedia ?? false;
  const res = await listsApiFetch(`/api/lists/${listId}?include_media=${includeMedia ? "true" : "false"}`, {
    signal: options.signal,
  });
  if (!res.ok) throw new Error("Failed to load list details");
  const data = await res.json();
  return {
    categories: data.categories ?? [],
    items: data.items ?? [],
  };
}

export async function createList(
  name: string,
  languageFrom: string,
  languageTo: string,
): Promise<WordList> {
  const res = await listsApiFetch("/api/lists", {
    method: "POST",
    body: JSON.stringify({ name, language_from: languageFrom, language_to: languageTo }),
  });
  if (!res.ok) throw new Error("Failed to create list");
  const data = await res.json();
  return data.list;
}

export async function updateList(
  listId: string,
  data: Pick<WordList, "name" | "description" | "isPublic"> & { isCommon?: boolean },
): Promise<WordList> {
  const res = await listsApiFetch(`/api/lists/${listId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      is_public: data.isPublic,
      ...(typeof data.isCommon === "boolean" ? { is_common: data.isCommon } : {}),
    }),
  });
  const responseData = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(responseData.error ?? "Failed to update list");
  return responseData.list;
}

export async function forkList(
  listId: string,
  data: { languageFrom: string; languageTo: string },
): Promise<WordList> {
  const res = await listsApiFetch(`/api/lists/${listId}/fork`, {
    method: "POST",
    body: JSON.stringify({
      language_from: data.languageFrom,
      language_to: data.languageTo,
    }),
  });
  const responseData = await res.json();
  if (!res.ok) throw new Error(responseData.error ?? "Fork failed");
  return responseData.list;
}

export async function deleteList(listId: string): Promise<void> {
  const res = await listsApiFetch(`/api/lists/${listId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Delete failed");
  }
}

export async function subscribeToList(listId: string): Promise<void> {
  const res = await listsApiFetch(`/api/lists/${listId}/subscribe`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Subscribe failed");
  }
}

export async function unsubscribeFromList(listId: string): Promise<void> {
  const res = await listsApiFetch(`/api/lists/${listId}/subscribe`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Unsubscribe failed");
  }
}

export async function previewCategoryItems(
  listId: string,
  categoryId: string,
  lines: string[],
  inputLanguage: "known" | "target",
): Promise<DiffResult> {
  const res = await listsApiFetch(
    `/api/lists/${listId}/categories/${categoryId}/items/preview`,
    {
      method: "PUT",
      body: JSON.stringify({ lines, input_language: inputLanguage }),
    },
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Preview failed");
  }
  return res.json();
}

export async function confirmCategoryItems(
  listId: string,
  categoryId: string,
  diffResult: DiffResult,
  inputLanguage: "known" | "target",
): Promise<ConfirmResult> {
  const res = await listsApiFetch(
    `/api/lists/${listId}/categories/${categoryId}/items/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        added: diffResult.added,
        removed: diffResult.removed,
        reordered: diffResult.reordered.map((r) => ({ id: r.id, position: r.to_pos })),
        input_language: inputLanguage,
      }),
    },
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Confirm failed");
  }
  return res.json();
}

export async function createCategory(listId: string, name: string): Promise<void> {
  const res = await listsApiFetch(`/api/lists/${listId}/categories`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create category");
}

export async function reorderCategories(listId: string, orderedIds: string[]): Promise<void> {
  const res = await listsApiFetch(`/api/lists/${listId}/categories`, {
    method: "PUT",
    body: JSON.stringify({ order: orderedIds }),
  });
  if (!res.ok) throw new Error("Failed to reorder categories");
}

export async function renameCategory(
  listId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  const res = await listsApiFetch(`/api/lists/${listId}/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Rename failed");
  }
}

export async function deleteCategory(listId: string, categoryId: string): Promise<void> {
  await listsApiFetch(`/api/lists/${listId}/categories/${categoryId}`, {
    method: "DELETE",
  });
}
