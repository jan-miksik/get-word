/**
 * Mint an app session token for a user in the local development database.
 *
 * The native client authenticates with a bearer token instead of the session
 * cookie, so verifying the mobile bundle in a desktop browser needs a token in
 * hand. Apple sign-in cannot run there.
 *
 * Development only: it signs with the local APP_SESSION_SECRET, so the token is
 * worthless against any other environment.
 *
 * Usage:
 *   pnpm tsx scripts/mint-dev-session.ts             # user with the most lists
 *   pnpm tsx scripts/mint-dev-session.ts <user-id>
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/lib/db/client');
  const { users, userListSubscriptions } = await import('@/lib/db/schema');
  const { signSession } = await import('@/lib/session');

  const requestedUserId = process.argv[2];
  const subscriptionCount = sql<number>`(
    select count(*) from ${userListSubscriptions} s where s.user_id = ${users.id}
  )`;

  const rows = await db
    .select({
      id: users.id,
      userRole: users.userRole,
      lists: subscriptionCount,
    })
    .from(users)
    .orderBy(sql`${subscriptionCount} desc`)
    .limit(10);

  const target = requestedUserId
    ? rows.find((row) => row.id === requestedUserId)
    : rows[0];

  if (!target) {
    throw new Error(
      requestedUserId
        ? `User ${requestedUserId} not found among the top accounts`
        : 'No users in the development database',
    );
  }

  const token = await signSession({
    userId: target.id,
    userRole: target.userRole === 'editor' ? 'editor' : 'user',
  });

  console.log(`user:  ${target.id} (${target.lists} subscribed lists)`);
  console.log(`token: ${token}`);
  process.exit(0);
}

void main();
