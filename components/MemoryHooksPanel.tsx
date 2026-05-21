'use client';

import { useI18n } from '@/components/I18nProvider';

interface MemoryHooksPanelProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function MemoryHooksPanel({ isOpen, onClose }: MemoryHooksPanelProps) {
  const { t } = useI18n();

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
          <h2 className="m-0 mb-4 text-[1.1rem] font-semibold text-text leading-[1.4]">{t('memory.title')}</h2>
        </div>
        <div className="text-[0.9rem] leading-relaxed text-text-soft">
          <p className="mb-3">
            {t('memory.intro')}
          </p>

          <p className="mb-3">
            <strong className="text-text font-semibold">{t('memory.effective')}</strong>
          </p>
          <ul className="my-2 mb-3 pl-6">
            <li className="mb-2">
              <strong className="text-text font-semibold">{t('memory.soundBased')}</strong> {t('memory.soundBasedDetail')}
            </li>
            <li className="mb-2">
              <strong className="text-text font-semibold">{t('memory.visual')}</strong> {t('memory.visualDetail')}
            </li>
            <li className="mb-2">
              <strong className="text-text font-semibold">{t('memory.personal')}</strong> {t('memory.personalDetail')}
            </li>
          </ul>

          <p className="mb-3">
            <strong className="text-text font-semibold">{t('memory.strategy')}</strong>
          </p>
          <ul className="my-2 mb-3 pl-6">
            <li className="mb-2">{t('memory.strategySound')}</li>
            <li className="mb-2">{t('memory.strategyVisual')}</li>
            <li className="mb-2">{t('memory.strategyContext')}</li>
          </ul>

          <p className="mb-3">{t('memory.fast')}</p>
          <p className="mb-3">{t('memory.modify')}</p>
          <p className="mb-0">
            <strong className="text-text font-semibold">{t('memory.goal')}</strong>
          </p>
        </div>
      </div>
      </div>
    </section>
  );
}
