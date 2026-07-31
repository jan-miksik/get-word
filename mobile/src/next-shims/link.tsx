import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { navigate } from '../router';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  replace?: boolean;
  // Accepted and ignored: these only mean something to the Next router.
  prefetch?: boolean | null;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
};

function isExternal(href: string): boolean {
  return /^[a-z]+:/i.test(href);
}

/**
 * `next/link` for the native bundle. In-app paths go through the local router;
 * anything absolute (mailto:, https://) keeps the browser's own behaviour so it
 * leaves the app instead of being swallowed by a route that does not exist.
 */
const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, prefetch: _prefetch, scroll: _scroll, shallow: _shallow, passHref: _passHref, legacyBehavior: _legacyBehavior, onClick, children, ...rest },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || isExternal(href)) return;
    event.preventDefault();
    navigate(href, replace ? 'replace' : 'push');
  };

  return (
    <a ref={ref} href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});

export default Link;
