'use client';

import Image from 'next/image';
import { CSSProperties, Fragment, ReactNode, useEffect, useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { resolveAppInstallPlan, type AppInstallPlan } from '@/lib/app-install';
import {
  clearCapturedBeforeInstallPrompt,
  isRunningInstalled,
  type BeforeInstallPromptEvent,
  type SimulatedPlatform,
} from '@/lib/pwa-install';
import { getPWAInstallIntroCopy, type PWAInstallIntroCopy } from './pwaInstallCopy';
import { useAppInstallPlan, useCapturedInstallPrompt } from '@/hooks/usePWAInstallState';

interface PWAInstallIntroCardProps {
  onDismiss: () => void;
  simulatedPlatform?: SimulatedPlatform;
}

const PALETTE = {
  bg: 'var(--sand)',
  card: 'var(--paper-dim)',
  cardAlt: '#e8e0ce',
  ink: '#1f1409',
  inkSoft: '#3a2a1c',
  muted: 'var(--ink-250)',
  cta: '#241a10',
  ctaText: 'var(--paper-dim)',
  warnBg: '#f5d8a6',
} as const;

/**
 * A dev preview asks for a platform that is not the one we are running on, so
 * it cannot go through the live readings — it builds the same plan by hand.
 * `isMobile`/`isInstalled` are forced, because the point of the preview is to
 * see the card on a desktop.
 */
function simulatedPlan(simulated: Exclude<SimulatedPlatform, null>): AppInstallPlan | null {
  return resolveAppInstallPlan({
    runtime: 'web',
    isInstalled: false,
    isMobile: true,
    isIOS: simulated === 'ios',
    isAndroid: simulated === 'android',
  });
}

/**
 * "Get the app" — the store this device installs from, with add-to-home-screen
 * underneath where that is still worth offering. What it shows is entirely
 * `lib/app-install`'s decision; see the asymmetry documented there.
 */
export function PWAInstallIntroCard({ onDismiss, simulatedPlatform }: PWAInstallIntroCardProps) {
  const { language } = useI18n();
  const copy = useMemo(() => getPWAInstallIntroCopy(language), [language]);

  const livePlan = useAppInstallPlan();
  const plan = simulatedPlatform ? simulatedPlan(simulatedPlatform) : livePlan;
  const capturedPrompt = useCapturedInstallPrompt();
  const deferredPrompt = simulatedPlatform ? null : capturedPrompt;

  useEffect(() => {
    if (simulatedPlatform) return;
    if (isRunningInstalled()) {
      onDismiss();
      return;
    }

    const onAppInstalled = () => onDismiss();
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [onDismiss, simulatedPlatform]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      // The browser will not re-fire `beforeinstallprompt` for this event, so
      // drop the global slot to avoid handing out a stale, already-consumed
      // prompt to a future modal open.
      clearCapturedBeforeInstallPrompt();
      onDismiss();
    }
  };

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{
        background: PALETTE.bg,
        color: PALETTE.ink,
        fontFamily: 'Geist, -apple-system, system-ui, sans-serif',
        paddingTop: 16,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      }}
    >
      <div className="mx-auto w-full max-w-[440px]">
        <InstallScreen
          copy={copy}
          plan={plan}
          deferredPrompt={deferredPrompt}
          isPreview={Boolean(simulatedPlatform)}
          onInstall={handleInstall}
          onDismiss={onDismiss}
        />
      </div>
    </div>
  );
}

// ─── shared atoms ───────────────────────────────────────────────────────────

// App logo — square rounded frame with a thin ink outline so it reads as an
// app icon at any size. Kept on a white background so the icon's own colors
// don't bleed into the page palette.
function AppLogo({ size = 56, radius = 14 }: { size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        position: 'relative',
        border: `1.5px solid ${PALETTE.ink}`,
        boxShadow: `0 6px 16px ${PALETTE.ink}33`,
        flexShrink: 0,
        background: '#fff',
      }}
    >
      <Image
        src="/icons/icon-192.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        unoptimized
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
      />
    </div>
  );
}

