import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";

// Remote Supabase connection (from .env.local)
const REMOTE_DB_URL = process.env.DATABASE_URL;

if (!REMOTE_DB_URL) {
  console.error("❌ DATABASE_URL environment variable is not set in .env.local");
  console.error("   Please add your Supabase connection string to .env.local");
  process.exit(1);
}

// Ensure LOCAL_DB_URL is defined
const LOCAL_DB_URL_FINAL =
  process.env.LOCAL_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function migrate() {
  console.log("🚀 Starting migration from local Supabase to remote Supabase...\n");

  // Connect to local database
  console.log("📥 Connecting to local database...");
  const localClient = postgres(LOCAL_DB_URL_FINAL, { max: 1 });
  const localDb = drizzle(localClient, { schema });

  // Connect to remote database
  console.log("📤 Connecting to remote Supabase...");
  // REMOTE_DB_URL is guaranteed to be defined due to check above
  const remoteClient = postgres(REMOTE_DB_URL!, { max: 1, prepare: false });
  const remoteDb = drizzle(remoteClient, { schema });

  try {
    // Step 1: Export data from local database
    console.log("\n📊 Exporting data from local database...\n");

    const localWords = await localDb.select().from(schema.words);
    console.log(`   ✓ Exported ${localWords.length} words`);

    const localUsers = await localDb.select().from(schema.users);
    console.log(`   ✓ Exported ${localUsers.length} users`);

    const localUserProgress = await localDb.select().from(schema.userProgress);
    console.log(`   ✓ Exported ${localUserProgress.length} user progress records`);

    const localMemoryHooks = await localDb.select().from(schema.userMemoryHooks);
    console.log(`   ✓ Exported ${localMemoryHooks.length} memory hooks`);

    const localCategoryFilters = await localDb
      .select()
      .from(schema.userCategoryFilters);
    console.log(`   ✓ Exported ${localCategoryFilters.length} category filters`);

    // Step 2: Check if remote database has data
    console.log("\n🔍 Checking remote database...\n");

    const remoteWords = await remoteDb.select().from(schema.words);
    const remoteUsers = await remoteDb.select().from(schema.users);

    if (remoteWords.length > 0 || remoteUsers.length > 0) {
      console.log("⚠️  WARNING: Remote database already contains data!");
      console.log(`   - ${remoteWords.length} words`);
      console.log(`   - ${remoteUsers.length} users`);
      console.log("\n   This script will:");
      console.log("   - Insert new words (skip duplicates by ID)");
      console.log("   - Insert new users (skip duplicates by device_id/email/wallet_address)");
      console.log("   - Insert all user progress, memory hooks, and filters");
      console.log("\n   Continue? (This will not delete existing data)");
    }

    // Step 3: Import data to remote database
    console.log("\n📤 Importing data to remote Supabase...\n");

    // Import words (with conflict handling)
    if (localWords.length > 0) {
      console.log(`   Importing ${localWords.length} words...`);
      let imported = 0;
      let skipped = 0;

      for (const word of localWords) {
        try {
          await remoteDb
            .insert(schema.words)
            .values(word)
            .onConflictDoUpdate({
              target: schema.words.id,
              set: {
                category: word.category,
                cz: word.cz,
                en: word.en,
                vi: word.vi,
                czPron: word.czPron,
                viPron: word.viPron,
                czAudio: word.czAudio,
                viAudio: word.viAudio,
                czHint: word.czHint,
                viHint: word.viHint,
                updatedAt: new Date(),
              },
            });
          imported++;
        } catch (error) {
          console.error(`     ⚠️  Failed to import word ${word.id}:`, error);
          skipped++;
        }
      }
      console.log(`   ✓ Imported ${imported} words, skipped ${skipped} duplicates`);
    }

    // Map old user IDs to new user IDs for foreign key relationships
    // This needs to be outside the if block so it's accessible to all sections
    const userIdMap = new Map<string, string>();

    // Import users (with conflict handling)
    if (localUsers.length > 0) {
      console.log(`   Importing ${localUsers.length} users...`);
      let imported = 0;
      let skipped = 0;

      // Create a map of existing users by their unique identifiers
      const existingUsers = await remoteDb.select().from(schema.users);
      const existingDeviceIds = new Set(
        existingUsers.map((u) => u.deviceId).filter(Boolean)
      );
      const existingEmails = new Set(
        existingUsers.map((u) => u.email).filter(Boolean)
      );
      const existingWallets = new Set(
        existingUsers.map((u) => u.walletAddress).filter(Boolean)
      );

      for (const user of localUsers) {
        // Check if user already exists
        const exists =
          (user.deviceId && existingDeviceIds.has(user.deviceId)) ||
          (user.email && existingEmails.has(user.email)) ||
          (user.walletAddress && existingWallets.has(user.walletAddress));

        if (exists) {
          // Find the existing user
          const existingUser =
            existingUsers.find(
              (u) =>
                u.deviceId === user.deviceId ||
                u.email === user.email ||
                u.walletAddress === user.walletAddress
            ) || null;

          if (existingUser) {
            userIdMap.set(user.id, existingUser.id);
            skipped++;
            continue;
          }
        }

        try {
          // Insert new user
          const [insertedUser] = await remoteDb
            .insert(schema.users)
            .values({
              deviceId: user.deviceId,
              email: user.email,
              walletAddress: user.walletAddress,
              role: user.role,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            })
            .returning();

          if (insertedUser) {
            userIdMap.set(user.id, insertedUser.id);
            imported++;
          }
        } catch (error) {
          console.error(`     ⚠️  Failed to import user ${user.id}:`, error);
          skipped++;
        }
      }
      console.log(`   ✓ Imported ${imported} users, skipped ${skipped} duplicates`);
    }

    // Import user progress (map old user IDs to new ones)
    if (localUserProgress.length > 0) {
      console.log(`   Importing ${localUserProgress.length} user progress records...`);
      let imported = 0;
      let skipped = 0;

      for (const progress of localUserProgress) {
        const newUserId = userIdMap.get(progress.userId);
        if (!newUserId) {
          console.warn(
            `     ⚠️  Skipping progress for user ${progress.userId} (user not found)`
          );
          skipped++;
          continue;
        }

        try {
          await remoteDb
            .insert(schema.userProgress)
            .values({
              userId: newUserId,
              wordId: progress.wordId,
              stageIndex: progress.stageIndex,
              knownCount: progress.knownCount,
              unknownCount: progress.unknownCount,
              lastKnownAt: progress.lastKnownAt,
              lastUnknownAt: progress.lastUnknownAt,
              nextDueAt: progress.nextDueAt,
              createdAt: progress.createdAt,
              updatedAt: progress.updatedAt,
            })
            .onConflictDoUpdate({
              target: [schema.userProgress.userId, schema.userProgress.wordId],
              set: {
                stageIndex: progress.stageIndex,
                knownCount: progress.knownCount,
                unknownCount: progress.unknownCount,
                lastKnownAt: progress.lastKnownAt,
                lastUnknownAt: progress.lastUnknownAt,
                nextDueAt: progress.nextDueAt,
                updatedAt: new Date(),
              },
            });
          imported++;
        } catch (error) {
          console.error(
            `     ⚠️  Failed to import progress for user ${newUserId}, word ${progress.wordId}:`,
            error
          );
          skipped++;
        }
      }
      console.log(
        `   ✓ Imported ${imported} progress records, skipped ${skipped}`
      );
    }

    // Import memory hooks
    if (localMemoryHooks.length > 0) {
      console.log(`   Importing ${localMemoryHooks.length} memory hooks...`);
      let imported = 0;
      let skipped = 0;

      for (const hook of localMemoryHooks) {
        const newUserId = userIdMap.get(hook.userId);
        if (!newUserId) {
          skipped++;
          continue;
        }

        try {
          await remoteDb
            .insert(schema.userMemoryHooks)
            .values({
              userId: newUserId,
              wordId: hook.wordId,
              hookText: hook.hookText,
              createdAt: hook.createdAt,
              updatedAt: hook.updatedAt,
            })
            .onConflictDoUpdate({
              target: [schema.userMemoryHooks.userId, schema.userMemoryHooks.wordId],
              set: {
                hookText: hook.hookText,
                updatedAt: new Date(),
              },
            });
          imported++;
        } catch (error) {
          console.error(
            `     ⚠️  Failed to import memory hook for user ${newUserId}, word ${hook.wordId}:`,
            error
          );
          skipped++;
        }
      }
      console.log(`   ✓ Imported ${imported} memory hooks, skipped ${skipped}`);
    }

    // Import category filters
    if (localCategoryFilters.length > 0) {
      console.log(`   Importing ${localCategoryFilters.length} category filters...`);
      let imported = 0;
      let skipped = 0;

      for (const filter of localCategoryFilters) {
        const newUserId = userIdMap.get(filter.userId);
        if (!newUserId) {
          skipped++;
          continue;
        }

        try {
          await remoteDb
            .insert(schema.userCategoryFilters)
            .values({
              userId: newUserId,
              category: filter.category,
              createdAt: filter.createdAt,
            })
            .onConflictDoUpdate({
              target: [schema.userCategoryFilters.userId, schema.userCategoryFilters.category],
              set: {
                createdAt: filter.createdAt,
              },
            });
          imported++;
        } catch (error) {
          console.error(
            `     ⚠️  Failed to import category filter for user ${newUserId}, category ${filter.category}:`,
            error
          );
          skipped++;
        }
      }
      console.log(`   ✓ Imported ${imported} category filters, skipped ${skipped}`);
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Words: ${localWords.length} exported`);
    console.log(`   - Users: ${localUsers.length} exported`);
    console.log(`   - Progress records: ${localUserProgress.length} exported`);
    console.log(`   - Memory hooks: ${localMemoryHooks.length} exported`);
    console.log(`   - Category filters: ${localCategoryFilters.length} exported`);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    throw error;
  } finally {
    await localClient.end();
    await remoteClient.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log("\n🎉 All done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
