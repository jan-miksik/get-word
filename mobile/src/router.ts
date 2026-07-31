import { useSyncExternalStore } from 'react';

/**
 * The native bundle has no Next router, so it keeps its own current-path store.
 * The `next/navigation` shim reads and writes it, which means shared components
 * navigate exactly as they do on the web and only this module knows the app is
 * running without a server.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let stack: string[] = ['/'];

function normalize(href: string): string {
  if (!href) return '/';
  // Shared components only ever navigate to in-app paths; anything absolute is
  // an external link the caller should have opened in the system browser.
  if (/^[a-z]+:\/\//i.test(href)) return href;
  return href.startsWith('/') ? href : `/${href}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getRoutePath(): string {
  return stack[stack.length - 1];
}

export function navigate(href: string, mode: 'push' | 'replace' = 'push'): void {
  const next = normalize(href);
  if (next === getRoutePath()) return;
  stack = mode === 'replace' ? [...stack.slice(0, -1), next] : [...stack, next];
  emit();
}

export function goBack(): boolean {
  if (stack.length < 2) return false;
  stack = stack.slice(0, -1);
  emit();
  return true;
}

export function subscribeToRoute(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRoutePath(): string {
  return useSyncExternalStore(subscribeToRoute, getRoutePath, getRoutePath);
}
