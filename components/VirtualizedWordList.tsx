'use client';

import { useRef, useMemo, useState, useEffect, useCallback, ReactNode } from 'react';
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
  scrollElement?: HTMLElement | null;
  /** For verification: identifies which tab this list serves (e.g. "ready" | "all") */
  dataTab?: string;
}

export function VirtualizedWordList({
  groupedWords,
  renderCard,
  stageFooter,
  className = '',
  emptyMessage = 'No words to display.',
  scrollElement,
  dataTab,
}: VirtualizedWordListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);

  // Resolve scroll container: prefer explicit prop, fall back to own container
  const resolvedScrollEl = scrollElement ?? containerRef.current;

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

  // When scroll is the parent (main), the sticky header sits above the list; tell the virtualizer so it computes the visible range correctly.
  const scrollMargin = scrollElement ? 56 : 0;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement ?? containerRef.current,
    scrollMargin,
    getItemKey: useCallback((index: number) => {
      const item = items[index];
      if (item.type === 'header') return `header-${item.stageIndex}`;
      if (item.type === 'footer') return `footer-${item.stageIndex}`;
      return item.word.id;
    }, [items]),
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
      // Card height estimate (measured dynamically via measureElement).
      // Use a safe upper bound so cards with badges, memory hook, countdown don’t overlap before measurement.
      return 420;
    }, [items]),
    overscan: 5,
    horizontal: false,
  });

  // Track which stage is at the top of the viewport (so sticky header matches scroll position)
  const updateActiveStage = useCallback(() => {
    const el = scrollElement ?? containerRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const visibleItems = virtualizer.getVirtualItems();
    if (visibleItems.length === 0) return;
    // The virtual items' start values are container-relative (start from 0).
    // The sticky header covers scrollMargin px of the viewport, so the visible
    // content below it is at container position = scrollTop (scrollMargin and
    // stickyHeaderHeight cancel out).  When there is no scrollElement,
    // scrollMargin is 0 and this still holds.
    const viewportTop = scrollTop;
    const containing = visibleItems.find(
      (v) => v.start <= viewportTop && v.end > viewportTop
    );
    const best = containing ?? visibleItems[visibleItems.length - 1];
    const item = items[best.index];
    if (item) {
      setActiveStageIndex(item.stageIndex);
    }
  }, [virtualizer, items, scrollElement, scrollMargin]);

  useEffect(() => {
    const el = scrollElement ?? containerRef.current;
    if (!el) return;
    updateActiveStage();
    el.addEventListener('scroll', updateActiveStage, { passive: true });
    return () => el.removeEventListener('scroll', updateActiveStage);
  }, [updateActiveStage, scrollElement]);

  const activeStage = STAGES[activeStageIndex];
  const virtualItems = virtualizer.getVirtualItems();

  // Total word count
  const totalWords = useMemo(() => {
    return groupedWords.reduce((sum, words) => sum + (words?.length || 0), 0);
  }, [groupedWords]);

  // Debug: log virtualization stats
  const isDev = process.env.NODE_ENV === 'development';
  const [showDebug, setShowDebug] = useState(false);
  const [debugScrollInfo, setDebugScrollInfo] = useState({ clientH: 0, scrollH: 0, tag: '' });

  useEffect(() => {
    if (!isDev) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        setShowDebug(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDev]);

  // Poll scroll element dimensions for debug
  useEffect(() => {
    if (!isDev || !showDebug) return;
    const update = () => {
      const el = scrollElement ?? containerRef.current;
      if (el) {
        setDebugScrollInfo({
          clientH: el.clientHeight,
          scrollH: el.scrollHeight,
          tag: `${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''}`,
        });
      }
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [isDev, showDebug, scrollElement]);

  if (totalWords === 0) {
    return (
      <div
        className={`${className} p-8 text-center text-text-soft`}
        data-virtualized="true"
        data-tab={dataTab}
        data-total-items={0}
        data-rendered-items={0}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* Debug overlay for virtualization stats (dev only, toggle with Ctrl+Shift+V) */}
      {isDev && showDebug && (
        <div
          style={{
            position: 'fixed',
            bottom: 12,
            right: 12,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: 11,
            padding: '8px 12px',
            borderRadius: 8,
            lineHeight: 1.6,
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(0,255,0,0.2)',
            maxWidth: 260,
          }}
        >
          <div style={{ color: '#6f6', fontWeight: 700, marginBottom: 2 }}>
            Virtualization {dataTab ? `[${dataTab}]` : ''}
          </div>
          <div>Total items: <span style={{ color: '#fff' }}>{items.length}</span></div>
          <div>
            Rendered DOM:{' '}
            <span style={{ color: virtualItems.length < items.length ? '#0f0' : '#f80' }}>
              {virtualItems.length}
            </span>
          </div>
          <div>Word cards: <span style={{ color: '#fff' }}>{totalWords}</span></div>
          <div>Overscan: <span style={{ color: '#fff' }}>5</span></div>
          <div>Virtual height: <span style={{ color: '#fff' }}>{virtualizer.getTotalSize()}px</span></div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4, paddingTop: 4 }}>
            <div style={{ color: '#6f6', fontWeight: 700, marginBottom: 2 }}>Scroll container</div>
            <div>Element: <span style={{ color: '#fff' }}>{debugScrollInfo.tag || 'null'}</span></div>
            <div>scrollElement: <span style={{ color: scrollElement ? '#0f0' : '#f00' }}>{scrollElement ? `set (${scrollElement.tagName.toLowerCase()})` : 'NULL'}</span></div>
            <div>clientHeight: <span style={{ color: '#fff' }}>{debugScrollInfo.clientH}px</span></div>
            <div>scrollHeight: <span style={{ color: '#fff' }}>{debugScrollInfo.scrollH}px</span></div>
            <div>
              Scrollable:{' '}
              <span style={{ color: debugScrollInfo.scrollH > debugScrollInfo.clientH ? '#0f0' : '#f00' }}>
                {debugScrollInfo.scrollH > debugScrollInfo.clientH ? 'YES' : 'NO (content fits)'}
              </span>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4, paddingTop: 4 }}>
            Saving:{' '}
            <span style={{ color: virtualItems.length < items.length ? '#0f0' : '#f80' }}>
              {items.length > 0
                ? virtualItems.length < items.length
                  ? `${Math.round((1 - virtualItems.length / items.length) * 100)}% fewer DOM nodes`
                  : 'NONE -- not virtualizing!'
                : 'N/A'}
            </span>
          </div>
          <div style={{ color: '#666', fontSize: 10, marginTop: 4 }}>
            Ctrl+Shift+V to hide
          </div>
        </div>
      )}
      {/* Sticky header showing current stage - only shown when using parent scroll */}
      {scrollElement && (
        <div className="sticky top-0 z-10 bg-background backdrop-blur-[12px] border-b border-border-subtle py-3 px-4 mb-2">
          <h2 className="m-0 text-base font-semibold text-accent">
            {activeStage?.name || 'Loading...'}
          </h2>
        </div>
      )}
      <div
        ref={containerRef}
        className={`${className} relative w-full`}
        data-virtualized="true"
        data-tab={dataTab}
        data-total-items={items.length}
        data-rendered-items={virtualItems.length}
      >
        {/* Virtual list container */}
        <div
          className="w-full relative"
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
