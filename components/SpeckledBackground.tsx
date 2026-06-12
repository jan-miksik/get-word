'use client';

import { RisingLettersBackground } from '@/components/RisingLettersBackground';

interface SpeckledBackgroundProps {
  className?: string;
  snapRisingLettersToMouse?: boolean;
  showRisingLetters?: boolean;
}

const RANDOMIZED_BACKGROUND_ENDPOINT = '/api/backgrounds/get-word';

export function SpeckledBackground({
  className = '',
  snapRisingLettersToMouse = true,
  showRisingLetters = true,
}: SpeckledBackgroundProps) {
  const cls = [
    'speckled-background pointer-events-none fixed left-0 top-0 -z-10 w-full max-w-[stretch] bg-[#dcd1b9] object-fill',
    className,
  ].filter(Boolean).join(' ');

  return (
    <>
      <img
        aria-hidden="true"
        alt=""
        className={cls}
        style={{ height: 'calc(100dvh + env(safe-area-inset-bottom, 0px))' }}
        src={RANDOMIZED_BACKGROUND_ENDPOINT}
      />
      {showRisingLetters && (
        <RisingLettersBackground
          variant="ambient"
          count={64}
          snapToMouse={snapRisingLettersToMouse}
          className="-z-[9]"
        />
      )}
    </>
  );
}
