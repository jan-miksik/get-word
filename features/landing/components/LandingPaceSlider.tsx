'use client';

import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { pluralForm } from '@/lib/i18n/plural';
import type { I18nKey } from '@/lib/i18n/messages';

/**
 * Minutes of study per word learned in a week. Anchored on the pace the section
 * is written around: 30 words a week ≈ 15 minutes a day. Even steps keep the
 * derived minutes a whole number, so nothing ever renders as "7.5 minutes".
 */
const MINUTES_PER_WORD = 0.5;
const MIN_WORDS_PER_WEEK = 4;
const MAX_WORDS_PER_WEEK = 100;
const STEP = 2;
const DEFAULT_WORDS_PER_WEEK = 30;

/**
 * Whole weeks, deliberately: a month is 4.3 weeks, but rounding down keeps every
 * total a number the visitor can check on their own fingers, and it errs on the
 * side of promising less.
 */
const HORIZONS = [
  { id: 'month', weeks: 4, label: 'landing.marathon.horizon.month' },
  { id: 'quarter', weeks: 13, label: 'landing.marathon.horizon.quarter' },
  { id: 'halfYear', weeks: 26, label: 'landing.marathon.horizon.halfYear' },
  { id: 'year', weeks: 52, label: 'landing.marathon.horizon.year' },
] satisfies ReadonlyArray<{ id: string; weeks: number; label: I18nKey }>;
const DEFAULT_HORIZON = 'halfYear';

/**
 * Measured coverage of spoken English by the N most frequent word *forms*, from
 * Adolphs & Schmitt (2003) — the study is used here rather than the better-known
 * ones because it is the only widely cited set that also reports points well
 * below 1 000 words, which is the range this slider spends most of its time in.
 * Each value is the midpoint of the two spoken corpora they report (e.g. 100
 * words covered 62–66 %, so 64 here). Straight linear interpolation between the
 * anchors; no fitted equation, so every number on screen can be traced back to
 * a row of published data.
 *
 * Ha (2022), on ~600M words of film and TV, and Nation (2006), on word families,
 * both find the same shape: a huge jump over the first thousand, then thousands
 * of words for a few percent.
 *
 * This curve is a *benchmark*, not a prediction. It assumes the words learned
 * are the most frequent ones, and Get Word deliberately lets people learn words
 * from their own work and life, which are often rarer than that. That is why the
 * result is never shown as a bare number — see COVERAGE_BANDS.
 */
const COVERAGE_ANCHORS: ReadonlyArray<readonly [words: number, percent: number]> = [
  [25, 37],
  [50, 50],
  [100, 64],
  [500, 83.5],
  [1000, 88.5],
  [1500, 91.5],
  [2000, 92.5],
  [2500, 93.5],
  [3000, 94.5],
  [5000, 96.5],
];

function coverageBenchmark(words: number): number {
  const first = COVERAGE_ANCHORS[0];
  const last = COVERAGE_ANCHORS[COVERAGE_ANCHORS.length - 1];
  if (words <= first[0]) return (words / first[0]) * first[1];
  if (words >= last[0]) return last[1];
  for (let i = 1; i < COVERAGE_ANCHORS.length; i += 1) {
    const [highWords, highPercent] = COVERAGE_ANCHORS[i];
    if (words > highWords) continue;
    const [lowWords, lowPercent] = COVERAGE_ANCHORS[i - 1];
    const t = (words - lowWords) / (highWords - lowWords);
    return lowPercent + (highPercent - lowPercent) * t;
  }
  return last[1];
}

/**
 * The benchmark, widened into a range before anybody sees it. A single figure
 * ("≈ 86 %") would claim a precision the research does not have: studies differ
 * by corpus and by whether they count forms, lemmas or whole word families.
 *
 * Low down, the band hangs *below* the benchmark, because the curve assumes the
 * most frequent words were learned first and Get Word lets people pick their
 * own, which are often rarer than that.
 *
 * High up, the band opens to 100 instead. Once the average sits around 95 %, the
 * spread between conversations is what actually matters: some you will know
 * every word of, others will still have a gap every ten words. A band of 90–100
 * says that; "≈ 95 %" hides it.
 *
 * Thresholds are on the benchmark, so 3 000 words (94.5) reads 85–100 and 3 500
 * (95.0) reads 90–100.
 */
const COVERAGE_BANDS: ReadonlyArray<{ upTo: number; low: number; high: number }> = [
  { upTo: 30, low: 15, high: 30 },
  { upTo: 45, low: 25, high: 45 },
  { upTo: 60, low: 40, high: 60 },
  { upTo: 70, low: 50, high: 70 },
  { upTo: 80, low: 60, high: 80 },
  { upTo: 87, low: 70, high: 85 },
  { upTo: 92, low: 80, high: 95 },
  { upTo: 94.9, low: 85, high: 100 },
  { upTo: Infinity, low: 90, high: 100 },
];

/**
 * Where the curve and its shape come from. Author, year and title are left
 * untranslated on purpose: it is a citation, not copy.
 *
 * Every link is readable without a subscription. The DOIs of the two journal
 * articles are not used, because both land on a paywall; these go to the freely
 * hosted full texts instead. Adolphs & Schmitt, which the anchor points are
 * taken from, has no free full text anywhere, so it points at its open ERIC
 * record and says that it is only the abstract.
 */
