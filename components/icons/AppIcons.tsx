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

export function PhotoLabIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 1.8}>
      <rect x="3" y="6.5" width="18" height="13" rx="2.5" />
      <path d="M8.5 6.5l1.1-2.1a1 1 0 0 1 .9-.55h3a1 1 0 0 1 .9.55L15.5 6.5" />
      <circle cx="12" cy="13" r="3.25" />
    </Glyph>
  );
}

/** Speech bubble with a plus — "add words by chatting", distinct from the
    plain bubble StudyNoteIcon uses for per-item notes. */
export function WordChatIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M6.25 5.25h8.9a2.85 2.85 0 0 1 2.85 2.85v5.15a2.85 2.85 0 0 1-2.85 2.85H11l-3.55 3.05a.55.55 0 0 1-.9-.42V16.1h-.3a2.85 2.85 0 0 1-2.85-2.85V8.1a2.85 2.85 0 0 1 2.85-2.85Z" />
      <path d="M10.7 10.6h3.9" />
      <path d="M12.65 8.65v3.9" />
    </Glyph>
  );
}

/** A friendly bot head — the AI that proposes words, distinct from the plain
    speech bubble WordChatIcon uses for the conversation itself. */
export function RobotIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 1.8}>
      <rect x="4.5" y="8.5" width="15" height="10.5" rx="2.75" />
      <path d="M12 5.25V8.5" />
      <circle cx="12" cy="4.25" r="1.15" />
      <path d="M2.75 12.25v3" />
      <path d="M21.25 12.25v3" />
      <circle cx="9.25" cy="13.25" r="1.1" />
      <circle cx="14.75" cy="13.25" r="1.1" />
      <path d="M9.5 16.25h5" />
    </Glyph>
  );
}

/** A deck of word cards — the study flow itself, next to the two ways words
    get *into* it (chat, photo). Deliberately a stack rather than the single
    sheet WordListsIcon uses, so "where I learn" reads apart from "my lists". */
export function StudyIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M8.5 6.25h8.25A2.75 2.75 0 0 1 19.5 9v7.75" />
      <rect x="3.5" y="8.75" width="12.75" height="10.75" rx="2.5" />
      <path d="M6.75 12.5h6.25" />
      <path d="M6.75 15.75h3.75" />
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

/** Rising bars — the learning overview. */
export function ProgressIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M4.5 19.5h15" />
      <path d="M7.5 19.5v-5" />
      <path d="M12 19.5v-9" />
      <path d="M16.5 19.5v-13" />
    </Glyph>
  );
}

/** Graduation cap — school membership and the school dashboard. */
export function SchoolIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M12 5 2.5 9.5 12 14l9.5-4.5L12 5Z" />
      <path d="M6.5 11.75v4.5c0 1.1 2.46 2.25 5.5 2.25s5.5-1.15 5.5-2.25v-4.5" />
      <path d="M21.5 9.5v5" />
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

/** Three linked nodes — the standard "share" graph, matching the icon the
    list rows use to open the same share-and-visibility dialog. */
export function ShareIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 1.8}>
      <circle cx="17.5" cy="6" r="2.6" />
      <circle cx="6.5" cy="12" r="2.6" />
      <circle cx="17.5" cy="18" r="2.6" />
      <path d="M15.2 7.3 8.8 10.7" />
      <path d="M8.8 13.3 15.2 16.7" />
    </Glyph>
  );
}

/** Vertical ellipsis — the "more actions" affordance next to a heading. */
export function KebabIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <circle cx="12" cy="5.25" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" />
      <circle cx="12" cy="18.75" r="1.35" fill="currentColor" />
    </Glyph>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2}>
      <path d="M4 20h4.5L19.25 9.25a2.12 2.12 0 0 0 0-3L17.75 4.75a2.12 2.12 0 0 0-3 0L4 15.5V20Z" />
      <path d="m13.5 6 4.5 4.5" />
    </Glyph>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Glyph {...props} strokeWidth={props.strokeWidth ?? 2.4}>
      <path d="M12 19V5.75" />
      <path d="m6.25 11.5 5.75-5.75 5.75 5.75" />
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

export function VenusIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7.25" />
      <path d="M8.75 18.25h6.5" />
    </Glyph>
  );
}

export function MarsIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="10" cy="14" r="5" />
      <path d="m13.54 10.46 5.71-5.71" />
      <path d="M14.75 4.75h4.5v4.5" />
    </Glyph>
  );
}

/**
 * The gender-neutral symbol: Venus without the cross, Mars without the arrow.
 * Stands for "no gendered form", which is what the salutation step actually
 * asks about — not for trans identity, which ⚧ would specifically denote.
 */
export function GenderNeutralIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7.25" />
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
