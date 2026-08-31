'use client';

import { useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getMemoryHooksLearnMoreCopy } from '@/features/learning/components/memoryHooksCopy';

interface MemoryHooksPanelProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function MemoryHooksPanel({ isOpen, onClose }: MemoryHooksPanelProps) {
  const { t, language } = useI18n();
  const copy = useMemo(() => getMemoryHooksLearnMoreCopy(language), [language]);

  return (
    <section
      className={`memory-hooks-panel ${isOpen ? 'is-open fixed inset-0' : ''}`}
      aria-label={t('memory.aria')}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div
          className="panel-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div className="panel-content">
        <div className="memory-hooks-learn-more">
          <header className="sticky top-0 z-10 border-b-2 border-dashed border-[rgba(31,26,18,0.14)] bg-paper-shade px-5 py-4 sm:px-8 sm:py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 font-mono text-[0.76rem] font-bold uppercase tracking-[0.28em] text-ink-350 sm:text-[0.84rem]">
                  {copy.eyebrow}
                </p>
                <h2 className="m-0 mt-2 text-[1.75rem] font-black leading-none tracking-normal text-ink-800 sm:text-[2rem]">
                  {copy.title}
                </h2>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-ink-800 bg-transparent text-ink-800 transition-colors hover:bg-paper-deep sm:h-12 sm:w-12"
                  aria-label={t('memory.close')}
                >
                  <span className="relative block h-5 w-5" aria-hidden="true">
                    <span className="absolute left-1/2 top-1/2 h-0.5 w-7 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                    <span className="absolute left-1/2 top-1/2 h-0.5 w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
                  </span>
                </button>
              )}
            </div>
          </header>

          <div className="space-y-7 px-5 py-5 sm:space-y-8 sm:px-8 sm:py-7">
            <section className="space-y-3 text-[1.04rem] font-medium leading-relaxed text-ink-500 sm:text-[1.18rem]">
              <p className="m-0 text-[#3f3529]">{copy.intro}</p>
              <p className="m-0 text-ink-350">{copy.temporary}</p>
            </section>

            <section className="space-y-3">
              <SectionLabel>{copy.kindsLabel}</SectionLabel>
              <div className="space-y-3">
                {copy.kinds.map((kind) => (
                  <div
                    key={kind.label}
                    className="rounded-[1.05rem] border-2 border-[rgba(31,26,18,0.13)] bg-paper-deep/70 px-4 py-3 text-ink-500 sm:px-5"
                  >
                    <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[1rem] font-bold leading-snug sm:text-[1.08rem]">
                      <span className="inline-flex rounded-full bg-[var(--tm-accent)] px-3 py-1 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-paper-shade">
                        {kind.label}
                      </span>
                      <span>{kind.title}</span>
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <SectionLabel>{copy.qualitiesLabel}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                {copy.qualities.map((quality) => (
                  <div
                    key={quality.title}
                    className="min-h-[92px] rounded-[1.05rem] border-2 border-[rgba(31,26,18,0.13)] bg-paper-deep/70 px-4 py-3 sm:px-5"
                  >
                    <h3 className="m-0 text-[1.08rem] font-black leading-tight text-ink-800 sm:text-[1.16rem]">
                      {quality.title}
                    </h3>
                    <p className="m-0 mt-1 text-[0.98rem] font-medium leading-snug text-ink-350 sm:text-[1.02rem]">
                      {quality.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <TextSection title={copy.fadeLabel} paragraphs={copy.fade} />
            <TextSection title={copy.makeOwnLabel} paragraphs={[copy.makeOwn]} />
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h3 className="m-0 font-mono text-[0.78rem] font-bold uppercase tracking-[0.28em] text-ink-350 sm:text-[0.86rem]">
      {children}
    </h3>
  );
}

function TextSection({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  return (
    <section className="space-y-3">
      <SectionLabel>{title}</SectionLabel>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="m-0 text-[1.02rem] font-medium leading-relaxed text-ink-500 sm:text-[1.12rem]"
        >
          {paragraph}
        </p>
      ))}
    </section>
  );
}
