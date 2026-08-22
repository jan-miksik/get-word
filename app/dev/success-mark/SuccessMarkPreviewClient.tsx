'use client';

import { useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import { MultipleChoiceGame } from '@/features/learning/components/games/MultipleChoiceGame';
import { TypingChallengeGame } from '@/features/learning/components/games/TypingChallengeGame';
import { WordAssemblyGame } from '@/features/learning/components/games/WordAssemblyGame';
import { SuccessMark } from '@/features/learning/components/games/SuccessMark';
import {
  FALLBACK_ANIMATION,
  FALLBACK_SKIN,
  SUCCESS_MARK_ANIMATIONS,
  SUCCESS_MARK_SKINS,
  type SuccessMarkAnimation,
  type SuccessMarkSkin,
} from '@/features/learning/components/games/successMarkVariant';
import type { NormalizedWord } from '@/lib/words';

/**
 * Dev harness for the success badge: `/dev/success-mark`.
 *
 * Three things are hard to judge anywhere else. The entrances are over in half a
 * second and only fire on a correct answer, so comparing them means replaying
 * them side by side; the skins only read as different next to each other; and
 * the badge's *placement* only makes sense inside a real card, because the cards
 * differ wildly in how tall and how full they are.
 *
 * The controls only affect this preview. Study cards always use their own
 * per-reveal animation roll and the solid appearance.
 */

const ANIMATION_NOTES: Record<SuccessMarkAnimation, string> = {
  pop: 'pružina + jedno kolečko',
  stamp: 'razítko, dopadne s natočením',
  drop: 'spadne shora, fajfka se dokreslí',
  draw: 'tiché — kolečko i fajfka se kreslí',
  bloom: 'nehýbe se, dvě rozkvétající kolečka',
};

const SKIN_NOTES: Record<SuccessMarkSkin, string> = {
  green: 'světle zelená, tvrdý stín',
  solid: 'plná zelená, krémová fajfka',
  ink: 'papír a inkoust jako rámeček kartičky',
  gold: 'zlatá medaile, dvojitý kroužek',
  accent: 'modrý akcent, bez obruby, měkká záře',
};

const PAIRS: [string, string][] = [
  ['pes', 'con chó'],
  ['jíst', 'ăn'],
  ['děkuji', 'cảm ơn'],
  ['nádraží', 'nhà ga'],
];

const WORDS: NormalizedWord[] = PAIRS.map(([from, to], index) => ({
  id: `success-${index}`,
  category: ['word'],
  languageFrom: 'cs',
  languageTo: 'vi',
  cz: from,
  en: '',
  vi: to,
}));

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-black/10 px-3 py-4">
      <h2 className="m-0 mb-1 text-xs font-bold uppercase tracking-wider text-[#2A2218]">{title}</h2>
      {hint && <p className="m-0 mb-3 max-w-2xl text-[0.7rem] text-[#4a4032]">{hint}</p>}
      {children}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 font-bold ${
        active ? 'border-black/50 bg-white' : 'border-black/20'
      }`}
    >
      {children}
    </button>
  );
}

export function SuccessMarkPreviewClient() {
  const [animationChoice, setAnimationChoice] = useState<SuccessMarkAnimation | 'random'>('random');
  const [skinChoice, setSkinChoice] = useState<SuccessMarkSkin | 'random'>('solid');
  // Remounting is what replays a CSS entrance animation; there is no way to
  // re-trigger one that has already finished on a mounted element. It also
  // re-rolls every badge that is currently set to random.
  const [take, setTake] = useState(0);
  const replay = () => setTake((value) => value + 1);

  // With an axis left on random the samples would each roll their own, and
  // nothing would be comparable — so the galleries pin whatever is not the axis
  // being shown, falling back to the first entry.
  const pinnedAnimation: SuccessMarkAnimation =
    animationChoice === 'random' ? FALLBACK_ANIMATION : animationChoice;
  const pinnedSkin: SuccessMarkSkin = skinChoice === 'random' ? FALLBACK_SKIN : skinChoice;

  return (
    <I18nProvider language="cs">
      <div className="min-h-[100dvh] bg-[#dcd1b9] text-[#2A2218]">
        <div className="sticky top-0 z-20 border-b border-black/10 bg-[#dcd1b9] px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-bold uppercase tracking-wider">animace</span>
            <Chip active={animationChoice === 'random'} onClick={() => { setAnimationChoice('random'); replay(); }}>
              náhodně
            </Chip>
            {SUCCESS_MARK_ANIMATIONS.map((value) => (
              <Chip
                key={value}
                active={animationChoice === value}
                onClick={() => { setAnimationChoice(value); replay(); }}
              >
                {value}
              </Chip>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="w-20 font-bold uppercase tracking-wider">provedení</span>
            <Chip active={skinChoice === 'random'} onClick={() => { setSkinChoice('random'); replay(); }}>
              náhodně
            </Chip>
            {SUCCESS_MARK_SKINS.map((value) => (
              <Chip
                key={value}
                active={skinChoice === value}
                onClick={() => { setSkinChoice(value); replay(); }}
              >
                {value}
              </Chip>
            ))}
            <button type="button" onClick={replay} className="ml-auto rounded-md border border-black/20 px-2 py-1 font-bold">
              přehrát znovu
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.7rem] text-[#4a4032]">
            <span>Nastavení na této stránce nemění studijní kartičky ani nic neukládá.</span>
          </div>
        </div>

        <Section
          title="provedení"
          hint={`Vykreslené s animací „${pinnedAnimation}“, aby šla porovnat jen barva a stavba odznaku.`}
        >
          <div className="flex flex-wrap gap-5">
            {SUCCESS_MARK_SKINS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setSkinChoice(value); replay(); }}
                className={`flex w-36 flex-col items-center gap-2 rounded-xl border px-2 py-4 text-center ${
                  skinChoice === value ? 'border-black/50 bg-white/60' : 'border-transparent'
                }`}
              >
                <SuccessMark key={`${value}:${take}`} label="" animation={pinnedAnimation} skin={value} />
                <span className="text-xs font-bold">{value}</span>
                <span className="text-[0.68rem] leading-tight text-[#4a4032]">{SKIN_NOTES[value]}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="animace"
          hint={`Vykreslené v provedení „${pinnedSkin}“. Všechny se přehrají naráz.`}
        >
          <div className="flex flex-wrap gap-5">
            {SUCCESS_MARK_ANIMATIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => { setAnimationChoice(value); replay(); }}
                className={`flex w-36 flex-col items-center gap-2 rounded-xl border px-2 py-4 text-center ${
                  animationChoice === value ? 'border-black/50 bg-white/60' : 'border-transparent'
                }`}
              >
                <SuccessMark key={`${value}:${take}`} label="" animation={value} skin={pinnedSkin} />
                <span className="text-xs font-bold">{value}</span>
                <span className="text-[0.68rem] leading-tight text-[#4a4032]">{ANIMATION_NOTES[value]}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section title="všech 25 kombinací" hint="Řádky jsou provedení, sloupce animace.">
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-3 text-[0.68rem]">
              <thead>
                <tr>
                  <th />
                  {SUCCESS_MARK_ANIMATIONS.map((value) => (
                    <th key={value} className="font-bold">{value}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SUCCESS_MARK_SKINS.map((skin) => (
                  <tr key={skin}>
                    <th className="pr-2 text-right font-bold">{skin}</th>
                    {SUCCESS_MARK_ANIMATIONS.map((animation) => (
                      <td key={animation} className="text-center">
                        <SuccessMark
                          key={`${skin}:${animation}:${take}`}
                          label=""
                          animation={animation}
                          skin={skin}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="v opravdových kartičkách"
          hint="Odpověz správně a sleduj, kde fajfka přistane. Ve všech kartičkách je to stejné místo: vyhrazený pruh nahoře, takže se nic neposune. Tyhle používají živou volbu, takže při „náhodně“ uvidíš losování."
        >
          <div className="flex flex-col gap-8">
            <div>
              <p className="m-0 mb-2 text-[0.7rem] font-bold uppercase tracking-wider">výběr — bez rámečku (studijní kartička)</p>
              <MultipleChoiceGame key={`choice-bare:${take}`} words={WORDS.slice(0, 3)} role="languageToLearn" frameless />
            </div>
            <div>
              <p className="m-0 mb-2 text-[0.7rem] font-bold uppercase tracking-wider">výběr — v rámečku (minihra)</p>
              <MultipleChoiceGame key={`choice-framed:${take}`} words={WORDS.slice(0, 4)} role="knownLanguage" />
            </div>
            <div>
              <p className="m-0 mb-2 text-[0.7rem] font-bold uppercase tracking-wider">psaní</p>
              <TypingChallengeGame key={`typing:${take}`} words={WORDS.slice(0, 1)} role="knownLanguage" />
            </div>
            <div>
              <p className="m-0 mb-2 text-[0.7rem] font-bold uppercase tracking-wider">skládání</p>
              <WordAssemblyGame
                key={`assembly:${take}`}
                word={WORDS[2]}
                role="knownLanguage"
                variant="words"
                answerParts={['cảm', 'ơn']}
                distractorParts={['chó', 'ăn']}
                onOutcome={() => undefined}
              />
            </div>
          </div>
        </Section>
      </div>
    </I18nProvider>
  );
}
