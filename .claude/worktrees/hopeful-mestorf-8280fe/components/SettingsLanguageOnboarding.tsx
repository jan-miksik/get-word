'use client';

import { useEffect, useMemo, useState } from 'react';
import { syncUserData } from '@/lib/sync';
import {
  COMMON_LANGUAGES,
  findBestSupportedLanguage,
  getBrowserLanguageCandidates,
  mergeLanguages,
  normalizeLanguageCode,
  type SupportedLanguage,
} from '@/lib/i18n/languages';
import { useAppStateContext } from '@/context/AppStateContext';
import { useI18n } from '@/components/I18nProvider';

const FLAG_EMOJIS: Record<string, string> = {
  en: '🇬🇧', cs: '🇨🇿', vi: '🇻🇳', de: '🇩🇪', es: '🇪🇸',
  fr: '🇫🇷', it: '🇮🇹', pl: '🇵🇱', pt: '🇵🇹', uk: '🇺🇦',
  ru: '🇷🇺', ja: '🇯🇵', ko: '🇰🇷', 'zh-cn': '🇨🇳', ar: '🇸🇦',
};

const FEATURED_CODES = ['cs', 'vi', 'en'];

const SCATTER_MT_CLASSES = [
  'mt-0', 'mt-3', 'mt-1', 'mt-4', 'mt-2', 'mt-0', 'mt-3', 'mt-1',
];

function matchesQuery(lang: SupportedLanguage, query: string): boolean {
  const q = query.trim().toLowerCase();
  return lang.name.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q);
}

export function SettingsLanguageOnboarding() {
  const { t } = useI18n();
  const { settingsLanguage, setSettingsLanguage } = useAppStateContext();
  const [query, setQuery] = useState('');
  const [languages, setLanguages] = useState<SupportedLanguage[]>(COMMON_LANGUAGES);
  const [selected, setSelected] = useState(settingsLanguage);

  const browserSuggestion = useMemo(
    () => findBestSupportedLanguage(getBrowserLanguageCandidates(), COMMON_LANGUAGES),
    [],
  );

  useEffect(() => {
    setSelected(browserSuggestion);
  }, [browserSuggestion]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings-languages?target=en')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setLanguages(mergeLanguages(COMMON_LANGUAGES, data.languages ?? []));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const featuredLanguages = useMemo(
    () => FEATURED_CODES.flatMap((code) => {
      const lang = languages.find((l) => normalizeLanguageCode(l.code) === code);
      return lang ? [lang] : [];
    }),
    [languages],
  );

  const otherLanguages = useMemo(
    () => languages.filter((l) => !FEATURED_CODES.includes(normalizeLanguageCode(l.code))),
    [languages],
  );

  const selectedName = useMemo(
    () => languages.find((l) => normalizeLanguageCode(l.code) === normalizeLanguageCode(selected))?.name ?? selected,
    [languages, selected],
  );

  const isSearching = query.trim().length > 0;

  const handleConfirm = async () => {
    setSettingsLanguage(selected);
    await syncUserData({ settings_language: selected }).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-4 py-8 overflow-y-auto">
      <section className="w-full max-w-xl rounded-2xl border border-border-subtle bg-background-elevated p-5 shadow-2xl sm:p-6">

        <div className="mb-5 flex flex-col gap-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-accent">WordLink</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🌐</span>
            <h1 className="m-0 text-2xl font-semibold text-text">{t('language.onboardingTitle')}</h1>
          </div>
          <p className="m-0 text-sm leading-relaxed text-text-soft">{t('language.onboardingIntro')}</p>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('language.searchPlaceholder')}
          autoFocus
          className="mb-4 w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        />

        <div className="max-h-[50vh] overflow-y-auto">
          <div className="flex flex-wrap gap-2 pb-1">
            {featuredLanguages.map((lang) => {
              const hidden = isSearching && !matchesQuery(lang, query);
              return (
                <LanguagePill
                  key={lang.code}
                  lang={lang}
                  selected={normalizeLanguageCode(lang.code) === normalizeLanguageCode(selected)}
                  featured
                  hidden={hidden}
                  onClick={() => setSelected(lang.code)}
                />
              );
            })}
          </div>

          {!isSearching && (
            <p className="mt-2 mb-2 text-[0.68rem] text-text-soft/60">
              Most optimised for Czech → Vietnamese
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {otherLanguages.map((lang, i) => {
              const hidden = isSearching && !matchesQuery(lang, query);
              return (
                <LanguagePill
                  key={lang.code}
                  lang={lang}
                  selected={normalizeLanguageCode(lang.code) === normalizeLanguageCode(selected)}
                  mtClass={SCATTER_MT_CLASSES[i % SCATTER_MT_CLASSES.length]}
                  hidden={hidden}
                  onClick={() => setSelected(lang.code)}
                />
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-background transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {t('language.continueWith', { name: selectedName })}
        </button>
      </section>
    </div>
  );
}

function LanguagePill({
  lang,
  selected,
  featured = false,
  mtClass = 'mt-0',
  hidden = false,
  onClick,
}: {
  lang: SupportedLanguage;
  selected: boolean;
  featured?: boolean;
  mtClass?: string;
  hidden?: boolean;
  onClick: () => void;
}) {
  const flag = FLAG_EMOJIS[normalizeLanguageCode(lang.code)] ?? '';

  if (hidden) return null;

  const sizeClasses = featured ? 'px-4 py-2 text-base' : 'px-3 py-1.5 text-sm';
  const stateClasses = selected
    ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent'
    : 'border-border-subtle bg-background-elevated text-text hover:border-accent/50 hover:bg-accent/5';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${mtClass} inline-flex items-center gap-1.5 rounded-full border transition-all duration-150 ${sizeClasses} ${stateClasses}`}
    >
      {flag && <span aria-hidden="true">{flag}</span>}
      <span>{lang.name}</span>
    </button>
  );
}
