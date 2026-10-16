/**
 * Fill a scratch database with invented users, lists and progress.
 *
 * The app's real data is other people's personal data: email addresses, their
 * own word lists, what they are struggling to remember. None of it belongs in
 * a development database an AI assistant can read, and none of it belongs in a
 * session transcript. This script gives that assistant a database shaped like
 * production and populated entirely with made-up rows.
 *
 * Usage:
 *   SYNTHETIC_DATABASE_URL=postgresql://... pnpm run db:migrate   # schema first
 *   SYNTHETIC_DATABASE_URL=postgresql://... pnpm run db:seed:synthetic
 *
 * It refuses to touch anything that is not plainly a scratch database:
 * - `SYNTHETIC_DATABASE_URL` must be set; DATABASE_URL is never used, so the
 *   real development database cannot be overwritten by forgetting a flag.
 * - the host must be local, unless --allow-remote is passed AND
 *   SYNTHETIC_DB_CONFIRM=SCRATCH_DATABASE is set.
 * - a database that already holds users is left alone unless --reset is given.
 */
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { computeContentKey } from "../lib/progress-key";
import { normalizeDatabaseUrl } from "../lib/db/connection-string";
import {
  users,
  wordLists,
  wordCategories,
  wordListItems,
  userListSubscriptions,
  userProgress,
} from "../lib/db/schema";

const LEARNER_COUNT = 12;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** Invented vocabulary. Short on purpose: shape matters, volume does not. */
const LIST_FIXTURES = [
  {
    name: "Synthetic basics",
    languageFrom: "cs",
    languageTo: "en",
    categories: [
      {
        name: "Greetings",
        items: [
          ["ahoj", "hello"],
          ["dobrý den", "good day"],
          ["na shledanou", "goodbye"],
          ["prosím", "please"],
          ["děkuji", "thank you"],
        ],
      },
      {
        name: "Around the flat",
        items: [
          ["stůl", "table"],
          ["okno", "window"],
          ["kuchyně", "kitchen"],
          ["klíč", "key"],
        ],
      },
    ],
  },
  {
    name: "Synthetic travel",
    languageFrom: "cs",
    languageTo: "vi",
    categories: [
      {
        name: "On the way",
        items: [
          ["vlak", "tàu hỏa"],
          ["letiště", "sân bay"],
          ["jízdenka", "vé"],
          ["zavazadlo", "hành lý"],
        ],
      },
    ],
  },
] as const;

function parseArgs(argv: string[]) {
  return {
    allowRemote: argv.includes("--allow-remote"),
    reset: argv.includes("--reset"),
  };
}

function die(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function assertScratchTarget(rawUrl: string, allowRemote: boolean) {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    die("SYNTHETIC_DATABASE_URL is not a valid URL.");
  }

  if (LOCAL_HOSTS.has(host)) return host;

  if (!allowRemote) {
    die(
      `SYNTHETIC_DATABASE_URL points at ${host}, which is not local. A scratch ` +
        "database should run on your machine. To use a throwaway hosted one anyway, " +
        "pass --allow-remote and set SYNTHETIC_DB_CONFIRM=SCRATCH_DATABASE."
    );
  }
  if (process.env.SYNTHETIC_DB_CONFIRM !== "SCRATCH_DATABASE") {
    die("--allow-remote also needs SYNTHETIC_DB_CONFIRM=SCRATCH_DATABASE.");
  }
  return host;
}

/** Spread stages and due dates so the study stream, upcoming panel and stats all have something to show. */
function progressShape(index: number, now: Date) {
  const stageIndex = index % 11;
  const dayMs = 24 * 60 * 60 * 1000;
  const due = new Date(now.getTime() + (index % 5 === 0 ? -2 * dayMs : (index % 7) * dayMs));
  return {
    stageIndex,
    knownCount: stageIndex,
    unknownCount: index % 3,
    nextDueAt: due,
    introducedAt: new Date(now.getTime() - (index % 30) * dayMs),
    lastKnownAt: stageIndex > 0 ? new Date(now.getTime() - (index % 9) * dayMs) : null,
  };
}

