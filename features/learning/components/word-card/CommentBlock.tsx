'use client';

import { memo, useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { StudyNoteIcon } from '@/components/icons/AppIcons';
import {
  hashCommentText,
  type WordItemComment,
  type WordItemCommentMention,
} from '@/lib/word-item-comment';

interface CommentBlockProps {
  comment: WordItemComment;
  listId?: string;
  itemId: string;
  /** Default-minimized (collapsed) based on the card's SRS stage + setting. */
  defaultMinimized: boolean;
}

type CollapseOverride = {
  collapsed: boolean;
  commentTextHash: string;
  defaultCollapsed: boolean;
};

function storageKey(listId: string | undefined, itemId: string): string {
  // Never key by source text — duplicates / edited translations would collide.
  return `commentCollapsed:${listId ?? 'nolist'}:${itemId}`;
}

function readOverride(
  listId: string | undefined,
  itemId: string,
  textHash: string,
  defaultCollapsed: boolean,
): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(listId, itemId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CollapseOverride;
    // When the comment text changes, the hash no longer matches → discard the
    // override so a freshly edited note isn't hidden by a stale collapse.
    if (parsed.commentTextHash !== textHash) return null;
    // If stage/settings change the default state, let the setting win again.
    if (parsed.defaultCollapsed !== defaultCollapsed) return null;
    return typeof parsed.collapsed === 'boolean' ? parsed.collapsed : null;
  } catch {
    return null;
  }
}

function writeOverride(
  listId: string | undefined,
  itemId: string,
  collapsed: boolean,
  textHash: string,
  defaultCollapsed: boolean,
): void {
  if (typeof window === 'undefined') return;
  try {
    const value: CollapseOverride = { collapsed, commentTextHash: textHash, defaultCollapsed };
    window.localStorage.setItem(storageKey(listId, itemId), JSON.stringify(value));
  } catch {
    // Storage unavailable (privacy mode) — fall back to in-memory only.
  }
}

/** Ascending 3-segment signal bars (▁▃▅) filled by frequency 1–3. */
function FrequencyBars({ frequency }: { frequency: 1 | 2 | 3 }) {
  const heights = ['h-1', 'h-1.5', 'h-2.5'];
  return (
    <span className="inline-flex items-end gap-px" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${h} ${
            i < frequency ? 'bg-[#2A2218]' : 'bg-[#2A2218]/25'
          }`}
        />
      ))}
    </span>
  );
}

function MentionChip({ mention }: { mention: WordItemCommentMention }) {
  const { t } = useI18n();
  const label =
    mention.frequency === 3
      ? t('card.studyNoteFrequencyCommon')
      : mention.frequency === 2
        ? t('card.studyNoteFrequencyOccasional')
        : t('card.studyNoteFrequencyRare');
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#2A2218]/30 bg-[#2A2218]/[0.04] px-2 py-0.5 text-[0.72rem] text-[#2A2218]"
      title={label}
      aria-label={`${mention.word}: ${label}`}
    >
      <span className="font-medium">{mention.word}</span>
      <FrequencyBars frequency={mention.frequency} />
    </span>
  );
}

export const CommentBlock = memo(function CommentBlock({
  comment,
  listId,
  itemId,
  defaultMinimized,
}: CommentBlockProps) {
  const { t } = useI18n();
  const textHash = useMemo(() => hashCommentText(comment.text), [comment.text]);

  // Local manual collapse/expand override takes precedence over the stage-based
  // default. Discarded automatically when the comment text changes (hash miss),
  // so a freshly edited note isn't hidden by a stale collapse of the old text.
  const [override, setOverride] = useState<boolean | null>(() =>
    readOverride(listId, itemId, textHash, defaultMinimized),
  );
  // Re-seed the override during render (not in an effect) when the item or comment
  // text changes — card recycled in the virtualized list, or the note was edited.
  // This is React's "adjust state when a prop changes" pattern, which avoids the
  // extra render + effect of syncing via useEffect.
  const [seed, setSeed] = useState({ listId, itemId, textHash, defaultMinimized });
  if (
    seed.listId !== listId ||
    seed.itemId !== itemId ||
    seed.textHash !== textHash ||
    seed.defaultMinimized !== defaultMinimized
  ) {
    setSeed({ listId, itemId, textHash, defaultMinimized });
    setOverride(readOverride(listId, itemId, textHash, defaultMinimized));
  }

  const minimized = override ?? defaultMinimized;

  const setMinimized = (next: boolean) => {
    setOverride(next);
    writeOverride(listId, itemId, next, textHash, defaultMinimized);
  };

  if (minimized) {
    return (
      <div className="study-note-shell study-note-shell--minimized mt-1 mb-1">
        <button
          type="button"
          className="study-note-chip inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#2A2218]/70 bg-[#F4EFE2] text-[#2A2218] shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:bg-[#2A2218]/5"
          onClick={() => setMinimized(false)}
          aria-label={t('card.studyNoteExpand')}
          title={t('card.studyNoteExpand')}
        >
          <StudyNoteIcon size={22} />
        </button>
      </div>
    );
  }

  return (
    <div className="study-note-shell mt-1 mb-1">
      <button
        type="button"
        className="study-note rounded-lg border border-[#2A2218]/70 bg-[#F4EFE2] px-3 py-2 text-left text-[#2A2218] shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:bg-[#2A2218]/5"
        onClick={() => setMinimized(true)}
        aria-label={t('card.studyNoteCollapse')}
        title={t('card.studyNoteCollapse')}
      >
        <div className="study-note-copy flex items-start gap-2.5 text-[0.82rem] leading-snug text-[#2A2218]">
          <StudyNoteIcon size={22} className="study-note-copy-icon shrink-0" />
          <p className="m-0">
            {comment.text}
          </p>
        </div>
        {comment.mentions && comment.mentions.length > 0 && (
          <div className="study-note-mentions mt-1.5 flex flex-wrap gap-1.5">
            {comment.mentions.map((mention, i) => (
              <MentionChip key={`${mention.word}-${i}`} mention={mention} />
            ))}
          </div>
        )}
      </button>
    </div>
  );
});
