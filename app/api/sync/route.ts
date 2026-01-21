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
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    // Get or create user
    // First try by device ID (primary method)
    let user = deviceId ? await getOrCreateUserByDeviceId(deviceId) : null;
    
    // Fallback: if device ID lookup failed but we have a user ID, try to get by user ID
    // This helps recover if device ID was lost but user ID is still stored
    if (!user && userId) {
      user = await getUserById(userId);
      // If user found but device ID doesn't match, update the device ID to link them
      if (user && deviceId && user.deviceId !== deviceId) {
        // Update device ID to maintain the link
        const updated = await db
          .update(users)
          .set({ deviceId, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        user = updated[0] || user;
      }
    }
    
    // If still no user and we have device ID, create new one
    if (!user && deviceId) {
      user = await getOrCreateUserByDeviceId(deviceId);
    }
    
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

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: role ?? user.role,
        show_english: user.showEnglish ?? true,
        show_category_badges: user.showCategoryBadges ?? false,
      },
      progress: currentProgress,
      memory_hooks: currentHooks,
      category_filters: currentFilters,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Failed to sync data" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const userId = searchParams.get("userId"); // Optional: fallback user ID

    if (!deviceId && !userId) {
      return NextResponse.json(
        { error: "deviceId or userId is required" },
        { status: 400 }
      );
    }

    // Get or create user
    // First try by device ID (primary method)
    let user = deviceId ? await getOrCreateUserByDeviceId(deviceId) : null;
    
    // Fallback: if device ID lookup failed but we have a user ID, try to get by user ID
    if (!user && userId) {
      user = await getUserById(userId);
      // If user found but device ID doesn't match, update the device ID to link them
      if (user && deviceId && user.deviceId !== deviceId) {
        // Update device ID to maintain the link
        const updated = await db
          .update(users)
          .set({ deviceId, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        user = updated[0] || user;
      }
    }
    
    // If still no user and we have device ID, create new one
    if (!user && deviceId) {
      user = await getOrCreateUserByDeviceId(deviceId);
    }
    
    if (!user) {
      return NextResponse.json(
        { error: "Failed to get or create user" },
        { status: 500 }
      );
    }
    const [progress, memoryHooks, categoryFilters] = await Promise.all([
      getUserProgress(user.id),
      getUserMemoryHooks(user.id),
      getUserCategoryFilters(user.id),
    ]);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: user.role,
        show_english: user.showEnglish ?? true,
        show_category_badges: user.showCategoryBadges ?? false,
      },
      progress,
      memory_hooks: memoryHooks,
      category_filters: categoryFilters,
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
