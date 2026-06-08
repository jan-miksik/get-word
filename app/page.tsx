import { cookies } from 'next/headers';
import { GET_WORD_SESSION_COOKIE_NAME, verifySession } from '@/lib/session';
import { LandingPage } from '@/components/LandingPage';
import { HomeClient } from './HomeClient';

/**
 * Home route entry. Signed-out visitors get the public, server-rendered
 * `LandingPage` so the app's purpose is visible without logging in (and is
 * crawlable / reviewable). Visitors with a valid app session get the client
 * learning shell.
 */
export default async function Home() {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(GET_WORD_SESSION_COOKIE_NAME)?.value
  );

  if (!session?.userId) {
    return <LandingPage />;
  }

  return <HomeClient />;
}
