import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { words, type Word, type NewWord } from "../schema";

// Get all words
export async function getAllWords(): Promise<Word[]> {
  return db.select().from(words);
}

// Get word by ID
export async function getWordById(id: string): Promise<Word | null> {
  const results = await db.select().from(words).where(eq(words.id, id)).limit(1);
  return results[0] || null;
}

// Get words by category
export async function getWordsByCategory(category: string): Promise<Word[]> {
  return db.select().from(words).where(
    sql`${words.category} @> ARRAY[${category}]::text[]`
  );
}

// Insert a new word
export async function createWord(word: NewWord): Promise<Word> {
  const results = await db.insert(words).values(word).returning();
  return results[0];
}

// Update a word
export async function updateWord(
  id: string,
  updates: Partial<Omit<NewWord, "id">>
): Promise<Word | null> {
  const results = await db
    .update(words)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(words.id, id))
    .returning();
  return results[0] || null;
}

// Delete a word
export async function deleteWord(id: string): Promise<boolean> {
  const results = await db.delete(words).where(eq(words.id, id)).returning();
  return results.length > 0;
}

// Batch insert/update words (for seeding)
export async function upsertWords(wordList: NewWord[]): Promise<void> {
  if (wordList.length === 0) return;

  await db
    .insert(words)
    .values(wordList)
    .onConflictDoUpdate({
      target: words.id,
      set: {
        category: words.category,
        cz: words.cz,
        en: words.en,
        vi: words.vi,
        czPron: words.czPron,
        viPron: words.viPron,
        czAudio: words.czAudio,
        viAudio: words.viAudio,
        czHint: words.czHint,
        viHint: words.viHint,
        updatedAt: new Date(),
      },
    });
}

// Get word count
export async function getWordCount(): Promise<number> {
  const results = await db.select({ count: sql<number>`count(*)` }).from(words);
  return Number(results[0]?.count || 0);
}

