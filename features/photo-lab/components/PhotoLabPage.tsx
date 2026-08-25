'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { I18nProvider, useI18n } from '@/components/I18nProvider';
import { LanguagePairSummary } from '@/features/shared/languages/LanguagePairSummary';
import { useSettingsLanguage } from '@/features/shared/languages/useSettingsLanguage';
import { useSupportedLanguages } from '@/features/shared/languages/useSupportedLanguages';
import {
  ADDRESS_REGISTER_CHANGED_EVENT,
  readAddressRegisterPreference,
} from '@/features/shared/user-preferences/address-register';
import { readPhotoLabPreference } from '@/features/photo-lab/client/preferences';
import { WARM_PALETTE, warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { getLanguageFlag } from '@/lib/i18n/languages';
import { cleanupPhotoLab } from '../client/photoStore';
import { LabeledPhoto } from './LabeledPhoto';
import { LanguagePairModal } from './LanguagePairModal';
import type { PhotoLabSaveWordsResult } from '../client/saveToList';
import { SaveWordsModal } from './SaveWordsModal';
import { usePhotoLabStudio } from './usePhotoLabStudio';

// Calibrated to the pro-tier vision model (see PHOTO_LAB_MODEL).
const ANALYSIS_ESTIMATE_SECONDS = 25;

const ERROR_MESSAGE_KEYS = {
  limit: 'photoLab.errorLimit',
  imageProcessing: 'photoLab.errorImageProcessing',
  tooLarge: 'photoLab.errorTooLarge',
  unauthorized: 'photoLab.errorUnauthorized',
  timeout: 'photoLab.errorTimeout',
  generic: 'photoLab.errorGeneric',
} as const;

/** The remaining-analyses badge, rendered under the photo history. */
function UsageBadge({ usage }: { usage: NonNullable<ReturnType<typeof usePhotoLabStudio>['usage']> }) {
  const { t } = useI18n();
  const messageKey =
    usage.remaining <= 0
      ? 'photoLab.usageExhausted'
      : usage.period === 'week'
        ? 'photoLab.usageRemainingWeek'
        : usage.period === 'month'
          ? 'photoLab.usageRemainingMonth'
          : 'photoLab.usageRemaining';

  return (
    <p
      className={`m-0 text-xs ${
        usage.remaining <= 0
          ? 'font-medium text-[#B91C1C]'
          : 'text-[color:var(--ob-ink-soft)]'
      }`}
      aria-live="polite"
    >
      {t(messageKey, { remaining: usage.remaining, limit: usage.limit })}
    </p>
  );
}

/** Full-bleed warm background; the app body is dark navy. */
function PhotoLabShell({ children }: { children: React.ReactNode }) {
  // Paint the body itself warm while mounted — otherwise the navy app body
  // shows through iOS overscroll bounce and below the shell on browsers
  // where 100dvh is unsupported.
  useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = WARM_PALETTE.surface;
    return () => {
      document.body.style.backgroundColor = previous;
    };
  }, []);

  return (
    <div
      style={warmPaletteVars}
      className="photo-lab-shell relative bg-[var(--ob-surface)] text-[color:var(--ob-ink)]"
    >
      {/* Soft accent/ink washes give the flat surface a hint of depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_520px_at_85%_-10%,rgba(30,111,168,0.10),transparent_60%),radial-gradient(900px_460px_at_-15%_35%,rgba(42,34,24,0.06),transparent_55%)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

type PhotoLabPageProps = {
  /**
   * Present when the lab is open in place over the study view: closing returns
   * to the deck instead of navigating. Absent on the standalone `/photo-lab`
   * route, where back is a plain link home.
   */
  onClose?: () => void;
  variant?: 'standalone' | 'embedded';
  /** Mounted workspace panels stay alive; visual-only effects pause while hidden. */
  active?: boolean;
  /** App-wide pair supplied by the embedded study workspace. */
  languageFrom?: string;
  languageTo?: string;
  onLanguagePairChange?: (pair: { from: string; to: string }) => void | Promise<void>;
  /**
   * True inside the tabbed "Add your own words" screen, whose header already
   * carries the study pair for every tab. Without this the lab drew a second
   * chip directly under the first one.
   */
  hideLanguagePair?: boolean;
  /**
   * Present inside the tabbed "Add your own words" screen: the picked pairs are
   * handed to that screen's basket, where they meet the Check step alongside
   * typed and proposed words, instead of being saved from here. `onSavedToList`
   * is then never used — the shared flow owns the save and the receipt.
   */
  onPickWords?: (items: { known: string; target: string; audioHash?: string | null }[]) => void;
  /**
   * Embedded, the study view behind the lab is holding a snapshot taken before
   * the save: it has to re-read for the new words (and the category counts) to
   * show up. Absent on the standalone route, where the learning page boots
   * fresh on return and reads the refresh marker the save leaves instead.
   */
  onSavedToList?: (result: PhotoLabSaveWordsResult) => void;
};

export function PhotoLabPage({
  onClose,
  variant = 'standalone',
  active = true,
  languageFrom,
  languageTo,
  onLanguagePairChange,
  hideLanguagePair = false,
  onPickWords,
  onSavedToList,
}: PhotoLabPageProps) {
  const settingsLanguage = useSettingsLanguage();
  const content = (
    <PhotoLabContent
      onClose={onClose}
      variant={variant}
      active={active}
      languageFrom={languageFrom}
      languageTo={languageTo}
      onLanguagePairChange={onLanguagePairChange}
      hideLanguagePair={hideLanguagePair}
      onPickWords={onPickWords}
      onSavedToList={onSavedToList}
    />
  );

  return (
    <I18nProvider language={settingsLanguage}>
      {variant === 'standalone' ? <PhotoLabShell>{content}</PhotoLabShell> : content}
    </I18nProvider>
  );
}

function PhotoLabContent({
  onClose,
  variant = 'standalone',
  active = true,
  languageFrom,
  languageTo,
  onLanguagePairChange,
  hideLanguagePair = false,
  onPickWords,
  onSavedToList,
}: PhotoLabPageProps) {
  const { t } = useI18n();
  // null = not yet known (first client render); avoids a hydration mismatch.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setEnabled(readPhotoLabPreference()), 0);
    void cleanupPhotoLab();
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (enabled === null) return null;
  if (!enabled) {
    return (
      <div
        className={`flex items-center justify-center p-6 ${
          variant === 'standalone' ? 'min-h-dvh' : 'min-h-full'
        }`}
      >
        <div className="flex max-w-sm flex-col gap-3 rounded-xl border-2 border-[color:var(--ob-ink)] p-6 text-center">
          <p className="m-0 text-sm">{t('photoLab.enableHint')}</p>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[color:var(--ob-accent)] underline"
            >
              ← Get Word
            </button>
          ) : (
            <Link href="/" className="text-sm text-[color:var(--ob-accent)] underline">
              ← Get Word
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <PhotoLabStudio
      onClose={onClose}
      variant={variant}
      active={active}
      languageFrom={languageFrom}
      languageTo={languageTo}
      onLanguagePairChange={onLanguagePairChange}
      hideLanguagePair={hideLanguagePair}
      onPickWords={onPickWords}
      onSavedToList={onSavedToList}
    />
  );
}

const BACK_LINK_CLASS =
  'shrink-0 rounded-full border-2 border-[color:var(--ob-ink)]/60 bg-[#F4EFE2]/70 px-3.5 py-2 text-sm font-semibold text-[color:var(--ob-ink)] transition hover:-translate-y-0.5 hover:border-[color:var(--ob-ink)] hover:bg-[var(--ob-surface-hover)] hover:shadow-md hover:shadow-[#2A2218]/10 sm:text-base';

/**
 * Back out of the lab.
 *
 * Opened in place over the study view (`onClose`), this is a plain button: the
 * deck is still mounted behind it, so there is nothing to navigate back to.
 *
 * On the standalone route it is a link home, except when `?from=study` says the
 * learner arrived from a live deck — then back pops history instead of loading
 * `/` fresh, which lets the browser restore the deck rather than rebuilding it.
 * Without that param — a bookmark, a shared link, a new tab — the plain link
 * home is still the right answer.
 */
export function BackLink({
  onClose,
}: {
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const [fromStudy, setFromStudy] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFromStudy(new URLSearchParams(window.location.search).get('from') === 'study');
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (onClose) {
    return (
      <button type="button" onClick={onClose} className={BACK_LINK_CLASS}>
        ← {t('photoLab.backToStudy')}
      </button>
    );
  }

  return (
    <Link
      href="/"
      className={BACK_LINK_CLASS}
      onClick={(event) => {
        // Only intercept a plain left click; modifier/middle clicks should keep
        // opening `/` in a new tab as the href promises.
        if (!fromStudy) return;
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (window.history.length <= 1) return;
        event.preventDefault();
        window.history.back();
      }}
    >
      ← {t(fromStudy ? 'photoLab.backToStudy' : 'photoLab.back')}
    </Link>
  );
}

/** One square "add a photo" tile in the history grid. */
function PhotoSourceTile({
  icon,
  label,
  disabled,
  title,
  className = '',
  onClick,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  title?: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[color:var(--ob-ink)]/45 bg-[var(--ob-accent)]/8 px-3 text-center text-[color:var(--ob-ink)] transition hover:-translate-y-1 hover:border-[color:var(--ob-ink)] hover:bg-[var(--ob-accent)]/15 hover:shadow-lg hover:shadow-[#2A2218]/15 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${className}`}
    >
      <span aria-hidden="true" className="text-4xl font-light leading-none text-[var(--ob-accent)]">
        {icon}
      </span>
      <span className="text-xs font-bold sm:text-sm">{label}</span>
    </button>
  );
}

export function usesAndroidPhotoSourceChooser(userAgent: string) {
  return /Android/i.test(userAgent);
}

/** Android's file picker often omits the camera, so give it an explicit source sheet. */
export function PhotoSourcePickerDialog({
  onCamera,
  onLibrary,
  onCancel,
}: {
  onCamera: () => void;
  onLibrary: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-lab-source-title"
        style={warmPaletteVars}
        className="w-full max-w-sm rounded-2xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-surface)] p-4 text-[color:var(--ob-ink)] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="photo-lab-source-title" className="m-0 px-1 text-base font-semibold">
          {t('photoLab.choosePhoto')}
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            autoFocus
            className="flex w-full items-center gap-3 rounded-xl border-2 border-[color:var(--ob-ink)] px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-[var(--ob-surface-hover)]"
            onClick={onCamera}
          >
            <span aria-hidden="true" className="text-xl">📷</span>
            {t('photoLab.takePhoto')}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl border-2 border-[color:var(--ob-ink)] px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-[var(--ob-surface-hover)]"
            onClick={onLibrary}
          >
            <span aria-hidden="true" className="text-xl">▧</span>
            {t('photoLab.chooseFromLibrary')}
          </button>
          <button
            type="button"
            className="mt-1 w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--ob-surface-hover)]"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Small confirmation dialog shown before a photo (and its session) is deleted. */
function DeletePhotoConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="photo-lab-delete-title"
        style={warmPaletteVars}
        className="w-full max-w-xs rounded-2xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-surface)] p-5 text-[color:var(--ob-ink)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="photo-lab-delete-title" className="m-0 text-sm font-medium">
          {t('photoLab.deleteConfirm')}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            className="rounded-lg border border-[color:var(--ob-ink)]/25 px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--ob-surface-hover)]"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--ob-ink)] px-4 py-2 text-sm font-medium text-[var(--ob-surface)] transition-opacity hover:opacity-85"
            onClick={onConfirm}
          >
            {t('photoLab.deletePhoto')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PhotoLabStudio({
  onClose,
  variant = 'standalone',
  active = true,
  languageFrom,
  languageTo,
  onLanguagePairChange,
  hideLanguagePair = false,
  onPickWords,
  onSavedToList,
}: PhotoLabPageProps) {
  const { t } = useI18n();
  const { languages } = useSupportedLanguages();
  const [addressRegister, setAddressRegister] =
    useState<ReturnType<typeof readAddressRegisterPreference>>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [photoSourceOpen, setPhotoSourceOpen] = useState(false);
  const {
    langFrom,
    langTo,
    langModalOpen,
    analysisElapsedSeconds,
    analyzing,
    errorCode,
    usage,
    current,
    history,
    confirmDeleteId,
    thumbUrls,
    fileInputRef,
    cameraInputRef,
    pendingPhoto,
    limitReached,
    languagesReady,
    changeLanguagePair,
    openLanguageModal,
    closeLanguageModal,
    analyze,
    handleFileChange,
    openSession,
    removeSession,
    requestDelete,
    cancelDelete,
  } = usePhotoLabStudio(active, {
    languageFrom,
    languageTo,
    onLanguagePairChange,
  });
  const analysisRemainingSeconds = Math.max(
    1,
    ANALYSIS_ESTIMATE_SECONDS - analysisElapsedSeconds,
  );
  const analysisStatusText =
    analysisElapsedSeconds < ANALYSIS_ESTIMATE_SECONDS
      ? t('photoLab.analyzingWithEta', { seconds: analysisRemainingSeconds })
      : t('photoLab.analyzingTakingLonger');
  const historyTitle = t(
    addressRegister === 'casual'
      ? 'photoLab.historyCasual'
      : 'photoLab.historyFormal',
  );

  useEffect(() => {
    const update = () => setAddressRegister(readAddressRegisterPreference());
    const timeoutId = window.setTimeout(update, 0);
    window.addEventListener(ADDRESS_REGISTER_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(ADDRESS_REGISTER_CHANGED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  const openPhotoSource = () => {
    if (usesAndroidPhotoSourceChooser(window.navigator.userAgent)) {
      setPhotoSourceOpen(true);
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <div
      style={variant === 'embedded' ? warmPaletteVars : undefined}
      className={`mx-auto flex w-full flex-col gap-3 px-3 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-4 ${
        variant === 'standalone'
          ? 'min-h-dvh max-w-[1800px] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6 lg:px-8'
          : 'max-w-[1800px] text-[color:var(--ob-ink)]'
      }`}
    >
      <header className="relative z-10 mx-auto w-full max-w-[800px] overflow-visible px-1 animate-[photo-lab-rise_0.5s_ease-out_both] motion-reduce:animate-none md:px-4">
        {/* Embedded in the app workspace, the top menu already switches surfaces,
            so a back button here is redundant — it only earns its place on the
            standalone route. */}
        <div
          className={`relative z-10 flex items-center gap-3 overflow-visible ${
            variant === 'standalone' ? 'justify-between' : 'justify-end'
          }`}
        >
          {variant === 'standalone' ? <BackLink onClose={onClose} /> : null}
          {hideLanguagePair ? null : (
            <LanguagePairSummary
              from={langFrom}
              to={langTo}
              onOpen={openLanguageModal}
              className="relative z-20"
            />
          )}
        </div>
      </header>

      <LanguagePairModal
        isOpen={active && langModalOpen}
        languages={languages}
        loading={languages.length === 0}
        from={langFrom}
        to={langTo}
        onChange={changeLanguagePair}
        onClose={closeLanguageModal}
      />

      {/* iOS gets its native camera/library/files source menu from the first
          input. Android's explicit source sheet can target either input. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {analyzing && (
        <div
          className={
            pendingPhoto
              ? // Mirror the LabeledPhoto viewport (full-bleed square on mobile,
                // rounded and bordered on sm+) so corners don't jump when the
                // analysis finishes.
                'relative -mx-3 overflow-hidden bg-black/5 shadow-lg sm:mx-0 sm:max-w-3xl sm:rounded-2xl sm:border-2 sm:border-[color:var(--ob-ink)] sm:shadow-xl sm:shadow-[#2A2218]/10'
              : 'mx-auto w-full max-w-xl rounded-2xl border-2 border-[color:var(--ob-ink)]/60 bg-white/35 px-4 py-3'
          }
          aria-live="polite"
        >
          {pendingPhoto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
              <img
                src={pendingPhoto.dataUrl}
                alt=""
                draggable={false}
                // Safari can let a blurred child leak past the parent's rounded
                // overflow clip; round the image itself to the inner radius too.
                className="block max-h-[calc(100dvh-10rem)] w-full select-none object-contain opacity-90 blur-[3px] sm:rounded-[14px]"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-black/25" />
              <div
                aria-hidden="true"
                className="absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-white/45 to-transparent motion-safe:animate-[photo-lab-scan_2.2s_linear_infinite] motion-reduce:hidden"
              />
            </>
          )}
          <div
            className={`flex flex-col gap-2 text-center text-sm sm:text-base ${
              pendingPhoto
                ? 'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-4 pb-4 pt-10 text-white/85'
                : 'text-[color:var(--ob-ink-soft)]'
            }`}
          >
            <p className={`m-0 font-semibold ${pendingPhoto ? 'text-white' : 'text-[color:var(--ob-ink)]'}`}>
              {t('photoLab.analyzing')}
            </p>
            <p className="m-0">{analysisStatusText}</p>
            <div
              className={`h-1.5 overflow-hidden rounded-full ${
                pendingPhoto ? 'bg-white/25' : 'bg-[#2A2218]/10'
              }`}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-[var(--ob-accent)] transition-[width] duration-500"
                style={{
                  width: `${Math.min(
                    94,
                    Math.max(8, (analysisElapsedSeconds / ANALYSIS_ESTIMATE_SECONDS) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {errorCode && !analyzing && (
        <div className="flex w-full max-w-xl flex-col items-center gap-2.5 rounded-2xl border-2 border-[color:var(--ob-ink)] bg-[#B91C1C]/5 p-4">
          <p className="m-0 text-center text-sm font-medium">{t(ERROR_MESSAGE_KEYS[errorCode])}</p>
          {pendingPhoto && errorCode !== 'limit' && errorCode !== 'tooLarge' && (
            <button
              type="button"
              onClick={() => void analyze(pendingPhoto)}
              className="rounded-xl border-2 border-[color:var(--ob-ink)] px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-[var(--ob-surface-hover)] hover:shadow-md hover:shadow-[color:var(--ob-ink)]/10"
            >
              {t('photoLab.retry')}
            </button>
          )}
        </div>
      )}

      {current && !analyzing && (
        <>
          <LabeledPhoto
            key={current.session.id}
            imageUrl={current.imageUrl}
            labels={current.session.labels}
            audioHashes={current.session.audioHashes}
            active={active}
          />
          {current.session.labels.length > 0 && (
            // Directly under the photo, full width on a phone: keeping the words
            // is the natural next step once the labels have been worked through,
            // and a right-aligned outline button was easy to scroll past.
            <div className="mx-auto flex w-full max-w-[800px] px-1 md:px-4">
              <button
                type="button"
                onClick={() => setSaveOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--ob-ink)] bg-[var(--ob-accent)]/10 px-4 py-2.5 text-sm font-semibold text-[color:var(--ob-ink)] transition hover:-translate-y-0.5 hover:bg-[var(--ob-accent)]/20 hover:shadow-md hover:shadow-[color:var(--ob-ink)]/10 sm:w-auto sm:text-base"
              >
                <span aria-hidden="true" className="text-lg leading-none text-[var(--ob-accent)]">
                  ＋
                </span>
                {t(onPickWords ? 'photoLab.pickWords' : 'photoLab.saveWords')}
              </button>
            </div>
          )}
        </>
      )}

      <section className="mt-2 flex w-full max-w-5xl flex-col gap-4 animate-[photo-lab-rise_0.5s_ease-out_160ms_both] motion-reduce:animate-none">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-base font-semibold text-[color:var(--ob-ink)] [font-family:var(--font-photo-display),system-ui] sm:text-lg">
            {historyTitle}
          </h2>
          <p className="m-0 text-xs text-[color:var(--ob-ink-soft)]">
            {t('photoLab.historyNote')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <PhotoSourceTile
            icon="📷"
            label={t('photoLab.choosePhoto')}
            disabled={!languagesReady || analyzing || limitReached}
            title={limitReached ? t('photoLab.limitReachedHint') : undefined}
            onClick={openPhotoSource}
          />
          {history.map((session) => (
            <div key={session.id} className="group relative">
              <button
                type="button"
                onClick={() => void openSession(session)}
                className="relative block w-full overflow-hidden rounded-xl border-2 border-[color:var(--ob-ink)]/25 transition group-hover:-translate-y-1 group-hover:border-[color:var(--ob-ink)] group-hover:shadow-lg group-hover:shadow-[#2A2218]/15"
              >
                {thumbUrls.get(session.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                  <img
                    src={thumbUrls.get(session.id)}
                    alt=""
                    className="block aspect-square w-full object-cover"
                  />
                ) : (
                  <span className="block aspect-square w-full bg-[#2A2218]/10" />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/65 to-transparent px-2 pb-1.5 pt-7 text-[11px] font-medium text-white">
                  <span aria-hidden="true">{getLanguageFlag(session.languageFrom)}</span>
                  <span aria-hidden="true">→</span>
                  <span aria-hidden="true">{getLanguageFlag(session.languageTo)}</span>
                  <span className="ml-auto tabular-nums">{session.labels.length}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => requestDelete(session.id)}
                aria-label={t('photoLab.deletePhoto')}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-black/60 text-[11px] text-white transition hover:bg-black/80"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {limitReached && (
          <span className="text-xs font-medium text-[#B91C1C] sm:text-sm">
            {t('photoLab.limitReachedHint')}
          </span>
        )}
        {usage && <UsageBadge usage={usage} />}
      </section>

      {active && confirmDeleteId && (
        <DeletePhotoConfirmModal
          onConfirm={() => void removeSession(confirmDeleteId)}
          onCancel={cancelDelete}
        />
      )}

      {active && photoSourceOpen && (
        <PhotoSourcePickerDialog
          onCamera={() => {
            setPhotoSourceOpen(false);
            cameraInputRef.current?.click();
          }}
          onLibrary={() => {
            setPhotoSourceOpen(false);
            fileInputRef.current?.click();
          }}
          onCancel={() => setPhotoSourceOpen(false)}
        />
      )}

      {active && saveOpen && current && (
        <SaveWordsModal
          session={current.session}
          onClose={() => setSaveOpen(false)}
          onPick={onPickWords}
          onSaved={onSavedToList}
        />
      )}
    </div>
  );
}
