type LocalFontOptions = {
  src: string | Array<{ path: string }>;
  weight?: string;
  style?: string;
  display?: string;
  preload?: boolean;
  variable?: string;
  fallback?: string[];
};

type LoadedFont = {
  className: string;
  variable: string;
  style: { fontFamily: string };
};

/**
 * `next/font/local` for the native bundle. Next generates a class that declares
 * a CSS variable; here the @font-face and the matching class are written by
 * hand in `mobile/src/fonts.css`, and this returns the agreed class name. The
 * name is derived from the requested variable (`--font-photo-display` becomes
 * `gw-font-photo-display`), so adding a font means adding one CSS rule.
 */
export default function localFont(options: LocalFontOptions): LoadedFont {
  const className = options.variable
    ? `gw-font${options.variable.replace(/^--font/, '')}`
    : 'gw-font';

  return {
    className,
    variable: className,
    style: { fontFamily: `var(${options.variable ?? '--font'}, inherit)` },
  };
}
