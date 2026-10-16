import { asc } from "drizzle-orm";
import { db } from "../client";
import { testerAccounts } from "../schema";

/**
 * Store-review and QA accounts that study nothing real.
 *
 * They arrive in waves from the closed-testing programmes the app stores
 * require, so they dominate registrations and devices while contributing no
 * retention — the dashboard is unreadable with them mixed in, and misleading
 * with them silently gone. `testerScope` on the admin stats query switches
 * between the two populations instead.
 *
 * The addresses live in the `tester_accounts` table rather than in this
 * repository: they are real personal email addresses, so only the server ever
 * holds them, and the client learns how many there are from the stats payload,
 * never who. A new wave goes in as SQL — see `docs/admin/tester-accounts.md`.
 */
export async function getTesterAccountEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: testerAccounts.email })
    .from(testerAccounts)
    .orderBy(asc(testerAccounts.email));

  return Array.from(
    new Set(rows.map((row) => row.email.trim().toLowerCase()).filter(Boolean))
  );
}
