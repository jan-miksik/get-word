import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { normalizeDatabaseUrl } from "./connection-string";

// Connection string from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

/**
 * Longest a single statement may run. Generous enough for the heaviest sync
 * read, short enough that a stalled connection surfaces as an error the client
 * can react to rather than a request that never answers.
 */
const STATEMENT_TIMEOUT_MS = 10_000;

// Create postgres client
// max: 3 allows Promise.all queries (e.g. progress + hooks + filters) to run in parallel
// rather than queuing behind a single connection
const client = postgres(normalizeDatabaseUrl(connectionString), {
  max: 3,
  // Disable prepare for serverless environments (Vercel)
  prepare: false,
  // Allow up to 15s for the initial SSL/TCP connection to Supabase
  connect_timeout: 15,
  // Close idle connections after 20s (serverless cold-start friendly)
  idle_timeout: 20,
  connection: {
    // Server-side cap on a single query. Without it, a connection that stalls
    // after connecting (dropped NAT mapping on flaky Wi-Fi, an unresponsive
    // pooler) blocks the request handler until TCP retransmits give up —
    // minutes, during which the client sees no response at all.
    statement_timeout: STATEMENT_TIMEOUT_MS,
  },
});

// Create drizzle instance with schema for relational queries
export const db = drizzle(client, { schema });