// Inline wordmark wrapper — distinguishes the brand name "Get Word" inside running
// copy. Italic + tighter tracking + nowrap so it never breaks mid-word.
function Brand({ children = 'Get Word' }: { children?: ReactNode }) {
  return (
    <span
      style={{
        fontStyle: 'italic',
        fontWeight: 700,
        letterSpacing: '-0.035em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

// Splits a title string on the literal "Get Word" and wraps each occurrence
// in <Brand /> so the brand wordmark gets visual emphasis in any language.
function renderTitleWithBrand(title: string): ReactNode {
  const parts = title.split('Get Word');
  if (parts.length === 1) return title;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && <Brand />}
    </Fragment>
  ));
}

function HeroBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  // Icon stacked above title — title gets full width with no horizontal fight
  // with the icon. A 2-line break is intentional and balanced via textWrap.
  return (
    <div style={{ padding: '4px 20px 22px' }}>
      <AppLogo size={56} radius={14} />
      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          margin: '16px 0 0',
          color: PALETTE.ink,
          textWrap: 'balance',
          maxWidth: '14ch',
        } as CSSProperties}
      >
        {renderTitleWithBrand(title)}
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: 14,
            color: PALETTE.muted,
            lineHeight: 1.4,
            margin: '8px 0 0',
            textWrap: 'pretty',
            maxWidth: '34ch',
          } as CSSProperties}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function SkipInstallLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'center' }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 12px',
          borderRadius: 8,
          color: PALETTE.muted,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          textDecorationColor: `color-mix(in srgb, ${PALETTE.muted} 50%, transparent)`,
          textDecorationThickness: 1,
        }}
      >
        {label}
      </button>
    </div>
  );
}

// ─── the screen ─────────────────────────────────────────────────────────────

