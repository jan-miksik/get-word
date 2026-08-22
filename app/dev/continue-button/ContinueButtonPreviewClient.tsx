'use client';

import { useState } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import {
  CONTINUE_BUTTON_VARIANTS,
  ContinueButton,
  type ContinueButtonVariant,
} from '@/features/learning/components/ContinueButton';

/**
 * Dev harness for the unified continue button: `/dev/continue-button`.
 *
 * Three things can only be judged here. The variants differ in skin alone, so
 * they read as different only next to each other; the pressed state is over in
 * a frame in the real app; and the size question ("is it too small?") is a
 * question about the button *inside a card at phone width*, not about the
 * button on its own.
 *
 * Nothing on this page is wired to the study cards — the cards below are
 * mock-ups. The learning cards currently use `solid`; the other skins remain
 * here for comparison before any future change.
 */

const VARIANT_NOTES: Record<ContinueButtonVariant, string> = {
  solid:
    'Plná modrá, plochá, bez stínu. Stejné podání jako zvýrazněná tlačítka v onboardingu a v přestávce mezi bloky — nejmenší rozdíl proti tomu, co je v aplikaci dnes.',
  ink: 'Tmavý inkoust, krémový text. Odpovídá dnešnímu pruhu „Ťukni pro pokračování“ a tlačítku v psaní. Nesplývá s odpověďmi — čte se jako „posuň sezení“, ne jako další volba.',
  lift: 'Modrá s tvrdým spodním stínem, při stisku se propadne. Stejná fyzika jako dlaždice u výběru z možností, takže patří ke stejné hračce. Nejvýraznější z varianty.',
  outline:
    'Krém s inkoustovým rámečkem, modrou se vyplní až při stisku. Podání tlačítek Zapomenuto/OK. Nejtišší — nepřebije zelenou fajfku, která je na kartičce nad ním.',
};

const STATES = [
  { key: 'default', label: 'výchozí' },
  { key: 'pressed', label: 'stisknuté' },
  { key: 'disabled', label: 'zakázané' },
] as const;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-black/10 px-3 py-5">
      <h2 className="m-0 mb-1 text-xs font-bold uppercase tracking-wider text-[#2A2218]">{title}</h2>
      {hint && <p className="m-0 mb-4 max-w-2xl text-[0.7rem] leading-relaxed text-[#4a4032]">{hint}</p>}
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

/** The exercise card as it looks after a wrong answer, minus the real wiring. */
function MockChoiceCard({
  variant,
  label,
  width,
}: {
  variant: ContinueButtonVariant;
  label?: string;
  width: number;
}) {
  return (
    <div
      className="shrink-0 rounded-2xl border border-black/10 bg-[#EFE7D4] p-4"
      style={{ width }}
    >
      <div className="mb-3 text-center text-[0.6rem] font-bold uppercase tracking-wider text-[#6B5E48]">
        {width}px
      </div>
      <div className="mb-3 text-center text-3xl font-extrabold text-[#1f1a12]">nádraží</div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {['nhà ga', 'bến xe', 'sân bay', 'bưu điện'].map((option, index) => (
          <div
            key={option}
            className={`flex min-h-12 items-center justify-center rounded-2xl border-[1.5px] text-sm font-bold ${
              index === 0
                ? 'border-[#187A43] bg-[#F1F7ED] text-[#187A43]'
                : index === 1
                  ? 'border-[#B91C1C] bg-[#FCE7E5] text-[#8F1515]'
                  : 'border-[#BBAE98] bg-[#FFF8E8] text-[#2A2218] shadow-[0_3px_0_#D8C9AF]'
            }`}
          >
            {option}
          </div>
        ))}
      </div>
      <div className="mb-3 text-center text-sm font-bold text-[#B91C1C]">✗ nhà ga</div>
      <div className="flex justify-center">
        <ContinueButton variant={variant} label={label} className="max-w-[22rem]" />
      </div>
    </div>
  );
}

