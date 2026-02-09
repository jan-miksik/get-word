import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateUserByDeviceId,
  getUserById,
  getUserProgress,
  batchUpsertProgress,
  getUserMemoryHooks,
  upsertMemoryHook,
  deleteMemoryHook,
  getUserCategoryFilters,
  setUserCategoryFilters,
  updateUserRole,
  updateUserPreferences,
} from "@/lib/db";
import { db } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  signSession,
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

/** Prefers userId (PK lookup) when provided; falls back to deviceId get-or-create. */
async function resolveUser(
  deviceId: string | null,
  userId: string | null
): Promise<User | null> {
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
  if (deviceId) return await getOrCreateUserByDeviceId(deviceId);
  return null;
}

interface SyncRequest {
  deviceId?: string;
  userId?: string; // Optional: fallback user ID for recovery
  role?: "cz" | "vi";
  show_english?: boolean;
  show_category_badges?: boolean;
  progress?: Array<{
    word_id: string;
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
    const body: SyncRequest = await request.json();
    const { deviceId, role, show_english, show_category_badges, progress, memory_hooks, category_filters } = body;
    const userId = body.userId as string | undefined; // Optional: fallback user ID from client

    if (!deviceId && !userId) {
      return NextResponse.json(
        { error: "deviceId or userId is required" },
        { status: 400 }
      );
    }

    let user = await withRetryOnTimeout(() =>
      resolveUser(deviceId || null, userId || null)
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

    // Update display preferences if provided
    if (show_english !== undefined || show_category_badges !== undefined) {
      const updated = await updateUserPreferences(user.id, { show_english, show_category_badges });
      if (updated) user = updated;
    }

    // Sync progress
    if (progress && progress.length > 0) {
      const progressData = progress.map((p) => ({
        userId: user.id,
        wordId: p.word_id,
        stageIndex: p.stage_index,
        knownCount: p.known_count,
        unknownCount: p.unknown_count,
        lastKnownAt: p.last_known_at ? new Date(p.last_known_at) : null,
        lastUnknownAt: p.last_unknown_at ? new Date(p.last_unknown_at) : null,
        nextDueAt: p.next_due_at ? new Date(p.next_due_at) : null,
      }));
      await batchUpsertProgress(progressData);
    }

    // Sync memory hooks
    if (memory_hooks) {
      for (const [wordId, hookText] of Object.entries(memory_hooks)) {
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
    const [currentProgress, currentHooks, currentFilters] = await Promise.all([
      getUserProgress(user.id),
      getUserMemoryHooks(user.id),
      getUserCategoryFilters(user.id),
    ]);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: role ?? user.role,
        user_role: user.userRole,
        show_english: user.showEnglish ?? true,
        show_category_badges: user.showCategoryBadges ?? false,
        wallet_address: user.walletAddress ?? null,
      },
      progress: currentProgress,
      memory_hooks: currentHooks,
      category_filters: currentFilters,
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
      resolveUser(deviceId || null, userId || null)
    );
    if (!user) {
      console.error("Failed to resolve user", { deviceId, userId });
      return NextResponse.json(
        { success: false, error: "Failed to get or create user" },
        { status: 500 }
      );
    }
    const [progress, memoryHooks, categoryFilters] = await Promise.all([
      getUserProgress(user.id),
      getUserMemoryHooks(user.id),
      getUserCategoryFilters(user.id),
    ]);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: user.role,
        user_role: user.userRole,
        show_english: user.showEnglish ?? true,
        show_category_badges: user.showCategoryBadges ?? false,
        wallet_address: user.walletAddress ?? null,
      },
      progress,
      memory_hooks: memoryHooks,
      category_filters: categoryFilters,
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
