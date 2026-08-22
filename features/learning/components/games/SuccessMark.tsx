'use client';

import { useState } from 'react';
import {
  FALLBACK_ANIMATION,
  FALLBACK_SKIN,
  pickRandom,
  SUCCESS_MARK_ANIMATIONS,
  type SuccessMarkAnimation,
  type SuccessMarkSkin,
} from './successMarkVariant';

/**
 * The one "you got it" badge for the whole study flow.
 *
 * Every card that can be completed shows the check in the same place: a
 * reserved slot at the top of the card (`SuccessMarkSlot`). Cards used to place
 * it themselves — three different corner offsets, one inline at the bottom —
 * and none of them actually worked, because the badge carried `relative` in its
 * own class list and Tailwind emits `.relative` after `.absolute`, so a
 * caller's `absolute top-3 right-3` silently lost and the badge dropped into
 * normal flow wherever the card happened to put it.
 *
 * Positioning therefore stays *inside* this module: callers pass no position
 * classes, and the badge keeps `relative` for its own rings.
 */

/**
 * One size everywhere. There used to be a second, smaller badge for the cards
 * inside the stream and a hero one for the "round finished" panels, which meant
 * the same reward changed size depending on which exercise the learner happened
 * to get. The larger of the two won.
 */
const BADGE_SIZE = 'h-20 w-20';

/** Height reserved by `SuccessMarkSlot`; matches the badge exactly. */
const SLOT_HEIGHT = 'h-20';

type SkinStyle = {
  /** Fill, ink colour and shadow. */
  surface: string;
  /** Dropped by animations that draw their own ring instead. */
  border: string;
  /** The expanding halos. */
  halo: string;
  /** A second, static ring inside the badge — only some skins have one. */
  inner: string | null;
  /** Tick weight, in the 48-unit viewBox. */
  tickWidth: number;
  /** Ring weight for the drawn circle, in the same units. */
  circleWidth: number;
};

const SKIN_STYLES: Record<SuccessMarkSkin, SkinStyle> = {
  /** The original: pale green chip with a hard offset shadow. */
  green: {
    surface: 'bg-[#E3F3E7] text-[#187A43] shadow-[0_4px_0_rgba(24,122,67,0.2)]',
    border: 'border-2 border-[#187A43]',
    halo: 'border-2 border-[#187A43]/45',
    inner: null,
    tickWidth: 4,
    circleWidth: 3,
  },
  /** Filled disc, cream tick. The loudest of the five. */
  solid: {
    surface: 'bg-[#187A43] text-[#F4EFE2] shadow-[0_6px_14px_rgba(24,122,67,0.35)]',
    border: '',
    halo: 'border-2 border-[#187A43]/40',
    inner: null,
    tickWidth: 4.6,
    circleWidth: 2.6,
  },
  /** Paper and ink, exactly like the card frame around it. No colour reward. */
  ink: {
    surface: 'bg-[#F4EFE2] text-[#2A2218]',
    border: 'border-2 border-[#2A2218]',
    halo: 'border-2 border-[#2A2218]/35',
    inner: null,
    tickWidth: 3.4,
    circleWidth: 2.6,
  },
  /** Heavier rim plus a hairline inside it — reads as a small medal. */
  gold: {
    surface: 'bg-[#FBF1D8] text-[#9A6B0C] shadow-[0_4px_0_rgba(154,107,12,0.18)]',
    border: 'border-[3px] border-[#C79320]',
    halo: 'border-2 border-[#C79320]/45',
    inner: 'absolute inset-[4px] rounded-full border border-[#C79320]/40',
    tickWidth: 4,
    circleWidth: 3.4,
  },
  /** No rim at all; a soft glow in the app's blue carries the edge. */
  accent: {
    surface: 'bg-[#E4EEF6] text-[#1E6FA8] shadow-[0_0_0_4px_rgba(30,111,168,0.14)]',
    border: '',
    halo: 'border-2 border-[#1E6FA8]/40',
    inner: null,
    tickWidth: 4,
    circleWidth: 3,
  },
};

type AnimationStyle = {
  /** Entrance animation for the badge itself. */
  badge: string;
  /** Expanding halos. Hidden entirely under reduced motion. */
  rings: string[];
  /** Replaces the skin's painted rim with a stroke that draws itself on. */
  drawsOwnRing: boolean;
  tick: string;
};

const drawnTick =
  '[stroke-dasharray:40] motion-safe:[stroke-dashoffset:40] motion-safe:animate-[success-mark-draw-tick_360ms_ease-out_forwards]';

