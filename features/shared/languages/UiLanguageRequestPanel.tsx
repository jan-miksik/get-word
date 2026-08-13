'use client';

import { useMemo, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { apiFetch } from '@/features/shared/http/api-runtime';
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  getLanguageFlag,
  getLocalizedLanguageName,
  getNativeLanguageName,
  languageMatchesSearch,
  mergeLanguages,
  normalizeLanguageCode,
  orderSettingsLanguages,
} from '@/lib/i18n/languages';

type RequestState =
  | { status: 'idle' }
  | { status: 'sending'; code: string }
  | { status: 'success'; name: string }
  | { status: 'error'; message: string };

export function UiLanguageRequestPanel({
  supportedCodes,
  onBack,
}: {
  supportedCodes: ReadonlySet<string>;
  onBack: () => void;
}) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });

  const requestableLanguages = useMemo(
    () => orderSettingsLanguages(
      mergeLanguages(COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES).filter(
        (item) => !supportedCodes.has(normalizeLanguageCode(item.code)),
      ),
    ),
    [supportedCodes],
  );
  const visibleLanguages = useMemo(
    () => requestableLanguages.filter((item) => {
      const localizedName = getLocalizedLanguageName(item.code, language) ?? '';
      return languageMatchesSearch(item, query, [localizedName]);
    }),
    [language, query, requestableLanguages],
  );

  async function requestLanguage(code: string, name: string) {
    const normalized = normalizeLanguageCode(code);
    setRequestState({ status: 'sending', code: normalized });
    try {
      const response = await apiFetch('/api/ui-language-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languageCode: normalized }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data?.code === 'already_supported') {
        setRequestState({ status: 'error', message: t('language.requestAlreadySupported') });
        return;
      }
      if (!response.ok) throw new Error('Request failed');
      setRequestState({ status: 'success', name });
    } catch {
      setRequestState({ status: 'error', message: t('language.requestError') });
    }
  }

  if (requestState.status === 'success') {
    return (
      <div className="onboarding-combobox-list p-4 text-sm text-[color:var(--ob-ink)]">
        <p role="status" className="m-0 leading-relaxed">
          {t('language.requestSuccess', { name: requestState.name })}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 font-bold text-[color:var(--ob-accent)] underline underline-offset-2"
        >
          {t('language.requestBack')}
        </button>
      </div>
    );
  }

  return (
    <div className="onboarding-combobox-list overflow-hidden">
      <div className="border-b-2 border-[var(--ob-ink)] p-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 text-xs font-bold text-[color:var(--ob-accent)] underline underline-offset-2"
        >
          ← {t('language.requestBack')}
        </button>
        <p className="m-0 text-sm font-bold text-[color:var(--ob-ink)]">
          {t('language.requestTitle')}
        </p>
        <p className="mb-0 mt-1 text-xs leading-relaxed onboarding-text-soft">
          {t('language.requestIntro')}
        </p>
      </div>
      <div className="p-1.5 pb-0">
        <input
          type="search"
          value={query}
          autoFocus
          placeholder={t('language.searchPlaceholder')}
          aria-label={t('language.requestSearchLabel')}
          onChange={(event) => {
            setQuery(event.target.value);
            if (requestState.status === 'error') setRequestState({ status: 'idle' });
          }}
          className="h-10 w-full rounded-xl border-2 border-[var(--ob-ink)] bg-[var(--ob-surface)] px-3 text-base text-[color:var(--ob-ink)] outline-none transition-colors placeholder:text-[color:var(--ob-ink-soft)] placeholder:opacity-70 focus:bg-[var(--ob-surface-hover)] sm:text-sm"
        />
      </div>
      {requestState.status === 'error' ? (
        <p role="alert" className="mx-3 mb-0 mt-2 text-xs text-red-700">
          {requestState.message}
        </p>
      ) : null}
      <ul
        role="listbox"
        aria-label={t('language.requestTitle')}
        className="max-h-72 overflow-y-auto p-1"
      >
        {visibleLanguages.length === 0 ? (
          <li className="px-3 py-2 text-sm onboarding-text-soft">
            {t('onboarding.noLanguagesFound')}
          </li>
        ) : (
          visibleLanguages.map((item) => {
            const code = normalizeLanguageCode(item.code);
            const displayName = getLocalizedLanguageName(code, language) ?? item.name;
            const nativeName = getNativeLanguageName(code);
            const sending = requestState.status === 'sending' && requestState.code === code;
            return (
              <li key={code} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  disabled={requestState.status === 'sending'}
                  onClick={() => void requestLanguage(code, displayName)}
                  className="onboarding-combobox-option flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium disabled:opacity-60"
                >
                  <span aria-hidden="true" className="w-5 shrink-0 text-base leading-none">
                    {item.flag ?? getLanguageFlag(code) ?? '·'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{displayName}</span>
                    {nativeName && nativeName !== displayName ? (
                      <span className="block truncate text-[0.68rem] leading-tight onboarding-text-soft">
                        {nativeName}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[0.62rem] uppercase tracking-wide onboarding-text-soft">
                    {sending ? t('language.requestSending') : code}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
