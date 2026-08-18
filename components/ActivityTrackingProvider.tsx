'use client';

import { useEffect, type ReactNode } from 'react';

import { setActivitySurface, startActivityTracking } from '@/lib/activity/runtime';
import type { ActivitySurface } from '@/packages/contracts/src/activity';
import { useNavigation } from '@/packages/product/shared/platform/navigation';

/**
 * The seam between the React tree and the activity runtime.
 *
 * `useNavigation()` is a hook, so it cannot be called from
 * `lib/activity/runtime.ts` — this component reads the current route and pushes
 * it down, leaving the tracker core and its runtime adapter free of React.
 * Mount it inside `NavigationProvider` in both app roots (web and native) so
 * every surface is covered, not just the learning screen.
 */

/** Longest-prefix wins, so `/admin/stats` resolves before `/admin`. */
const SURFACE_BY_PREFIX: ReadonlyArray<readonly [string, ActivitySurface]> = [
  ['/lists', 'lists'],
  ['/join', 'lists'],
  ['/photo-lab', 'photo_lab'],
  ['/word-chat', 'word_chat'],
  ['/school', 'school'],
  ['/admin', 'admin'],
  ['/onboarding', 'onboarding'],
];

function surfaceFromPath(pathname: string): ActivitySurface {
  // The learning screen lives at the root, which would prefix-match everything.
  if (pathname === '/' || pathname === '') return 'study';
  for (const [prefix, surface] of SURFACE_BY_PREFIX) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return surface;
  }
  return 'other';
}

export function ActivityTrackingProvider({ children }: { children: ReactNode }) {
  const { pathname } = useNavigation();

  useEffect(() => startActivityTracking(), []);

  useEffect(() => {
    setActivitySurface(surfaceFromPath(pathname));
  }, [pathname]);

  return <>{children}</>;
}
