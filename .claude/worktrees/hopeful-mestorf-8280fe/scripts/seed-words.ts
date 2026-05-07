import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { words } from "../lib/db/schema";
import { WORDS } from "../wordbook/slova.js";

// Type for the raw word data from slova.js
interface RawWord {
  id: string;
  category: string[];
  cz: string;
  en: string;
  vi: string;
  czPron?: string;
  viPron?: string;
  czAudio?: string | string[];
  viAudio?: string | string[];
  czHint?: string;
  viHint?: string;
}

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("Connecting to database...");
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log(`Seeding ${WORDS.length} words...`);

  // Transform and insert words in batches
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < WORDS.length; i += BATCH_SIZE) {
    const batch = (WORDS as RawWord[]).slice(i, i + BATCH_SIZE);

    const transformedBatch = batch.map((word) => ({
      id: word.id,
      category: word.category,
      cz: word.cz,
      en: word.en,
      vi: word.vi,
      czPron: word.czPron || null,
      viPron: word.viPron || null,
      // Handle audio fields that might be arrays
      czAudio: Array.isArray(word.czAudio)
        ? word.czAudio[0]
        : word.czAudio || null,
      viAudio: Array.isArray(word.viAudio)
        ? word.viAudio[0]
        : word.viAudio || null,
      czHint: word.czHint || null,
      viHint: word.viHint || null,
    }));

    await db
      .insert(words)
      .values(transformedBatch)
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

    inserted += batch.length;
    console.log(`Progress: ${inserted}/${WORDS.length} words`);
  }

  console.log("Seeding complete!");
  await client.end();
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
