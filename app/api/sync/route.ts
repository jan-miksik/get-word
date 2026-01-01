import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getOrCreateUser, getUserProgress, batchUpsertProgress, getUserMemoryHooks, upsertMemoryHook, deleteMemoryHook, getUserCategoryFilters, setUserCategoryFilters, updateUserRole, D1Database } from '@/lib/db';

// Helper to get DB from Cloudflare context
function getDB(): D1Database | null {
  try {
    const { env } = getCloudflareContext();
    return (env as any).DB as D1Database || null;
  } catch {
    return null;
  }
}

interface SyncRequest {
  deviceId: string;
  role?: 'cz' | 'vi';
  progress?: Array<{
    word_index: number;
    stage_index: number;
    known_count: number;
    unknown_count: number;
    last_known_at: number | null;
    last_unknown_at: number | null;
    next_due_at: number | null;
  }>;
  memory_hooks?: Record<number, string | null>; // null means delete
  category_filters?: string[];
}

export async function POST(request: NextRequest) {
  try {
    // Get DB from Cloudflare Workers/Pages bindings
    // The D1 database is configured in wrangler.toml and available via process.env.DB
    
    const body: SyncRequest = await request.json();
    const { deviceId, role, progress, memory_hooks, category_filters } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    // Get DB from environment (Cloudflare Workers/Pages)
    const db = getDB();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    // Get or create user
    const user = await getOrCreateUser(db, deviceId);

    // Update role if provided
    if (role && role !== user.role) {
      await updateUserRole(db, user.id, role);
      user.role = role;
    }

    // Sync progress
    if (progress && progress.length > 0) {
      const progressData = progress.map((p) => ({
        user_id: user.id,
        ...p,
      }));
      await batchUpsertProgress(db, progressData);
    }

    // Sync memory hooks
    if (memory_hooks) {
      for (const [wordIndexStr, hookText] of Object.entries(memory_hooks)) {
        const wordIndex = parseInt(wordIndexStr, 10);
        
        // Validate wordIndex: must be integer and >= 0
        if (!Number.isInteger(wordIndex) || wordIndex < 0) {
          console.warn(`Invalid wordIndex: ${wordIndexStr} (parsed as ${wordIndex}), skipping`);
          continue;
        }
        
        // Normalize hookText: treat non-null values as strings and trim
        const trimmed = hookText === null ? null : String(hookText).trim();
        
        if (trimmed === null || trimmed === '') {
          await deleteMemoryHook(db, user.id, wordIndex);
        } else {
          await upsertMemoryHook(db, user.id, wordIndex, trimmed);
        }
      }
    }

    // Sync category filters
    if (category_filters !== undefined) {
      await setUserCategoryFilters(db, user.id, category_filters);
    }

    // Fetch all current data to return
    const [currentProgress, currentHooks, currentFilters] = await Promise.all([
      getUserProgress(db, user.id),
      getUserMemoryHooks(db, user.id),
      getUserCategoryFilters(db, user.id),
    ]);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        role: user.role,
      },
      progress: currentProgress,
      memory_hooks: currentHooks,
      category_filters: currentFilters,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const db = getDB();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const user = await getOrCreateUser(db, deviceId);
    const [progress, memoryHooks, categoryFilters] = await Promise.all([
      getUserProgress(db, user.id),
      getUserMemoryHooks(db, user.id),
      getUserCategoryFilters(db, user.id),
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
    console.error('Fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

