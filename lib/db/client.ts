import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connection string from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Create postgres client
// For serverless, we want max 1 connection per request
const client = postgres(connectionString, {
  max: 1,
  // Disable prepare for serverless environments (Vercel)
  prepare: false,
});

// Create drizzle instance with schema for relational queries
export const db = drizzle(client, { schema });

// Export types
export type Database = typeof db;
