/**
 * Run Drizzle migrations programmatically.
 * Use this if `pnpm db:migrate` (drizzle-kit migrate) is not working or you want to run migrations from CI.
 *
 * Requires DATABASE_URL in .env.local (or environment).
 * Usage: pnpm run db:migrate:run
 */
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
    process.exit(1);
  }

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const postgres = (await import("postgres")).default;

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  const migrationsFolder = path.join(projectRoot, "drizzle", "migrations");
  console.log("Running migrations from:", migrationsFolder);

  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
