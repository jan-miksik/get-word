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
   * a phone and grows on a desktop, and the light behind it gathers toward the
   * middle.
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
      className={
        celebratory
          // Leave only a hairline phone gutter: card mode starts with 12px and
          // stream mode with 16px, so pulling eight back reaches 4–8px from the
          // viewport while still reading as a card rather than a page colour.
          ? '-mx-2 flex h-full min-h-64 items-center justify-center px-0 py-3 sm:mx-0 sm:px-6 sm:py-8'
          : 'flex h-full min-h-64 items-center justify-center px-2 py-8 sm:px-4'
      }
    >
      <section
        className={[
          'relative w-full overflow-hidden border border-white/60',
          'bg-[linear-gradient(145deg,#fffaf0_0%,#f7f0df_60%,#edf6f8_100%)]',
          'px-5 py-8 text-center text-[#1f1a12] shadow-[0_22px_60px_rgba(42,34,24,0.12)] sm:px-10 sm:py-12',
          celebratory
            ? 'mx-auto max-w-none rounded-[1.75rem] sm:max-w-7xl sm:rounded-[2rem]'
            : 'max-w-lg rounded-[2rem]',
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
