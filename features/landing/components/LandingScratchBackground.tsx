'use client';

import { useRef, useState } from 'react';
import {
  ScratchField,
  ScratchFieldBase,
  ScratchFieldRevealTint,
  useLettersLayer,
} from '@/components/ScratchField';
import { ScratchFieldSwitcher } from '@/components/ScratchFieldSwitcher';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { SpeckledBackground } from '@/components/SpeckledBackground';

/**
 * The landing page's two background modes.
 *
 * By default the page sits on a static contour map — one SVG, generated fresh
 * per visit by `/api/backgrounds/topo`, spanning the full document height.
 *
 * Double-clicking the logo reveals the easter egg: the same contours become an
 * interactive scratch cover pinned to the viewport, with terrazzo underneath,
 * so moving the pointer rubs the map away and finds colour chips beneath it.
 * That mode is deliberately undiscoverable and deliberately not persisted —
 * it lasts until the page is reloaded.
 */

/** Long enough that two separate clicks are not mistaken for the gesture. */
const DOUBLE_ACTIVATE_MS = 450;

/**
 * Double-click *and* double-tap from one handler.
 *
 * `onDoubleClick` alone would miss touch on some browsers and, on the ones that
 * synthesise `dblclick` from a double tap, would fire alongside a hand-rolled
 * touch handler and toggle twice. Counting `pointerup` covers mouse, pen and
 * touch identically with no synthesised-event overlap.
 */
export function useDoubleActivate(onActivate: () => void) {
  const lastAt = useRef(0);
  return {
    onPointerUp: () => {
      const now = performance.now();
      if (now - lastAt.current < DOUBLE_ACTIVATE_MS) {
        lastAt.current = 0;
        onActivate();
        return;
      }
      lastAt.current = now;
    },
  };
}

/** Ambient letters over the static map, in the layer the egg mode leaves free. */
export function LandingAmbientLetters() {
  return (
    <RisingLettersBackground
      variant="ambient"
      count={64}
      snapToMouse={false}
      className="-z-[9]"
    />
  );
}

/**
 * The scratch stack, mounted only while the easter egg is on. Everything lives
 * inside one fading wrapper, which also gives the layers their own stacking
 * context — so they order among themselves (base → letters → cover) instead of
 * having to thread between the page's own negative z-indexes.
 */
export function LandingScratchLayers({ active }: { active: boolean }) {
  // Adjusting state during render rather than in an effect: the fade-out has to
  // outlive `active`, and a CSS animation (not a transition) means the layers
  // can mount already fading in, with no extra frame to schedule.
  const [wasActive, setWasActive] = useState(active);
  const [fadingOut, setFadingOut] = useState(false);
  if (active !== wasActive) {
    setWasActive(active);
    setFadingOut(!active);
  }

  if (!active && !fadingOut) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className={`lp-scratch-layers pointer-events-none fixed inset-0 -z-[8] ${
          active ? 'lp-scratch-in' : 'lp-scratch-out'
        }`}
        // The rising letters inside animate constantly, so only the wrapper's
        // own fade counts as the end of the transition.
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setFadingOut(false);
        }}
      >
        {/* Only reachable when the switcher's second layer is set to "none" —
            but then the parchment is what gets revealed, so it has to be here. */}
        <SpeckledBackground snapRisingLettersToMouse={false} showRisingLetters={false} />
        <ScratchFieldRevealTint className="z-0" />
        <ScratchFieldBase className="z-0" />
        <ScratchRisingLetters />
        <ScratchField className="z-[2]" />
      </div>
      {/* Outside the wrapper: it is a control, so it needs pointer events and
          must not fade with the surfaces it edits. */}
      {active ? <ScratchFieldSwitcher /> : null}
    </>
  );
}

/**
 * The letters sit either just under the cover (visible only through what has
 * been rubbed away) or just above it, depending on the switcher.
 */
function ScratchRisingLetters() {
  const layer = useLettersLayer();
  return (
    <RisingLettersBackground
      variant="ambient"
      count={64}
      snapToMouse={false}
      className={layer === 'cover' ? 'z-[3]' : 'z-[1]'}
    />
  );
}

