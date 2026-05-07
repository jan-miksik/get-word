'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import type { MenuPanel } from '@/hooks/useMenuPanels';
import { PWAInstallMenuItem } from '@/components/PWAInstallMenuItem';
import { useI18n } from '@/components/I18nProvider';
import {
  CategoryIcon,
  MemoryIcon,
  MenuIcon,
  ProgressIcon,
  SettingsIcon,
  StarIcon,
  WordListsIcon,
} from '@/components/icons/AppIcons';

interface TopMenuProps {
  onShowAll: () => void;
  onMenuAction: (panel: MenuPanel) => void;
  showAll: boolean;
  categoryCount: number;
  categoryActive: boolean;
  progressActive: boolean;
  score?: number;
  /** Rendered in center of bar (e.g. "to repeat" count or Sign in button) */
  centerContent?: ReactNode;
  /** When logged in, rendered at top of menu dropdown */
  accountSlot?: ReactNode;
  /** Hide the monkey button in the top bar on mobile (card view shows it on the card) */
  hideMonkeyOnMobile?: boolean;
  lists?: { id: string; name: string }[];
  activeListId?: string | null;
  onListChange?: (id: string | null) => void;
}

function shortenListName(name: string): string {
  return name
    .replace(/^Default\s+/i, '')
    .replace(/Vietnamese[–\-\s]*Czech/i, 'vi - cz')
    .replace(/Czech[–\-\s]*Vietnamese/i, 'cz - vi');
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
      className="stat-chip stat-chip--score relative"
      aria-label={`Game score: ${score}`}
    >
      <span className="stat-chip-icon stat-chip-icon--score">
        <StarIcon size={14} />
      </span>
      <span className="stat-chip-copy">
        <span className="stat-chip-value">{score}</span>
        <span className="stat-chip-label">stars</span>
      </span>
      {delta && (
        <span
          key={delta.key}
          className={`stat-chip-delta pointer-events-none ${
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
  /** When logged in, render account button at top of dropdown */
  accountSlot?: ReactNode;
}

function MenuDropdown({
  onMenuAction,
  categoryActive,
  categoryCount,
  progressActive,
  accountSlot,
}: MenuDropdownProps) {
  const { t } = useI18n();
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

  type PanelItem = { kind: 'panel'; icon: ReactNode; label: string; panel: MenuPanel; active: boolean; badge: string | null };
  type LinkItem = { kind: 'link'; icon: ReactNode; label: string; href: string };
  type MenuItem = PanelItem | LinkItem;

  const items: MenuItem[] = [
    {
      kind: 'panel',
      icon: <CategoryIcon size={15} />,
      label: t('top.categories'),
      panel: 'category',
      active: categoryActive,
      badge: categoryCount > 0 ? String(categoryCount) : null,
    },
    {
      kind: 'panel',
      icon: <ProgressIcon size={15} />,
      label: t('top.progress'),
      panel: 'progress',
      active: progressActive,
      badge: null,
    },
    {
      kind: 'panel',
      icon: <MemoryIcon size={15} />,
      label: t('top.memory'),
      panel: 'memoryHooks',
      active: false,
      badge: null,
    },
    {
      kind: 'link',
      icon: <WordListsIcon size={15} />,
      label: t('lists.wordLists'),
      href: '/lists',
    },
    {
      kind: 'panel',
      icon: <SettingsIcon size={15} />,
      label: t('top.settings'),
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
        <span className="menu-toggle-icon" aria-hidden="true">
          <MenuIcon size={16} />
        </span>
        <span className="menu-toggle-label text-sm font-medium">Menu</span>
        {hasActiveItem && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="menu-dropdown-popup absolute right-0 z-[200]"
        >
          {accountSlot != null && (
            <div className="menu-dropdown-account">
              {accountSlot}
            </div>
          )}
          {items.map((item) =>
            item.kind === 'link' ? (
              <a
                key={item.label}
                href={item.href}
                role="menuitem"
                className="menu-item"
                onClick={() => setOpen(false)}
              >
                <span className="menu-item-icon">{item.icon}</span>
                <span className="menu-item-label">{item.label}</span>
              </a>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                className="menu-item"
                onClick={() => {
                  onMenuAction(item.panel);
                  setOpen(false);
                }}
              >
                <span className="menu-item-icon">{item.icon}</span>
                <span className="menu-item-label">{item.label}</span>
                {item.badge && (
                  <span className="menu-item-badge">{item.badge}</span>
                )}
                {item.active && !item.badge && (
                  <span className="menu-item-active-dot" />
                )}
              </button>
            )
          )}
          <PWAInstallMenuItem onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function ListSelector({
  lists,
  activeListId,
  onListChange,
}: {
  lists: { id: string; name: string }[];
  activeListId: string | null | undefined;
  onListChange: (id: string | null) => void;
}) {
  const selectedList = lists.find((list) => list.id === activeListId) ?? lists[0] ?? null;
  const selectedLabel = selectedList ? shortenListName(selectedList.name) : '';

  return (
    <div className="list-selector-pill">
      <span className="list-selector-measure" aria-hidden="true">
        {selectedLabel}
      </span>
      <select
        value={activeListId ?? lists[0]?.id ?? ''}
        onChange={(e) => onListChange(e.target.value || null)}
        aria-label="Select word list"
      >
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {shortenListName(list.name)}
          </option>
        ))}
      </select>
      <svg
        className="list-selector-chevron"
        width="10"
        height="6"
        viewBox="0 0 10 6"
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
  centerContent,
  accountSlot,
  lists,
  activeListId,
  onListChange,
}: TopMenuProps) {
  const showListSelector = lists && lists.length > 0 && onListChange;

  return (
    <div className="top-menu" aria-label="Top menu">
      <div className="top-menu-left flex items-center gap-2">
        {showListSelector && (
          <ListSelector
            lists={lists}
            activeListId={activeListId}
            onListChange={onListChange}
          />
        )}
      </div>
      <div className="top-menu-center flex items-center justify-center min-w-0 flex-1 gap-1">
        <div className="top-menu-stats">
          {score !== undefined && <ScoreBadge score={score} />}
          {centerContent}
        </div>
      </div>
      <div className="top-menu-right flex items-center gap-2 ml-auto">
        <MenuDropdown
          onMenuAction={onMenuAction}
          categoryActive={categoryActive}
          categoryCount={categoryCount}
          progressActive={progressActive}
          accountSlot={accountSlot}
        />
      </div>
    </div>
  );
}
