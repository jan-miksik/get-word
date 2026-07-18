import { eq, and } from "drizzle-orm";
import { db } from "../client";
import { userCategoryFilters, users } from "../schema";

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

  // Filter rows carry no updated_at, so move the user's sync_revision instead —
  // otherwise other devices' conditional syncs would report "unchanged" and
  // never pick this change up.
  if (toAdd.length > 0 || toRemove.length > 0) {
    await db
      .update(users)
      .set({ updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
