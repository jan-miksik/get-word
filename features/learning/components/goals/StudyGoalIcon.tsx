/**
 * A flag planted at the top, not a target with an arrow in it: the goal screen
 * is about a rhythm someone keeps, and a bullseye reads as a single hit.
 * Drawn in the onboarding line weights (2–3px ink) so it sits with the rest of
 * the flow rather than looking like a sticker dropped on it.
 */
export function StudyGoalIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 64"
      className="onboarding-step-icon"
      fill="none"
    >
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="var(--ob-surface-hover, var(--paper-hi))"
        stroke="var(--ob-ink, var(--ink))"
        strokeWidth="2"
      />
      <path
        d="M24 47V17"
        stroke="var(--ob-ink, var(--ink))"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M24 18h19l-5 6.5 5 6.5H24z"
        fill="var(--ob-accent, var(--sea))"
        stroke="var(--ob-ink, var(--ink))"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M15 47h27"
        stroke="var(--ob-ink, var(--ink))"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
