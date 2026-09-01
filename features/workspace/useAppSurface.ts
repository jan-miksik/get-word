'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APP_SURFACE_HISTORY_MARKER,
  appSurfaceHref,
  isAppSurface,
  parseAppSurface,
  readAppSurfaceHistoryEntry,
  withAppSurfaceHistoryEntry,
  type AppSurface,
  type AppSurfaceHistoryEntry,
} from './surface-history';

function blurActiveElement(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

export function useAppSurface(photoEnabled: boolean) {
  const [activeSurface, setActiveSurface] = useState<AppSurface>(() => {
    if (typeof window === 'undefined') return 'study';
    return parseAppSurface(window.location.href, { photoEnabled });
  });
  const [visitedSurfaces, setVisitedSurfaces] = useState<Set<AppSurface>>(
    () => {
      const initial =
        typeof window === 'undefined'
          ? 'study'
          : parseAppSurface(window.location.href, { photoEnabled });
      return new Set<AppSurface>(['study', initial]);
    },
  );
  const pendingDirectReturnRef = useRef(false);

  const rememberVisited = useCallback((surface: AppSurface) => {
    setVisitedSurfaces((current) => {
      if (current.has(surface)) return current;
      const next = new Set(current);
      next.add(surface);
      return next;
    });
  }, []);

  const ensureHistoryEntry = useCallback((): AppSurfaceHistoryEntry => {
    const existing = readAppSurfaceHistoryEntry(window.history.state);
    if (existing) return existing;
    // `photoEnabled` matters here too: without it a `?surface=photo` URL would
    // seed the entry with a surface this learner cannot open, and every later
    // `baseSurface` decision would inherit it.
    const surface = parseAppSurface(window.location.href, { photoEnabled });
    const entry: AppSurfaceHistoryEntry = {
      marker: APP_SURFACE_HISTORY_MARKER,
      depth: 0,
      baseSurface: surface,
      surface,
    };
    window.history.replaceState(
      withAppSurfaceHistoryEntry(window.history.state, entry),
      '',
      window.location.href,
    );
    return entry;
  }, [photoEnabled]);

  const replaceSurface = useCallback(
    (surface: AppSurface, { resetRoot = false }: { resetRoot?: boolean } = {}) => {
      const current = ensureHistoryEntry();
      const entry: AppSurfaceHistoryEntry = resetRoot
        ? {
            marker: APP_SURFACE_HISTORY_MARKER,
            depth: 0,
            baseSurface: surface,
            surface,
          }
        : { ...current, surface };
      window.history.replaceState(
        withAppSurfaceHistoryEntry(window.history.state, entry),
        '',
        appSurfaceHref(surface, window.location.href),
      );
      setActiveSurface(surface);
      rememberVisited(surface);
    },
    [ensureHistoryEntry, rememberVisited],
  );

  const navigateSurface = useCallback(
    (surface: AppSurface) => {
      if (surface === parseAppSurface(window.location.href, { photoEnabled })) return;
      if (surface === 'photo' && !photoEnabled) {
        replaceSurface('study', { resetRoot: true });
        return;
      }
      blurActiveElement();
      const current = ensureHistoryEntry();
      const entry: AppSurfaceHistoryEntry = {
        ...current,
        depth: current.depth + 1,
        surface,
      };
      window.history.pushState(
        withAppSurfaceHistoryEntry(window.history.state, entry),
        '',
        appSurfaceHref(surface, window.location.href),
      );
      setActiveSurface(surface);
      rememberVisited(surface);
    },
    [ensureHistoryEntry, photoEnabled, rememberVisited, replaceSurface],
  );

  const returnToStudy = useCallback(() => {
    if (activeSurface === 'study') return;
    blurActiveElement();
    const current = ensureHistoryEntry();
    if (current.depth > 0 && current.baseSurface === 'study') {
      window.history.go(-current.depth);
      return;
    }
    if (current.depth > 0) {
      pendingDirectReturnRef.current = true;
      window.history.go(-current.depth);
      return;
    }
    replaceSurface('study', { resetRoot: true });
  }, [activeSurface, ensureHistoryEntry, replaceSurface]);

  useEffect(() => {
    const requestedSurface = new URL(window.location.href).searchParams.get('surface');
    // Anything the parser cannot honour as a surface of its own: a name it does
    // not know, or `?surface=study`, which is study spelled the long way and
    // whose canonical address carries no query at all. A real surface must be
    // listed here or its direct link would be rewritten to study underneath a
    // React tree that goes on showing it.
    const invalidSurface =
      requestedSurface !== null &&
      (!isAppSurface(requestedSurface) || requestedSurface === 'study');
    const disabledPhoto = requestedSurface === 'photo' && !photoEnabled;
    const canonicalSurface = parseAppSurface(window.location.href, { photoEnabled });
    const current = readAppSurfaceHistoryEntry(window.history.state);

    if (invalidSurface || disabledPhoto) {
      const entry: AppSurfaceHistoryEntry = {
        marker: APP_SURFACE_HISTORY_MARKER,
        depth: 0,
        baseSurface: 'study',
        surface: 'study',
      };
      window.history.replaceState(
        withAppSurfaceHistoryEntry(window.history.state, entry),
        '',
        appSurfaceHref('study', window.location.href),
      );
    } else if (!current) {
      ensureHistoryEntry();
    } else if (current.surface !== canonicalSurface) {
      const entry: AppSurfaceHistoryEntry = {
        ...current,
        baseSurface: current.depth === 0 ? canonicalSurface : current.baseSurface,
        surface: canonicalSurface,
      };
      window.history.replaceState(
        withAppSurfaceHistoryEntry(window.history.state, entry),
        '',
        window.location.href,
      );
    }

    const handlePopState = () => {
      blurActiveElement();
      let surface = parseAppSurface(window.location.href, { photoEnabled });
      if (pendingDirectReturnRef.current) {
        pendingDirectReturnRef.current = false;
        const entry: AppSurfaceHistoryEntry = {
          marker: APP_SURFACE_HISTORY_MARKER,
          depth: 0,
          baseSurface: 'study',
          surface: 'study',
        };
        window.history.replaceState(
          withAppSurfaceHistoryEntry(window.history.state, entry),
          '',
          appSurfaceHref('study', window.location.href),
        );
        surface = 'study';
      }
      setActiveSurface(surface);
      rememberVisited(surface);
    };
    window.addEventListener('popstate', handlePopState);
    const syncTimer = disabledPhoto
      ? window.setTimeout(() => {
          setActiveSurface('study');
          rememberVisited('study');
        }, 0)
      : undefined;
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (syncTimer !== undefined) window.clearTimeout(syncTimer);
    };
  }, [ensureHistoryEntry, photoEnabled, rememberVisited]);

  return {
    activeSurface,
    navigateSurface,
    replaceSurface,
    returnToStudy,
    visitedSurfaces,
  };
}
