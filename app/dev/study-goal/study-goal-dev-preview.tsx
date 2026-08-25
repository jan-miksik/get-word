'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { I18nProvider } from '@/components/I18nProvider';
import { StudyCountdown } from '@/features/learning/components/goals/StudyCountdown';
import { StudyGoalSetupCard } from '@/features/learning/components/goals/StudyGoalSetupCard';
import { StudyGoalPicker, type GoalPickerValue } from '@/features/learning/components/goals/StudyGoalPicker';
import { SessionRail } from '@/features/learning/components/SessionRail';
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
type View = 'setup' | 'countdown' | 'forecast';

const VIEWS: View[] = ['setup', 'countdown', 'forecast'];

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
        {view === 'setup' ? <SetupView /> : view === 'countdown' ? <CountdownView /> : <ForecastView />}
      </main>
    </I18nProvider>
  );
}
