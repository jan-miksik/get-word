import { eq, and, inArray } from "drizzle-orm";
import { db } from "../client";
import { userCategoryFilters, type UserCategoryFilter } from "../schema";

// Get category filters for a user
export async function getUserCategoryFilters(
  userId: string
): Promise<string[]> {
  const results = await db
    .select()
    .from(userCategoryFilters)
    .where(eq(userCategoryFilters.userId, userId));

  return results.map((row) => row.category);
}

// Set category filters for a user (replaces existing)
export async function setUserCategoryFilters(
  userId: string,
  categories: string[]
): Promise<void> {
  // Get current categories
  const currentCategories = await getUserCategoryFilters(userId);
  const currentSet = new Set(currentCategories);
  const newSet = new Set(categories);

  // Categories to add
  const toAdd = categories.filter((cat) => !currentSet.has(cat));

  // Categories to remove
  const toRemove = currentCategories.filter((cat) => !newSet.has(cat));

  // Add new categories
  if (toAdd.length > 0) {
    await db.insert(userCategoryFilters).values(
      toAdd.map((category) => ({ userId, category }))
    );
  }

  // Remove old categories
  if (toRemove.length > 0) {
    for (const category of toRemove) {
      await db
        .delete(userCategoryFilters)
        .where(
          and(
            eq(userCategoryFilters.userId, userId),
            eq(userCategoryFilters.category, category)
          )
        );
    }
  }
}

// Add a category filter
export async function addCategoryFilter(
  userId: string,
  category: string
): Promise<UserCategoryFilter> {
  const results = await db
    .insert(userCategoryFilters)
    .values({ userId, category })
    .onConflictDoNothing()
    .returning();

  // If conflict (already exists), fetch the existing one
  if (results.length === 0) {
    const existing = await db
      .select()
      .from(userCategoryFilters)
      .where(
        and(
          eq(userCategoryFilters.userId, userId),
          eq(userCategoryFilters.category, category)
        )
      )
      .limit(1);
    return existing[0];
  }

  return results[0];
}

// Remove a category filter
export async function removeCategoryFilter(
  userId: string,
  category: string
): Promise<boolean> {
  const results = await db
    .delete(userCategoryFilters)
    .where(
      and(
        eq(userCategoryFilters.userId, userId),
        eq(userCategoryFilters.category, category)
      )
    )
    .returning();
  return results.length > 0;
}

// Clear all category filters for a user
export async function clearUserCategoryFilters(userId: string): Promise<number> {
  const results = await db
    .delete(userCategoryFilters)
    .where(eq(userCategoryFilters.userId, userId))
    .returning();
  return results.length;
}
