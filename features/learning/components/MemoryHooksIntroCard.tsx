'use client';

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/components/I18nProvider';
import { MemoryHooksPanel } from './MemoryHooksPanel';
import { getMemoryHooksIntroCopy } from './memoryHooksCopy';

interface MemoryHooksIntroCardProps {
  onEnableMemoryHooks: () => void;
  onDisableMemoryHooks: () => void;
  learningLanguageFrom?: string | null;
  learningLanguageTo?: string | null;
}

export function MemoryHooksIntroCard({
  onEnableMemoryHooks,
  onDisableMemoryHooks,
  learningLanguageFrom,
  learningLanguageTo,
}: MemoryHooksIntroCardProps) {
  const { language } = useI18n();
  const copy = useMemo(
    () => getMemoryHooksIntroCopy(language, learningLanguageFrom, learningLanguageTo),
    [language, learningLanguageFrom, learningLanguageTo]
  );
  const [useMemoryHooks, setUseMemoryHooks] = useState(true);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const activeExample = copy.examples[0];

  const handleContinue = useCallback(() => {
    if (useMemoryHooks) onEnableMemoryHooks();
    else onDisableMemoryHooks();
  }, [onDisableMemoryHooks, onEnableMemoryHooks, useMemoryHooks]);

  return (
    <div className="relative h-full overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] text-ink-800">
      <article className="mx-auto flex min-h-full w-full max-w-[700px] flex-col justify-evenly gap-3 py-2 [--tm-accent:var(--sea)] sm:gap-4 sm:py-3">
        <div className="mx-auto flex w-full max-w-[620px] flex-col items-center gap-2 text-center sm:gap-2.5">
          <h2 className="m-0 max-w-[600px] text-[2rem] font-black leading-[1.02] tracking-normal text-ink-800 sm:text-[2.5rem]">
            {copy.title}
          </h2>
          <p className="m-0 max-w-[570px] text-[0.98rem] leading-snug text-ink-500/82 sm:text-[1.04rem]">
            {copy.body}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setLearnMoreOpen(true);
            }}
            data-memory-hooks-learn-more
            className="inline-flex w-fit items-center gap-2 text-[0.95rem] font-semibold text-[var(--tm-accent)] transition-colors hover:opacity-80"
          >
            {copy.learnMoreInline}
            <span aria-hidden="true">-&gt;</span>
          </button>
        </div>

        <div className="mx-auto w-full max-w-[500px]">
          <div className="relative w-full rounded-[1.35rem] border-2 border-ink-800 bg-paper-shade px-4 py-3 text-left text-ink-800 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-2.5">
              <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink-800">
                <span className="text-[2.35rem] font-black leading-none sm:text-[2.65rem]">
                  {activeExample.source}
                </span>
                <span className="text-[1.1rem] font-bold text-ink-350">=</span>
                <span className="text-[1.1rem] font-semibold text-ink-500 sm:text-[1.2rem]">
                  {activeExample.target}
                </span>
              </p>
              <p className="m-0 text-[0.95rem] font-medium leading-snug text-ink-500 sm:text-[1rem]">
                {activeExample.hook}
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[500px] rounded-[1.35rem] border-2 border-ink-800 bg-paper-shade px-4 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 text-[1.05rem] font-black leading-tight text-ink-800 sm:text-[1.12rem]">
                {copy.useHooksLabel}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 font-mono text-[0.72rem] font-bold uppercase tracking-[0.12em] ${
                    useMemoryHooks
                      ? 'border-[var(--tm-accent)] bg-[#d7e7f2] text-[var(--tm-accent)]'
                      : 'border-[#9a8e78] bg-paper-deep text-ink-350'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${useMemoryHooks ? 'bg-[var(--tm-accent)]' : 'bg-[#9a8e78]'}`} />
                  {useMemoryHooks ? copy.onLabel : copy.offLabel}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useMemoryHooks}
                  aria-label={copy.useHooksLabel}
                  onClick={() => setUseMemoryHooks((value) => !value)}
                  className={`relative h-10 w-[70px] rounded-full border-2 border-ink-800 transition-colors ${
                    useMemoryHooks ? 'bg-[var(--tm-accent)]' : 'bg-[#d9c9a8]'
                  }`}
                >
                  <span
                    className={`absolute left-1 top-1 h-7 w-7 rounded-full border-2 border-ink-800 bg-paper-shade transition-transform ${
                      useMemoryHooks ? 'translate-x-[30px]' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border-2 border-[var(--tm-accent)] bg-[var(--tm-accent)] px-5 py-3 text-[1.05rem] font-black text-paper-shade transition-opacity hover:opacity-90"
            >
              {copy.continueLabel}
              <span aria-hidden="true">-&gt;</span>
            </button>
          </div>
        </div>
      </article>
      {learnMoreOpen && typeof document !== 'undefined'
        ? createPortal(
            <MemoryHooksPanel
              isOpen
              onClose={() => setLearnMoreOpen(false)}
            />,
            document.body
          )
        : null}
    </div>
  );
}
