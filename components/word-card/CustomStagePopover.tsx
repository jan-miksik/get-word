'use client';

import { useEffect, useRef, useState } from 'react';
import { STAGES } from '@/lib/words';
import type { I18nKey } from '@/lib/i18n/messages';
import { useI18n } from '@/components/I18nProvider';

export function CustomStagePopover({
  clampedStageIndex,
  onCustomStage,
  onReallyKnown,
}: {
  clampedStageIndex: number;
  onCustomStage?: (stageIndex: number, opts?: { noRepeat?: boolean }) => void;
  onReallyKnown?: () => void;
}) {
  const { t } = useI18n();
  const [customOpen, setCustomOpen] = useState(false);
  const customPopoverRef = useRef<HTMLDivElement>(null);
  const customTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!customOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (customPopoverRef.current?.contains(target)) return;
      if (customTriggerRef.current?.contains(target)) return;
      setCustomOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCustomOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [customOpen]);

  return (
    <div className="relative flex">
      <button
        ref={customTriggerRef}
        type="button"
        className="srs-btn srs-btn--easy !relative !border-[#12750f] w-full"
        onClick={() => setCustomOpen((open) => !open)}
        title={t('card.pickCustomInterval')}
        aria-label={t('card.customInterval')}
        aria-haspopup="listbox"
        aria-expanded={customOpen}
      >
        <span className="srs-btn-copy">
          <span className="srs-btn-label">⋯</span>
          <span className="srs-btn-hint !opacity-[0.35] !whitespace-normal max-sm:!text-[0.55rem] max-sm:!leading-[1.1] max-sm:!tracking-[0.04em]">{t('card.custom')}</span>
        </span>
      </button>
      {customOpen && (
        <div
          ref={customPopoverRef}
          role="listbox"
          className="absolute right-0 bottom-[calc(100%+0.5rem)] z-50 w-[15rem] max-w-[calc(100vw-2rem)] max-h-[min(70dvh,26rem)] rounded-2xl border-2 border-[#2A2218] bg-[#F4EFE2] text-[#2A2218] shadow-lg overflow-hidden flex flex-col"
        >
          <div className="bg-[#F4EFE2] px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[#2A2218]/70 border-b border-[#2A2218]/20">
            {t('card.repeatAfter')}
          </div>
          <div className="overflow-y-auto">
            {STAGES.map((stage, idx) => {
              const isCurrent = idx === clampedStageIndex;
              const stripe = idx % 2 === 1;
              return (
                <button
                  key={stage.id}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => {
                    setCustomOpen(false);
                    onCustomStage?.(idx);
                  }}
                  className={`relative flex w-full items-center px-3 py-2 text-left text-[0.9rem] leading-snug transition-colors hover:bg-[#2A2218]/15 active:bg-[#2A2218]/25 ${
                    isCurrent
                      ? 'bg-[#2A2218]/12 font-semibold before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r before:bg-[#2A2218]'
                      : stripe
                        ? 'bg-[#2A2218]/[0.045]'
                        : ''
                  }`}
                >
                  {t(`stage.${stage.id}` as I18nKey)}
                </button>
              );
            })}
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                setCustomOpen(false);
                if (onCustomStage) {
                  onCustomStage(STAGES.length - 1, { noRepeat: true });
                } else {
                  onReallyKnown?.();
                }
              }}
              className="flex w-full items-center px-3 py-2 text-left text-[0.9rem] leading-snug font-medium text-[#12750f] bg-[#12750f]/[0.08] transition-colors hover:bg-[#12750f]/20 active:bg-[#12750f]/30 border-t border-[#2A2218]/20"
            >
              {t('card.fullyKnownNoRepeat')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
