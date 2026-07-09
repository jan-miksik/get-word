import { listsApiFetch } from "@/features/lists/api";
import { logGenerationStats } from "@/features/lists/client/generationStatsLog";
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

export type CreateListOptions = {
  description: string;
  isPublic: boolean;
};

export async function createList(
  name: string,
  languageFrom: string,
  languageTo: string,
  options: CreateListOptions = { description: "", isPublic: false },
): Promise<WordList> {
  const res = await listsApiFetch("/api/lists", {
    method: "POST",
    body: JSON.stringify({
      name,
      language_from: languageFrom,
      language_to: languageTo,
      description: options.description,
      is_public: options.isPublic,
    }),
  });
  if (!res.ok) throw new Error("Failed to create list");
  const data = await res.json();
  return data.list;
}

export async function updateList(
  listId: string,
  data: Pick<WordList, "name" | "description" | "isPublic"> & {
    isCommon?: boolean;
    isRecommended?: boolean;
    languageFrom?: string;
    languageTo?: string;
  },
): Promise<{ list: WordList; clearedSides: ("known" | "target")[] }> {
  const res = await listsApiFetch(`/api/lists/${listId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      is_public: data.isPublic,
      ...(typeof data.isCommon === "boolean" ? { is_common: data.isCommon } : {}),
      ...(typeof data.isRecommended === "boolean" ? { is_recommended: data.isRecommended } : {}),
      ...(data.languageFrom ? { language_from: data.languageFrom } : {}),
      ...(data.languageTo ? { language_to: data.languageTo } : {}),
    }),
  });
  const responseData = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(responseData.error ?? "Failed to update list");
  return {
    list: responseData.list,
    clearedSides: Array.isArray(responseData.cleared_sides)
      ? responseData.cleared_sides.filter((side: unknown): side is "known" | "target" =>
          side === "known" || side === "target"
        )
      : [],
  };
}

export type ForkProgress = {
  phase: "translating" | "saving";
  processed: number;
  total: number;
};

export type ForkResult = {
  list: WordList;
  copied: number;
  translated: number;
  clearedSides: ("known" | "target")[];
  missingAudio: { known: number; target: number };
  stats?: {
    translations: { reused: number; generated: number };
    audio: { reused: number; generated: number; missing: number };
  };
};

export async function forkList(
  listId: string,
  data: {
    name?: string;
    languageFrom: string;
    languageTo: string;
    translationProvider?: "google" | "openrouter" | "none";
    translationModel?: string;
    sourceLanguage?: string;
    translateCategoryNames?: boolean;
  },
  options: { onProgress?: (progress: ForkProgress) => void } = {},
): Promise<ForkResult> {
  const res = await listsApiFetch(`/api/lists/${listId}/fork`, {
    method: "POST",
    body: JSON.stringify({
      ...(data.name ? { name: data.name } : {}),
      language_from: data.languageFrom,
      language_to: data.languageTo,
      translation_provider: data.translationProvider ?? "none",
      ...(data.translationModel ? { translation_model: data.translationModel } : {}),
      ...(data.sourceLanguage ? { source_language: data.sourceLanguage } : {}),
      ...(data.translateCategoryNames === false ? { translate_category_names: false } : {}),
    }),
  });

  // Validation/auth errors (4xx) are returned as plain JSON before any stream starts.
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error ?? "Fork failed");
  }
  if (!res.body) throw new Error("Fork did not complete.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ForkResult | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed);
    if (event.type === "progress") {
      options.onProgress?.({
        phase: event.phase === "saving" ? "saving" : "translating",
        processed: Number(event.processed ?? 0),
        total: Number(event.total ?? 0),
      });
    } else if (event.type === "error") {
      throw new Error(event.error ?? "Fork failed");
    } else if (event.type === "done") {
      const r = event.result ?? {};
      result = {
        list: r.list,
        copied: Number(r.copied ?? 0),
        translated: Number(r.translated ?? 0),
        clearedSides: Array.isArray(r.cleared_sides)
          ? r.cleared_sides.filter((side: unknown): side is "known" | "target" =>
              side === "known" || side === "target"
            )
          : [],
        missingAudio: {
          known: Number(r.missing_audio?.known ?? 0),
          target: Number(r.missing_audio?.target ?? 0),
        },
        stats: r.stats
          ? {
              translations: {
                reused: Number(r.stats.translations?.reused ?? 0),
                generated: Number(r.stats.translations?.generated ?? 0),
              },
              audio: {
                reused: Number(r.stats.audio?.reused ?? 0),
                generated: Number(r.stats.audio?.generated ?? 0),
                missing: Number(r.stats.audio?.missing ?? 0),
              },
            }
          : undefined,
      };
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  if (buffer.trim()) handleLine(buffer);

  if (!result) throw new Error("Fork did not complete.");
  const forkResult: ForkResult = result;
  logGenerationStats({
    flow: "fork",
    listName: forkResult.list?.name ?? "",
    listId: forkResult.list?.id ?? "",
    strategy: "fork",
    seedListId: listId,
    translations: forkResult.stats?.translations ?? {
      reused: 0,
      generated: forkResult.translated,
    },
    audio: forkResult.stats?.audio ?? {
      reused: 0,
      generated: 0,
      missing: forkResult.missingAudio.known + forkResult.missingAudio.target,
    },
  });
  return forkResult;
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
        added_positions: diffResult.added_positions ?? diffResult.added.map((text, index) => ({
          text,
          position: index,
        })),
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

export type RemoveItemsResult = {
  removed: string[];
  merged: { from: string; into: string }[];
};

export async function removeListItems(
  listId: string,
  itemIds: string[],
): Promise<RemoveItemsResult> {
  const res = await listsApiFetch(`/api/lists/${listId}/items/remove`, {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to remove items");
  }
  return res.json();
}

export async function assignItemsCategory(
  listId: string,
  itemIds: string[],
  categoryId: string,
): Promise<string[]> {
  const res = await listsApiFetch(`/api/lists/${listId}/items/category`, {
    method: "POST",
    body: JSON.stringify({ itemIds, categoryId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to assign category");
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.updated) ? (data.updated as string[]) : [];
}

export async function createCategory(listId: string, name: string): Promise<string | null> {
  const res = await listsApiFetch(`/api/lists/${listId}/categories`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create category");
  const data = await res.json().catch(() => ({}));
  return data?.category?.id ?? null;
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
