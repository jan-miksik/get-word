import { useMemo } from 'react';
import { getRoutePath, goBack, navigate, useRoutePath } from '../router';

type AppRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
};

export function useRouter(): AppRouter {
  return useMemo<AppRouter>(
    () => ({
      push: (href) => navigate(href, 'push'),
      replace: (href) => navigate(href, 'replace'),
      back: () => {
        goBack();
      },
      forward: () => {},
      // Nothing on the client is server-rendered here, so there is no RSC
      // payload to re-fetch. Callers use `refresh()` to pick up new server
      // state; the shared code paths that matter re-fetch through the API.
      refresh: () => {},
      prefetch: () => {},
    }),
    [],
  );
}

export function usePathname(): string {
  return useRoutePath().split('?')[0];
}

export function useSearchParams(): URLSearchParams {
  const path = useRoutePath();
  return useMemo(() => new URLSearchParams(path.split('?')[1] ?? ''), [path]);
}

export function useParams<T extends Record<string, string | string[]>>(): T {
  const pathname = usePathname();
  return useMemo(() => {
    const joinMatch = /^\/join\/([^/]+)\/?$/.exec(pathname);
    if (!joinMatch) return {} as T;
    try {
      return { token: decodeURIComponent(joinMatch[1]) } as unknown as T;
    } catch {
      return {} as T;
    }
  }, [pathname]);
}

export function redirect(href: string): never {
  navigate(href, 'replace');
  throw new Error(`NEXT_REDIRECT:${href}`);
}

export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}

export { getRoutePath };
