'use client';

import { useRef, useMemo, useState, useEffect, useCallback, ReactNode, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { NormalizedWord, STAGES } from '@/lib/words';

export type Stage = (typeof STAGES)[number];

export type VirtualItem =
  | { type: 'header'; stage: Stage; stageIndex: number }
  | { type: 'card'; word: NormalizedWord; stageIndex: number }
  | { type: 'footer'; stageIndex: number; content: ReactNode };

interface VirtualizedWordListProps {
  groupedWords: NormalizedWord[][];
  renderCard: (word: NormalizedWord, stageIndex: number) => ReactNode;
  stageFooter?: (stageIndex: number) => ReactNode | null;
  className?: string;
  emptyMessage?: string;
  scrollElementRef?: RefObject<HTMLElement | null>;
}

export function VirtualizedWordList({
  groupedWords,
  renderCard,
  stageFooter,
  className = '',
  emptyMessage = 'No words to display.',
  scrollElementRef,
}: VirtualizedWordListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  // Flatten items: headers + cards + optional footers
  const items = useMemo(() => {
    const flat: VirtualItem[] = [];
    STAGES.forEach((stage, stageIndex) => {
      const words = groupedWords[stageIndex] || [];
      if (words.length > 0) {
        flat.push({ type: 'header', stage, stageIndex });
        words.forEach(word => {
          flat.push({ type: 'card', word, stageIndex });
        });
        const footerContent = stageFooter?.(stageIndex);
        if (footerContent) {
          flat.push({ type: 'footer', stageIndex, content: footerContent });
        }
      }
    });
    return flat;
  }, [groupedWords, stageFooter]);

  // Find the first non-empty stage for initial active stage
  useEffect(() => {
    const firstNonEmpty = STAGES.findIndex((_, idx) => (groupedWords[idx]?.length || 0) > 0);
    if (firstNonEmpty >= 0) {
      setActiveStageIndex(firstNonEmpty);
    }
  }, [groupedWords]);

  // Make the scroll element "reactive" (ref.current changes don't re-render by themselves)
  useEffect(() => {
    setScrollEl(scrollElementRef?.current ?? null);
  }, [scrollElementRef]);

  // When scroll is the parent (main), the sticky header sits above the list; tell the virtualizer so it computes the visible range correctly.
  const scrollMargin = scrollEl && scrollElementRef ? 56 : 0;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => {
      // Prefer parent scroll when available; otherwise fall back so we still render.
      return scrollEl ?? containerRef.current;
    },
    scrollMargin,
    estimateSize: useCallback((index: number) => {
      const item = items[index];
      // Header height - increased for more spacing between categories
      if (item.type === 'header') {
        // First header has less top spacing, subsequent headers have more
        const prevItem = index > 0 ? items[index - 1] : null;
        if (prevItem && prevItem.type === 'card') {
          return 80; // More spacing for headers after cards
        }
        return 64; // Base header height
      }
      if (item.type === 'footer') {
        return 96; // Estimated control/footer block height
      }
      // Card height estimate (will be measured dynamically)
      // Account for margin-top: 4px on phrase-card
      return 284;
    }, [items]),
    overscan: 15,
    horizontal: false,
  });

  // Track which stage is currently at the top
  const updateActiveStage = useCallback(() => {
    const visibleItems = virtualizer.getVirtualItems();
    if (visibleItems.length > 0) {
      for (const virtualItem of visibleItems) {
        const item = items[virtualItem.index];
        if (item) {
          setActiveStageIndex(item.stageIndex);
          break;
        }
      }
    }
  }, [virtualizer, items]);

  useEffect(() => {
    // When using parent scroll, listen to that element's scroll (not window)
    const el = scrollEl ?? containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateActiveStage, { passive: true });
    return () => el.removeEventListener('scroll', updateActiveStage);
  }, [updateActiveStage, scrollEl]);

  const activeStage = STAGES[activeStageIndex];
  const virtualItems = virtualizer.getVirtualItems();

  // Total word count
  const totalWords = useMemo(() => {
    return groupedWords.reduce((sum, words) => sum + (words?.length || 0), 0);
  }, [groupedWords]);

  if (totalWords === 0) {
    return (
      <div className={`${className} p-8 text-center text-text-soft`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* Sticky header showing current stage - only shown when using parent scroll */}
      {scrollElementRef && (
        <div className="sticky top-0 z-10 bg-background backdrop-blur-[12px] border-b border-border-subtle py-3 px-4 mb-2">
          <h2 className="m-0 text-base font-semibold text-accent">
            {activeStage?.name || 'Loading...'}
          </h2>
        </div>
      )}
      <div ref={containerRef} className={`${className} relative w-full`}>
        {/* Virtual list container */}
        <div
          className="w-full relative mb-[15rem]"
          style={{ height: virtualizer.getTotalSize() }}
        >
        {virtualItems.map(virtualRow => {
          const item = items[virtualRow.index];

          // Render headers with more spacing
          if (item.type === 'header') {
            return (
              <div
                key={`header-${item.stageIndex}`}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 right-0"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {/* Inline header for scroll position tracking - with more spacing */}
                <h2
                  className={`text-[0.7rem] uppercase tracking-[0.12em] text-text-soft m-0 mb-1 mx-0.5 opacity-90 py-4 px-4 text-sm ${item.stageIndex > 0 ? 'border-t border-border-subtle' : ''}`}
                  style={{ marginTop: item.stageIndex > 0 ? '32px' : '0', paddingTop: item.stageIndex > 0 ? '20px' : '16px' }}
                >
                  {item.stage.name}
                </h2>
              </div>
            );
          }

          if (item.type === 'footer') {
            return (
              <div
                key={`footer-${item.stageIndex}`}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 right-0"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  width: '100%',
                  willChange: 'transform',
                }}
              >
                {item.content}
              </div>
            );
          }

          return (
            <div
              key={item.word.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 right-0"
              style={{ 
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
                willChange: 'transform'
              }}
            >
              {renderCard(item.word, item.stageIndex)}
            </div>
          );
        })}
        </div>
      </div>
    </>
  );
}
