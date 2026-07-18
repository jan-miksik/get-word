'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import type { MenuPanel } from '@/hooks/useMenuPanels';
import { PWAInstallMenuItem } from '@/components/PWAInstallMenuItem';
import { useI18n } from '@/components/I18nProvider';
import { SUPPORT_TELEGRAM_URL } from '@/components/SupportButton';
import {
  CategoryIcon,
  MemoryIcon,
  MenuIcon,
  SettingsIcon,
  StarIcon,
  TuneIcon,
  UpcomingIcon,
  WordListsIcon,
} from '@/components/icons/AppIcons';

interface TopMenuProps {
  onShowAll: () => void;
  onMenuAction: (panel: MenuPanel) => void;
  showAll: boolean;
  categoryCount: number;
  categoryActive: boolean;
  score?: number;
  /** Rendered in center of bar (e.g. repeat count or Sign in button) */
  centerContent?: ReactNode;
  /** When logged in, rendered at top of menu dropdown */
  accountSlot?: ReactNode;
  /** Hide the monkey button in the top bar on mobile (card view shows it on the card) */
  hideMonkeyOnMobile?: boolean;
  lists?: { id: string; name: string; audioIncomplete?: boolean }[];
  activeListId?: string | null;
  onListChange?: (id: string | null) => void;
  /** Language pair of the active list, used to suggest other lists to switch to. */
  activeListLanguagePair?: { from: string; to: string } | null;
}

function shortenListName(name: string): string {
  return name
    .replace(/^Default\s+/i, '')
    .replace(/Vietnamese[–\-\s]*Czech/i, 'vi - cz')
    .replace(/Czech[–\-\s]*Vietnamese/i, 'cz - vi');
}

function BetaBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-[#2A2218]/70 bg-[#F4EFE2] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#2A2218] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      aria-label="Beta version"
      title="Beta version"
    >
      Beta
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const { t } = useI18n();
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
      aria-label={t('score.aria', { score })}
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

function TelegramIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}

interface ListSelectModalProps {
  lists: { id: string; name: string; audioIncomplete?: boolean }[];
  activeListId: string | null | undefined;
  onListChange: (id: string | null) => void;
  onClose: () => void;
  languagePair?: { from: string; to: string } | null;
}

type SuggestedList = { id: string; name: string; itemCount?: number };

