'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { I18nProvider } from '@/components/I18nProvider';
import { StudyCountdown } from '@/features/learning/components/goals/StudyCountdown';
import { StudyGoalSetupCard } from '@/features/learning/components/goals/StudyGoalSetupCard';
import { StudyGoalPicker, type GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';
import { SessionRail } from '@/features/learning/components/SessionRail';
import { StreakDays, StreakSummary } from '@/features/learning/components/goals/StreakDays';
import { SessionCardShell } from '@/features/learning/components/SessionCardShell';
import {
  STREAK_VARIANTS,
  useStreakVariant,
  writeStreakVariant,
} from '@/features/learning/components/goals/streakVariant';
import type { StreakChipData, StreakDay } from '@/features/learning/goals/streakWeek';
import { SessionTimeStrip } from '@/features/learning/components/SessionTimeStrip';
import { currentIanaTimezone } from '@/lib/local-day';
import type { SessionBlockProgress } from '@/features/learning/session/dayProgress';
import type { SessionFlowState } from '@/features/learning/session/flow';
import {
  GOAL_STRIP_VARIANTS,
  useGoalStripVariant,
  writeGoalStripVariant,
} from '@/features/learning/components/goals/goalStripVariant';
import { normalizeFineTuneConfig } from '@/features/learning/fine-tune/config';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import { summarizeAllArchetypes } from '@/packages/domain/goals/cohorts';
import type { ReviewLoadInput } from '@/packages/domain/goals/forecast';
import type { StudyGoalVersion, StudyPacing } from '@/packages/domain/goals/goal';

type GoalDay = GoalSummary['days'][number];
type View = 'setup' | 'countdown' | 'streak' | 'forecast';

const VIEWS: View[] = ['setup', 'countdown', 'streak', 'forecast'];

/**
 * The app's default pacing, not an empty one. An empty stage table collapses
 * `estimateSecondsPerItem` to the bare reveal cost, which makes every budget on
 * this page look about half as expensive as a real learner's.
 */
const pacing: StudyPacing = {
  revealMode: 'press', minigameFrequency: 'off', fineTune: normalizeFineTuneConfig(undefined),
};

/** A local day key that cannot collide with the real one in activity storage. */
const DEV_DAY_KEY = '1999-01-01';

/** Just enough plan for the rails to draw against on this page. */
const DEV_BLOCKS: SessionBlockProgress[] = [
  { key: 'r1', kind: 'review', total: 7, done: 7, pending: 0, liveRemaining: 0, unavailable: 0 },
  { key: 'n1', kind: 'new', total: 10, done: 4, pending: 0, liveRemaining: 6, unavailable: 0 },
  { key: 'r2', kind: 'review', total: 16, done: 0, pending: 0, liveRemaining: 16, unavailable: 0 },
];

const DEV_FLOW: SessionFlowState = {
  index: 1,
  blocks: DEV_BLOCKS,
  block: DEV_BLOCKS[1],
  next: DEV_BLOCKS[2],
  blockNumber: 2,
  blockCount: 3,
  dayDone: 11,
  dayTotal: 33,
  dayPending: 0,
  complete: false,
};

function goalFrom(value: GoalPickerValue): ReviewLoadInput['goal'] {
  const isWords = value.mode === 'words';
  return {
    mode: value.mode,
    minutesPerDay: value.minutesPerDay,
    wordsPerDay: isWords ? value.newWordsPerDay : 0,
    newWordsPerDay: isWords ? value.newWordsPerDay : null,
    pacing,
  };
}

/**
 * Every state a segment can take, side by side.
 *
 * The states that matter most here are the quiet ones: a `nothing_due` day must
 * not read as a miss, and a planned day still ahead must stay visible or the
 * rhythm of a 4/7 goal disappears.
 */
const STREAK_CASES: Array<{ label: string; day: Partial<StreakDay> }> = [
  { label: 'nic neudělal', day: { status: 'none' } },
  { label: 'něco, ale málo', day: { status: 'partial' } },
  { label: 'splnil cíl', day: { status: 'met' } },
  { label: 'splnil a ještě víc', day: { status: 'exceeded' } },
  { label: 'splnil mimo své dny', day: { status: 'met', preferred: false } },
  { label: 'dnešek splněný', day: { status: 'met', isToday: true } },
  { label: 'dnešek otevřený', day: { status: 'none', isToday: true } },
  { label: 'nebylo co opakovat', day: { status: 'nothing_due' } },
  { label: 'preferovaný, teprve přijde', day: { status: 'none', isFuture: true } },
  { label: 'mimo preferenci', day: { status: 'none', preferred: false, isFuture: true } },
];

function streakDay(index: number, overrides: Partial<StreakDay>): StreakDay {
  return {
    dayKey: `2026-08-${String(24 + index).padStart(2, '0')}`,
    weekday: index + 1,
    status: 'none',
    preferred: true,
    isToday: false,
    isFuture: false,
    ...overrides,
  };
}

function StreakView() {
  const variant = useStreakVariant();

  // A four-day goal preferring Mon/Wed/Fri/Sun, lived differently: Monday met,
  // Tuesday exceeded though it was not a preferred day, Wednesday only partial,
  // today (Thursday) met. Three days kept out of four, with the week still open.
  const week: StreakDay[] = [
    streakDay(0, { status: 'met' }),
    streakDay(1, { status: 'exceeded', preferred: false }),
    streakDay(2, { status: 'partial' }),
    streakDay(3, { status: 'met', isToday: true }),
    streakDay(4, { status: 'none', isFuture: true }),
    streakDay(5, { status: 'none', preferred: false, isFuture: true }),
    streakDay(6, { status: 'none', isFuture: true }),
  ];

  // Six weeks of plausible history, so the long-arc variant has something real
  // to show rather than one week repeated.
  const history: StreakDay[][] = [
    [0, 2, 3, 1, 0, 4, 0],
    [3, 0, 3, 0, 2, 3, 0],
    [3, 3, 0, 3, 0, 0, 3],
    [4, 0, 3, 2, 3, 0, 0],
    [3, 3, 3, 0, 3, 0, 1],
  ].map((row) => row.map((code, index) => streakDay(index, {
    status: (['none', 'partial', 'met', 'exceeded'] as const)[Math.min(code, 3)],
    preferred: [1, 3, 5, 7].includes(index + 1),
  }))).concat([week]);

  const streak: StreakChipData = {
    days: week, weeks: history, dailyStreak: 1, weeklyStreak: 6, keptThisWeek: 3, weekTarget: 4,
  };

  return (
    <div className="flex flex-col gap-6">
      <Card title="Varianta (sdílená s běžící appkou)">
        <div className="flex flex-wrap gap-2">
          {STREAK_VARIANTS.map((option) => (
            <button
              key={option} type="button" onClick={() => writeStreakVariant(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${variant === option ? 'bg-[#a95e2a] text-white' : 'bg-[#eadfc8]'}`}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="m-0 mt-2 text-xs text-[#735d43]">
          Všechny varianty čtou stejnou sémantiku (kolik z dne, jaká barva,
          dnešek) — liší se jen forma, ne co je pravda.
        </p>
      </Card>

      <Card title="Všechny varianty vedle sebe">
        <div className="flex flex-col gap-4">
          {STREAK_VARIANTS.map((option) => (
            <div key={option} className="flex items-center gap-4 rounded-xl bg-[#f6f1e6] p-4">
              <span className="w-14 shrink-0 text-xs font-black uppercase tracking-wide text-[#735d43]">{option}</span>
              <StreakDays days={week} weeks={history} size="full" variant={option} value={1} />
              <span className="ml-auto flex items-center gap-2">
                <span className="stat-chip">
                  <StreakDays days={week} weeks={history} size="compact" variant={option} value={1} />
                  <span className="stat-chip-copy"><span className="stat-chip-value">1</span></span>
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Deliberately outside `Card`, and wrapped in the same two constraints
          the real deck imposes — the 800px viewport cap and the phone gutter —
          because escaping those is the whole point of the card's full-bleed. */}
      <div className="-mx-6 sm:mx-0">
        <p className="m-0 mb-2 text-xs font-bold uppercase tracking-wide text-[#735d43]">
          Karta konce dne (uvnitř skutečného guttteru decku, sloupec bez capu)
        </p>
        <div className="px-3 sm:px-0">
          <div className="relative mx-auto flex w-full max-w-none flex-col">
            <SessionCardShell celebratory>
              <h2 className="m-0 text-2xl font-black text-[#1f1a12]">Pro dnešek hotovo!</h2>
              <p className="m-0 mt-2 text-sm text-[#4a4032]">Další várka čeká zítra.</p>
              <StreakSummary streak={streak} />
            </SessionCardShell>
          </div>
        </div>
      </div>

      <Card title="Všechny stavy dne">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STREAK_CASES.map((entry) => (
            <div key={entry.label} className="flex flex-col items-center gap-2 rounded-xl bg-[#f6f1e6] p-3 text-center">
              <StreakDays days={[streakDay(0, entry.day)]} size="full" />
              <span className="text-[0.6875rem] font-bold leading-tight text-[#735d43]">{entry.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="m-0 mb-4 text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Slider({ label, value, max, onChange }: {
  label: string; value: number; max: number; onChange: (next: number) => void;
}) {
  return (
    <label className="block text-xs font-bold">
      {label}: <span className="tabular-nums">{value}</span>
      <input
        type="range" min={0} max={max} value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 block w-full accent-[#a95e2a]"
      />
    </label>
  );
}

/** The intro card against local state — no session, no auth, no sync. */
function SetupView() {
  const [saved, setSaved] = useState<GoalPickerValue | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-2xl bg-background py-6 lg:bg-[#f4efe2]">
        <StudyGoalSetupCard pacing={pacing} onSave={setSaved} />
      </div>
      <Card title="Co by se uložilo">
        <pre className="m-0 overflow-x-auto rounded-xl bg-[#f6f1e6] p-3 text-xs">
          {saved === null ? 'zatím nic' : JSON.stringify(saved, null, 2)}
        </pre>
      </Card>
    </div>
  );
}

/**
 * The strip against a hand-built day snapshot.
 *
 * `useStudyCountdown` seeds the activity runtime from `day.activeMs`, so the
 * clock slider really does drive the displayed time — the same path the real
 * app takes when the goal summary arrives.
 */
function CountdownView() {
  const [mode, setMode] = useState<'words' | 'minutes'>('words');
  const [activeSeconds, setActiveSeconds] = useState(180);
  const [introduced, setIntroduced] = useState(4);
  const [reviewed, setReviewed] = useState(7);
  const [nothingDue, setNothingDue] = useState(false);
  const variant = useGoalStripVariant();

  const day: GoalDay = {
    dayKey: DEV_DAY_KEY, activeMs: activeSeconds * 1000,
    answeredWords: introduced + reviewed,
    goalDaysPerWeek: 4, goalMinutes: 10, goalWords: 10, goalMode: mode,
    goalStatus: nothingDue ? 'nothing_due' : 'active',
    availableNewWords: 120, dueReviewCount: 40,
    resolvedNewTarget: 10, resolvedReviewTarget: 23,
    resolvedItemBudget: 33, resolvedMinutesBudget: 10,
    introducedWords: introduced, reviewedWords: reviewed, met: false,
    preferred: true, status: nothingDue ? 'nothing_due' : 'none',
  };
  const goal = {
    id: 'dev', effectiveFromDay: DEV_DAY_KEY, enabled: true, mode,
    daysPerWeek: 4, minutesPerDay: 10, wordsPerDay: 10, newWordsPerDay: 10,
    preset: 'custom', pacing,
  } as unknown as StudyGoalVersion;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card title="Ovládání">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {(['words', 'minutes'] as const).map((option) => (
              <button
                key={option} type="button" onClick={() => setMode(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${mode === option ? 'bg-[#2a2218] text-white' : 'bg-[#eadfc8]'}`}
              >
                {option}
              </button>
            ))}
          </div>
          <Slider label="Aktivní čas (s)" value={activeSeconds} max={1800} onChange={setActiveSeconds} />
          <Slider label="Nová slova" value={introduced} max={10} onChange={setIntroduced} />
          <Slider label="Opakování" value={reviewed} max={23} onChange={setReviewed} />
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={nothingDue} onChange={(e) => setNothingDue(e.target.checked)} />
            Stav „nothing_due“
          </label>
          <div>
            <p className="m-0 mb-1 text-xs font-bold">Varianta pruhu (sdílená s běžící appkou)</p>
            <div className="flex gap-2">
              {GOAL_STRIP_VARIANTS.map((option) => (
                <button
                  key={option} type="button" onClick={() => writeGoalStripVariant(option)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${variant === option ? 'bg-[#a95e2a] text-white' : 'bg-[#eadfc8]'}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <p className="m-0 text-xs text-[#735d43]">
            Hodiny nezčervenají podle spotřebovaného času, ale podle{' '}
            <em>odhadu dokončení</em>: jakmile aktuální tempo × zbývající karty
            přeteče rozpočet. Zpomal to přidáním času bez přidání odpovědí.
          </p>
        </div>
      </Card>
      <div className="flex flex-col gap-6">
        <Card title="Pruh">
          <div className="rounded-xl bg-[#f6f1e6] p-4">
            <StudyCountdown day={day} goal={goal} enabled />
          </div>
        </Card>
        <Card title={mode === 'minutes' ? 'Odpočet nad kartami' : 'Raily u okrajů'}>
          <p className="m-0 mb-3 text-xs text-[#735d43]">
            U časového cíle nejsou raily žádné — zbývá jen odpočet nad balíčkem,
            s vlastním miniprogresem a s ryskami tam, kde se den láme na
            opakování → nová slova → doběh. U slov zůstávají raily beze změny.
            Posuvník „Aktivní čas“ je tu jen náhled — v aplikaci ho hýbe jen
            měřený čas, takže odloženou kartu nic neodpočítá.
          </p>
          {/* The real study area sits on the fixed warm ground, not on the theme
              background — the rail track is a dark translucency tuned for it. */}
          <div className="relative h-72 overflow-hidden rounded-xl bg-[#dcd1b9] text-[#2a2218]">
            {mode === 'minutes' ? (
              <SessionTimeStrip
                goal={{
                  dayKey: DEV_DAY_KEY,
                  timezone: currentIanaTimezone(),
                  budgetMs: 10 * 60_000,
                  serverActiveMs: activeSeconds * 1000,
                }}
              />
            ) : (
              <SessionRail flow={DEV_FLOW} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ForecastView() {
  const [goalValue, setGoalValue] = useState<GoalPickerValue>({
    mode: 'words', daysPerWeek: 4, weekdays: [1, 3, 5, 6], minutesPerDay: 10, newWordsPerDay: 10,
  });
  const [wordPoolSize, setWordPoolSize] = useState(600);
  const summaries = useMemo(
    () => summarizeAllArchetypes(goalFrom(goalValue), { wordPoolSize }),
    [goalValue, wordPoolSize],
  );
  const peak = Math.max(1, ...summaries.flatMap((entry) => entry.days.map((day) => day.answerEvents)));

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="flex flex-col gap-4">
        <StudyGoalPicker pacing={pacing} initial={goalValue} onSubmit={setGoalValue} submitLabel="Přepočítat" />
        <Card title="Zásoba slov">
          <Slider label="Slov v seznamech" value={wordPoolSize} max={3000} onChange={setWordPoolSize} />
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card title="Kdo si ten cíl nastaví">
          <p className="m-0 mb-3 text-xs text-[#735d43]">
            Stejný cíl, pět různých návyků. Podíly jsou odhad, ne měření — jsou tu proto,
            aby se okrajový případ nepletl s normou. Průměry se čtou z posledních 14 dnů
            před řezem, jen ze dnů, kdy se ten člověk skutečně učil.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#e3d7bd]">
                  <th className="py-2 pr-3">Persona</th>
                  <th className="py-2 pr-3">Podíl</th>
                  <th className="py-2 pr-3">Den</th>
                  <th className="py-2 pr-3 text-right">Opakování/den</th>
                  <th className="py-2 pr-3 text-right">Min/den</th>
                  <th className="py-2 pr-3 text-right">Zavedeno</th>
                  <th className="py-2 pr-3 text-right">Zralých</th>
                  <th className="py-2 text-right">Backlog</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((entry) => entry.slices.map((slice, index) => (
                  <tr key={`${entry.archetype.id}-${slice.day}`} className="border-b border-[#f0e8d6]">
                    <td className="py-1.5 pr-3 font-bold">{index === 0 ? entry.archetype.id : ''}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{index === 0 ? `${entry.archetype.share} %` : ''}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{slice.day}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{slice.reviewsPerStudyDay.toFixed(1)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{slice.minutesPerStudyDay.toFixed(1)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{Math.round(slice.introducedEver)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{Math.round(slice.matureWords)}</td>
                    <td className="py-1.5 text-right tabular-nums">{Math.round(slice.backlog)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </Card>

        {summaries.map((entry) => (
          <Card key={entry.archetype.id} title={`${entry.archetype.id} · ${entry.archetype.share} % · ${entry.archetype.daysPerWeek}×/týden · ${Math.round(entry.archetype.successRate * 100)} % úspěšnost`}>
            <div className="flex h-32 items-end gap-px" aria-label={`Odpovědi za den, ${entry.archetype.id}`}>
              {entry.days.map((day) => (
                <div
                  key={day.day}
                  title={`Den ${day.day}: ${Math.round(day.answerEvents)} odpovědí, ${Math.round(day.backlog)} v backlogu`}
                  className="flex min-w-0 flex-1 flex-col justify-end"
                >
                  <div
                    className={day.studied ? 'rounded-t bg-[#a95e2a]' : 'rounded-t bg-[#ddd0b6]'}
                    style={{ height: `${(day.answerEvents / peak) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <p className="m-0 mt-2 text-xs text-[#735d43]">
              Sloupce jsou skutečné odpovědi včetně pětiminutových návratů; světlé dny
              jsou ty, kdy appka zůstala zavřená. Vrchol backlogu:{' '}
              <strong className="tabular-nums">{Math.round(entry.slices.at(-1)?.peakBacklog ?? 0)}</strong>
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function StudyGoalDevPreview() {
  // Read through `useSearchParams` rather than `window.location`: the latter is
  // undefined during the prerender, so the server would settle on the default
  // view and the client on the requested one — a hydration mismatch.
  const requested = useSearchParams().get('view');
  const [view, setView] = useState<View>(
    VIEWS.includes(requested as View) ? (requested as View) : 'forecast',
  );

  const choose = (next: View) => {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  return (
    <I18nProvider language="cs">
      <main className="mx-auto min-h-screen max-w-6xl bg-[#fffdf7] px-5 py-10 text-[#2a2218]">
        <h1 className="mb-2 text-3xl font-black">Studijní cíl · dev preview</h1>
        <p className="mb-5 max-w-2xl text-sm text-[#735d43]">
          Úvodní karta, snapshotový countdown a odhad zátěže opakování. Vše běží na
          ručně sestavených datech — bez přihlášení, bez databáze.
        </p>
        <div className="mb-8 flex gap-2">
          {VIEWS.map((option) => (
            <button
              key={option} type="button" onClick={() => choose(option)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${view === option ? 'bg-[#2a2218] text-white' : 'bg-[#eadfc8]'}`}
            >
              {option}
            </button>
          ))}
        </div>
        {view === 'setup' ? <SetupView /> : view === 'countdown' ? <CountdownView /> : view === 'streak' ? <StreakView /> : <ForecastView />}
      </main>
    </I18nProvider>
  );
}
