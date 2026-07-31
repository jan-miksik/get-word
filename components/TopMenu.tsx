'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import type { MenuPanel } from '@/hooks/useMenuPanels';
import type { SchoolMembership } from '@/features/auth/client/useAuth';
import { PWAInstallMenuItem } from '@/components/PWAInstallMenuItem';
import { useI18n } from '@/components/I18nProvider';
import { SUPPORT_TELEGRAM_URL } from '@/components/SupportButton';
import {
  CategoryIcon,
  MenuIcon,
  PhotoLabIcon,
  SchoolIcon,
  SettingsIcon,
  StarIcon,
  StudyIcon,
  TuneIcon,
  UpcomingIcon,
  WordChatIcon,
  WordListsIcon,
} from '@/components/icons/AppIcons';
import type { AppSurface } from '@/features/workspace/surface-history';
import { apiFetch } from '@/features/shared/http/api-runtime';

const STUDY_SURFACE_HREF = '/';
const CHAT_SURFACE_HREF = '/?surface=chat';
const PHOTO_SURFACE_HREF = '/?surface=photo';

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
  /** When the photo-lab beta is enabled, surface it as a main-menu destination. */
  photoLabEnabled?: boolean;
  /** Active school membership; drives the school row and the teacher dashboard link. */
  school?: SchoolMembership | null;
  /** Opens the word chat in place. Falls back to a full page load when absent. */
  onOpenWordChat?: () => void;
  /** Opens photo lab in place. Falls back to the `/photo-lab` route when absent. */
  onOpenPhotoLab?: () => void;
  /** Mirrors the two word-input paths as icons in the centre of the bar. */
  quickAddEnabled?: boolean;
  /** Active workspace destination, used for persistent navigation state. */
  activeSurface?: AppSurface;
  /** Switches workspace content while keeping the app shell mounted. */
  onSurfaceChange?: (surface: AppSurface) => void;
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

// Deliberately quieter than the menu button next to them: bare glyphs, no
// chrome at all, soft ink. The generous box is touch target only — it stays
// invisible until hover. The `--tm-*` vars are scoped to `.top-menu`.
const QUICK_ADD_BUTTON_CLASS =
  'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-surface)] hover:text-[var(--tm-ink)]';
const QUICK_ADD_BUTTON_ACTIVE_CLASS =
  '!bg-[var(--tm-accent)] !text-[var(--tm-surface)] shadow-[0_2px_0_rgba(42,34,24,0.18)]';

interface SurfaceNavLinkProps {
  href: string;
  surface: AppSurface;
  activeSurface: AppSurface;
  label: string;
  /** Fallback when the host cannot swap surfaces in place; absent for study,
      whose href already lands on the study view. */
  onOpen?: () => void;
  onSurfaceChange?: (surface: AppSurface) => void;
  children: ReactNode;
}

function SurfaceNavLink({
  href,
  surface,
  activeSurface,
  label,
  onOpen,
  onSurfaceChange,
  children,
}: SurfaceNavLinkProps) {
  const current = activeSurface === surface;
  return (
    <a
      href={href}
      className={`${QUICK_ADD_BUTTON_CLASS} ${current ? QUICK_ADD_BUTTON_ACTIVE_CLASS : ''}`}
      aria-current={current ? 'page' : undefined}
      aria-label={label}
      title={label}
      onClick={(event) => {
        if (!onSurfaceChange && !onOpen) return;
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (current) return;
        if (onSurfaceChange) onSurfaceChange(surface);
        else onOpen?.();
      }}
    >
      {children}
    </a>
  );
}

interface QuickAddButtonsProps {
  photoLabEnabled?: boolean;
  onOpenWordChat?: () => void;
  onOpenPhotoLab?: () => void;
  activeSurface: AppSurface;
  onSurfaceChange?: (surface: AppSurface) => void;
}

/**
 * The app's surfaces as icons: studying itself, plus the two ways new words get
 * into it. Study leads because a learner who wandered into the chat or the
 * photo lab needs the way back to be as obvious as the way in — the Back button
 * inside those screens is the only other route. Behind a settings toggle while
 * we decide whether the top bar is where they belong.
 */
