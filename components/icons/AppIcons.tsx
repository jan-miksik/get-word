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
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </Glyph>
  );
}

export function ProgressIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 18V12" />
      <path d="M12 18V7" />
      <path d="M19 18V4" />
      <path d="M3.5 18.5h17" />
    </Glyph>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path
        d="M12 4 13.6 9 19 10.5 13.6 12 12 17 10.4 12 5 10.5 10.4 9Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M19.5 5.5v2" strokeWidth={1.6} />
      <path d="M18.5 6.5h2" strokeWidth={1.6} />
      <path d="M5 17v2" strokeWidth={1.6} />
      <path d="M4 18h2" strokeWidth={1.6} />
    </Glyph>
  );
}

export function WordListsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 12.5h8" />
      <path d="M8 16h5" />
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
