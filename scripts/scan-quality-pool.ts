import * as dotenv from "dotenv";

// Loaded before anything that reaches the database. Static imports are
// evaluated ahead of this line, and `lib/db/client` throws at import time when
// DATABASE_URL is unset — so the modules below are pulled in from inside
// main() instead, which lets the script run without a pre-exported env.
dotenv.config({ path: ".env.local" });

import { MAX_AUDIT_ITEMS } from "../features/admin/server/quality-audit-constants";

// Quality pool maintenance.
//
//   pnpm tsx scripts/scan-quality-pool.ts --scan                        # dry-run
//   pnpm tsx scripts/scan-quality-pool.ts --scan --apply                # store heuristics
//   pnpm tsx scripts/scan-quality-pool.ts --scan --apply --force        # re-judge everything
//   pnpm tsx scripts/scan-quality-pool.ts --audit --apply --confirm --limit 50
//   pnpm tsx scripts/scan-quality-pool.ts --purge --apply --confirm
//
// Dry-run is the default everywhere. --apply performs writes; --audit and
// --purge additionally require --confirm, because one spends money at an
// external provider and the other deletes rows.
//
// --purge is deliberately NOT part of --scan. The scan runs with a limit, so
// most live rows are untouched on any given run; deletion is driven by whether
// a pair still has a live source, never by how much the scan covered.

type Mode = "scan" | "audit" | "purge";

type Args = {
  modes: Set<Mode>;
  apply: boolean;
  confirm: boolean;
  force: boolean;
  limit: number;
  offset: number;
  graceDays: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    modes: new Set<Mode>(),
    apply: false,
    confirm: false,
    force: false,
    limit: 500,
    offset: 0,
    graceDays: 30,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scan") args.modes.add("scan");
    else if (arg === "--audit") args.modes.add("audit");
    else if (arg === "--purge") args.modes.add("purge");
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--confirm") args.confirm = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--limit") args.limit = Number.parseInt(argv[++i] ?? "", 10) || args.limit;
    else if (arg === "--offset") {
      // `|| args.offset` would swallow a deliberate `--offset 0`, so the parse
      // is checked instead of defaulted through a falsy test.
      const parsed = Number.parseInt(argv[++i] ?? "", 10);
      args.offset = Number.isFinite(parsed) && parsed >= 0 ? parsed : args.offset;
    } else if (arg === "--grace-days") {
      args.graceDays = Number.parseInt(argv[++i] ?? "", 10) || args.graceDays;
    }
  }

  return args;
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [{ scanQualityPool }, { auditQualityPool }, { purgeStaleQualityReviews }, versions] =
    await Promise.all([
      import("../features/admin/server/quality-scan"),
      import("../features/admin/server/quality-audit"),
      import("../lib/db/queries/quality-pool"),
      import("../features/admin/server/quality-versions"),
    ]);
  const { HEURISTIC_VERSION, LLM_AUDIT_VERSION } = versions;

  if (args.modes.size === 0) {
    die("Nothing to do. Pass --scan, --audit, and/or --purge.");
  }
  if ((args.modes.has("audit") || args.modes.has("purge")) && args.apply && !args.confirm) {
    die("--audit / --purge with --apply also require --confirm.");
  }
  if (args.limit > MAX_AUDIT_ITEMS && args.modes.has("audit")) {
    die(`--limit for --audit must not exceed ${MAX_AUDIT_ITEMS}.`);
  }

  console.log(
    `heuristics v${HEURISTIC_VERSION}, audit v${LLM_AUDIT_VERSION}` +
      (args.apply ? "" : "  (dry run — nothing will be written)"),
  );

  if (args.modes.has("scan")) {
    if (!args.apply) {
      console.log(`scan: would visit up to ${args.limit} pairs from offset ${args.offset}`);
    } else {
      const result = await scanQualityPool({
        limit: args.limit,
        offset: args.offset,
        force: args.force,
      });
      console.log(
        `scan: ${result.scanned} visited, ${result.flagged} flagged, ` +
          `${result.unchanged} unchanged` +
          (result.nextOffset === null
            ? " (pool exhausted)"
            : `, resume at --offset ${result.nextOffset}`),
      );
    }
  }

  if (args.modes.has("audit")) {
    if (!args.apply) {
      console.log(`audit: would send up to ${args.limit} pairs to an external model`);
    } else {
      const result = await auditQualityPool({ maxItems: args.limit, force: args.force });
      console.log(
        `audit: ${result.audited} scored with ${result.model}, ` +
          `${result.cached} already current`,
      );
    }
  }

  if (args.modes.has("purge")) {
    if (!args.apply) {
      console.log(
        `purge: would delete review rows with no live source, older than ${args.graceDays} days`,
      );
    } else {
      const deleted = await purgeStaleQualityReviews({ graceDays: args.graceDays });
      console.log(`purge: ${deleted} review row(s) deleted`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