const COVERAGE_SOURCES = [
  {
    label: 'Adolphs & Schmitt (2003): Lexical Coverage of Spoken Discourse (abstract)',
    href: 'https://eric.ed.gov/?id=EJ678005',
  },
  {
    label: 'Nation (2006): How Large a Vocabulary Is Needed for Reading and Listening?',
    href: 'https://www.lextutor.ca/cover/papers/nation_2006.pdf',
  },
  {
    label: 'Nation & Waring (1997): Vocabulary Size, Text Coverage and Word Lists',
    href: 'https://www.lextutor.ca/research/nation_waring_97.html',
  },
] as const;

function coverageBand(words: number): { low: number; high: number } {
  const benchmark = coverageBenchmark(words);
  return COVERAGE_BANDS.find((band) => benchmark <= band.upTo) ?? COVERAGE_BANDS[0];
}

const WORDS_PER_WEEK_LABEL = {
  one: 'landing.marathon.wordsPerWeek.one',
  few: 'landing.marathon.wordsPerWeek.few',
  many: 'landing.marathon.wordsPerWeek.many',
} satisfies Record<string, I18nKey>;
const MINUTES_PER_DAY_LABEL = {
  one: 'landing.marathon.minutesPerDay.one',
  few: 'landing.marathon.minutesPerDay.few',
  many: 'landing.marathon.minutesPerDay.many',
} satisfies Record<string, I18nKey>;
const WORDS_IN_HORIZON_LABEL = {
  one: 'landing.marathon.wordsInHorizon.one',
  few: 'landing.marathon.wordsInHorizon.few',
  many: 'landing.marathon.wordsInHorizon.many',
} satisfies Record<string, I18nKey>;

/**
 * The pace equation, made adjustable: pick a weekly number of words and a
 * horizon, and the daily minutes, the total and the share of everyday speech it
 * covers all follow. The equation comes before the prose in the section on
 * purpose — the numbers are the argument, the paragraph is the footnote.
 *
 * Server-rendered at the default pace, so the milestones read the same as the
 * prose next to them before any JavaScript runs.
 */
export function LandingPaceSlider() {
  const { t, language } = useI18n();
  const [wordsPerWeek, setWordsPerWeek] = useState(DEFAULT_WORDS_PER_WEEK);
  const [horizonId, setHorizonId] = useState<string>(DEFAULT_HORIZON);
  const horizon = HORIZONS.find((option) => option.id === horizonId) ?? HORIZONS[2];

  const minutesPerDay = Math.round(wordsPerWeek * MINUTES_PER_WORD);
  const totalWords = wordsPerWeek * horizon.weeks;
  const coverage = coverageBand(totalWords);
  const progress =
    (wordsPerWeek - MIN_WORDS_PER_WEEK) / (MAX_WORDS_PER_WEEK - MIN_WORDS_PER_WEEK);

  return (
    <div className="lp-pace">
      <div className="lp-pace-controls">
        <div className="lp-pace-control">
          <label className="lp-pace-label" htmlFor="landing-pace">
            {t('landing.marathon.sliderLabel')}
          </label>
          <input
            id="landing-pace"
            className="lp-pace-range"
            type="range"
            min={MIN_WORDS_PER_WEEK}
            max={MAX_WORDS_PER_WEEK}
            step={STEP}
            value={wordsPerWeek}
            onChange={(event) => setWordsPerWeek(Number(event.target.value))}
            style={{ '--progress': `${progress * 100}%` } as React.CSSProperties}
          />
        </div>

        <div className="lp-pace-control lp-pace-control--horizon">
          <label className="lp-pace-label" htmlFor="landing-pace-horizon">
            {t('landing.marathon.horizonLabel')}
          </label>
          <div className="lp-pace-select-wrap">
            <select
              id="landing-pace-horizon"
              className="lp-pace-select"
              value={horizon.id}
              onChange={(event) => setHorizonId(event.target.value)}
            >
              {HORIZONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.label)}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="lp-pace-select-caret" />
          </div>
        </div>
      </div>

      <ol className="lp-stats">
        <Milestone
          value={String(wordsPerWeek)}
          label={t(pluralForm(WORDS_PER_WEEK_LABEL, language, wordsPerWeek))}
        />
        <Milestone
          value={String(minutesPerDay)}
          label={t(pluralForm(MINUTES_PER_DAY_LABEL, language, minutesPerDay))}
        />
        <Milestone
          value={String(totalWords)}
          label={`${t(pluralForm(WORDS_IN_HORIZON_LABEL, language, totalWords))} ${t(horizon.label)}`}
          accent
        />
        <Milestone
          value={t('landing.marathon.coverageValue', {
            low: coverage.low,
            high: coverage.high,
          })}
          label={t('landing.marathon.coverageLabel')}
          accent
        />
      </ol>

      <p className="lp-pace-note">{t('landing.marathon.coverageNote')}</p>

      {/* Native <details>: the methodology is worth having on the page and worth
          not being on it by default. No JavaScript, so it works in the
          server-rendered page and for anybody reading with the keyboard. */}
      <details className="lp-method">
        <summary className="lp-method-summary">{t('landing.marathon.methodTitle')}</summary>
        <div className="lp-method-body">
          <p>{t('landing.marathon.methodCurve')}</p>
          <p>{t('landing.marathon.methodLastPercent')}</p>
          <p>{t('landing.marathon.methodCoverageMeaning')}</p>
          <p className="lp-method-sources">
            <span className="lp-method-sources-label">
              {t('landing.marathon.methodSources')}
            </span>
            {COVERAGE_SOURCES.map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="lp-method-source"
              >
                {source.label}
              </a>
            ))}
          </p>
        </div>
      </details>
    </div>
  );
}

function Milestone({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <li className={`lp-stat ${accent ? 'lp-stat--accent' : ''}`}>
      <span className="lp-stat-value lp-display">{value}</span>
      <span className="lp-stat-label">{label}</span>
    </li>
  );
}