function SurfaceNavButtons({
  photoLabEnabled,
  onOpenWordChat,
  onOpenPhotoLab,
  activeSurface,
  onSurfaceChange,
}: QuickAddButtonsProps) {
  const { t } = useI18n();

  return (
    <nav className="flex items-center gap-1.5" aria-label={t('top.surfaceNavLabel')}>
      <SurfaceNavLink
        href={STUDY_SURFACE_HREF}
        surface="study"
        activeSurface={activeSurface}
        label={t('top.surfaceStudy')}
        onSurfaceChange={onSurfaceChange}
      >
        <StudyIcon size={25} />
      </SurfaceNavLink>
      <SurfaceNavLink
        href={CHAT_SURFACE_HREF}
        surface="chat"
        activeSurface={activeSurface}
        label={t('top.quickAddChat')}
        onOpen={onOpenWordChat}
        onSurfaceChange={onSurfaceChange}
      >
        <WordChatIcon size={25} />
      </SurfaceNavLink>
      {photoLabEnabled && (
        <SurfaceNavLink
          href={PHOTO_SURFACE_HREF}
          surface="photo"
          activeSurface={activeSurface}
          label={t('top.quickAddPhoto')}
          onOpen={onOpenPhotoLab}
          onSurfaceChange={onSurfaceChange}
        >
          <PhotoLabIcon size={25} />
        </SurfaceNavLink>
      )}
    </nav>
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
    apiFetch(
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
      const res = await apiFetch(`/api/lists/${id}/subscribe`, { method: 'POST' });
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
  photoLabEnabled?: boolean;
  school?: SchoolMembership | null;
  onOpenWordChat?: () => void;
  onOpenPhotoLab?: () => void;
  activeSurface: AppSurface;
  onSurfaceChange?: (surface: AppSurface) => void;
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
  photoLabEnabled,
  school,
  onOpenWordChat,
  onOpenPhotoLab,
  activeSurface,
  onSurfaceChange,
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
  type SurfaceItem = {
    kind: 'surface';
    icon: ReactNode;
    label: string;
    href: string;
    surface: AppSurface;
    onSelect: () => void;
  };
  type MenuItem = PanelItem | LinkItem | ActionItem | SurfaceItem;

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
      kind: 'surface',
      icon: <WordListsIcon size={15} />,
      label: t('wordChat.addWords'),
      href: CHAT_SURFACE_HREF,
      surface: 'chat',
      onSelect: () => {
        if (onSurfaceChange) onSurfaceChange('chat');
        else if (onOpenWordChat) onOpenWordChat();
        else window.location.assign(CHAT_SURFACE_HREF);
      },
    },
    {
      kind: 'panel',
      icon: <TuneIcon size={15} />,
      label: t('top.learningSettings'),
      panel: 'learning',
      active: false,
      badge: null,
    },
    ...(photoLabEnabled
      ? [
          {
            kind: 'surface' as const,
            icon: <PhotoLabIcon size={15} />,
            label: t('top.photoLab'),
            href: PHOTO_SURFACE_HREF,
            surface: 'photo' as const,
            onSelect: () => {
              if (onSurfaceChange) onSurfaceChange('photo');
              else if (onOpenPhotoLab) onOpenPhotoLab();
              else window.location.assign(PHOTO_SURFACE_HREF);
            },
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
      icon: <UpcomingIcon size={15} />,
      label: t('top.upcoming'),
      panel: 'upcoming',
      active: false,
      badge: null,
    },
    {
      kind: 'link',
      icon: <WordListsIcon size={15} />,
      label: t('lists.wordLists'),
      href: '/lists',
    },
    ...(school?.role === 'teacher'
      ? [
          {
            kind: 'link' as const,
            icon: <SchoolIcon size={15} />,
            label: t('top.schoolOverview'),
            href: '/school/overview',
          },
        ]
      : []),
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
            {school && (
              <div className="menu-dropdown-school" role="presentation">
                <span className="menu-item-icon"><SchoolIcon size={15} /></span>
                <span className="menu-item-label">
                  {t(
                    school.role === 'teacher'
                      ? 'top.schoolMemberTeacher'
                      : 'top.schoolMemberStudent',
                    { school: school.name },
                  )}
                </span>
              </div>
            )}
            {items.map((item) => {
              if (item.kind === 'surface') {
                const current = item.surface === activeSurface;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    aria-current={current ? 'page' : undefined}
                    className={`menu-item${current ? ' is-active' : ''}`}
                    onClick={(event) => {
                      if (event.defaultPrevented || event.button !== 0) return;
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      if (!current) item.onSelect();
                      setOpen(false);
                    }}
                  >
                    <span className="menu-item-icon">{item.icon}</span>
                    <span className="menu-item-label">{item.label}</span>
                    {current ? <span className="menu-item-active-dot" /> : null}
                  </a>
                );
              }
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
  photoLabEnabled,
  school,
  onOpenWordChat,
  onOpenPhotoLab,
  quickAddEnabled = true,
  activeSurface = 'study',
  onSurfaceChange,
}: TopMenuProps) {
  return (
    <div
      className={`top-menu${quickAddEnabled ? ' top-menu--quick-add' : ''}`}
      aria-label="Top menu"
    >
      {/* The stats block is `flex-shrink: 0` by default and eats the whole bar
          on a narrow phone. When the shortcuts are on it has to give way — the
          score/due chips wrap instead, which is the cheaper loss. */}
      <div
        className={`top-menu-left flex flex-col items-start gap-1 min-w-0 ${
          quickAddEnabled ? '!shrink' : ''
        }`}
      >
        <BetaBadge />
        <div className="top-menu-stats">
          {score !== undefined && <ScoreBadge score={score} />}
          {centerContent}
        </div>
      </div>
      {/* Empty by default, so the CSS lets it collapse to nothing. With buttons
          in it, `min-width: 0` would starve them into the `overflow: hidden`
          clip on a narrow phone — a content floor keeps them whole and still
          lets the slot grow to centre them when the bar has room. */}
      <div className={`top-menu-center ${quickAddEnabled ? 'top-menu-center--quick-add' : ''}`}>
        {quickAddEnabled && (
          <SurfaceNavButtons
            photoLabEnabled={photoLabEnabled}
            onOpenWordChat={onOpenWordChat}
            onOpenPhotoLab={onOpenPhotoLab}
            activeSurface={activeSurface}
            onSurfaceChange={onSurfaceChange}
          />
        )}
      </div>
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
          photoLabEnabled={photoLabEnabled}
          school={school}
          onOpenWordChat={onOpenWordChat}
          onOpenPhotoLab={onOpenPhotoLab}
          activeSurface={activeSurface}
          onSurfaceChange={onSurfaceChange}
        />
      </div>
    </div>
  );
}
