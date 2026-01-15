import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateUserByDeviceId,
  getUserProgress,
  batchUpsertProgress,
  getUserMemoryHooks,
  upsertMemoryHook,
  deleteMemoryHook,
  getUserCategoryFilters,
  setUserCategoryFilters,
  updateUserRole,
} from "@/lib/db";

interface SyncRequest {
  deviceId: string;
  role?: "cz" | "vi";
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
    const { deviceId, role, progress, memory_hooks, category_filters } = body;

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 }
      );
    }

    // Get or create user
    const user = await getOrCreateUserByDeviceId(deviceId);

    // Update role if provided
    if (role && role !== user.role) {
      await updateUserRole(user.id, role);
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
        role: role || user.role,
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

    if (!deviceId) {
      return NextResponse.json(
        { error: "deviceId is required" },
        { status: 400 }
      );
    }

    const user = await getOrCreateUserByDeviceId(deviceId);
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
