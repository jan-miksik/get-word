import { NextRequest, NextResponse } from "next/server";
import {
  getUserByDeviceId,
  getUserById,
  getUserProgress,
  batchUpsertProgress,
  batchUpsertProgressByItemId,
  getUserMemoryHooks,
  upsertMemoryHook,
  deleteMemoryHook,
  getUserCategoryFilters,
  setUserCategoryFilters,
  updateUserRole,
  updateUserPreferences,
  getUserSubscribedItems,
  getUserOwnListItems,
  getListCategories,
  getSystemDefaultList,
  getWordIdToItemIdMapping,
  getWordListsByIds,
} from "@/lib/db";
import { db } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  signSession,
  verifySession,
  WORDLINK_SESSION_COOKIE_NAME,
  WORDLINK_SESSION_TTL_SECONDS,
} from "@/lib/session";

const PG_STATEMENT_TIMEOUT = "57014";

function isStatementTimeout(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === PG_STATEMENT_TIMEOUT || e?.cause?.code === PG_STATEMENT_TIMEOUT;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetryOnTimeout<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isStatementTimeout(e)) {
      await sleep(800);
      return fn();
    }
    throw e;
  }
}

/**
 * Re-key a Record<oldWordId, V> → Record<wordListItemId, V> using a mapping.
 * Entries without a mapping are preserved with their original key.
 */
