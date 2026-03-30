import { eq } from "drizzle-orm";
import { db } from "../client";
import { users, type User, type NewUser } from "../schema";

const MEMORY_HOOK_DISABLE_STAGE_VALUES = new Set([5, 6, 7, 8, 9, 10]);
const DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE = 8;

function normalizeMemoryHookDisableFromStage(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE;
  const normalized = Math.floor(parsed);
  return MEMORY_HOOK_DISABLE_STAGE_VALUES.has(normalized)
    ? normalized
    : DEFAULT_MEMORY_HOOK_DISABLE_FROM_STAGE;
}

// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return results[0] || null;
}

// Get user by device ID
export async function getUserByDeviceId(deviceId: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.deviceId, deviceId))
    .limit(1);
  return results[0] || null;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return results[0] || null;
}

// Get user by wallet address
export async function getUserByWalletAddress(
  walletAddress: string
): Promise<User | null> {
  const results = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, walletAddress))
    .limit(1);
  return results[0] || null;
}

// Get or create user by device ID
export async function getOrCreateUserByDeviceId(
  deviceId: string
): Promise<User> {
  const existing = await getUserByDeviceId(deviceId);
  if (existing) return existing;

  const results = await db
    .insert(users)
    .values({ deviceId, role: "vi" })
    .returning();
  return results[0];
}

// Create a new user
export async function createUser(user: NewUser): Promise<User> {
  const results = await db.insert(users).values(user).returning();
  return results[0];
}

// Update user role
export async function updateUserRole(
  userId: string,
  role: "cz" | "vi"
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Update user display preferences (show_english, show_category_badges, game_score)
export async function updateUserPreferences(
  userId: string,
  prefs: {
    show_english?: boolean;
    show_category_badges?: boolean;
    show_pronunciation?: boolean;
    memory_hooks_enabled?: boolean;
    memory_hook_disable_from_stage?: number;
    game_score?: number;
    category_order?: string[];
  }
): Promise<User | null> {
  const updates: {
    showEnglish?: boolean;
    showCategoryBadges?: boolean;
    showPronunciation?: boolean;
    memoryHooksEnabled?: boolean;
    memoryHookDisableFromStage?: number;
    gameScore?: number;
    categoryOrder?: string[];
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };
  if (prefs.show_english !== undefined) updates.showEnglish = prefs.show_english;
  if (prefs.show_category_badges !== undefined) updates.showCategoryBadges = prefs.show_category_badges;
  if (prefs.show_pronunciation !== undefined) updates.showPronunciation = prefs.show_pronunciation;
  if (prefs.memory_hooks_enabled !== undefined) updates.memoryHooksEnabled = prefs.memory_hooks_enabled;
  if (prefs.memory_hook_disable_from_stage !== undefined) {
    updates.memoryHookDisableFromStage = normalizeMemoryHookDisableFromStage(
      prefs.memory_hook_disable_from_stage
    );
  }
  if (prefs.game_score !== undefined) updates.gameScore = Math.max(0, Math.floor(prefs.game_score));
  if (prefs.category_order !== undefined) {
    const normalized = Array.isArray(prefs.category_order)
      ? prefs.category_order
          .map((c) => String(c).trim())
          .filter((c) => c.length > 0)
      : [];
    updates.categoryOrder = Array.from(new Set(normalized)).slice(0, 500);
  }
  if (Object.keys(updates).length === 1) return getUserById(userId);
  const results = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Link email to user
export async function linkEmailToUser(
  userId: string,
  email: string
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ email, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Link wallet address to user
export async function linkWalletToUser(
  userId: string,
  walletAddress: string
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ walletAddress, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

/** Link wallet and optionally email + auth provider (e.g. "google" | "email" | "wallet") to user. */
export async function linkAccountToUser(
  userId: string,
  opts: { walletAddress: string; email?: string | null; authProvider?: string | null }
): Promise<User | null> {
  const updates: Partial<User> = {
    walletAddress: opts.walletAddress,
    updatedAt: new Date(),
  };
  if (opts.email != null && opts.email.trim() !== "") {
    updates.email = opts.email.trim();
  }
  if (opts.authProvider != null && opts.authProvider.trim() !== "") {
    updates.authProvider = opts.authProvider.trim();
  }
  const results = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// --- Merge logic for wallet linking ---

export interface ProgressMergeItem {
  stageIndex: number
  knownCount: number
  unknownCount: number
  lastKnownAt: Date | null
  lastUnknownAt: Date | null
  nextDueAt: Date | null
}

export interface MergeInput {
  sourceProgress: Record<string, ProgressMergeItem>
  targetProgress: Record<string, ProgressMergeItem>
  sourceHooks: Record<string, string>
  targetHooks: Record<string, string>
  sourceFilters: string[]
  targetFilters: string[]
}

export interface MergeResult {
  mergedProgress: Record<string, ProgressMergeItem>
  mergedHooks: Record<string, string>
  mergedFilters: string[]
}

/** Pure function: merge two users' data. Highest stageIndex wins per word. */
export function mergeUserData(input: MergeInput): MergeResult {
  const { sourceProgress, targetProgress, sourceHooks, targetHooks, sourceFilters, targetFilters } = input

  // Merge progress: highest stageIndex wins
  const mergedProgress: Record<string, ProgressMergeItem> = { ...targetProgress }
  for (const [wordId, sourceItem] of Object.entries(sourceProgress)) {
    const targetItem = mergedProgress[wordId]
    if (!targetItem || sourceItem.stageIndex > targetItem.stageIndex) {
      mergedProgress[wordId] = sourceItem
    }
  }

  // Merge hooks: target wins on conflict, source fills gaps
  const mergedHooks: Record<string, string> = { ...sourceHooks, ...targetHooks }

  // Merge filters: union
  const mergedFilters = [...new Set([...targetFilters, ...sourceFilters])]

  return { mergedProgress, mergedHooks, mergedFilters }
}

// Update arbitrary user fields
export async function updateUserFields(
  userId: string,
  fields: Partial<Omit<User, 'id' | 'createdAt'>>
): Promise<User | null> {
  const results = await db
    .update(users)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return results[0] || null;
}

// Delete user
export async function deleteUser(userId: string): Promise<boolean> {
  const results = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning();
  return results.length > 0;
}
