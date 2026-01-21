'use client';

import { useRef, useMemo, useState, useEffect, useCallback, ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { NormalizedWord, STAGES } from '@/lib/words';

export type Stage = (typeof STAGES)[number];

export type VirtualItem =
  | { type: 'header'; stage: Stage; stageIndex: number }
  | { type: 'card'; word: NormalizedWord; stageIndex: number };

interface VirtualizedWordListProps {
  groupedWords: NormalizedWord[][];
  renderCard: (word: NormalizedWord, stageIndex: number) => ReactNode;
  className?: string;
  emptyMessage?: string;
}

export function VirtualizedWordList({
  groupedWords,
  renderCard,
  className = '',
  emptyMessage = 'No words to display.',
}: VirtualizedWordListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);

  // Flatten items: headers + cards
  const items = useMemo(() => {
    const flat: VirtualItem[] = [];
    STAGES.forEach((stage, stageIndex) => {
      const words = groupedWords[stageIndex] || [];
      if (words.length > 0) {
        flat.push({ type: 'header', stage, stageIndex });
        words.forEach(word => {
          flat.push({ type: 'card', word, stageIndex });
        });
      }
    });
    return flat;
  }, [groupedWords]);

  // Find the first non-empty stage for initial active stage
  useEffect(() => {
    const firstNonEmpty = STAGES.findIndex((_, idx) => (groupedWords[idx]?.length || 0) > 0);
    if (firstNonEmpty >= 0) {
      setActiveStageIndex(firstNonEmpty);
    }
  }, [groupedWords]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      const item = items[index];
      // Header height
      if (item.type === 'header') return 48;
      // Card height estimate (will be measured dynamically)
      return 280;
    }, [items]),
    overscan: 5,
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
    const scrollEl = parentRef.current;
    if (!scrollEl) return;
    
    scrollEl.addEventListener('scroll', updateActiveStage);
    return () => scrollEl.removeEventListener('scroll', updateActiveStage);
  }, [updateActiveStage]);

  const activeStage = STAGES[activeStageIndex];

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
    <div
      ref={parentRef}
      className={`${className} h-[calc(100vh-180px)] overflow-auto relative`}
    >
      {/* Sticky header showing current stage */}
      <div className="sticky top-0 z-10 bg-[rgba(5,8,22,0.98)] backdrop-blur-[12px] border-b border-border-subtle py-3 px-6">
        <h2 className="m-0 text-base font-semibold text-accent">
          {activeStage?.name || 'Loading...'}
        </h2>
      </div>

      {/* Virtual list container */}
      <div
        className="w-full relative"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const item = items[virtualRow.index];

          // Skip rendering headers in the virtual list (we have sticky header)
          if (item.type === 'header') {
            return (
              <div
                key={`header-${item.stageIndex}`}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {/* Inline header for scroll position tracking */}
                <h2
                  className={`category-zone-title py-3 px-6 m-0 text-sm text-text-soft ${item.stageIndex > 0 ? 'border-t border-border-subtle' : ''}`}
                >
                  {item.stage.name}
                </h2>
              </div>
            );
          }

          return (
            <div
              key={item.word.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderCard(item.word, item.stageIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
