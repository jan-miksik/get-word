'use client';

import { useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import { WordChatProgress } from '@/features/word-chat/components/WordChatProgress';
import { SelectStep } from '@/features/word-chat/components/SelectStep';
import { ReviewStep } from '@/features/word-chat/components/ReviewStep';
import { DoneStep } from '@/features/word-chat/components/DoneStep';
import type { ReviewItem } from '@/features/word-chat/types';

/**
 * Workbench for the in-app "Add words" flow. Every step is rendered from static
 * props, so the whole thing can be compared side by side without a signed-in
 * session, a language pair or a live model behind it.
 */

const SAMPLE = [
  ['snídaně', 'breakfast'],
  ['objednat si kávu', 'to order a coffee'],
  ['účet, prosím', 'the bill, please'],
  ['bez cukru', 'without sugar'],
  ['s sebou', 'to take away'],
  ['ještě jednou', 'one more time'],
] as const;

const reviewItems: ReviewItem[] = [
  ...SAMPLE.map(([known, target]): ReviewItem => ({
    kind: 'word',
    textKnown: known,
    textTarget: target,
    audioStatus: 'idle',
  })),
  // One address-form pair, so the chips are visible here without spending a
  // real translation. Both rows ask the same question on purpose — that is
  // exactly why each needs its label.
  {
    kind: 'sentence',
    textKnown: 'How are you?',
    textTarget: 'Wie geht es dir?',
    audioStatus: 'idle',
    addressForm: { form: 'familiar' },
    variantGroupKey: 'dev:address',
  },
  {
    kind: 'sentence',
    textKnown: 'How are you?',
    textTarget: 'Wie geht es Ihnen?',
    audioStatus: 'idle',
    addressForm: { form: 'polite' },
    variantGroupKey: 'dev:address',
  },
];

const limits = {
  maxItemsPerSession: 30,
  softItemWarningThreshold: 15,
  monthlyUsed: 12,
  monthlyLimit: 60,
  monthlyResetAt: null,
};

const commitResult = {
  listId: 'dev-list',
  categoryId: 'dev-category',
  itemCount: SAMPLE.length,
  takeoverCount: 0,
  upgradedTakeoverCount: 0,
  alreadyCommitted: false,
  monthlyUsed: 18,
  monthlyLimit: 60,
};

type Screen = 'select' | 'review' | 'done';

const SCREENS: Array<[Screen, string]> = [
  ['select', '1 · Words'],
  ['review', '2 · Check'],
  ['done', '3 · Saved'],
];

function Frame({ step, children }: { step: Screen; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[800px] px-4 pb-10">
      <section
        style={warmPaletteVars}
        className="onboarding-card w-full rounded-2xl! border-2! p-4 sm:p-7"
      >
        <div className="mb-5">
          <WordChatProgress step={step} />
        </div>
        {children}
      </section>
    </div>
  );
}

export function AddWordsDevPreview() {
  const [screen, setScreen] = useState<Screen>('select');
  const [custom, setCustom] = useState<{ kind: 'sentence' | 'word'; text: string }[]>([
    { kind: 'word', text: 'snídaně' },
    { kind: 'sentence', text: 'objednat si kávu' },
  ]);

  return (
    <I18nProvider language="cs">
      <div
        style={warmPaletteVars}
        className="min-h-[100dvh] bg-[color:var(--ob-surface)] py-6 text-[color:var(--ob-ink)]"
      >
        <div className="mx-auto mb-6 flex w-full max-w-[800px] flex-wrap gap-2 px-4">
          {SCREENS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScreen(value)}
              className={[
                'onboarding-option rounded-full px-4 py-2 text-xs font-extrabold',
                screen === value ? 'onboarding-option-highlight' : '',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {screen === 'select' ? (
          <Frame step="select">
            <SelectStep
              mode="manual"
              listName="Moje slovíčka — angličtina"
              proposals={[]}
              isSelected={() => false}
              onToggle={() => {}}
              onUpdateProposal={() => {}}
              onSelectAll={() => {}}
              onClearSelection={() => {}}
              customItems={custom}
              onAddCustom={(text) => setCustom((rows) => [...rows, { kind: 'word', text }])}
              onRemoveCustom={(text) =>
                setCustom((rows) => rows.filter((row) => row.text !== text))
              }
              limits={limits}
              selectedCount={custom.length}
              overSoftLimit={false}
              atHardCap={false}
              monthlyRemaining={48}
              overMonthlyLimit={false}
              atSelectionLimit={false}
              busy={false}
              languageTo="en"
              onStartChat={() => {}}
              onOpenSettings={() => {}}
              onContinue={() => setScreen('review')}
            />
          </Frame>
        ) : screen === 'review' ? (
          <Frame step="review">
            <ReviewStep
              items={reviewItems}
              listName="Moje slovíčka — angličtina"
              categoryName="Kavárna"
              warningsByPair={{}}
              translationDiagnostics={null}
              isPublic={false}
              busy={false}
              onUpdate={() => {}}
              onRemove={() => {}}
              onEnsureAudio={() => {}}
              onBack={() => setScreen('select')}
              onSave={() => setScreen('done')}
            />
          </Frame>
        ) : (
          <Frame step="done">
            <DoneStep
              result={commitResult}
              refreshStatus="success"
              onRetryRefresh={async () => {}}
              onAddMore={() => setScreen('select')}
              onDone={() => setScreen('select')}
            />
          </Frame>
        )}
      </div>
    </I18nProvider>
  );
}
