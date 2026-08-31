'use client';

import { AppLogo } from '@/components/AppLogo';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';
import {
  ScratchField,
  ScratchFieldBase,
  ScratchFieldRevealTint,
  useLettersLayer,
} from '@/components/ScratchField';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-paper-glow/98">
      {/* Same experiment as the landing page: the loader is a scratch field.
          Bottom to top: reveal tint → second motif → cover → logo, with the
          rising letters either side of the cover per the chosen config. */}
      <ScratchFieldRevealTint className="z-0" />
      <ScratchFieldBase className="z-0" />
      <LoaderRisingLetters />
      <ScratchField className="z-[2]" />

      <div className="relative z-10 flex flex-col items-center">
        <LoaderB />
      </div>

      <style>{`
        .ls-underglow {
          position: absolute;
          inset: -20px;
          border-radius: 30%;
          background: radial-gradient(circle, rgba(79, 47, 36, 0.1), transparent 70%);
        }
      `}</style>
    </div>
  );
}

/**
 * No mouse snapping here: the scratch field owns pointer movement on this
 * screen, and letters chasing the cursor fought the rubbing.
 */
function LoaderRisingLetters() {
  const layer = useLettersLayer();
  return (
    <RisingLettersBackground
      variant="loader"
      count={48}
      snapToMouse={false}
      className={layer === 'cover' ? 'z-[3]' : 'z-[1]'}
    />
  );
}

function LoaderB() {
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative">
        <div className="ls-underglow" />
        <div>
          <AppLogo
            size={88}
            showLabel
            className="flex-col gap-5"
            labelClassName="text-brown-deep/55 text-[0.65rem] tracking-[0.45em]"
          />
        </div>
      </div>
    </div>
  );
}