const ANIMATION_STYLES: Record<SuccessMarkAnimation, AnimationStyle> = {
  /** Springs up and lets one halo go. */
  pop: {
    badge: 'motion-safe:animate-[success-mark-pop_420ms_cubic-bezier(0.34,1.56,0.64,1)]',
    rings: ['motion-safe:animate-[success-mark-ring_620ms_ease-out_forwards]'],
    drawsOwnRing: false,
    tick: '',
  },
  /** Slams down out of scale and rotation, like a rubber stamp. No halo. */
  stamp: {
    badge: 'motion-safe:animate-[success-mark-stamp_460ms_cubic-bezier(0.2,0.9,0.3,1)]',
    rings: [],
    drawsOwnRing: false,
    tick: '',
  },
  /** Falls in from above and settles — reads with the badge's top placement. */
  drop: {
    badge: 'motion-safe:animate-[success-mark-drop_520ms_cubic-bezier(0.3,1.3,0.5,1)]',
    rings: [],
    drawsOwnRing: false,
    tick: `${drawnTick} motion-safe:[animation-delay:230ms]`,
  },
  /** Quiet: the ring draws itself around, then the check strokes on. */
  draw: {
    badge: 'motion-safe:animate-[success-mark-fade_240ms_ease-out]',
    rings: [],
    drawsOwnRing: true,
    tick: `${drawnTick} motion-safe:[animation-delay:320ms]`,
  },
  /** Barely moves; two staggered halos do the celebrating. */
  bloom: {
    badge: 'motion-safe:animate-[success-mark-fade_320ms_ease-out]',
    rings: [
      'motion-safe:animate-[success-mark-ring_760ms_ease-out_forwards]',
      'motion-safe:animate-[success-mark-ring_760ms_ease-out_forwards] motion-safe:[animation-delay:160ms]',
    ],
    drawsOwnRing: false,
    tick: '',
  },
};

export function SuccessMark({
  label,
  animation,
  skin,
  className = '',
}: {
  /** Empty when a heading right next to the badge already says it. */
  label: string;
  /** Pin the entrance instead of following the picker. Only the dev harness does. */
  animation?: SuccessMarkAnimation;
  /** Pin the look instead of following the picker. Only the dev harness does. */
  skin?: SuccessMarkSkin;
  /** Extra classes for the badge. Never position classes — see the note above. */
  className?: string;
}) {
  // Roll once per mount, so a badge never changes under the learner mid-
  // animation. The skin is deliberately not random: every real success mark
  // is solid. `skin` exists solely for the isolated development gallery.
  const [rolledAnimation] = useState(() => pickRandom(SUCCESS_MARK_ANIMATIONS));

  const resolvedAnimation = animation ?? rolledAnimation;
  const resolvedSkin = skin ?? FALLBACK_SKIN;

  const motion = ANIMATION_STYLES[resolvedAnimation] ?? ANIMATION_STYLES[FALLBACK_ANIMATION];
  const look = SKIN_STYLES[resolvedSkin] ?? SKIN_STYLES[FALLBACK_SKIN];

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      data-success-mark={`${resolvedAnimation}/${resolvedSkin}`}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${look.surface} ${motion.drawsOwnRing ? '' : look.border} ${BADGE_SIZE} ${motion.badge} ${className}`}
    >
      {motion.rings.map((ring, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`absolute inset-[-3px] rounded-full opacity-0 motion-reduce:hidden ${look.halo} ${ring}`}
        />
      ))}
      {look.inner && !motion.drawsOwnRing && <span aria-hidden="true" className={look.inner} />}
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        fill="none"
        className="absolute inset-0 h-full w-full"
      >
        <circle
          cx="24"
          cy="24"
          r="21"
          stroke="currentColor"
          strokeWidth={look.circleWidth}
          className={
            motion.drawsOwnRing
              ? '[stroke-dasharray:132] motion-safe:[stroke-dashoffset:132] motion-safe:animate-[success-mark-draw-circle_460ms_ease-out_forwards] origin-center -rotate-90'
              : 'opacity-0'
          }
        />
        <path
          d="M14.5 24.5 21 31l13-13.5"
          stroke="currentColor"
          strokeWidth={look.tickWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={motion.tick}
        />
      </svg>
    </span>
  );
}

/**
 * The reserved top-of-card slot. Always rendered, so the badge's arrival never
 * shifts the card's layout, and always the same height, so the badge lands in
 * the same spot on every kind of card.
 */
export function SuccessMarkSlot({
  show,
  label,
  rollKey,
  className = '',
}: {
  show: boolean;
  label: string;
  /**
   * Identifies the card this badge belongs to — normally the word's id. Part of
   * the badge's React key, so moving to another card always mounts a new badge.
   */
  rollKey?: string;
  className?: string;
}) {
  // A badge rolls its animation when it mounts, so it must actually mount every
  // time it appears. Relying on the card around it being remounted per word was
  // enough in the study stream but not everywhere: a card that resets for a new
  // round without unmounting kept the badge — and its animation — alive, which
  // is why the same entrance kept showing up. Counting reveals here makes the
  // roll depend on the badge appearing, not on anything above it.
  const [wasShown, setWasShown] = useState(show);
  const [reveals, setReveals] = useState(0);
  if (show !== wasShown) {
    // Adjusting state during render: React re-runs this component before it
    // commits, so the badge mounts once, already carrying its final key.
    setWasShown(show);
    if (show) setReveals((count) => count + 1);
  }

  return (
    <div
      className={`pointer-events-none flex w-full shrink-0 items-center justify-center ${SLOT_HEIGHT} ${className}`}
      role={show ? 'status' : undefined}
      aria-hidden={show ? undefined : true}
    >
      {show ? <SuccessMark key={`${rollKey ?? ''}:${reveals}`} label={label} /> : null}
    </div>
  );
}
