import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { wordLists } from "../lib/db/schema";
import {
  scanListAudio,
  repairListAudio,
  type AudioSide,
  type FlaggedItem,
} from "../features/audio/server/repair/scan-list-audio";

dotenv.config({ path: ".env.local" });

// Repair broken/inaudible audio on existing lists.
//
//   pnpm tsx scripts/repair-list-audio.ts --list <id>            # scan (dry-run)
//   pnpm tsx scripts/repair-list-audio.ts --list <id> --apply    # scan + repair
//   pnpm tsx scripts/repair-list-audio.ts --all-curated          # scan all curated
//   pnpm tsx scripts/repair-list-audio.ts --all-curated --apply --confirm --limit 20 --concurrency 2
//
// Dry-run (scan only) is the default. --apply performs writes; with --all-curated /
// --all-recommended it additionally requires --confirm. --limit caps items repaired
// across the whole run; --concurrency bounds parallel TTS calls.

type Args = {
  listId?: string;
  allCurated: boolean;
  allRecommended: boolean;
  side: AudioSide | "both";
  apply: boolean;
  confirm: boolean;
  limit: number;
  concurrency: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    allCurated: false,
    allRecommended: false,
    side: "both",
    apply: false,
    confirm: false,
    limit: Infinity,
    concurrency: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--list":
        args.listId = argv[++i];
        break;
      case "--all-curated":
        args.allCurated = true;
        break;
      case "--all-recommended":
        args.allRecommended = true;
        break;
      case "--side": {
        const v = argv[++i];
        args.side = v === "target" || v === "known" ? v : "both";
        break;
      }
      case "--apply":
        args.apply = true;
        break;
      case "--confirm":
        args.confirm = true;
        break;
      case "--limit":
        args.limit = Math.max(0, Number.parseInt(argv[++i] ?? "", 10) || Infinity);
        break;
      case "--concurrency":
        args.concurrency = Math.max(1, Number.parseInt(argv[++i] ?? "", 10) || 2);
        break;
      default:
        console.warn(`[repair-list-audio] ignoring unknown arg: ${arg}`);
    }
  }
  return args;
}

async function resolveListIds(args: Args): Promise<string[]> {
  if (args.listId) return [args.listId];
  const ids = new Set<string>();
  if (args.allCurated) {
    const rows = await db
      .select({ id: wordLists.id })
      .from(wordLists)
      .where(eq(wordLists.isCommon, true));
    rows.forEach((r) => ids.add(r.id));
  }
  if (args.allRecommended) {
    const rows = await db
      .select({ id: wordLists.id })
      .from(wordLists)
      .where(eq(wordLists.isRecommended, true));
    rows.forEach((r) => ids.add(r.id));
  }
  return [...ids];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.listId && !args.allCurated && !args.allRecommended) {
    console.error("[repair-list-audio] specify --list <id>, --all-curated, or --all-recommended");
    process.exit(1);
  }
  if (args.apply && (args.allCurated || args.allRecommended) && !args.confirm) {
    console.error(
      "[repair-list-audio] refusing to --apply across all curated/recommended lists " +
        "without --confirm. Add --confirm (and consider --limit / --concurrency).",
    );
    process.exit(1);
  }

  const listIds = await resolveListIds(args);
  if (listIds.length === 0) {
    console.log("[repair-list-audio] no matching lists.");
    process.exit(0);
  }

  console.log(
    `[repair-list-audio] ${args.apply ? "APPLY" : "SCAN (dry-run)"} — ${listIds.length} list(s), ` +
      `side=${args.side}, limit=${args.limit === Infinity ? "∞" : args.limit}, concurrency=${args.concurrency}`,
  );

  let repairedTotal = 0;
  let attemptedTotal = 0;
  let flaggedTotal = 0;

  for (const listId of listIds) {
    const flagged: FlaggedItem[] = await scanListAudio(listId, { side: args.side });
    flaggedTotal += flagged.length;

    if (flagged.length === 0) {
      console.log(`  ${listId}: clean`);
      continue;
    }

    const reasons = flagged.reduce<Record<string, number>>((acc, f) => {
      acc[f.reason] = (acc[f.reason] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `  ${listId}: ${flagged.length} flagged (` +
        Object.entries(reasons).map(([r, n]) => `${r}:${n}`).join(", ") +
        ")",
    );

    if (!args.apply) continue;

    // --limit caps *attempted* items (i.e. TTS regenerations), not just successes —
    // otherwise a run with many failures could fire far more calls than requested.
    const remaining = args.limit - attemptedTotal;
    if (remaining <= 0) {
      console.log("  reached --limit; stopping.");
      break;
    }
    const toRepair = flagged.slice(0, remaining).map((f) => ({ itemId: f.itemId, side: f.side }));
    attemptedTotal += toRepair.length;
    const outcomes = await repairListAudio(listId, toRepair, { concurrency: args.concurrency });
    const ok = outcomes.filter((o) => o.status === "ok").length;
    const failed = outcomes.length - ok;
    const warned = outcomes.filter((o) => o.qualityWarning).length;
    repairedTotal += ok;
    console.log(`    repaired ${ok}, failed ${failed}, quality-warned ${warned}`);
  }

  console.log(
    `[repair-list-audio] done — flagged ${flaggedTotal}` +
      (args.apply ? `, repaired ${repairedTotal}` : " (dry-run; re-run with --apply to fix)"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[repair-list-audio] failed:", err);
    process.exit(1);
  });
