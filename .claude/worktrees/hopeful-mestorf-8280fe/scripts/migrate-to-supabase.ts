import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as readline from "readline";
import * as schema from "../lib/db/schema";

// Remote Supabase connection (from .env.local)
const REMOTE_DB_URL = process.env.DATABASE_URL;

if (!REMOTE_DB_URL) {
  console.error("❌ DATABASE_URL environment variable is not set in .env.local");
  console.error("   Please add your Supabase connection string to .env.local");
  process.exit(1);
}

// Check if using Direct Connection (requires IPv6)
// Direct connection format: db.[PROJECT-REF].supabase.co:5432
// Pooler connection format: aws-0-[REGION].pooler.supabase.com:6543 or [PROJECT-REF].pooler.supabase.com
const isDirectConnection = REMOTE_DB_URL.includes("db.") && 
                           REMOTE_DB_URL.includes(".supabase.co:5432");

if (isDirectConnection) {
  console.warn("⚠️  WARNING: You're using a Direct Connection string");
  console.warn("   Direct connections require IPv6, which may not work on your network.");
  console.warn("   For this migration script, use the Connection Pooler string instead:");
  console.warn("   - Go to Supabase Dashboard → Settings → Database");
  console.warn("   - Copy the 'Connection Pooler' string (Transaction or Session mode)");
  console.warn("   - Format: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres");
  console.warn("");
  console.warn("   Alternatively, enable the IPv4 add-on in Supabase Dashboard.");
  console.warn("");
}