function ListSelectModal({
  lists,
  activeListId,
  onListChange,
  onClose,
  languagePair,
}: ListSelectModalProps) {
  const { t } = useI18n();
  const [suggested, setSuggested] = useState<SuggestedList[]>([]);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Suggest other lists for the same language pair so a wrong pick during
  // onboarding can be undone on mobile. Only list metadata is fetched here;
  // the list content is downloaded only once the user subscribes below.
  useEffect(() => {
    if (!languagePair) return;
    const controller = new AbortController();
    const subscribedIds = new Set(lists.map((list) => list.id));
    fetch(
      `/api/lists/matches?from=${encodeURIComponent(languagePair.from)}&to=${encodeURIComponent(languagePair.to)}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load matches'))))
      .then((data: { lists?: SuggestedList[]; recommendedList?: { id: string } | null }) => {
        const recommended = data.recommendedList?.id ?? null;
        const available = (Array.isArray(data.lists) ? data.lists : []).filter(
          (list) => !subscribedIds.has(list.id),
        );
        available.sort((a, b) => {
          if (a.id === recommended) return -1;
          if (b.id === recommended) return 1;
          return (b.itemCount ?? 0) - (a.itemCount ?? 0);
        });
        setRecommendedId(available.some((list) => list.id === recommended) ? recommended : null);
        setSuggested(available);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSuggested([]);
        setRecommendedId(null);
      });
    return () => controller.abort();
  }, [languagePair, lists]);

  async function subscribeAndSwitch(id: string) {
    if (subscribingId) return;
    setSubscribingId(id);
    try {
      const res = await fetch(`/api/lists/${id}/subscribe`, { method: 'POST' });
      if (!res.ok && res.status !== 409) throw new Error('Subscribe failed');
      onListChange(id);
      window.location.reload();
    } catch {
      setSubscribingId(null);
    }
  }

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
            aria-label={t('common.close')}
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
                {list.audioIncomplete && (
                  <span className="list-select-option-badge">{t('lists.badgeAudioMissing')}</span>
                )}
                {active && <span className="list-select-option-check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
          {suggested.length > 0 && (
            <div className="list-select-suggested">
              <h3 className="list-select-suggested-title">{t('lists.suggestedHeading')}</h3>
              {suggested.map((list) => {
                const adding = subscribingId === list.id;
                return (
                  <button
                    key={list.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="list-select-option list-select-option--suggested"
                    disabled={!!subscribingId}
                    onClick={() => subscribeAndSwitch(list.id)}
                  >
                    <span className="list-select-option-name">
                      {shortenListName(list.name)}
                      {list.id === recommendedId && (
                        <span className="list-select-option-badge">{t('lists.badgeRecommended')}</span>
                      )}
                    </span>
                    {adding && (
                      <span className="list-select-option-check" aria-hidden="true">
                        {t('lists.addingList')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="list-select-footer">
          <button
            type="button"
            className="list-select-add"
            onClick={() => {
              // Reuse the language-onboarding screen as the "create a new list"
              // entry point: it picks the known/learning languages and then
              // routes into list selection/creation for that pair.
              window.location.assign('/?onboarding=1');
            }}
          >
            <span className="list-select-add-icon" aria-hidden="true">+</span>
            {t('lists.addNewWordList')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MenuDropdownProps {
  onMenuAction: (panel: MenuPanel) => void;
  categoryActive: boolean;
  categoryCount: number;
  /** When logged in, render account button at top of dropdown */
  accountSlot?: ReactNode;
  lists?: { id: string; name: string; audioIncomplete?: boolean }[];
  activeListId?: string | null;
  onListChange?: (id: string | null) => void;
  activeListLanguagePair?: { from: string; to: string } | null;
}

function MenuDropdown({
  onMenuAction,
  categoryActive,
  categoryCount,
  accountSlot,
  lists,
  activeListId,
  onListChange,
  activeListLanguagePair,
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
  type LinkItem = { kind: 'link'; icon: ReactNode; label: string; href: string; external?: boolean };
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
            trailing: activeList
              ? `${shortenListName(activeList.name)}${activeList.audioIncomplete ? ` · ${t('lists.badgeAudioMissing')}` : ''}`
              : null,
          },
        ]
      : []),
    {
      kind: 'panel',
      icon: <TuneIcon size={15} />,
      label: t('top.learningSettings'),
      panel: 'learning',
      active: false,
      badge: null,
    },
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
      icon: <UpcomingIcon size={15} />,
      label: t('top.upcoming'),
      panel: 'upcoming',
      active: false,
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
      kind: 'link',
      icon: <TelegramIcon size={15} />,
      label: t('support.chat'),
      href: SUPPORT_TELEGRAM_URL,
      external: true,
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

  const hasActiveItem = categoryActive;

  return (
    <>
      <div className="relative top-menu-dropdown" ref={menuRef}>
        <button
          className={`mode-btn menu-toggle-btn flex-none flex items-center gap-1.5 !shadow-none ${hasActiveItem ? 'is-active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          type="button"
          aria-label={t('menu.open')}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="menu-toggle-icon" aria-hidden="true">
            <MenuIcon size={16} />
          </span>
          <span className="menu-toggle-label text-sm font-medium">{t('menu.label')}</span>
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
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    role="menuitem"
                    className="menu-item word-lists-editor-item"
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
          languagePair={activeListLanguagePair}
        />
      )}
    </>
  );
}

export function TopMenu({
  onMenuAction,
  categoryCount,
  categoryActive,
  score,
  centerContent,
  accountSlot,
  lists,
  activeListId,
  onListChange,
  activeListLanguagePair,
}: TopMenuProps) {
  return (
    <div className="top-menu" aria-label="Top menu">
      <div className="top-menu-left flex flex-col items-start gap-1 min-w-0">
        <BetaBadge />
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
          accountSlot={accountSlot}
          lists={lists}
          activeListId={activeListId}
          onListChange={onListChange}
          activeListLanguagePair={activeListLanguagePair}
        />
      </div>
    </div>
  );
}
