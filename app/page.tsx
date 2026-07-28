import { cookies } from 'next/headers';
import { GET_WORD_SESSION_COOKIE_NAME, verifySession } from '@/lib/session';
import { LandingPage } from '@/features/landing/components/LandingPage';
import { photoDisplayFont } from '@/features/photo-lab/font';
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

  // The photo-lab display font is declared here, in a server component, because
  // `next/font` cannot be called from the client tree that opens the lab.
  // `preload: false` keeps the file off this page's critical path.
  return <HomeClient photoDisplayFontClass={photoDisplayFont.variable} />;
}
