'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReviewItem } from '../types';

export type ReviewItemsUpdate =
  | ReviewItem[]
  | ((current: ReviewItem[]) => ReviewItem[]);

/**
 * React state with a synchronous mirror for async workflows.
 *
 * Save waits for background audio and must then read the rows those jobs just
 * updated. A captured `useState` value is stale after that await; the ref is the
 * commit-time source of truth while still driving ordinary React rendering.
 */
export function useReviewItemState() {
  const [reviewItems, setReviewItemsState] = useState<ReviewItem[]>([]);
  const reviewItemsRef = useRef<ReviewItem[]>([]);
  const setReviewItems = useCallback((update: ReviewItemsUpdate) => {
    const next = typeof update === 'function' ? update(reviewItemsRef.current) : update;
    reviewItemsRef.current = next;
    setReviewItemsState(next);
  }, []);

  return { reviewItems, reviewItemsRef, setReviewItems };
}
