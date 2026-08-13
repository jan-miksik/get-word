'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { SpeakerIcon } from '@/components/icons/SpeakerIcon';
import { DemoMatchingGame } from './demo/DemoMatchingGame';
import { LandingDemoStyles } from './demo/LandingDemoStyles';
import {
  buildDemoSet,
  getLandingDemoFallbackTo,
} from './demo/demo-set';
import { logLandingDemoAudio } from './demo/audio';
import type { DemoAudioSource } from './demo/types';
import { ScratchCover } from '@/components/ScratchCover';
import { playUserInitiatedAudio } from '@/lib/audio-playback';
import { normalizeLanguageCode } from '@/lib/i18n/languages';
import {
  LANDING_DEMO_AUDIO_LANGUAGES,
  getLandingDemoStaticAudioEntries,
} from '@/lib/landing-demo-words';
import type { I18nKey } from '@/lib/i18n/messages';
import { apiFetch } from '@/features/shared/http/api-runtime';

/**
 * Interactive demo study card for the public landing page. Self-contained
 * except for one read-only fetch of pre-generated word audio, and
 * deliberately shaped like the real study card: the answer is covered by the
 * same canvas scratch cover the app uses, and the visitor rates themselves
 * with the same two big "Forgotten" / "OK" buttons — the core loop of the app
 * in one scratch. After the third card the demo drops in a small matching
 * round, so visitors first see the core flashcard loop before the minigame.
 *
 * The demo pair follows the landing hero's "I know" / "I want to learn"
 * choices so the card reads like a live slice of the app, not a fixed
 * screenshot.
 */

// Demo review ladder shown after a correct answer; mirrors the shape (not the
// exact values) of the real 11-stage schedule in lib/words.ts.
const MAX_DEMO_STAGE = 4;
const INTERVAL_KEYS: I18nKey[] = [
  'landing.demo.interval1',
  'landing.demo.interval2',
  'landing.demo.interval3',
  'landing.demo.interval4',
];
const DEMO_CUSTOM_STAGE_IDS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const EXIT_DELAY_MS = 380;
const ENTER_CLEAR_DELAY_MS = 460;
// The matching round is the fourth demo item overall: three regular cards
// first, then the minigame.
const MATCH_AFTER_COMPLETED_CARDS = 3;

