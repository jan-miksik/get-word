'use client';

import Image from 'next/image';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import { isNativeAppRuntime } from '@/lib/runtime-platform';

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
  const nativeApp = isNativeAppRuntime();
  const cls = [
    'speckled-background pointer-events-none fixed left-0 top-0 -z-10 w-full max-w-[stretch] bg-[#dcd1b9] object-fill',
    className,
  ].filter(Boolean).join(' ');

  return (
    <>
      {nativeApp ? (
        <div
          aria-hidden="true"
          className={cls}
          style={{ height: 'calc(100dvh + env(safe-area-inset-bottom, 0px))' }}
        />
      ) : (
        <Image
          aria-hidden="true"
          alt=""
          className={cls}
          style={{ height: 'calc(100dvh + env(safe-area-inset-bottom, 0px))' }}
          src={RANDOMIZED_BACKGROUND_ENDPOINT}
          width={1920}
          height={1080}
          sizes="100vw"
          unoptimized
        />
      )}
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
