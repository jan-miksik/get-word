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
      </span>
      {delta && (
        <span
          key={delta.key}
          className={`stat-chip-delta pointer-events-none ${
            delta.value > 0 ? 'text-emerald-700' : 'text-red-700'
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

interface ListSelectModalProps {
  lists: { id: string; name: string }[];
  activeListId: string | null | undefined;
  onListChange: (id: string | null) => void;
  onClose: () => void;
}

function ListSelectModal({ lists, activeListId, onListChange, onClose }: ListSelectModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="list-select-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('lists.selectWordListTitle')}
      onClick={onClose}
    >
      <div
        className="list-select-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="list-select-header">
          <h2 className="list-select-title">{t('lists.selectWordListTitle')}</h2>
          <button
            type="button"
            className="list-select-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="list-select-body" role="listbox">
          {lists.map((list) => {
            const active = list.id === activeListId;
            return (
              <button
                key={list.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`list-select-option${active ? ' is-active' : ''}`}
                onClick={() => {
                  onListChange(list.id);
                  onClose();
                }}
              >
                <span className="list-select-option-name">{shortenListName(list.name)}</span>
                {active && <span className="list-select-option-check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface MenuDropdownProps {
  onMenuAction: (panel: MenuPanel) => void;
  categoryActive: boolean;
  categoryCount: number;
  progressActive: boolean;
  /** When logged in, render account button at top of dropdown */
  accountSlot?: ReactNode;
  lists?: { id: string; name: string }[];
  activeListId?: string | null;
  onListChange?: (id: string | null) => void;
}

function MenuDropdown({
  onMenuAction,
  categoryActive,
  categoryCount,
  progressActive,
  accountSlot,
  lists,
  activeListId,
  onListChange,
}: MenuDropdownProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
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
  type ActionItem = { kind: 'action'; icon: ReactNode; label: string; onSelect: () => void; trailing?: string | null };
  type MenuItem = PanelItem | LinkItem | ActionItem;

  const hasLists = !!(lists && lists.length > 0 && onListChange);
  const activeList = hasLists ? lists!.find((l) => l.id === activeListId) ?? null : null;

  const items: MenuItem[] = [
    ...(hasLists
      ? [
          {
            kind: 'action' as const,
            icon: <WordListsIcon size={15} />,
            label: t('lists.selectWordList'),
            onSelect: () => {
              setListModalOpen(true);
            },
            trailing: activeList ? shortenListName(activeList.name) : null,
          },
        ]
      : []),
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
    <>
      <div className="relative top-menu-dropdown" ref={menuRef}>
        <button
          className={`mode-btn menu-toggle-btn flex-none flex items-center gap-1.5 !shadow-none ${hasActiveItem ? 'is-active' : ''}`}
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
            {items.map((item) => {
              if (item.kind === 'link') {
                return (
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
                );
              }
              if (item.kind === 'action') {
                return (
                  <button
                    key={item.label}
                    role="menuitem"
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      item.onSelect();
                      setOpen(false);
                    }}
                  >
                    <span className="menu-item-icon">{item.icon}</span>
                    <span className="flex-1 flex flex-col gap-0.5 min-w-0">
                      <span className="menu-item-label">{item.label}</span>
                      {item.trailing && (
                        <span className="menu-item-trailing">{item.trailing}</span>
                      )}
                    </span>
                  </button>
                );
              }
              return (
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
              );
            })}
            <PWAInstallMenuItem onClick={() => setOpen(false)} />
          </div>
        )}
      </div>
      {listModalOpen && hasLists && (
        <ListSelectModal
          lists={lists!}
          activeListId={activeListId}
          onListChange={onListChange!}
          onClose={() => setListModalOpen(false)}
        />
      )}
    </>
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
  return (
    <div className="top-menu" aria-label="Top menu">
      <div className="top-menu-left flex items-center gap-2 min-w-0">
        <div className="top-menu-stats">
          {score !== undefined && <ScoreBadge score={score} />}
          {centerContent}
        </div>
      </div>
      <div className="top-menu-center flex items-center justify-center min-w-0 flex-1 gap-1" />
      <div className="top-menu-right flex items-center gap-2 ml-auto">
        <MenuDropdown
          onMenuAction={onMenuAction}
          categoryActive={categoryActive}
          categoryCount={categoryCount}
          progressActive={progressActive}
          accountSlot={accountSlot}
          lists={lists}
          activeListId={activeListId}
          onListChange={onListChange}
        />
      </div>
    </div>
  );
}
