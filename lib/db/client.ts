import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Connection string from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Create postgres client
// max: 3 allows Promise.all queries (e.g. progress + hooks + filters) to run in parallel
// rather than queuing behind a single connection
const client = postgres(connectionString, {
  max: 3,
  // Disable prepare for serverless environments (Vercel)
  prepare: false,
  // Allow up to 15s for the initial SSL/TCP connection to Supabase
  connect_timeout: 15,
  // Close idle connections after 20s (serverless cold-start friendly)
  idle_timeout: 20,
});

// Create drizzle instance with schema for relational queries
export const db = drizzle(client, { schema });

// Export types
export type Database = typeof db;