async function main() {
  const { allowRemote, reset } = parseArgs(process.argv.slice(2));
  const rawUrl = process.env.SYNTHETIC_DATABASE_URL;
  if (!rawUrl) {
    die(
      "SYNTHETIC_DATABASE_URL is not set. This script never reads DATABASE_URL, so " +
        "the real development database cannot be seeded by accident."
    );
  }

  const host = assertScratchTarget(rawUrl, allowRemote);
  const client = postgres(normalizeDatabaseUrl(rawUrl), { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    const existing = await db.execute(sql`SELECT count(*)::int AS count FROM users`);
    const existingUsers = Number((existing as unknown as { count: number }[])[0]?.count ?? 0);
    if (existingUsers > 0 && !reset) {
      die(
        `${host} already holds ${existingUsers} user row(s). Pass --reset to empty the ` +
          "app tables first, or point SYNTHETIC_DATABASE_URL at an empty database."
      );
    }

    if (reset && existingUsers > 0) {
      process.stdout.write(`Emptying app tables on ${host} (${existingUsers} users)…\n`);
      // users cascades to progress, subscriptions and the rest; lists are
      // owner-nulled rather than deleted, so they go separately.
      await db.execute(sql`TRUNCATE TABLE users, word_lists CASCADE`);
    }

    const now = new Date();

    const [editor] = await db
      .insert(users)
      .values({
        email: "editor@example.test",
        deviceId: randomUUID(),
        authProvider: "email",
        userRole: "editor",
        registeredAt: now,
        languageFrom: "cs",
        languageTo: "en",
      })
      .returning({ id: users.id });

    const learners = await db
      .insert(users)
      .values(
        Array.from({ length: LEARNER_COUNT }, (_, index) => ({
          email: `learner${String(index + 1).padStart(2, "0")}@example.test`,
          deviceId: randomUUID(),
          authProvider: index % 3 === 0 ? "google" : "email",
          registeredAt: new Date(now.getTime() - index * 36 * 60 * 60 * 1000),
          languageFrom: "cs",
          languageTo: index % 4 === 0 ? "vi" : "en",
        }))
      )
      .returning({ id: users.id });

    let itemCounter = 0;
    let progressRows = 0;

    for (const fixture of LIST_FIXTURES) {
      const [list] = await db
        .insert(wordLists)
        .values({
          ownerId: editor.id,
          name: fixture.name,
          description: "Invented data for local development.",
          languageFrom: fixture.languageFrom,
          languageTo: fixture.languageTo,
          isPublic: true,
        })
        .returning({ id: wordLists.id });

      const itemIds: { id: string; textKnown: string; textTarget: string }[] = [];

      for (const [position, category] of fixture.categories.entries()) {
        const [row] = await db
          .insert(wordCategories)
          .values({ listId: list.id, name: category.name, position })
          .returning({ id: wordCategories.id });

        for (const [textKnown, textTarget] of category.items) {
          const [item] = await db
            .insert(wordListItems)
            .values({
              listId: list.id,
              categoryId: row.id,
              position: itemCounter++,
              textKnown,
              textTarget,
            })
            .returning({ id: wordListItems.id });
          itemIds.push({ id: item.id, textKnown, textTarget });
        }
      }

      // Every learner subscribes; the first half also has progress, so the
      // dashboard shows both studying and non-studying accounts.
      for (const [learnerIndex, learner] of learners.entries()) {
        await db
          .insert(userListSubscriptions)
          .values({ userId: learner.id, listId: list.id });

        if (learnerIndex >= Math.ceil(learners.length / 2)) continue;

        for (const [itemIndex, item] of itemIds.entries()) {
          const contentKey = await computeContentKey({
            languageFrom: fixture.languageFrom,
            languageTo: fixture.languageTo,
            textKnown: item.textKnown,
            textTarget: item.textTarget,
          });

          await db.insert(userProgress).values({
            userId: learner.id,
            wordListItemId: item.id,
            contentKey,
            ...progressShape(learnerIndex + itemIndex, now),
          });
          progressRows++;
        }
      }
    }

    process.stdout.write(
      `Seeded ${host}: 1 editor, ${learners.length} learners, ${LIST_FIXTURES.length} lists, ` +
        `${itemCounter} items, ${progressRows} progress rows.\n`
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
