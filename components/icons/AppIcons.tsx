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
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <rect x="4.25" y="4.75" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.25" y="4.75" width="6.5" height="6.5" rx="1.6" />
      <rect x="4.25" y="13.25" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.25" y="13.25" width="6.5" height="6.5" rx="1.6" />
    </Glyph>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M8.6 18.25c-2.15-.75-3.6-2.7-3.6-5.15 0-2.35 1.18-4.02 3.1-4.7.18-1.88 1.64-3.15 3.5-3.15 1.48 0 2.62.72 3.2 1.9 2.45.3 4.2 2.23 4.2 4.9 0 2.86-1.9 5.06-4.65 5.55" />
      <path d="M9 9.7c.8-.45 1.75-.48 2.55.05" />
      <path d="M14.6 10.25c.68-.18 1.45-.02 2.05.45" />
      <path d="M12 13.25v6" />
      <path d="M9.55 15.1 12 13.25l2.45 1.85" />
    </Glyph>
  );
}

export function StudyNoteIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M6.25 5.25h8.9a2.85 2.85 0 0 1 2.85 2.85v5.15a2.85 2.85 0 0 1-2.85 2.85H11l-3.55 3.05a.55.55 0 0 1-.9-.42V16.1h-.3a2.85 2.85 0 0 1-2.85-2.85V8.1a2.85 2.85 0 0 1 2.85-2.85Z" />
      <path d="M8 9h6.25" />
      <path d="M8 12h4.3" />
    </Glyph>
  );
}

export function WordListsIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M7.5 4.5h9A2.5 2.5 0 0 1 19 7v12.5H8A3 3 0 0 1 5 16.5V7a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M8 16.5h11" />
      <path d="M9 9h6" />
      <path d="M9 12h5" />
    </Glyph>
  );
}

export function UpcomingIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <circle cx="12" cy="12.5" r="6.75" />
      <path d="M12 9v3.75l2.4 1.5" />
      <path d="M9 4.5h6" />
    </Glyph>
  );
}

export function TuneIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M5 7h8.5" />
      <path d="M17 7h2" />
      <circle cx="15.25" cy="7" r="1.75" />
      <path d="M5 12h2" />
      <path d="M10.5 12H19" />
      <circle cx="8.75" cy="12" r="1.75" />
      <path d="M5 17h7.5" />
      <path d="M16 17h3" />
      <circle cx="14.25" cy="17" r="1.75" />
    </Glyph>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 1.8}>
      <circle cx="12" cy="12" r="2.75" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
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
