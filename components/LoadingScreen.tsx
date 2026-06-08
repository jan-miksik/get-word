'use client';

import { AppLogo } from '@/components/AppLogo';
import { RisingLettersBackground } from '@/components/RisingLettersBackground';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#fefff5fa]">
      <RisingLettersBackground variant="loader" count={48} className="z-0" />

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
            labelClassName="text-[#4f2f24]/55 text-[0.65rem] tracking-[0.45em]"
          />
        </div>
      </div>
    </div>
  );
}
