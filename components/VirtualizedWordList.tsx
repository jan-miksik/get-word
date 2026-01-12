'use client';

import { useRef, useMemo, useState, useEffect, useCallback, ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { NormalizedWord, STAGES } from '@/lib/words';
import { ProgressData } from '@/lib/storage';

export type Stage = (typeof STAGES)[number];

export type VirtualItem =
  | { type: 'header'; stage: Stage; stageIndex: number }
  | { type: 'card'; word: NormalizedWord; stageIndex: number };

interface VirtualizedWordListProps {
  groupedWords: NormalizedWord[][];
  progress: Record<string, ProgressData>;
  renderCard: (word: NormalizedWord, stageIndex: number) => ReactNode;
  className?: string;
  emptyMessage?: string;
}

export function VirtualizedWordList({
  groupedWords,
  progress,
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
  useEffect(() => {
    const visibleItems = virtualizer.getVirtualItems();
    if (visibleItems.length > 0) {
      // Find the first visible item that's a card or header
      for (const virtualItem of visibleItems) {
        const item = items[virtualItem.index];
        if (item) {
          setActiveStageIndex(item.stageIndex);
          break;
        }
      }
    }
  }, [virtualizer.getVirtualItems(), items]);

  const activeStage = STAGES[activeStageIndex];

  // Total word count
  const totalWords = useMemo(() => {
    return groupedWords.reduce((sum, words) => sum + (words?.length || 0), 0);
  }, [groupedWords]);

  if (totalWords === 0) {
    return (
      <div className={className} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-soft)' }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height: 'calc(100vh - 180px)', // Account for header and bottom nav
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {/* Sticky header showing current stage */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'rgba(5, 8, 22, 0.98)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.75rem 1.5rem',
        }}
      >
        <h2 style={{
          margin: 0,
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--accent)',
        }}>
          {activeStage?.name || 'Loading...'}
        </h2>
      </div>

      {/* Virtual list container */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
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
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Inline header for scroll position tracking */}
                <h2
                  className="category-zone-title"
                  style={{
                    padding: '0.75rem 1.5rem',
                    margin: 0,
                    fontSize: '0.9rem',
                    color: 'var(--text-soft)',
                    borderTop: item.stageIndex > 0 ? '1px solid var(--border-subtle)' : 'none',
                  }}
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
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderCard(item.word, item.stageIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