// The caller keys this component by interface language and selected pair, so a
// language change remounts it and the demo restarts from a clean state.
export function LandingDemoCard({
  lang,
  fromLang,
  toLang,
  onContinueToApp,
}: {
  lang: string;
  fromLang?: string;
  toLang?: string;
  onContinueToApp?: () => void;
}) {
  const { t } = useI18n();
  const normalizedFrom = normalizeLanguageCode(fromLang || lang);
  const normalizedTo = normalizeLanguageCode(toLang || getLandingDemoFallbackTo(normalizedFrom));
  const set = buildDemoSet(normalizedFrom, normalizedTo);
  // Word indices still waiting to be answered "known", in study order. The
  // head is the card on top of the stack; a forgotten card rotates to the
  // back so the visitor sees the rest of the stack before meeting it again.
  const [queue, setQueue] = useState<number[]>(() => set.words.map((_, i) => i));
  const index = queue[0] ?? 0;
  const [stages, setStages] = useState<number[]>(() => set.words.map(() => 0));
  const [pending, setPending] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [phase, setPhase] = useState<'cards' | 'match'>('cards');
  const [animationClass, setAnimationClass] = useState('animate-deck-enter-slide');
  const [pendingAdvances, setPendingAdvances] = useState(false);
  const [remoteDemoAudio, setRemoteDemoAudio] = useState<{
    lang: string;
    byText: Map<string, DemoAudioSource[]>;
  } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [attemptKey, setAttemptKey] = useState(0);
  const advanceTimer = useRef<number | null>(null);
  const enterTimer = useRef<number | null>(null);
  const matchPlayedRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const preloadedAudioRef = useRef<HTMLAudioElement[]>([]);
  const customRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
      if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
      audioElRef.current?.pause();
      audioElRef.current = null;
    };
  }, []);

  const explicitUnsupportedTarget = Boolean(toLang) && set.toLang !== set.requestedToLang;
  const audioLang =
    !explicitUnsupportedTarget && LANDING_DEMO_AUDIO_LANGUAGES.has(set.toLang)
      ? set.toLang
      : null;

  const staticDemoAudio = useMemo(() => {
    if (!audioLang) return null;
    const byText = new Map<string, DemoAudioSource[]>();
    for (const entry of getLandingDemoStaticAudioEntries(audioLang)) {
      byText.set(entry.text, [{
        text: entry.text,
        lang: audioLang,
        url: entry.url,
        source: 'bundled-static',
        generatedBy: 'synced from media_assets via scripts/generate-bundled-demo-audio.ts',
        storageType: 'public-file',
        storageRef: entry.url,
      }]);
    }
    return byText;
  }, [audioLang]);

  const demoAudio = useMemo(() => {
    const byText = new Map<string, DemoAudioSource[]>();
    const append = (text: string, srcs: DemoAudioSource[] | undefined) => {
      if (!srcs || srcs.length === 0) return;
      const current = byText.get(text) ?? [];
      const byUrl = new Map([...current, ...srcs].map((source) => [source.url, source]));
      byText.set(text, [...byUrl.values()]);
    };
    for (const [text, srcs] of staticDemoAudio ?? []) append(text, srcs);
    const remoteForLang = remoteDemoAudio?.lang === audioLang ? remoteDemoAudio.byText : null;
    for (const [text, srcs] of remoteForLang ?? []) append(text, srcs);
    return byText.size > 0 ? byText : null;
  }, [audioLang, remoteDemoAudio, staticDemoAudio]);

  // The bundled files are the primary source so the first-contact demo survives
  // DB/storage/gateway outages. The public endpoint is still queried as an
  // optional extra source for operator-generated audio variants.
  useEffect(() => {
    if (!audioLang || typeof fetch !== 'function') return;
    const controller = new AbortController();
    let request: Promise<Response>;
    try {
      request = apiFetch(`/api/audio/demo?lang=${encodeURIComponent(audioLang)}`, {
        signal: controller.signal,
      });
    } catch {
      return;
    }
    request
      .then((res) => (res.ok ? res.json() : null))
      .then((data: {
        results?: {
          text: string;
          audio_url: string | null;
          arweave_urls?: string[];
          content_hash?: string | null;
          provider?: string | null;
          storage_type?: string | null;
          storage_provider?: string | null;
          storage_ref?: string | null;
          size_bytes?: number | null;
          created_at?: string | null;
        }[];
      } | null) => {
        if (!data?.results) return;
        const byText = new Map<string, DemoAudioSource[]>();
        for (const result of data.results) {
          const shared = {
            text: result.text,
            lang: audioLang,
            generatedBy: result.provider
              ? `${result.provider} (voice id not persisted)`
              : 'remote media asset',
            provider: result.provider ?? null,
            voice: null,
            contentHash: result.content_hash ?? null,
            storageType: result.storage_type ?? null,
            storageProvider: result.storage_provider ?? null,
            storageRef: result.storage_ref ?? null,
            sizeBytes: result.size_bytes ?? null,
            createdAt: result.created_at ?? null,
          };
          const srcs: DemoAudioSource[] = [
            result.audio_url
              ? {
                  ...shared,
                  url: result.audio_url,
                  source: 'remote-api',
                }
              : null,
            ...(result.arweave_urls ?? []).map((url): DemoAudioSource => ({
              ...shared,
              url,
              source: 'remote-arweave',
            })),
          ].filter((source): source is DemoAudioSource => Boolean(source));
          if (srcs.length > 0) byText.set(result.text, srcs);
        }
        setRemoteDemoAudio({ lang: audioLang, byText });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [audioLang]);

  useEffect(() => {
    if (!demoAudio || typeof Audio === 'undefined') {
      preloadedAudioRef.current.forEach((el) => el.pause());
      preloadedAudioRef.current = [];
      return;
    }
    preloadedAudioRef.current.forEach((el) => el.pause());
    preloadedAudioRef.current = [...demoAudio.values()].flatMap((srcs) => {
      const source = srcs[0];
      if (!source) return [];
      const el = new Audio();
      el.preload = 'auto';
      el.src = source.url;
      try {
        el.load();
      } catch {
        // Best-effort cache warming; playback still retries candidates.
      }
      return [el];
    });
    return () => {
      preloadedAudioRef.current.forEach((el) => el.pause());
      preloadedAudioRef.current = [];
    };
  }, [demoAudio]);

  useEffect(() => {
    if (!customOpen) return;
    function closeOnOutside(event: PointerEvent) {
      if (!customRootRef.current?.contains(event.target as Node)) {
        setCustomOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [customOpen]);

  const word = set.words[index];
  const stage = stages[index];
  const canPlayAudio = Boolean(audioLang) && (demoAudio?.size ?? 0) > 0;

  function playWordAudio(text: string) {
    const sources = demoAudio?.get(text);
    if (!sources || sources.length === 0) return;
    const srcs = sources.map((source) => source.url);
    void playUserInitiatedAudio(audioElRef, srcs, {
      onDebug: (event) => logLandingDemoAudio(event, {
        text,
        lang: set.toLang,
        sources,
      }),
    });
  }

  // "Study again soon" path (forgotten / a stage-0 custom pick). The card
  // slides off and drops to the back of the stack; the next card comes up in
  // its place. When it is the only card left there is nothing to hide behind,
  // so it simply comes back with a fresh cover.
  function scheduleAgain(nextStage: number) {
    setStages((current) => current.map((s, i) => (i === index ? nextStage : s)));
    setPending(true);
    setPendingAdvances(false);
    setAnimationClass('animate-deck-exit-scale');
    advanceTimer.current = window.setTimeout(() => {
      setQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));
      setAttemptKey((key) => key + 1);
      setAnimationClass('animate-deck-enter-slide');
      setPending(false);
      enterTimer.current = window.setTimeout(() => {
        setAnimationClass('');
      }, ENTER_CLEAR_DELAY_MS);
    }, EXIT_DELAY_MS);
  }

  function answer(kind: 'known' | 'forgotten' | 'custom', customStage?: number) {
    if (pending || isDone) return;
    const nextStage =
      kind === 'forgotten'
        ? 0
        : kind === 'custom'
          ? Math.min(customStage ?? stage + 2, MAX_DEMO_STAGE)
          : Math.min(stage + 1, MAX_DEMO_STAGE);
    setCustomOpen(false);
    if (kind === 'forgotten' || nextStage === 0) {
      scheduleAgain(nextStage);
      return;
    }
    setStages((current) => current.map((s, i) => (i === index ? nextStage : s)));
    setPending(true);
    setPendingAdvances(true);
    setAnimationClass('animate-deck-exit-scale');
    advanceTimer.current = window.setTimeout(() => {
      // The current card is mastered: drop it from the stack for good.
      const remaining = queue.slice(1);
      const nextCompletedCount = set.words.length - remaining.length;
      setCompletedCount(nextCompletedCount);
      setQueue(remaining);
      if (
        nextCompletedCount === MATCH_AFTER_COMPLETED_CARDS &&
        !matchPlayedRef.current &&
        set.words.length > 2
      ) {
        matchPlayedRef.current = true;
        setPhase('match');
        setAnimationClass('animate-deck-enter-rise');
        setPending(false);
        setPendingAdvances(false);
        enterTimer.current = window.setTimeout(() => {
          setAnimationClass('');
        }, ENTER_CLEAR_DELAY_MS);
        return;
      }
      if (remaining.length === 0) {
        setIsDone(true);
        setAnimationClass('animate-deck-enter-rise');
        setPending(false);
        setPendingAdvances(false);
        return;
      }
      setAnimationClass('animate-deck-enter-slide');
      setPending(false);
      setPendingAdvances(false);
      enterTimer.current = window.setTimeout(() => {
        setAnimationClass('');
      }, ENTER_CLEAR_DELAY_MS);
    }, EXIT_DELAY_MS);
  }

  function finishMatchPhase() {
    // When the minigame comes after the last demo card, finishing it should
    // land straight on the done state. Otherwise the queue head is the next
    // card to study.
    if (queue.length === 0) {
      setPhase('cards');
      setIsDone(true);
      setAnimationClass('animate-deck-enter-rise');
      enterTimer.current = window.setTimeout(() => {
        setAnimationClass('');
      }, ENTER_CLEAR_DELAY_MS);
      return;
    }
    setPhase('cards');
    setAnimationClass('animate-deck-enter-slide');
    enterTimer.current = window.setTimeout(() => {
      setAnimationClass('');
    }, ENTER_CLEAR_DELAY_MS);
  }

  function resetDemo() {
    audioElRef.current?.pause();
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
    setQueue(set.words.map((_, i) => i));
    setStages(set.words.map(() => 0));
    setPending(false);
    setPendingAdvances(false);
    setCompletedCount(0);
    setIsDone(false);
    setPhase('cards');
    setAttemptKey(0);
    setCustomOpen(false);
    matchPlayedRef.current = false;
    setAnimationClass('animate-deck-enter-slide');
  }

  function playDemoAudio() {
    if (!canPlayAudio || isDone) return;
    playWordAudio(word.back.text);
  }

  // The interval the word would move to if answered OK now — shown as the
  // small hint under the button, like the real card's srs-btn-hint.
  const okHint = t(INTERVAL_KEYS[Math.min(stage, INTERVAL_KEYS.length - 1)]);
  const shownCompletedCount = pendingAdvances
    ? Math.min(completedCount + 1, set.words.length)
    : completedCount;

  return (
    <div className="lp-demo-card">
      <LandingDemoStyles />
      <div className="flex items-center justify-between gap-3">
        <span className="lp-mono lp-demo-pair">{set.pairLabel}</span>
        <span className="lp-demo-dots" aria-label={`${shownCompletedCount}/${set.words.length}`}>
          {set.words.map((_, i) => (
            <span
              key={i}
              className={`lp-demo-dot ${i < shownCompletedCount ? 'is-on' : ''} ${
                !isDone && phase === 'cards' && i === index ? 'is-current' : ''
              }`}
            />
          ))}
        </span>
      </div>

      <div className={`lp-demo-stage ${animationClass}`}>
        {isDone ? (
          <div className="lp-demo-done" aria-live="polite">
            <span className="lp-demo-done-mark" aria-hidden="true">✓</span>
            <h3 className="lp-display lp-demo-done-title">{t('landing.demo.doneTitle')}</h3>
            <a href="/login" className="lp-demo-continue" onClick={onContinueToApp}>
              {t('landing.demo.continue')}
            </a>
            <button type="button" className="lp-demo-replay" onClick={resetDemo}>
              {t('landing.demo.replay')}
            </button>
          </div>
        ) : phase === 'match' ? (
          <DemoMatchingGame
            words={set.words}
            fromLang={set.fromLang}
            toLang={set.toLang}
            playWordAudio={canPlayAudio ? playWordAudio : undefined}
            onComplete={finishMatchPhase}
          />
        ) : (
          <>
            <div className="lp-demo-words">
              <div
                className="lp-demo-front notranslate"
                lang={set.fromLang}
                translate="no"
              >
                {word.front.text}
              </div>

              {/* The answer text is fully painted and hidden under the same canvas
                  scratch cover the app uses; keying by `index` gives each word a
                  freshly painted cover. */}
              <div className="lp-demo-answer-row">
                <div
                  className="lp-demo-answer cover-target is-scratch"
                  data-lang={set.toLang}
                  key={`${index}-${attemptKey}`}
                >
                  <span
                    className="lang-text notranslate lp-demo-back-word"
                    lang={set.toLang}
                    translate="no"
                  >
                    {word.back.text}
                  </span>
                  <ScratchCover label={t('card.scratchToReveal')} />
                </div>
              </div>
            </div>

            <div className={`lp-demo-action-zone ${canPlayAudio ? '' : 'lp-demo-action-zone--no-audio'}`}>
              <div className="lp-demo-audio-slot">
                {canPlayAudio ? (
                  <button
                    type="button"
                    className="lp-demo-audio"
                    disabled={pending}
                    onClick={playDemoAudio}
                    aria-label={t('card.playAudio')}
                    title={t('card.playAudio')}
                  >
                    <SpeakerIcon size={23} />
                  </button>
                ) : null}
              </div>

              <div className="lp-demo-actions card-actions-row card-actions-row--three">
                <button
                  type="button"
                  className="srs-btn srs-btn--forgot lp-demo-btn"
                  disabled={pending}
                  onClick={() => answer('forgotten')}
                >
                  <span className="srs-btn-copy">
                    <span className="srs-btn-label">{t('card.forgotten')}</span>
                    <span className="srs-btn-hint lp-demo-btn-hint">{t('landing.demo.soon')}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="srs-btn srs-btn--okay lp-demo-btn"
                  disabled={pending}
                  onClick={() => answer('known')}
                >
                  <span className="srs-btn-copy">
                    <span className="srs-btn-label">{t('card.ok')}</span>
                    <span className="srs-btn-hint lp-demo-btn-hint">{okHint}</span>
                  </span>
                </button>
                <div ref={customRootRef} className="lp-demo-custom-wrap">
                  <button
                    type="button"
                    className="srs-btn srs-btn--easy lp-demo-btn lp-demo-btn-custom"
                    disabled={pending}
                    onClick={() => setCustomOpen((open) => !open)}
                    aria-label={t('card.customInterval')}
                    aria-haspopup="listbox"
                    aria-expanded={customOpen}
                    title={t('card.customInterval')}
                  >
                    <span className="srs-btn-copy">
                      <span className="srs-btn-label lp-demo-btn-custom-label">...</span>
                      <span className="srs-btn-hint lp-demo-btn-hint">{t('card.custom')}</span>
                    </span>
                  </button>
                  {customOpen ? (
                    <div className="lp-demo-custom-menu" role="listbox">
                      <div className="lp-demo-custom-menu-head">{t('card.repeatAfter')}</div>
                      <div className="lp-demo-custom-menu-scroll">
                        {DEMO_CUSTOM_STAGE_IDS.map((stageId) => (
                          <button
                            key={stageId}
                            type="button"
                            role="option"
                            aria-selected={stageId === stage}
                            className={`lp-demo-custom-option ${
                              stageId === stage ? 'is-current' : ''
                            }`}
                            onClick={() => answer('custom', stageId)}
                          >
                            {t(`stage.${stageId}` as I18nKey)}
                          </button>
                        ))}
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="lp-demo-custom-option lp-demo-custom-option--done"
                          onClick={() => answer('custom', MAX_DEMO_STAGE)}
                        >
                          {t('card.fullyKnownNoRepeat')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
