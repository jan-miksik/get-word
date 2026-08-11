'use client';

import {
  createContext,
  forwardRef,
  useContext,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

export interface Navigation {
  pathname: string;
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  refresh(): void;
}

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({
  value,
  children,
}: {
  value: Navigation;
  children: ReactNode;
}) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext);
  if (navigation) return navigation;
  // Isolated component tests and embedded previews may render a public screen
  // without an application shell. Keep links usable there without importing a
  // framework router; production web/mobile roots still install their adapter.
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;
  return {
    pathname,
    push: (href) => {
      if (typeof window === 'undefined') return;
      window.history.pushState(window.history.state, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    replace: (href) => {
      if (typeof window === 'undefined') return;
      window.history.replaceState(window.history.state, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    back: () => { if (typeof window !== 'undefined') window.history.back(); },
    refresh: () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('focus')); },
  };
}

export function useRouteParams<T extends Record<string, string | string[]>>(): T {
  const { pathname } = useNavigation();
  const joinMatch = /^\/join\/([^/]+)\/?$/.exec(pathname);
  if (!joinMatch) return {} as T;
  try {
    return { token: decodeURIComponent(joinMatch[1]) } as unknown as T;
  } catch {
    return {} as T;
  }
}

type PlatformLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  replace?: boolean;
  prefetch?: boolean | null;
};

function isExternal(href: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//');
}

export const PlatformLink = forwardRef<HTMLAnchorElement, PlatformLinkProps>(function PlatformLink(
  { href, replace, prefetch: _prefetch, onClick, children, ...rest },
  ref,
) {
  const navigation = useNavigation();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      isExternal(href)
    ) return;
    event.preventDefault();
    if (replace) navigation.replace(href);
    else navigation.push(href);
  };
  return <a ref={ref} href={href} onClick={handleClick} {...rest}>{children}</a>;
});
