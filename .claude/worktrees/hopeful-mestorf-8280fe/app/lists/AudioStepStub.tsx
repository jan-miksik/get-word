'use client';

interface AudioStepStubProps {
  onComplete: () => Promise<void>;
}

export function AudioStepStub({ onComplete }: AudioStepStubProps) {
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text">Audio Generation</h2>
        <p className="text-sm text-text-soft mt-0.5">
          Audio generation will be available in a future update.
        </p>
      </div>

      <div className="p-8 rounded-lg border border-border-subtle bg-background-elevated text-center">
        <div className="text-4xl mb-3 opacity-40">♪</div>
        <p className="text-text-soft text-sm mb-1">
          Pronunciation audio is not yet available.
        </p>
        <p className="text-text-soft text-xs">
          Cards work without audio — you can add it later.
        </p>
      </div>

      <div className="flex justify-end mt-6 pt-4 border-t border-border-subtle">
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium hover:bg-accent-strong transition-colors"
          onClick={onComplete}
        >
          Finish
        </button>
      </div>
    </div>
  );
}