function rekeyByItemId<V>(
  data: Record<string, V>,
  mapping: Map<string, string>
): Record<string, V> {
  const result: Record<string, V> = {};
  for (const [key, value] of Object.entries(data)) {
    const newKey = mapping.get(key) ?? key;
    result[newKey] = value;
  }
  return result;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Prefers userId (PK lookup) when provided; falls back to deviceId get-or-create. */
async function resolveUser(
  deviceId: string | null,
  userId: string | null,
  sessionUserId: string | null
): Promise<User | null> {
  if (sessionUserId) {
    let sessionUser = await getUserById(sessionUserId);
    if (sessionUser && deviceId && sessionUser.deviceId !== deviceId) {
      const updated = await db
        .update(users)
        .set({ deviceId, updatedAt: new Date() })
        .where(eq(users.id, sessionUser.id))
        .returning();
      sessionUser = updated[0] ?? sessionUser;
    }
    if (sessionUser) return sessionUser;
  }

  if (userId) {
    let user = await getUserById(userId);
    if (user && deviceId && user.deviceId !== deviceId) {
      const updated = await db
        .update(users)
        .set({ deviceId, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      user = updated[0] ?? user;
    }
    if (user) return user;
  }
  if (deviceId) return await getUserByDeviceId(deviceId);
  return null;
}

interface SyncRequest {
  deviceId?: string;
  userId?: string; // Optional: fallback user ID for recovery
  role?: "cz" | "vi";
  show_english?: boolean;
  show_category_badges?: boolean;
  show_pronunciation?: boolean;
  memory_hooks_enabled?: boolean;
  memory_hook_disable_from_stage?: number;
  game_score?: number;
  category_order?: string[];
  progress?: Array<{
    word_id?: string; // legacy: old word ID like "w000"
    word_list_item_id?: string; // new: UUID from word_list_items
    stage_index: number;
    known_count: number;
    unknown_count: number;
    last_known_at: number | null;
    last_unknown_at: number | null;
    next_due_at: number | null;
  }>;
  memory_hooks?: Record<string, string | null>; // null means delete
  category_filters?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(WORDLINK_SESSION_COOKIE_NAME)?.value;
    const session = await verifySession(sessionToken);
    if (!session?.userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    const body: SyncRequest = await request.json();
    const {
      deviceId,
      role,
      show_english,
      show_category_badges,
      show_pronunciation,
      memory_hooks_enabled,
      memory_hook_disable_from_stage,
      game_score,
      category_order,
      progress,
      memory_hooks,
      category_filters,
    } = body;
    const userId = body.userId as string | undefined; // Optional compatibility hint from client

    if (!deviceId && !userId) {
      return NextResponse.json(
        { error: "deviceId or userId is required" },
        { status: 400 }
      );
    }

    let user = await withRetryOnTimeout(() =>
      resolveUser(deviceId || null, userId || null, session.userId)
    );
    if (!user) {
      return NextResponse.json(
        { error: "Failed to get or create user" },
        { status: 500 }
      );
    }

    // Update role if provided
    if (role && role !== user.role) {
      await updateUserRole(user.id, role);
    }

    // Update display preferences + game score if provided
    if (
      show_english !== undefined ||
      show_category_badges !== undefined ||
      show_pronunciation !== undefined ||
      memory_hooks_enabled !== undefined ||
      memory_hook_disable_from_stage !== undefined ||
      game_score !== undefined ||
      category_order !== undefined
    ) {
      const updated = await updateUserPreferences(user.id, {
        show_english,
        show_category_badges,
        show_pronunciation,
        memory_hooks_enabled,
        memory_hook_disable_from_stage,
        game_score,
        category_order,
      });
      if (updated) user = updated;
    }

    // Sync progress — route to legacy (wordId) or new (wordListItemId) upsert
    if (progress && progress.length > 0) {
      const legacyProgress = progress.filter((p) => p.word_id && !p.word_list_item_id);
      const newProgress = progress.filter((p) => p.word_list_item_id);

      if (legacyProgress.length > 0) {
        const progressData = legacyProgress.map((p) => ({
          userId: user.id,
          wordId: p.word_id!,
          stageIndex: p.stage_index,
          knownCount: p.known_count,
          unknownCount: p.unknown_count,
          lastKnownAt: p.last_known_at ? new Date(p.last_known_at) : null,
          lastUnknownAt: p.last_unknown_at ? new Date(p.last_unknown_at) : null,
          nextDueAt: p.next_due_at ? new Date(p.next_due_at) : null,
        }));
        await batchUpsertProgress(progressData);
      }

      if (newProgress.length > 0) {
        const progressData = newProgress.map((p) => ({
          userId: user.id,
          wordListItemId: p.word_list_item_id!,
          stageIndex: p.stage_index,
          knownCount: p.known_count,
          unknownCount: p.unknown_count,
          lastKnownAt: p.last_known_at ? new Date(p.last_known_at) : null,
          lastUnknownAt: p.last_unknown_at ? new Date(p.last_unknown_at) : null,
          nextDueAt: p.next_due_at ? new Date(p.next_due_at) : null,
        }));
        await batchUpsertProgressByItemId(progressData);
      }
    }

    // Sync memory hooks
    if (memory_hooks) {
      const hasItemIdKeys = Object.keys(memory_hooks).some((k) => isUuid(k));
      let itemIdToWordId = new Map<string, string>();

      if (hasItemIdKeys) {
        const systemList = await getSystemDefaultList();
        if (systemList) {
          const wordIdToItemId = await getWordIdToItemIdMapping(systemList.id);
          itemIdToWordId = new Map(
            [...wordIdToItemId.entries()].map(([wordId, itemId]) => [itemId, wordId])
          );
        }
      }

      for (const [key, hookText] of Object.entries(memory_hooks)) {
        const wordId = isUuid(key) ? itemIdToWordId.get(key) : key;
        if (!wordId) {
          // Ignore unknown item IDs so one bad key doesn't fail the whole sync payload.
          continue;
        }

        // Normalize hookText: treat non-null values as strings and trim
        const trimmed = hookText === null ? null : String(hookText).trim();

        if (trimmed === null || trimmed === "") {
          await deleteMemoryHook(user.id, wordId);
        } else {
          await upsertMemoryHook(user.id, wordId, trimmed);
        }
      }
    }

    // Sync category filters
    if (category_filters !== undefined) {
      await setUserCategoryFilters(user.id, category_filters);
    }

    // Fetch all current data to return
    const [currentProgress, currentHooks, currentFilters, currentSubscribedItems, currentOwnItems] =
      await Promise.all([
        getUserProgress(user.id),
        getUserMemoryHooks(user.id),
        getUserCategoryFilters(user.id),
        getUserSubscribedItems(user.id),
        getUserOwnListItems(user.id),
      ]);

    const currentItems = [...currentSubscribedItems, ...currentOwnItems];

    // Build category lookup and word ID mapping for re-keying
    const postListIds = [...new Set(currentItems.map((i) => i.listId))];
    const postSystemList = await getSystemDefaultList();
    const [postCategoryResults, postWordIdMapping, postListNameRows] = await Promise.all([
      Promise.all(postListIds.map((id) => getListCategories(id))),
      postSystemList
        ? getWordIdToItemIdMapping(postSystemList.id)
        : Promise.resolve(new Map<string, string>()),
      getWordListsByIds(postListIds),
    ]);

    const postCategoryLookup: Record<
      string,
      { name: string; position: number }
    > = {};
    for (const cats of postCategoryResults) {
      for (const cat of cats) {
        postCategoryLookup[cat.id] = {
          name: cat.name,
          position: cat.position,
        };
      }
    }

    const postRekeyedHooks = rekeyByItemId(currentHooks, postWordIdMapping);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: role ?? user.role,
        user_role: user.userRole,
        show_english: user.showEnglish ?? true,
        show_category_badges: user.showCategoryBadges ?? false,
        show_pronunciation: user.showPronunciation ?? false,
        memory_hooks_enabled: user.memoryHooksEnabled ?? true,
        memory_hook_disable_from_stage: user.memoryHookDisableFromStage ?? 8,
        wallet_address: user.walletAddress ?? null,
        email: user.email ?? null,
        auth_provider: user.authProvider ?? null,
        game_score: user.gameScore ?? 0,
        category_order: user.categoryOrder ?? [],
      },
      progress: currentProgress,
      memory_hooks: postRekeyedHooks,
      category_filters: currentFilters,
      word_list_items: currentItems,
      categories: postCategoryLookup,
      lists: postListNameRows,
    });
    const safeUserRole = user.userRole === "editor" ? "editor" : "user";
    const token = await signSession({
      userId: user.id,
      userRole: safeUserRole,
      ttlSeconds: WORDLINK_SESSION_TTL_SECONDS,
    });
    response.cookies.set({
      name: WORDLINK_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: WORDLINK_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Sync error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to sync data";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(WORDLINK_SESSION_COOKIE_NAME)?.value;
    const session = await verifySession(sessionToken);
    if (!session?.userId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const userId = searchParams.get("userId"); // Optional: fallback user ID

    if (!deviceId && !userId) {
      return NextResponse.json(
        { success: false, error: "deviceId or userId is required" },
        { status: 400 }
      );
    }

    const user = await withRetryOnTimeout(() =>
      resolveUser(deviceId || null, userId || null, session.userId)
    );
    if (!user) {
      console.error("Failed to resolve user", { deviceId, userId });
      return NextResponse.json(
        { success: false, error: "Failed to get or create user" },
        { status: 500 }
      );
    }
    const [progress, memoryHooks, categoryFilters, subscribedItems, ownItems] =
      await Promise.all([
        getUserProgress(user.id),
        getUserMemoryHooks(user.id),
        getUserCategoryFilters(user.id),
        getUserSubscribedItems(user.id),
        getUserOwnListItems(user.id),
      ]);

    const wordListItems = [...subscribedItems, ...ownItems];

    // Build category lookup and word ID mapping
    const listIds = [...new Set(wordListItems.map((i) => i.listId))];
    const systemList = await getSystemDefaultList();
    const [categoryResults, wordIdMapping, listNameRows] = await Promise.all([
      Promise.all(listIds.map((id) => getListCategories(id))),
      systemList
        ? getWordIdToItemIdMapping(systemList.id)
        : Promise.resolve(new Map<string, string>()),
      getWordListsByIds(listIds),
    ]);

    const categoryLookup: Record<string, { name: string; position: number }> =
      {};
    for (const cats of categoryResults) {
      for (const cat of cats) {
        categoryLookup[cat.id] = { name: cat.name, position: cat.position };
      }
    }

    // Re-key memory hooks from old wordId to wordListItemId
    const rekeyedHooks = rekeyByItemId(memoryHooks, wordIdMapping);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: user.role,
        user_role: user.userRole,
        show_english: user.showEnglish ?? true,
        show_category_badges: user.showCategoryBadges ?? false,
        show_pronunciation: user.showPronunciation ?? false,
        memory_hooks_enabled: user.memoryHooksEnabled ?? true,
        memory_hook_disable_from_stage: user.memoryHookDisableFromStage ?? 8,
        wallet_address: user.walletAddress ?? null,
        email: user.email ?? null,
        auth_provider: user.authProvider ?? null,
        game_score: user.gameScore ?? 0,
        category_order: user.categoryOrder ?? [],
      },
      progress,
      memory_hooks: rekeyedHooks,
      category_filters: categoryFilters,
      word_list_items: wordListItems,
      categories: categoryLookup,
      lists: listNameRows,
    });
    const safeUserRole = user.userRole === "editor" ? "editor" : "user";
    const token = await signSession({
      userId: user.id,
      userRole: safeUserRole,
      ttlSeconds: WORDLINK_SESSION_TTL_SECONDS,
    });
    response.cookies.set({
      name: WORDLINK_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: WORDLINK_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Fetch error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch data";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