// Ensure LOCAL_DB_URL is defined
const LOCAL_DB_URL_FINAL =
  process.env.LOCAL_DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Helper function to prompt for user confirmation
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

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

  // Test connection before proceeding
  try {
    console.log("   Testing connection...");
    await remoteClient`SELECT 1`;
    console.log("   ✓ Connection successful\n");
  } catch (connError: any) {
    console.error("\n❌ Failed to connect to remote database");
    
    if (connError?.cause?.code === "28P01" || 
        connError?.cause?.message?.includes("password authentication failed") ||
        connError?.message?.includes("password authentication failed")) {
      console.error("\n🔐 Authentication Error:");
      console.error("   The password in your DATABASE_URL is incorrect.");
      console.error("\n   To fix this:");
      console.error("   1. Go to Supabase Dashboard → Settings → Database");
      console.error("   2. Check your database password (or reset it if needed)");
      console.error("   3. Copy the Connection Pooler string again");
      console.error("   4. Update DATABASE_URL in .env.local");
      console.error("\n   Your connection string format looks correct (pooler connection),");
      console.error("   but the password might be wrong or expired.");
    } else {
      console.error("   Error:", connError?.cause?.message || connError?.message || connError);
    }
    
    await localClient.end();
    await remoteClient.end();
    process.exit(1);
  }

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

    let remoteWords, remoteUsers;
    try {
      remoteWords = await remoteDb.select().from(schema.words);
      remoteUsers = await remoteDb.select().from(schema.users);
    } catch (schemaError: any) {
      if (schemaError?.cause?.code === "42P01" || 
          schemaError?.message?.includes("does not exist") ||
          schemaError?.cause?.message?.includes("does not exist")) {
        console.error("\n❌ Schema Error: Database tables do not exist on remote database");
        console.error("\n   The remote Supabase database needs to have the schema created first.");
        console.error("\n   To fix this:");
        console.error("   1. Make sure your DATABASE_URL in .env.local points to the remote Supabase");
        console.error("   2. Run the schema migration:");
        console.error("      pnpm run db:push");
        console.error("\n   This will create all the necessary tables (words, users, user_progress, etc.)");
        console.error("   on your remote Supabase database.");
        console.error("\n   After the schema is created, run this migration script again:");
        console.error("      pnpm run db:migrate-to-supabase");
      } else {
        throw schemaError;
      }
      await localClient.end();
      await remoteClient.end();
      process.exit(1);
    }

    if (remoteWords.length > 0 || remoteUsers.length > 0) {
      console.log("⚠️  WARNING: Remote database already contains data!");
      console.log(`   - ${remoteWords.length} words`);
      console.log(`   - ${remoteUsers.length} users`);
      console.log("\n   This script will:");
      console.log("   - Insert new words (skip duplicates by ID)");
      console.log("   - Insert new users (skip duplicates by device_id/email/wallet_address)");
      console.log("   - Insert all user progress, memory hooks, and filters");
      console.log("\n   This will not delete existing data.");
      
      const shouldContinue = await confirm("Continue?");
      if (!shouldContinue) {
        console.log("Migration cancelled.");
        await localClient.end();
        await remoteClient.end();
        process.exit(0);
      }
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

      // Get all existing users from remote database
      const existingUsers = await remoteDb.select().from(schema.users);

      for (const user of localUsers) {
        // Count how many local identifiers are non-null
        const nonNullIdentifiers = [
          user.deviceId,
          user.email,
          user.walletAddress,
        ].filter((id) => id != null);
        const nonNullCount = nonNullIdentifiers.length;

        // Find an existing user where ALL non-null identifiers match
        // Only treat as a match if at least one local identifier is non-null
        // AND all non-null local identifiers match the existing user
        const existingUser = existingUsers.find((existing) => {
          // Require at least one non-null identifier
          if (nonNullCount === 0) {
            return false;
          }

          // If local.deviceId is set, then existing.deviceId must equal it
          const deviceIdMatch =
            user.deviceId == null || user.deviceId === existing.deviceId;
          // If local.email is set, then existing.email must equal it
          const emailMatch =
            user.email == null || user.email === existing.email;
          // If local.walletAddress is set, then existing.walletAddress must equal it
          const walletMatch =
            user.walletAddress == null ||
            user.walletAddress === existing.walletAddress;

          return deviceIdMatch && emailMatch && walletMatch;
        });

        if (existingUser) {
          userIdMap.set(user.id, existingUser.id);
          skipped++;
          continue;
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
  } catch (error: any) {
    console.error("\n❌ Migration failed:", error);
    
    // Check for IPv6 connection errors
    if (error?.cause?.code === "ECONNREFUSED" && error?.cause?.address?.includes(":")) {
      console.error("\n🔍 IPv6 Connection Issue Detected:");
      console.error("   The connection string resolved to an IPv6 address, but your network");
      console.error("   cannot reach IPv6 addresses.");
      console.error("\n   Solution: Use the Connection Pooler string instead:");
      console.error("   1. Go to Supabase Dashboard → Settings → Database");
      console.error("   2. Copy the 'Connection Pooler' string (Transaction or Session mode)");
      console.error("   3. Update DATABASE_URL in .env.local");
      console.error("   4. Format: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres");
      console.error("\n   The pooler connection works without IPv6 and is compatible with this script.");
    }
    
    // Check for authentication errors
    if (error?.cause?.code === "28P01" || error?.cause?.message?.includes("password authentication failed")) {
      console.error("\n🔐 Authentication Error Detected:");
      console.error("   The password in your DATABASE_URL is incorrect.");
      console.error("\n   Solutions:");
      console.error("   1. Verify your database password in Supabase Dashboard");
      console.error("      - Go to Settings → Database → Database password");
      console.error("      - If you forgot it, you can reset it");
      console.error("   2. Check your .env.local file:");
      console.error("      - Make sure DATABASE_URL has the correct password");
      console.error("      - If password contains special characters, URL-encode them:");
      console.error("        @ → %40, # → %23, $ → %24, % → %25, etc.");
      console.error("   3. Copy the connection string directly from Supabase Dashboard");
      console.error("      - Settings → Database → Connection String");
      console.error("      - The dashboard handles URL encoding automatically");
    }
    
    // Check for schema errors
    if (error?.cause?.code === "42P01" || 
        error?.message?.includes("does not exist") ||
        error?.cause?.message?.includes("does not exist")) {
      console.error("\n📋 Schema Error Detected:");
      console.error("   The database tables do not exist on the remote database.");
      console.error("\n   Solution: Create the schema first:");
      console.error("   1. Make sure DATABASE_URL in .env.local points to your remote Supabase");
      console.error("   2. Run the schema migration:");
      console.error("      pnpm run db:push");
      console.error("\n   This will create all necessary tables (words, users, user_progress, etc.)");
      console.error("   on your remote Supabase database.");
      console.error("\n   After the schema is created, run this migration script again:");
      console.error("      pnpm run db:migrate-to-supabase");
    }
    
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
  .catch((error: any) => {
    console.error("\n💥 Migration failed:", error);
    
    // Check for IPv6 connection errors
    if (error?.cause?.code === "ECONNREFUSED" && error?.cause?.address?.includes(":")) {
      console.error("\n🔍 IPv6 Connection Issue Detected:");
      console.error("   The connection string resolved to an IPv6 address, but your network");
      console.error("   cannot reach IPv6 addresses.");
      console.error("\n   Solution: Use the Connection Pooler string instead:");
      console.error("   1. Go to Supabase Dashboard → Settings → Database");
      console.error("   2. Copy the 'Connection Pooler' string (Transaction or Session mode)");
      console.error("   3. Update DATABASE_URL in .env.local");
      console.error("   4. Format: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres");
      console.error("\n   The pooler connection works without IPv6 and is compatible with this script.");
    }
    
    // Check for authentication errors
    if (error?.cause?.code === "28P01" || error?.cause?.message?.includes("password authentication failed")) {
      console.error("\n🔐 Authentication Error Detected:");
      console.error("   The password in your DATABASE_URL is incorrect.");
      console.error("\n   Solutions:");
      console.error("   1. Verify your database password in Supabase Dashboard");
      console.error("      - Go to Settings → Database → Database password");
      console.error("      - If you forgot it, you can reset it");
      console.error("   2. Check your .env.local file:");
      console.error("      - Make sure DATABASE_URL has the correct password");
      console.error("      - If password contains special characters, URL-encode them:");
      console.error("        @ → %40, # → %23, $ → %24, % → %25, etc.");
      console.error("   3. Copy the connection string directly from Supabase Dashboard");
      console.error("      - Settings → Database → Connection String");
      console.error("      - The dashboard handles URL encoding automatically");
    }
    
    // Check for schema errors
    if (error?.cause?.code === "42P01" || 
        error?.message?.includes("does not exist") ||
        error?.cause?.message?.includes("does not exist")) {
      console.error("\n📋 Schema Error Detected:");
      console.error("   The database tables do not exist on the remote database.");
      console.error("\n   Solution: Create the schema first:");
      console.error("   1. Make sure DATABASE_URL in .env.local points to your remote Supabase");
      console.error("   2. Run the schema migration:");
      console.error("      pnpm run db:push");
      console.error("\n   This will create all necessary tables (words, users, user_progress, etc.)");
      console.error("   on your remote Supabase database.");
      console.error("\n   After the schema is created, run this migration script again:");
      console.error("      pnpm run db:migrate-to-supabase");
    }
    
    process.exit(1);
  });
