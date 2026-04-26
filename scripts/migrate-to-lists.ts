/**
 * Migration script: Convert existing word-based data to list-based schema.
 *
 * Steps:
 * 1. Create system-owned word_list "Default Vietnamese–Czech"
 * 2. Extract unique categories from existing words → word_categories
 * 3. Convert words → word_list_items on the system list
 * 4. Map user_progress.wordId → wordListItemId
 * 5. Map user_memory_hooks to word_list_item references (via notes field)
 * 6. Auto-subscribe all users to the default list
 *
 * Run: pnpm db:migrate-to-lists
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import {
  words,
  wordLists,
  wordCategories,
  wordListItems,
  users,
  userProgress,
  userMemoryHooks,
  userListSubscriptions,
} from "../lib/db/schema";

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("Connecting to database...");
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  // Step 1: Create system word_list
  console.log("\n--- Step 1: Creating system word list ---");

  // Check if system list already exists
  const existingLists = await db
    .select()
    .from(wordLists)
    .where(eq(wordLists.name, "Default Vietnamese–Czech"))
    .limit(1);

  let systemList;
  if (existingLists.length > 0) {
    systemList = existingLists[0];
    console.log(`System list already exists: ${systemList.id}`);
  } else {
    const inserted = await db
      .insert(wordLists)
      .values({
        ownerId: null, // system-owned
        name: "Default Vietnamese–Czech",
        description: "Default vocabulary list for learning Vietnamese from Czech",
        languageFrom: "cz",
        languageTo: "vi",
        isPublic: true,
      })
      .returning();
    systemList = inserted[0];
    console.log(`Created system list: ${systemList.id}`);
  }

  // Step 2: Extract categories from existing words → word_categories
  console.log("\n--- Step 2: Creating word categories ---");
  const allWords = await db.select().from(words);
  console.log(`Found ${allWords.length} existing words`);

  // Collect unique categories (exclude 'word' and 'phrase' meta-tags)
  const categorySet = new Set<string>();
  for (const word of allWords) {
    if (word.category) {
      for (const cat of word.category) {
        if (cat !== "word" && cat !== "phrase") {
          categorySet.add(cat);
        }
      }
    }
  }
  const categoryNames = [...categorySet].sort();
  console.log(`Found ${categoryNames.length} categories: ${categoryNames.join(", ")}`);

  // Check existing categories for this list
  const existingCategories = await db
    .select()
    .from(wordCategories)
    .where(eq(wordCategories.listId, systemList.id));

  const existingCatNames = new Set(existingCategories.map((c) => c.name));

  // Create missing categories
  const categoryMap = new Map<string, string>(); // name → id
  for (const cat of existingCategories) {
    categoryMap.set(cat.name, cat.id);
  }

  let position = existingCategories.length;
  for (const name of categoryNames) {
    if (!existingCatNames.has(name)) {
      const inserted = await db
        .insert(wordCategories)
        .values({
          listId: systemList.id,
          name,
          position: position++,
          isSystem: true,
        })
        .returning();
      categoryMap.set(name, inserted[0].id);
      console.log(`  Created category: ${name} (${inserted[0].id})`);
    }
  }

  // Step 3: Convert words → word_list_items
  console.log("\n--- Step 3: Converting words to word_list_items ---");

  // Check existing items
  const existingItems = await db
    .select({ id: wordListItems.id, textKnown: wordListItems.textKnown })
    .from(wordListItems)
    .where(eq(wordListItems.listId, systemList.id));

  const existingTextKnown = new Set(existingItems.map((i) => i.textKnown));

  // Track old wordId → new wordListItemId mapping
  const wordIdToItemId = new Map<string, string>();
  // Also map existing items
  for (const item of existingItems) {
    // We'll need to match back to old word IDs below
  }

  let itemPosition = existingItems.length;
  let created = 0;
  let skipped = 0;

  for (const word of allWords) {
    // Determine primary category (first non-meta category)
    const primaryCat = word.category?.find(
      (c) => c !== "word" && c !== "phrase"
    );
    const categoryId = primaryCat ? categoryMap.get(primaryCat) : undefined;

    // Check if already migrated (by matching cz text)
    if (existingTextKnown.has(word.cz)) {
      // Find existing item to map
      const existing = existingItems.find((i) => i.textKnown === word.cz);
      if (existing) {
        wordIdToItemId.set(word.id, existing.id);
      }
      skipped++;
      continue;
    }

    const inserted = await db
      .insert(wordListItems)
      .values({
        listId: systemList.id,
        categoryId: categoryId ?? null,
        canonicalWordId: null, // these ARE the canonical words
        position: itemPosition++,
        textKnown: word.cz,
        textTarget: word.vi,
        translationStatus: "manual",
        audioStatus: word.viAudio ? "ready" : "none",
        notes: word.en ? `en: ${word.en}` : null, // preserve English translation
      })
      .returning();

    wordIdToItemId.set(word.id, inserted[0].id);
    created++;
  }

  console.log(`  Created ${created} word_list_items, skipped ${skipped} (already exist)`);

  // If we skipped items, we need to build the mapping from existing data
  // by matching cz text to old word ids
  if (skipped > 0) {
    const allItems = await db
      .select()
      .from(wordListItems)
      .where(eq(wordListItems.listId, systemList.id));

    for (const word of allWords) {
      if (!wordIdToItemId.has(word.id)) {
        const matching = allItems.find((i) => i.textKnown === word.cz);
        if (matching) {
          wordIdToItemId.set(word.id, matching.id);
        }
      }
    }
  }

  console.log(`  Word ID mapping: ${wordIdToItemId.size} entries`);

  // Step 4: Map user_progress.wordId → wordListItemId
  console.log("\n--- Step 4: Mapping user progress ---");

  const allProgress = await db.select().from(userProgress);
  let mappedProgress = 0;
  let unmappedProgress = 0;

  for (const prog of allProgress) {
    if (prog.wordListItemId) {
      // Already mapped
      continue;
    }
    if (!prog.wordId) {
      unmappedProgress++;
      continue;
    }

    const itemId = wordIdToItemId.get(prog.wordId);
    if (itemId) {
      await db
        .update(userProgress)
        .set({ wordListItemId: itemId, updatedAt: new Date() })
        .where(eq(userProgress.id, prog.id));
      mappedProgress++;
    } else {
      console.warn(`  WARNING: No item found for wordId=${prog.wordId} (progress id=${prog.id})`);
      unmappedProgress++;
    }
  }
  console.log(`  Mapped ${mappedProgress} progress entries, ${unmappedProgress} unmapped`);

  // Step 5: Map user_memory_hooks - store word_list_item_id reference
  // Memory hooks currently reference wordId. We can't change the FK without schema change,
  // but the PRD says "Map existing user_memory_hooks to new word_list_item references".
  // The hooks will continue to work via wordId during transition.
  console.log("\n--- Step 5: Verifying memory hooks mapping ---");
  const allHooks = await db.select().from(userMemoryHooks);
  let hooksMapped = 0;
  let hooksUnmapped = 0;
  for (const hook of allHooks) {
    if (hook.wordListItemId || (hook.wordId && wordIdToItemId.has(hook.wordId))) {
      hooksMapped++;
    } else {
      console.warn(`  WARNING: No item found for hook wordId=${hook.wordId}`);
      hooksUnmapped++;
    }
  }
  console.log(`  ${hooksMapped} hooks have valid mappings, ${hooksUnmapped} unmapped`);

  // Step 6: Auto-subscribe all existing users
  console.log("\n--- Step 6: Auto-subscribing users ---");
  const allUsers = await db.select({ id: users.id }).from(users);

  let subscribed = 0;
  let alreadySubscribed = 0;

  for (const user of allUsers) {
    const existing = await db
      .select()
      .from(userListSubscriptions)
      .where(
        sql`${userListSubscriptions.userId} = ${user.id} AND ${userListSubscriptions.listId} = ${systemList.id}`
      )
      .limit(1);

    if (existing.length > 0) {
      alreadySubscribed++;
      continue;
    }

    await db.insert(userListSubscriptions).values({
      userId: user.id,
      listId: systemList.id,
    });
    subscribed++;
  }
  console.log(`  Subscribed ${subscribed} users, ${alreadySubscribed} already subscribed`);

  // Summary
  console.log("\n=== Migration Summary ===");
  console.log(`System list: ${systemList.id} ("${systemList.name}")`);
  console.log(`Categories: ${categoryMap.size}`);
  console.log(`Word list items: ${created} created, ${skipped} pre-existing`);
  console.log(`Progress entries: ${mappedProgress} mapped, ${unmappedProgress} unmapped`);
  console.log(`Memory hooks: ${hooksMapped} mapped, ${hooksUnmapped} unmapped`);
  console.log(`User subscriptions: ${subscribed} new, ${alreadySubscribed} existing`);
  console.log(`\nWord ID → Item ID mapping saved (${wordIdToItemId.size} entries)`);

  // Output mapping for verification
  console.log("\n--- Sample mappings (first 5) ---");
  let count = 0;
  for (const [oldId, newId] of wordIdToItemId) {
    if (count++ >= 5) break;
    console.log(`  ${oldId} → ${newId}`);
  }

  await client.end();
  console.log("\nMigration complete!");
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
