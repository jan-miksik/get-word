'use client';

import { useState } from 'react';
import type { DiffResult } from '@/features/lists/types';

type ExistingItem = {
  id: string;
  position: number;
  textKnown: string;
  textTarget: string | null;
};

interface DiffPreviewProps {
  diff: DiffResult;
  existingItems: ExistingItem[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onBack?: () => void;
}

export function DiffPreview({ diff, existingItems, onConfirm, onCancel, onBack }: DiffPreviewProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.reordered.length > 0;
  const orderedExistingItems = [...existingItems].sort((a, b) => a.position - b.position);

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text">Preview Changes</h2>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      {/* Summary */}
      <div className="p-3 rounded-lg bg-background-elevated border border-border-subtle mb-4 text-sm">
        <span className="text-done">{diff.added.length} added</span>
        <span className="mx-2 text-text-soft">·</span>
        <span className="text-danger">{diff.removed.length} removed</span>
        <span className="mx-2 text-text-soft">·</span>
        <span className="text-fresh">{diff.reordered.length} reordered</span>
        <span className="mx-2 text-text-soft">·</span>
        <span className="text-text-soft">{diff.unchanged} unchanged</span>
      </div>

      {diff.warning && (
        <div className="p-3 rounded-lg bg-fresh/10 border border-fresh/20 mb-4 text-sm text-fresh">
          {diff.warning}
        </div>
      )}

      {!hasChanges ? (
        <div className="space-y-3">
          <p className="text-text-soft text-sm">No changes detected. Current items:</p>
          {orderedExistingItems.length === 0 ? (
            <p className="text-text-soft text-sm py-6 text-center">This category is empty.</p>
          ) : (
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              {orderedExistingItems.map((item, index) => (
                <div
                  key={item.id}
                  className="px-3 py-2 border-b border-border-subtle last:border-0 bg-background-elevated"
                >
                  <div className="text-sm text-text">
                    <span className="text-text-soft mr-2">{index + 1}.</span>
                    {item.textKnown}
                  </div>
                  <div className="text-xs text-text-soft mt-0.5">
                    {item.textTarget || 'No translation yet'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Added */}
          {diff.added.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-done uppercase tracking-wide mb-2">
                Added ({diff.added.length})
              </h3>
              <div className="rounded-lg border border-done/20 overflow-hidden">
                {diff.added.map((text, i) => (
                  <div
                    key={i}
                    className="px-3 py-1.5 text-sm text-done bg-done/5 border-b border-done/10 last:border-0"
                  >
                    + {text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Removed */}
          {diff.removed.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-danger uppercase tracking-wide mb-2">
                Removed ({diff.removed.length})
              </h3>
              <div className="rounded-lg border border-danger/20 overflow-hidden">
                {diff.removed.map((item) => (
                  <div
                    key={item.id}
                    className="px-3 py-1.5 text-sm text-danger bg-danger/5 border-b border-danger/10 last:border-0"
                  >
                    - {item.text_known}
                    {item.text_target && (
                      <span className="text-danger/60 ml-2">({item.text_target})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reordered */}
          {diff.reordered.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-fresh uppercase tracking-wide mb-2">
                Reordered ({diff.reordered.length})
              </h3>
              <div className="rounded-lg border border-fresh/20 overflow-hidden">
                {diff.reordered.map((item) => (
                  <div
                    key={item.id}
                    className="px-3 py-1.5 text-sm text-fresh bg-fresh/5 border-b border-fresh/10 last:border-0 flex items-center gap-2"
                  >
                    <span className="truncate">{item.text}</span>
                    <span className="text-xs text-fresh/60 shrink-0">
                      {item.from_pos} → {item.to_pos}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-danger/10 text-danger text-sm">{error}</div>
      )}

      {/* Actions */}
      <div className="flex justify-between gap-2 mt-6 pt-4 border-t border-border-subtle">
        <button
          type="button"
          className="px-4 py-2 rounded-lg border border-border-subtle text-text text-sm hover:bg-background-elevated transition-colors"
          onClick={onBack ?? onCancel}
        >
          ← Back
        </button>
        <div className="flex gap-2">
        <button
          type="button"
          disabled={confirming}
          className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-medium disabled:opacity-50 hover:bg-accent-strong transition-colors"
          onClick={handleConfirm}
        >
          {confirming ? 'Confirming...' : hasChanges ? 'Confirm changes' : 'Continue'}
        </button>
        </div>
      </div>
    </div>
  );
}
