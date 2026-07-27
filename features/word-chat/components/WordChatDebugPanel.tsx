'use client';

import { useState } from 'react';
import type {
  WordChatDebugEntry,
  WordChatModelSettings,
} from '../hooks/useWordChat';

type ModelOverrides = {
  chat: string | null;
  proposal: string | null;
  translation: string | null;
};

type Props = {
  models: WordChatModelSettings | null;
  overrides: ModelOverrides;
  onOverridesChange: (next: ModelOverrides) => void;
  entries: WordChatDebugEntry[];
  busy: string | null;
};

const CALL_TYPES = [
  { key: 'chat', label: 'Chat turn' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'translation', label: 'Translation' },
] as const;

/**
 * Editor-only view of what this session is doing and what it costs.
 *
 * Everything here already exists elsewhere — `word_chat_usage` records spend,
 * the server logs errors — but neither answers "what is happening right now,
 * with which model, on which prompt", which is the question while tuning the
 * flow. Desktop only: it is a workbench, not a feature, and there is no room
 * for it beside a phone-width chat.
 */
export function WordChatDebugPanel({
  models,
  overrides,
  onOverridesChange,
  entries,
  busy,
}: Props) {
  const [open, setOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const totalCost = entries.reduce((sum, entry) => sum + entry.estimated_cost_usd, 0);
  const totalInput = entries.reduce((sum, entry) => sum + entry.input_tokens, 0);
  const totalOutput = entries.reduce((sum, entry) => sum + entry.output_tokens, 0);

  return (
    <div className="fixed bottom-4 right-4 z-[80] hidden w-[26rem] max-w-[90vw] lg:block">
      <div className="onboarding-card overflow-hidden rounded-xl text-[11px] shadow-lg">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-bold"
        >
          <span>
            AI debug · {entries.length} {entries.length === 1 ? 'call' : 'calls'} · $
            {totalCost.toFixed(6)}
          </span>
          <span className="onboarding-text-soft">
            {busy ? `${busy}…` : open ? '▾' : '▸'}
          </span>
        </button>

        {open ? (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto border-t-2 border-current/20 px-3 py-3">
            <div className="space-y-2">
              {CALL_TYPES.map((callType) => {
                const fallback = models?.defaults[callType.key] ?? '';
                return (
                  <label key={callType.key} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 font-bold">{callType.label}</span>
                    <select
                      value={overrides[callType.key] ?? fallback}
                      onChange={(event) =>
                        onOverridesChange({
                          ...overrides,
                          [callType.key]:
                            event.target.value === fallback ? null : event.target.value,
                        })
                      }
                      className="word-chat-input min-w-0 flex-1 rounded-md px-2 py-1"
                    >
                      {(models?.selectable ?? []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.id}
                          {model.id === fallback ? ' (default)' : ''} — $
                          {model.inputPricePerMillion}/${model.outputPricePerMillion} per M
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
              <p className="onboarding-text-soft">
                A change applies to the next call of that type. Prices are the estimate
                table in <code>server/config.ts</code>, not a billing source.
              </p>
            </div>

            <div className="onboarding-notice rounded-md px-2 py-1.5">
              {totalInput.toLocaleString()} in / {totalOutput.toLocaleString()} out tokens ·
              estimated ${totalCost.toFixed(6)} this session
            </div>

            {entries.length === 0 ? (
              <p className="onboarding-text-soft">No model calls yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {entries.map((entry, index) => (
                  <li key={`${entry.call_type}-${entry.at}-${index}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedIndex((current) => (current === index ? null : index))
                      }
                      className="onboarding-option w-full rounded-md px-2 py-1.5 text-left"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-bold">{entry.call_type}</span>
                        <span className="onboarding-text-soft">{entry.model}</span>
                        <span className="ml-auto">${entry.estimated_cost_usd.toFixed(6)}</span>
                      </span>
                      <span className="onboarding-text-soft block">
                        {entry.input_tokens} in / {entry.output_tokens} out ·{' '}
                        {(entry.duration_ms / 1000).toFixed(1)}s ·{' '}
                        {new Date(entry.at).toLocaleTimeString()}
                      </span>
                    </button>

                    {expandedIndex === index ? (
                      <div className="mt-1 space-y-1.5">
                        {entry.request ? (
                          entry.request.messages.map((message, messageIndex) => (
                            <div key={`${message.role}-${messageIndex}`}>
                              <p className="font-bold">{message.role}</p>
                              <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/5 p-2 text-[10px] leading-snug">
                                {message.content}
                              </pre>
                            </div>
                          ))
                        ) : (
                          <p className="onboarding-text-soft">
                            No request captured for this call.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
