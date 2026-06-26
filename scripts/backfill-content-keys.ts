/**
 * Backfill user_progress.content_key from each row's word_list_item.
 *
 * Run this BETWEEN migration 0035 (adds nullable content_key) and 0036 (adds the
 * unique partial index + drops the old item-id identity), and BEFORE the new
 * content-keyed app code is live. See docs/content-keyed-progress.md.
 *
 * What it does:
 *   - For every user_progress row that has a word_list_item_id, computes the
 *     content key from the item text + list languages + the item's ignore_case
 *     (the same lib/progress-key.computeContentKey the app uses).
 *   - Collapses duplicates per (user_id, content_key): keeps the latest-review
 *     row, ARCHIVES the losers (sets archived_at, leaves their content_key NULL
 *     so they stay out of the unique index and out of reads) — non-destructive.
 *   - Dumps the full contents of every archived loser to a JSON file first.
 *   - Reports rows that carry both word_id and word_list_item_id (these could
 *     hit the legacy (user_id, word_id) unique instead of the content key).
 *
 * Usage:
 *   pnpm tsx scripts/backfill-content-keys.ts            # dry run, prints plan
 *   pnpm tsx scripts/backfill-content-keys.ts --apply    # write changes
 *
 * Idempotent — safe to re-run (rows already keyed are recomputed to the same
 * value; already-archived losers stay archived).
 */

import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { computeContentKey } from "../lib/progress-key";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Row = {
  id: string;
  user_id: string;
  word_id: string | null;
  word_list_item_id: string;
  content_key: string | null;
  archived_at: Date | null;
  stage_index: number;
  last_known_at: Date | null;
  last_unknown_at: Date | null;
  updated_at: Date | null;
  text_known: string | null;
  text_target: string | null;
  ignore_case: boolean;
  language_from: string;
  language_to: string;
};

function reviewRank(row: Row): number {
  const candidates = [row.last_known_at, row.last_unknown_at, row.updated_at]
    .filter((d): d is Date => d != null)
    .map((d) => d.getTime());
  return candidates.length ? Math.max(...candidates) : -Infinity;
}

// Latest review wins; deterministic tie-break by updated_at then id.
function loserComparator(a: Row, b: Row): number {
  const rankDiff = reviewRank(b) - reviewRank(a);
  if (rankDiff !== 0) return rankDiff;
  const aUpdated = a.updated_at?.getTime() ?? -Infinity;
  const bUpdated = b.updated_at?.getTime() ?? -Infinity;
  if (bUpdated !== aUpdated) return bUpdated - aUpdated;
  return a.id < b.id ? 1 : -1; // higher id first (DESC)
}

