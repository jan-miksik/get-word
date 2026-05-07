import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

interface GlyphProps extends IconProps {
  children: ReactNode;
  viewBox?: string;
}

function Glyph({
  size = 18,
  className = '',
  strokeWidth = 1.8,
  viewBox = '0 0 24 24',
  children,
}: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 7.25h14" />
      <path d="M5 12h14" />
      <path d="M5 16.75h14" />
    </Glyph>
  );
}

export function CategoryIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.5 7.5h11" />
      <path d="M6.5 12h7.5" />
      <path d="M6.5 16.5h11" />
      <circle cx="17.5" cy="12" r="1.75" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function ProgressIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 18V8.5" />
      <path d="M10 18V11.5" />
      <path d="M15 18V6.5" />
      <path d="M20 18V13.5" />
      <path d="M4 18.25h16" />
    </Glyph>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5.5 13.4 8.7 16.6 10.1 13.4 11.5 12 14.7 10.6 11.5 7.4 10.1 10.6 8.7 12 5.5Z" />
      <path d="M18.25 4.75v3.5" />
      <path d="M16.5 6.5H20" />
      <path d="M18.5 14.75v2.5" />
      <path d="M17.25 16h2.5" />
      <path d="M5.75 14.75v2.5" />
      <path d="M4.5 16h2.5" />
    </Glyph>
  );
}

export function WordListsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.5 5.5h8.25a2 2 0 0 1 2 2v10.75H8.5a2 2 0 0 0-2 2V7.5a2 2 0 0 1 2-2Z" />
      <path d="M16.75 18.25h.75a2 2 0 0 0 2-2V8.75a2 2 0 0 0-2-2H16" />
      <path d="M9.5 9.5h5" />
      <path d="M9.5 12.5h5" />
    </Glyph>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3.75v2.1" />
      <path d="m17.83 6.17-1.49 1.49" />
      <path d="M20.25 12h-2.1" />
      <path d="m17.83 17.83-1.49-1.49" />
      <path d="M12 20.25v-2.1" />
      <path d="m7.66 16.34-1.49 1.49" />
      <path d="M5.85 12H3.75" />
      <path d="m7.66 7.66-1.49-1.49" />
      <circle cx="12" cy="12" r="3.35" />
    </Glyph>
  );
}

export function InstallAppIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="7" y="3.75" width="10" height="16.5" rx="2.5" />
      <path d="M12 8.5v5.5" />
      <path d="m9.75 11.75 2.25 2.25 2.25-2.25" />
      <path d="M10 17.1h4" />
    </Glyph>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="m12 4.75 2.18 4.42 4.88.71-3.53 3.44.83 4.86L12 15.89 7.64 18.18l.83-4.86-3.53-3.44 4.88-.71L12 4.75Z"
        fill="currentColor"
        stroke="none"
      />
    </Glyph>
  );
}