function BenefitList({ benefits }: { benefits: PWAInstallIntroCopy['benefitList'] }) {
  const icons = [iconOffline, iconRocket, iconBrowser];
  return (
    <div
      style={{
        margin: '0 16px 22px',
        background: PALETTE.card,
        border: `1.5px solid ${PALETTE.ink}`,
        borderRadius: 18,
        padding: '18px 18px 16px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {benefits.map((b, i) => (
          <div key={b.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: PALETTE.cardAlt,
                border: `1.5px solid ${PALETTE.ink}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {icons[i]?.(PALETTE.ink, 18)}
            </div>
            <div style={{ minWidth: 0, paddingTop: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{b.title}</div>
              <div
                style={{
                  fontSize: 13,
                  color: PALETTE.muted,
                  lineHeight: 1.4,
                  marginTop: 2,
                }}
              >
                {b.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Clean rounded video container. No top header bar with red dot, no bottom
// control strip — just the video, a black "Video návod" pill in the lower-left,
// and a hairline progress strip flush with the bottom of the card.
function StoreButton({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        width: '100%',
        height: 60,
        borderRadius: 18,
        background: PALETTE.cta,
        color: PALETTE.ctaText,
        fontSize: 17,
        fontWeight: 600,
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: `0 6px 14px ${PALETTE.ink}40`,
        textDecoration: 'none',
      }}
    >
      {label}
    </a>
  );
}

function HomeScreenButton({
  copy,
  onInstall,
  quiet,
}: {
  copy: PWAInstallIntroCopy;
  onInstall: () => void;
  /** Demoted to an outline when a store button already sits above it. */
  quiet: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onInstall}
        style={{
          width: '100%',
          height: quiet ? 52 : 60,
          borderRadius: 18,
          border: quiet ? `1.5px solid ${PALETTE.ink}` : 'none',
          background: quiet ? 'transparent' : PALETTE.cta,
          color: quiet ? PALETTE.ink : PALETTE.ctaText,
          fontSize: quiet ? 15 : 17,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: quiet ? 'none' : `0 6px 14px ${PALETTE.ink}40`,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path
            d="M9 2v9M5.5 7.5L9 11l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 13v2a1 1 0 001 1h10a1 1 0 001-1v-2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span>{copy.homeScreenCtaLabel}</span>
      </button>
      <p
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: PALETTE.muted,
          margin: '10px 0 0',
          lineHeight: 1.4,
        }}
      >
        {copy.homeScreenCtaHint}
        <b>{copy.homeScreenCtaHintBold}</b>.
      </p>
    </>
  );
}

function AlternativeLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        margin: '22px 0 12px',
        fontSize: 12,
        letterSpacing: '0.14em',
        fontWeight: 700,
        color: PALETTE.muted,
        textAlign: 'center',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  );
}

function InstallScreen({
  copy,
  plan,
  deferredPrompt,
  isPreview,
  onInstall,
  onDismiss,
}: {
  copy: PWAInstallIntroCopy;
  plan: AppInstallPlan | null;
  deferredPrompt: BeforeInstallPromptEvent | null;
  isPreview: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  // The home-screen button is only real when the browser has handed us a
  // `beforeinstallprompt` to fire; without one there is nothing to click, so
  // the browser-menu hint takes its place.
  const canPromptHomeScreen = plan?.offerHomeScreen && (Boolean(deferredPrompt) || isPreview);
  const storeLabel =
    plan?.store?.target === 'appStore' ? copy.appStoreCtaLabel : copy.playCtaLabel;

  return (
    <>
      <HeroBlock title={copy.title} subtitle={copy.subtitle} />
      <BenefitList benefits={copy.benefitList} />

      <div style={{ padding: '0 16px' }}>
        {plan?.store ? <StoreButton label={storeLabel} url={plan.store.url} /> : null}

        {canPromptHomeScreen ? (
          <>
            {plan?.store ? <AlternativeLabel label={copy.homeScreenAlternativeLabel} /> : null}
            <HomeScreenButton copy={copy} onInstall={onInstall} quiet={Boolean(plan?.store)} />
          </>
        ) : null}

        {/* Nothing to offer but words: no store for this device and no install
            prompt from the browser either. */}
        {!plan?.store && !canPromptHomeScreen ? (
          <p
            style={{
              textAlign: 'center',
              fontSize: 13,
              color: PALETTE.inkSoft,
              margin: 0,
              lineHeight: 1.5,
              padding: '14px 8px',
              border: `1.5px dashed ${PALETTE.ink}55`,
              borderRadius: 14,
              background: `color-mix(in srgb, ${PALETTE.card} 50%, transparent)`,
            }}
          >
            {copy.desktopHint}
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: 14 }}>
        <SkipInstallLink label={copy.skipInstallLabel} onClick={onDismiss} />
      </div>
    </>
  );
}

// ─── icons ──────────────────────────────────────────────────────────────────

function iconOffline(c: string, size = 18) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M3 7.5C4.5 6 6.5 5 9 5s4.5 1 6 2.5M5 9.5C6 8.5 7.4 8 9 8s3 .5 4 1.5M7 11.5C7.6 11 8.3 10.7 9 10.7s1.4.3 2 .8"
        stroke={c}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="9" cy="14" r="1" fill={c} />
    </svg>
  );
}

function iconRocket(c: string, size = 18) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="3.5" y="2.5" width="11" height="13" rx="2" stroke={c} strokeWidth="1.6" />
      <rect x="6" y="4.5" width="6" height="3.5" rx="0.5" fill={c} />
      <circle cx="9" cy="12.5" r="1" fill={c} />
    </svg>
  );
}

function iconBrowser(c: string, size = 18) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2.5" y="4" width="13" height="10" rx="1.5" stroke={c} strokeWidth="1.6" />
      <path d="M2.5 7h13" stroke={c} strokeWidth="1.6" />
      <circle cx="5" cy="5.5" r="0.6" fill={c} />
      <circle cx="7" cy="5.5" r="0.6" fill={c} />
    </svg>
  );
}
