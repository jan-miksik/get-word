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
      className="mx-auto h-14 w-14"
      fill="none"
    >
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="var(--ob-surface-hover, #FFF8E8)"
        stroke="var(--ob-ink, #2A2218)"
        strokeWidth="2"
      />
      <path
        d="M24 47V17"
        stroke="var(--ob-ink, #2A2218)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M24 18h19l-5 6.5 5 6.5H24z"
        fill="var(--ob-accent, #1E6FA8)"
        stroke="var(--ob-ink, #2A2218)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M15 47h27"
        stroke="var(--ob-ink, #2A2218)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
