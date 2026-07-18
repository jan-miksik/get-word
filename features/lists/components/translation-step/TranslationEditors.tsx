'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_ACCEPTED_ANSWER_LENGTH,
  MAX_ACCEPTED_ANSWERS,
} from '@/lib/word-item-accepted-answers';
import { mergeAcceptedAnswers } from './transformations';

export function AcceptedAnswersEditor({
  values,
  primary,
  label,
  onChange,
}: {
  values: string[];
  primary: string;
  label: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const addDraft = useCallback((raw: string) => {
    onChange(mergeAcceptedAnswers(values, raw.split(/\r?\n/), primary));
    setDraft('');
  }, [onChange, primary, values]);

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((value, index) => (
          <span key={`${value}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-md bg-background-elevated px-1.5 py-0.5 text-[11px] text-text">
            <span className="min-w-0 truncate">{value}</span>
            <button type="button" className="text-text-soft hover:text-danger" aria-label={`${label}: ${value}`} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          maxLength={MAX_ACCEPTED_ANSWER_LENGTH}
          disabled={values.length >= MAX_ACCEPTED_ANSWERS}
          aria-label={label}
          placeholder={label}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (text.includes('\n')) {
              event.preventDefault();
              addDraft(text);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addDraft(draft);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraft('');
            }
          }}
          onBlur={() => {
            if (draft.trim()) addDraft(draft);
          }}
          className="min-w-36 flex-1 rounded-md border border-border-subtle bg-background px-2 py-1 text-[11px] text-text outline-none placeholder:text-text-soft/60 focus:border-accent disabled:opacity-40"
        />
      </div>
    </div>
  );
}

export function TranslationTextarea({
  value,
  onChange,
  ariaLabel,
  placeholder,
  maxLength,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeToContent = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (textareaRef.current) resizeToContent(textareaRef.current);
  }, [resizeToContent, value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        resizeToContent(event.currentTarget);
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      onFocus={onFocus}
      onBlur={onBlur}
      rows={1}
      className="block min-h-7 w-full cursor-text select-text resize-none overflow-hidden bg-transparent text-sm leading-relaxed text-text focus:outline-none placeholder:text-text-soft/50"
      spellCheck={false}
    />
  );
}
