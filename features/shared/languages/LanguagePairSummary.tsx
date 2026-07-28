'use client';

import { useI18n } from '@/components/I18nProvider';
import { getLanguageFlag, getLocalizedLanguageName } from '@/lib/i18n/languages';

type Props = {
  /** The language the learner already knows — the source side of the pair. */
  from: string;
  /** The language being studied — the target side of the pair. */
  to: string;
  /**
   * Given, the summary is a button that opens a picker and shows a pencil.
   * Omitted, it renders as a read-only badge — the pair is decided elsewhere.
   */
  onOpen?: () => void;
  className?: string;
};

/**
 * "I know X → I'm learning Y", as one badge.
 *
 * Shared between the Photo Lab picker and chat settings. Names are localized
 * into the interface language, not into either side of the pair.
 */
export function LanguagePairSummary({ from, to, onOpen, className = '' }: Props) {
  const { t, language: uiLanguage } = useI18n();

  const describe = (code: string, fallbackLabel: string) => {
    if (!code) return { flag: '🌐', name: fallbackLabel };
    return {
      flag: getLanguageFlag(code),
      name: getLocalizedLanguageName(code, uiLanguage) ?? code.toUpperCase(),
    };
  };
  const source = describe(from, t('photoLab.knownLanguage'));
  const target = describe(to, t('photoLab.targetLanguage'));

  const shell = [
    'flex max-w-full items-center gap-1 rounded-full border-2 border-[color:var(--ob-ink)]/60 bg-[#F4EFE2]/70 px-3.5 py-2 text-sm font-semibold text-[color:var(--ob-ink)] sm:gap-2',
    onOpen
      ? 'transition hover:-translate-y-0.5 hover:border-[color:var(--ob-ink)] hover:bg-[var(--ob-surface-hover)] hover:shadow-md hover:shadow-[#2A2218]/10'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span aria-hidden="true">{source.flag}</span>
      <span className={onOpen ? 'hidden truncate sm:inline' : 'truncate'}>{source.name}</span>
      <span aria-hidden="true" className="text-[color:var(--ob-ink-soft)]">
        →
      </span>
      <span aria-hidden="true">{target.flag}</span>
      <span className={onOpen ? 'hidden truncate sm:inline' : 'truncate'}>{target.name}</span>
      {onOpen ? (
        <span aria-hidden="true" className="text-xs text-[color:var(--ob-ink-soft)]">
          ✎
        </span>
      ) : null}
    </>
  );

  // The visible arrow reads as a pair to someone looking at it; a screen reader
  // needs the two roles spelled out.
  const spokenLabel = `${t('photoLab.knownLanguage')}: ${source.name}. ${t(
    'photoLab.targetLanguage',
  )}: ${target.name}.`;

  if (!onOpen) {
    return (
      <span className={shell} aria-label={spokenLabel} role="group">
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${spokenLabel} ${t('photoLab.changeLanguages')}`}
      title={t('photoLab.changeLanguages')}
      className={shell}
    >
      {body}
    </button>
  );
}