export function ContinueButtonPreviewClient() {
  const [customLabel, setCustomLabel] = useState(false);
  const [focused, setFocused] = useState<ContinueButtonVariant>('solid');

  // A label the translation does not carry, to check that a longer string does
  // not change the height or break the line.
  const label = customLabel ? 'Pokračovat na další slovo' : undefined;

  return (
    <I18nProvider language="cs">
      <div className="min-h-[100dvh] bg-[#dcd1b9] text-[#2A2218]">
        <div className="sticky top-0 z-20 border-b border-black/10 bg-[#dcd1b9] px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 font-bold uppercase tracking-wider">popisek</span>
            <Chip active={!customLabel} onClick={() => setCustomLabel(false)}>
              Pokračovat
            </Chip>
            <Chip active={customLabel} onClick={() => setCustomLabel(true)}>
              dlouhý popisek
            </Chip>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="w-20 font-bold uppercase tracking-wider">varianta</span>
            {CONTINUE_BUTTON_VARIANTS.map((value) => (
              <Chip key={value} active={focused === value} onClick={() => setFocused(value)}>
                {value}
              </Chip>
            ))}
          </div>
          <p className="m-0 mt-1.5 text-[0.7rem] text-[#4a4032]">
            Jen náhled. Nic se neukládá. Studijní kartičky nyní používají variantu solid.
          </p>
        </div>

        <Section
          title="varianty × stavy"
          hint="Všechny varianty sdílí výšku 56 px, radius 14 px, typografii i vnitřní odsazení — liší se jen podáním. Sloupec „stisknuté“ je zamrzlý stav :active."
        >
          <div className="flex flex-col gap-6">
            {CONTINUE_BUTTON_VARIANTS.map((variant) => (
              <div
                key={variant}
                className={`rounded-xl border px-3 py-3 ${
                  focused === variant ? 'border-black/50 bg-white/50' : 'border-transparent'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-black">{variant}</span>
                  <span className="max-w-2xl text-[0.68rem] leading-tight text-[#4a4032]">
                    {VARIANT_NOTES[variant]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4">
                  {STATES.map((state) => (
                    <div key={state.key} className="w-56">
                      <div className="mb-1 text-[0.6rem] font-bold uppercase tracking-wider text-[#6B5E48]">
                        {state.label}
                      </div>
                      <ContinueButton
                        variant={variant}
                        label={label}
                        disabled={state.key === 'disabled'}
                        forcePressed={state.key === 'pressed'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="vedle sebe ve výchozím stavu"
          hint="Stejná šířka, ať je vidět, jak různě hlasitě se čtou."
        >
          <div className="flex flex-wrap gap-4">
            {CONTINUE_BUTTON_VARIANTS.map((variant) => (
              <div key={variant} className="w-60">
                <ContinueButton variant={variant} label={label} />
                <div className="mt-1 text-center text-[0.65rem] font-bold text-[#4a4032]">
                  {variant}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="původní stav pro srovnání"
          hint="Podoba tlačítek před sjednocením na solid. Zůstává tu jako referenční srovnání."
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-center">
              <button
                type="button"
                className="rounded-xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-6 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[#F4EFE2]"
              >
                →
              </button>
              <div className="mt-1 text-[0.65rem] text-[#4a4032]">StudyExerciseCard</div>
            </div>
            <div className="text-center">
              <button
                type="button"
                className="rounded-xl border-2 border-[#1E6FA8] bg-[#1E6FA8] px-5 py-2 text-sm font-bold text-[#F4EFE2]"
              >
                →
              </button>
              <div className="mt-1 text-[0.65rem] text-[#4a4032]">WordAssemblyGame</div>
            </div>
            <div className="text-center">
              <button type="button" className="rounded-xl bg-[#1E6FA8] px-5 py-3 text-sm font-bold text-white">
                Pokračovat →
              </button>
              <div className="mt-1 text-[0.65rem] text-[#4a4032]">SimilarWordsPromptGame</div>
            </div>
            <div className="text-center">
              <div className="flex min-h-[52px] items-center justify-center rounded-xl bg-[#2A2218] px-4 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[#F4EFE2]">
                Ťukni pro pokračování →
              </div>
              <div className="mt-1 text-[0.65rem] text-[#4a4032]">MiniGameCard (překryv)</div>
            </div>
          </div>
        </Section>

        <Section
          title="v kartičce na šířce telefonu"
          hint="Maketa kartičky po chybné odpovědi. 360 px je běžný telefon, 430 px větší; sjednocené tlačítko drží 22rem strop, takže na širokém sloupci nepřeteče."
        >
          <div className="flex flex-wrap gap-5">
            <MockChoiceCard variant={focused} label={label} width={360} />
            <MockChoiceCard variant={focused} label={label} width={430} />
          </div>
        </Section>

        <Section
          title="všechny varianty v kartičce"
          hint="Na 360 px, aby šla porovnat i hlasitost tlačítka vůči zbytku kartičky."
        >
          <div className="flex flex-wrap gap-5">
            {CONTINUE_BUTTON_VARIANTS.map((variant) => (
              <div key={variant}>
                <div className="mb-1 text-center text-[0.65rem] font-bold text-[#4a4032]">{variant}</div>
                <MockChoiceCard variant={variant} label={label} width={360} />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </I18nProvider>
  );
}
