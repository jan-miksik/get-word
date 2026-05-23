'use client';

import { useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getMemoryHooksIntroCopy } from './memoryHooksCopy';

interface MemoryHooksIntroCardProps {
  onEnableMemoryHooks: () => void;
  onDisableMemoryHooks: () => void;
  onLearnMore: () => void;
}

export function MemoryHooksIntroCard({
  onEnableMemoryHooks,
  onDisableMemoryHooks,
  onLearnMore,
}: MemoryHooksIntroCardProps) {
  const { language } = useI18n();
  const copy = useMemo(() => getMemoryHooksIntroCopy(language), [language]);

  return (
    <div className="h-full flex flex-col justify-end md:justify-start relative">
      <article className="phrase-card word-card--fullscreen h-full flex flex-col">
        <div className="flex-1 flex flex-col gap-5">
          <div className="space-y-3">
            <h2 className="m-0 text-[1.7rem] sm:text-[2rem] leading-tight text-text">
              {copy.title}
            </h2>
            <p className="m-0 text-[1rem] leading-relaxed text-text-soft">
              {copy.body}
            </p>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-background/60 px-4 py-3 text-text">
            {copy.exampleLines.map((line) => (
              <p key={line} className="m-0 text-[0.98rem] leading-relaxed">
                {line}
              </p>
            ))}
          </div>

          <p className="m-0 text-[0.9rem] leading-relaxed text-text-soft">
            {copy.note}
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onEnableMemoryHooks}
            className="rounded-2xl border-none bg-[#2A2218] px-4 py-3 text-sm font-semibold text-[#F4EFE2] transition-colors hover:bg-[#1E6FA8]"
          >
            {copy.keepOnLabel}
          </button>
          <button
            type="button"
            onClick={onDisableMemoryHooks}
            className="rounded-2xl border border-border-subtle bg-background px-4 py-3 text-sm font-semibold text-text transition-colors hover:bg-background-elevated"
          >
            {copy.turnOffLabel}
          </button>
          <button
            type="button"
            onClick={onLearnMore}
            className="rounded-2xl border border-transparent bg-transparent px-4 py-3 text-sm font-semibold text-[#1E6FA8] transition-colors hover:bg-[#1E6FA8]/10"
          >
            {copy.learnMoreLabel}
          </button>
        </div>
      </article>
    </div>
  );
}
