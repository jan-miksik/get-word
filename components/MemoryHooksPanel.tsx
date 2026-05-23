'use client';

import { useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { getMemoryHooksLearnMoreCopy } from '@/features/learning/components/memoryHooksCopy';

interface MemoryHooksPanelProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function MemoryHooksPanel({ isOpen, onClose }: MemoryHooksPanelProps) {
  const { t, language } = useI18n();
  const copy = useMemo(() => getMemoryHooksLearnMoreCopy(language), [language]);

  return (
    <section
      className={`memory-hooks-panel ${isOpen ? 'is-open fixed inset-0' : ''}`}
      aria-label={t('memory.aria')}
      onClick={(e) => e.stopPropagation()}
    >
      {isOpen && onClose && (
        <div
          className="panel-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}
      <div className="panel-content">
      <div className="p-5">
        <div className="relative">
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-0 right-0 bg-transparent border-none text-xl text-text-soft cursor-pointer p-1 leading-none flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-background-elevated hover:text-text"
              aria-label={t('memory.close')}
            >
              ×
            </button>
          )}
          <h2 className="m-0 mb-4 text-[1.1rem] font-semibold text-text leading-[1.4]">
            {copy.title}
          </h2>
        </div>
        <div className="text-[0.9rem] leading-relaxed text-text-soft">
          {copy.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mb-3">
              {paragraph}
            </p>
          ))}
          <ul className="my-2 mb-3 pl-6">
            {copy.bulletItems.map((item) => (
              <li key={item} className="mb-2">
                {item}
              </li>
            ))}
          </ul>
          <p className="mb-3">{copy.example}</p>
          <p className="mb-3">{copy.temporary}</p>
          <p className="mb-0">{copy.outro}</p>
        </div>
      </div>
      </div>
    </section>
  );
}
