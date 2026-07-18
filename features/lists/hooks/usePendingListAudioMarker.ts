'use client';

import { useEffect, useState } from 'react';
import {
  clearPendingCommonListAudio,
  readPendingCommonListAudio,
} from '@/features/learning/onboarding/pendingCommonListAudio';
import type { WordListItem } from '@/features/lists/types';

export function usePendingListAudioMarker({
  selectedListId,
  items,
}: {
  selectedListId: string | null;
  items: WordListItem[];
}) {
  const [pendingListId, setPendingListId] = useState<string | null>(
    () => readPendingCommonListAudio()?.listId ?? null,
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPendingListId(readPendingCommonListAudio()?.listId ?? null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectedListId]);

  useEffect(() => {
    if (!pendingListId || selectedListId !== pendingListId || items.length === 0) return;
    const hasAudio = (url: string | null | undefined, urls: string[] | undefined) =>
      Boolean(url) || Boolean(urls?.some(Boolean));
    const hasMissingAudio = items.some(
      (item) =>
        !hasAudio(item.knownAudioUrl, item.knownAudioArweaveUrls)
        || !hasAudio(item.audioUrl, item.audioArweaveUrls),
    );
    if (hasMissingAudio) return;
    clearPendingCommonListAudio(pendingListId);
    const timeoutId = window.setTimeout(() => setPendingListId(null), 0);
    return () => window.clearTimeout(timeoutId);
  }, [items, pendingListId, selectedListId]);

  return pendingListId;
}
