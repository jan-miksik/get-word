'use client';

import { useEffect, useRef, useState } from 'react';
import type { MenuPanel } from '@/hooks/useMenuPanels';

interface TopMenuProps {
  onShowAll: () => void;
  onMenuAction: (panel: MenuPanel) => void;
  showAll: boolean;
  categoryCount: number;
  categoryActive: boolean;
  progressActive: boolean;
  score?: number;
}

export function ScoreBadge({ score }: { score: number }) {
  const prevScore = useRef(score);
  const [delta, setDelta] = useState<{ value: number; key: number } | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    const diff = score - prevScore.current;
    prevScore.current = score;
    if (diff !== 0) {
      keyRef.current += 1;
      setDelta({ value: diff, key: keyRef.current });
      const t = setTimeout(() => setDelta(null), 900);
      return () => clearTimeout(t);
    }
  }, [score]);

  return (
    <span
      className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400/15 border border-yellow-400/30 text-yellow-600 dark:text-yellow-400 text-xs font-semibold tabular-nums"
      aria-label={`Game score: ${score}`}
    >
      ⭐ {score}
      {delta && (
        <span
          key={delta.key}
          className={`absolute -top-1 -right-1 text-xs font-bold pointer-events-none ${
            delta.value > 0 ? 'text-emerald-400' : 'text-red-400'
          }`}
          style={{ animation: 'score-float 0.9s ease-out forwards' }}
        >
          {delta.value > 0 ? `+${delta.value}` : delta.value}
        </span>
      )}
      <style>{`
        @keyframes score-float {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          60% { opacity: 1; transform: translateY(-18px) scale(1); }
          100% { opacity: 0; transform: translateY(-28px) scale(0.8); }
        }
      `}</style>
    </span>
  );
}

interface MenuDropdownProps {
  onMenuAction: (panel: MenuPanel) => void;
  categoryActive: boolean;
  categoryCount: number;
  progressActive: boolean;
}

function MenuDropdown({
  onMenuAction,
  categoryActive,
  categoryCount,
  progressActive,
}: MenuDropdownProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const items: Array<{
    icon: string;
    label: string;
    panel: MenuPanel;
    active: boolean;
    badge: string | null;
  }> = [
    {
      icon: '🏷️',
      label: 'Filter by Category',
      panel: 'category',
      active: categoryActive,
      badge: categoryCount > 0 ? String(categoryCount) : null,
    },
    {
      icon: '📊',
      label: 'Learning Progress',
      panel: 'progress',
      active: progressActive,
      badge: null,
    },
    {
      icon: 'ℹ️',
      label: 'Memory Hooks',
      panel: 'memoryHooks',
      active: false,
      badge: null,
    },
    {
      icon: '⚙️',
      label: 'Settings',
      panel: 'settings',
      active: false,
      badge: null,
    },
  ];

  const hasActiveItem = categoryActive || progressActive;

  return (
    <div className="relative top-menu-dropdown" ref={menuRef}>
      <button
        className={`mode-btn menu-toggle-btn flex-none flex items-center gap-1.5 ${hasActiveItem ? 'is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="text-base leading-none">☰</span>
        <span className="text-sm font-medium">Menu</span>
        {hasActiveItem && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="menu-dropdown-popup absolute right-0 w-56 rounded-2xl overflow-hidden z-[200]"
          style={{
            background: 'black',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors"
              style={{ color: 'var(--text)' }}
              onClick={() => {
                onMenuAction(item.panel);
                setOpen(false);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--accent-soft)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = '';
              }}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  {item.badge}
                </span>
              )}
              {item.active && !item.badge && (
                <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopMenu({
  onShowAll,
  onMenuAction,
  showAll,
  categoryCount,
  categoryActive,
  progressActive,
  score,
}: TopMenuProps) {
  return (
    <div className="top-menu" aria-label="Top menu">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="mode-btn show-all-btn flex-none"
          onClick={onShowAll}
          type="button"
          aria-label={showAll ? 'Hide completed items' : 'Show all items'}
        >
          {showAll ? '🙉' : '🙈'}
        </button>
        {score !== undefined && (
          <ScoreBadge score={score} />
        )}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <MenuDropdown
          onMenuAction={onMenuAction}
          categoryActive={categoryActive}
          categoryCount={categoryCount}
          progressActive={progressActive}
        />
      </div>
    </div>
  );
}