async function main() {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local or the environment.");
    process.exit(1);
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(connectionString, { max: 1 });

  console.log(apply ? "[backfill] APPLY mode" : "[backfill] DRY RUN — pass --apply to write");

  try {
    // 1) Rows that carry both legacy word_id and an item id — flag them.
    const dualKeyed = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM user_progress
      WHERE word_id IS NOT NULL AND word_list_item_id IS NOT NULL
    `;
    if (dualKeyed[0].count > 0) {
      console.log(
        `[backfill] ${dualKeyed[0].count} item-linked row(s) also carry a legacy word_id; ` +
          `--apply will clear word_id on every keyed/archived row (content-keyed rows use word_id = NULL), ` +
          `which is also what the live write path does.`,
      );
    }

    // 2) Load every item-linked progress row with the item text + languages.
    const rows = await sql<Row[]>`
      SELECT p.id, p.user_id, p.word_id, p.word_list_item_id, p.content_key, p.archived_at,
             p.stage_index, p.last_known_at, p.last_unknown_at, p.updated_at,
             i.text_known, i.text_target, i.ignore_case, l.language_from, l.language_to
      FROM user_progress p
      JOIN word_list_items i ON p.word_list_item_id = i.id
      JOIN word_lists l ON i.list_id = l.id
      WHERE p.word_list_item_id IS NOT NULL
    `;
    console.log(`[backfill] item-linked progress rows: ${rows.length}`);

    // 3) Compute keys.
    const keyById = new Map<string, string | null>();
    await Promise.all(
      rows.map(async (row) => {
        const key = await computeContentKey({
          languageFrom: row.language_from,
          languageTo: row.language_to,
          textKnown: row.text_known,
          textTarget: row.text_target,
          ignoreCase: row.ignore_case,
        });
        keyById.set(row.id, key);
      }),
    );

    const noKey = rows.filter((r) => !keyById.get(r.id));
    if (noKey.length) {
      console.log(`[backfill] ${noKey.length} row(s) cannot form a key (empty target) — left unchanged.`);
    }

    // 4) Group active rows by (user_id, content_key) and pick winners/losers.
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      if (row.archived_at) continue;
      const key = keyById.get(row.id);
      if (!key) continue;
      const groupKey = `${row.user_id}::${key}`;
      (groups.get(groupKey) ?? groups.set(groupKey, []).get(groupKey)!).push(row);
    }

    const winners: { id: string; key: string }[] = [];
    const losers: Row[] = [];
    for (const [, group] of groups) {
      const key = keyById.get(group[0].id)!;
      if (group.length === 1) {
        winners.push({ id: group[0].id, key });
        continue;
      }
      const sorted = [...group].sort(loserComparator);
      winners.push({ id: sorted[0].id, key });
      losers.push(...sorted.slice(1));
    }

    console.log(`[backfill] keys to set: ${winners.length}`);
    console.log(`[backfill] duplicate losers to archive: ${losers.length}`);

    if (!apply) {
      console.log("[backfill] DRY RUN complete — no changes written.");
      return;
    }

    // 5) Archive losers' full contents to JSON before any write.
    if (losers.length) {
      const backupDir = path.join(__dirname, "..", "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = path.join(backupDir, `content_key_backfill_losers_${stamp}.json`);
      fs.writeFileSync(file, JSON.stringify(losers, null, 2));
      console.log(`[backfill] archived loser rows dumped to ${file}`);
    }

    // 6) Apply inside a transaction: set winners' keys, archive losers.
    await sql.begin(async (txRaw) => {
      // postgres.js types don't surface the tagged-template call signature on
      // the transaction handle; it is the same callable shape as `sql`.
      const tx = txRaw as unknown as typeof sql;
      // Keyed rows become pure content-keyed rows: set content_key and clear the
      // vestigial legacy word_id (content-keyed rows use word_id = NULL).
      for (const { id, key } of winners) {
        await tx`UPDATE user_progress SET content_key = ${key}, word_id = NULL WHERE id = ${id}`;
      }
      // Losers are archived and fully neutralized (no content_key, no word_id) so
      // they sit out of every unique index; full contents were dumped above.
      for (const loser of losers) {
        await tx`UPDATE user_progress SET archived_at = now(), content_key = NULL, word_id = NULL WHERE id = ${loser.id}`;
      }
    });
    console.log(`[backfill] applied: ${winners.length} keyed, ${losers.length} archived.`);

    // 7) Post-checks.
    const dupes = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM (
        SELECT user_id, content_key FROM user_progress
        WHERE content_key IS NOT NULL AND archived_at IS NULL
        GROUP BY user_id, content_key HAVING count(*) > 1
      ) d
    `;
    // Active item-linked rows that *should* have a key (both sides non-empty)
    // but don't. Items with an empty target legitimately stay keyless.
    const missing = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM user_progress p
      JOIN word_list_items i ON p.word_list_item_id = i.id
      WHERE p.content_key IS NULL AND p.archived_at IS NULL
        AND i.text_known IS NOT NULL AND btrim(i.text_known) <> ''
        AND i.text_target IS NOT NULL AND btrim(i.text_target) <> ''
    `;
    const stillDual = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM user_progress
      WHERE word_id IS NOT NULL AND word_list_item_id IS NOT NULL
    `;
    console.log(`[backfill] post-check duplicate (user_id, content_key) groups: ${dupes[0].count}`);
    console.log(`[backfill] post-check active item-linked rows still missing content_key: ${missing[0].count}`);
    console.log(`[backfill] post-check rows still carrying both word_id + word_list_item_id: ${stillDual[0].count}`);
    if (dupes[0].count > 0 || missing[0].count > 0 || stillDual[0].count > 0) {
      console.warn("[backfill] VERIFY FAILED — do NOT apply migration 0036 until these are 0.");
    } else {
      console.log("[backfill] verification passed — safe to apply migration 0036.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
