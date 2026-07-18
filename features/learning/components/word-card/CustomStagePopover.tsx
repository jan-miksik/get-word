'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
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
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | undefined>(undefined);
  // Tracks the in-flight pointer gesture so we can tell a tap from a scroll.
  const tapRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const skipNextClickRef = useRef(false);

  // Activate options on a movement-thresholded pointer gesture rather than the
  // synthesized `click`. Inside a scrollable popover, iOS frequently cancels the
  // click when a tap carries the slightest movement (or scroll momentum from
  // opening the menu), which made selections — most visibly re-picking the
  // current stage — silently no-op. Pointer events survive that.
  const TAP_MOVE_THRESHOLD = 10;
  const updatePopoverPosition = useCallback(() => {
    const trigger = customTriggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const margin = 4;
    const gap = 8;
    const width = Math.min(240, window.innerWidth - margin * 2);
    const maxHeight = Math.min(416, Math.max(96, rect.top - gap - margin));
    const triggerCenter = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(triggerCenter - width / 2, margin),
      Math.max(margin, window.innerWidth - width - margin),
    );
    setPopoverStyle({
      position: 'fixed',
      left,
      bottom: Math.max(gap, window.innerHeight - rect.top + gap),
      width,
      maxHeight,
    });
  }, []);

  const preserveMainScroll = useCallback(() => {
    const scroller = customTriggerRef.current?.closest('main');
    const scrollTop = scroller?.scrollTop;
    return () => {
      if (scroller && scrollTop !== undefined) scroller.scrollTop = scrollTop;
    };
  }, []);

  const tapHandlers = (action: () => void) => ({
    onPointerDown: (event: ReactPointerEvent) => {
      tapRef.current = { x: event.clientX, y: event.clientY, moved: false };
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const start = tapRef.current;
      if (!start) return;
      if (
        Math.abs(event.clientX - start.x) > TAP_MOVE_THRESHOLD ||
        Math.abs(event.clientY - start.y) > TAP_MOVE_THRESHOLD
      ) {
        start.moved = true;
      }
    },
    onPointerUp: () => {
      const start = tapRef.current;
      tapRef.current = null;
      if (start && !start.moved) {
        skipNextClickRef.current = true;
        window.setTimeout(() => {
          skipNextClickRef.current = false;
        }, 0);
        action();
      }
    },
    onClick: () => {
      if (skipNextClickRef.current) {
        skipNextClickRef.current = false;
        return;
      }
      action();
    },
    // A scroll fires pointercancel and releases the implicit touch capture;
    // discard the gesture so it never registers as a tap.
    onPointerCancel: () => {
      tapRef.current = null;
    },
    onKeyDown: (event: ReactKeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
      }
    },
  });

  useEffect(() => {
    if (!customOpen) return;
    updatePopoverPosition();
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
    window.addEventListener('resize', updatePopoverPosition);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', updatePopoverPosition);
    };
  }, [customOpen, updatePopoverPosition]);

  return (
    <div className="relative flex">
      <button
        ref={customTriggerRef}
        type="button"
        className="srs-btn srs-btn--easy !relative w-full"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!customOpen) {
            const restoreScroll = preserveMainScroll();
            updatePopoverPosition();
            window.requestAnimationFrame(() => {
              restoreScroll();
              updatePopoverPosition();
            });
            window.setTimeout(() => {
              restoreScroll();
              updatePopoverPosition();
            }, 0);
            window.setTimeout(() => {
              restoreScroll();
              updatePopoverPosition();
            }, 80);
          }
          setCustomOpen((open) => !open);
        }}
        title={t('card.pickCustomInterval')}
        aria-label={t('card.customInterval')}
        aria-haspopup="listbox"
        aria-expanded={customOpen}
      >
        <span className="srs-btn-copy">
          <span className="srs-btn-label" aria-hidden="true">...</span>
          <span className="srs-btn-hint !opacity-[0.45] !whitespace-normal max-sm:!text-[0.54rem] max-sm:!leading-[1.05] max-sm:!tracking-[0.04em]">
            {t('card.repeatAfter')}
          </span>
        </span>
      </button>
      {customOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={customPopoverRef}
          role="listbox"
          style={popoverStyle}
          className="custom-stage-popover z-50 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-[#2A2218] bg-[#F4EFE2] text-[#2A2218] shadow-lg overflow-hidden flex flex-col"
        >
          <div className="bg-[#F4EFE2] px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[#2A2218]/70 border-b border-[#2A2218]/20">
            {t('card.repeatAfter')}
          </div>
          <div className="custom-stage-popover-options overflow-y-auto">
            {STAGES.map((stage, idx) => {
              const isCurrent = idx === clampedStageIndex;
              const stripe = idx % 2 === 1;
              return (
                <button
                  key={stage.id}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  {...tapHandlers(() => {
                    setCustomOpen(false);
                    onCustomStage?.(idx);
                  })}
                  className={`relative flex w-full items-center px-3 py-2 text-left text-[0.9rem] leading-snug [touch-action:manipulation] transition-colors hover:bg-[#2A2218]/15 active:bg-[#2A2218]/25 ${
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
              {...tapHandlers(() => {
                setCustomOpen(false);
                if (onCustomStage) {
                  onCustomStage(STAGES.length - 1, { noRepeat: true });
                } else {
                  onReallyKnown?.();
                }
              })}
              className="flex w-full items-center px-3 py-2 text-left text-[0.9rem] leading-snug font-medium text-[#12750f] bg-[#12750f]/[0.08] [touch-action:manipulation] transition-colors hover:bg-[#12750f]/20 active:bg-[#12750f]/30 border-t border-[#2A2218]/20"
            >
              {t('card.fullyKnownNoRepeat')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
