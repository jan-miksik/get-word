'use client';

import type { ReactNode } from 'react';

/**
 * The surface every session interstitial is written on.
 *
 * The pause between blocks and the card that closes the day are the same kind
 * of moment — the study surface stepping aside to say something — so they are
 * the same object: one warm paper panel, centred in whatever slot it lands in.
 *
 * Like the study surface itself this renders outside `.onboarding-screen`, so
 * the `--ob-*` variables are undefined and the warm ink palette is written out
 * directly.
 */
export function SessionCardShell({
  children,
  celebratory = false,
}: {
  children: ReactNode;
  /**
   * Marks a finished day rather than a seam: the card takes the whole width on
   * a phone (up to its gutter) and stays a compact modal on desktop, while the
   * light behind it gathers toward the middle.
   *
   * It used to be two soft circles bleeding out of opposite corners. They
   * pulled the eye outward, away from the one thing the screen is about, and
   * read as decoration that happened to be there. A single wash centred behind
   * the seal does the opposite work with less.
   */
  celebratory?: boolean;
}) {
  return (
    <div
      // `min-h-full` and `my-auto` on the card rather than `h-full` with
      // `items-center`: a centred flex item taller than its line overflows
      // equally at both ends, and the top half of that overflow is unreachable
      // — every ancestor's scrollable region only ever grows downward. So a
      // long card (a closed day with a series, a week and two offers on a short
      // phone) had its heading cut off with no way to scroll to it. Auto
      // margins centre the same way while there is room and collapse to zero
      // when there is not, which lets the card push the scroll container open.
      className={
        celebratory
          // Leave only a hairline phone gutter: card mode starts with 12px and
          // stream mode with 16px, so pulling eight back reaches 4–8px from the
          // viewport while still reading as a card rather than a page colour.
          // On desktop the section itself is capped at 500px, so this wrapper
          // only provides breathing room around the modal.
          ? '-mx-2 flex min-h-full w-full justify-center px-0 py-3 sm:mx-0 sm:px-6 sm:py-4'
          : 'flex min-h-full w-full justify-center px-2 py-8 sm:px-4'
      }
    >
      <section
        className={[
          'relative my-auto w-full overflow-hidden border',
          'bg-[linear-gradient(145deg,#fffaf0_0%,#f7f0df_60%,#edf6f8_100%)]',
          'px-5 text-center text-ink-800 shadow-[0_22px_60px_rgba(42,34,24,0.12)] sm:px-10',
          celebratory
            // Tighter than the seam card, and tighter still on a desktop. The
            // closing card is the tallest thing the study surface ever draws —
            // seal, headline, recap, both streaks, the week and up to two
            // offers — and it is the only one whose padding can push its own
            // buttons out of sight.
            // A hairline in ink rather than the white one the seam card wears:
            // the closing card sits on the study surface with nothing behind it,
            // and white on warm paper drew no edge at all.
            ? 'border-ink-faint/70 mx-auto max-w-[500px] rounded-[1.75rem] py-7 sm:rounded-[2rem] sm:py-8'
            // A full-strength ink hairline, the same ink the continue button
            // is drawn with. The seam cards sit straight on the study surface,
            // where first the white edge and then a faint warm one both read as
            // no edge at all — the card floated on its shadow. One line of the
            // same ink as the type ties it to the button it contains.
            : 'border-ink max-w-lg rounded-[2rem] py-8 sm:py-12',
        ].join(' ')}
      >
        {celebratory ? (
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-72"
            aria-hidden
            style={{
              background:
                'radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--rail-review) 13%, transparent) 0%, transparent 72%)',
            }}
          />
        ) : null}
        <div className="relative">{children}</div>
      </section>
    </div>
  );
}
