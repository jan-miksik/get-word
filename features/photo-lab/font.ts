import localFont from 'next/font/local';

/**
 * Display font for Photo Lab headings only; subsets cover every UI locale
 * (cs/en latin-ext, uk cyrillic, vi vietnamese). The official variable font is
 * checked in so production builds do not depend on Google Fonts networking.
 *
 * Shared by the `/photo-lab` route and the study page, which opens the lab in
 * place. `preload: false` keeps the 760 kB file off the study page's critical
 * path — it is fetched only once a heading actually renders in it.
 *
 * Server-only: `next/font` cannot be called from a client component, so the
 * class name is handed to the client tree as a prop.
 */
export const photoDisplayFont = localFont({
  src: './fonts/Unbounded-VariableFont_wght.ttf',
  weight: '200 900',
  display: 'swap',
  preload: false,
  variable: '--font-photo-display',
});
