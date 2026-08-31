'use client';

import type { MutableRefObject, PointerEvent, ReactNode, RefObject } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { isAppKeyboardOpen } from '@/hooks/useVisualViewportHeight';
import { ClipboardCheckIcon } from '@/components/icons/ClipboardCheckIcon';
import { LightbulbIcon } from '@/components/icons/LightbulbIcon';
import type { TypingResult } from './evaluation';

type TypingAnswerInputProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Owned by TypingStudyCard, which attaches native touch handlers to it. */
  hintButtonRef: RefObject<HTMLButtonElement | null>;
  isComposingRef: MutableRefObject<boolean>;
  useFreeAnswerInput: boolean;
  result: TypingResult | null;
  value: string;
  manualCheck: boolean;
  isFocused: boolean;
  mask: ReactNode;
  isManualAnswerComplete: boolean;
  /** Variants with a positive reveal budget expose the hint button. */
  hintEnabled: boolean;
  hintExhausted: boolean;
  onApplyValue: (value: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onUpdateCaret: (input: HTMLInputElement) => void;
  onSelectSlot: (input: HTMLInputElement, clientX: number, clientY: number) => void;
  onReveal: () => void;
  onPreserveFocus: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function TypingAnswerInput({
  inputRef,
  hintButtonRef,
  isComposingRef,
  useFreeAnswerInput,
  result,
  value,
  manualCheck,
  isFocused,
  mask,
  isManualAnswerComplete,
  hintEnabled,
  hintExhausted,
  onApplyValue,
  onSubmit,
  onFocus,
  onBlur,
  onUpdateCaret,
  onSelectSlot,
  onReveal,
  onPreserveFocus,
}: TypingAnswerInputProps) {
  const { t } = useI18n();
  // The two hardest rungs have no reveal budget, so no hint button is rendered.
  const hintButton = result === null && hintEnabled ? (
    <button
      ref={hintButtonRef}
      type="button"
      className="game-hint-btn !flex !h-11 !min-h-11 !w-11 !min-w-11 !items-center !justify-center !rounded-full !border-0 !bg-paper !p-0 !text-2xl !font-bold !normal-case !tracking-normal !text-ink shadow-none hover:!bg-paper-hi disabled:!opacity-50"
      onClick={onReveal}
      onPointerDown={onPreserveFocus}
      disabled={hintExhausted}
      aria-label={t('game.hint')}
      title={t('game.hint')}
    >
      <LightbulbIcon size={24} />
    </button>
  ) : null;

  const commonInputProps = {
    value,
    onFocus,
    onBlur,
    disabled: result !== null,
    'aria-disabled': result !== null,
    autoComplete: 'off',
    autoCorrect: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
  } as const;

  // From `md` up, the hint/check buttons hang off the right edge of the input
  // box, which is `w-fit` and centred. That only works while the box leaves
  // room beside it: a long sentence grows to the full card width, and the
  // buttons end up outside it — clipped away by the card's own scroll box.
  //
  // So cap the box at the width where the buttons still fit, and reserve the
  // same amount on the left. The input is centred, so its right edge sits at
  // `(container + box) / 2`; keeping that plus the buttons inside the container
  // means the box may be at most `container - 2 × (offset + buttons)` wide.
  // A long sentence wraps onto another line instead, which the mask supports.
  // The classes are spelled out rather than computed because Tailwind only
  // generates the arbitrary values it can find in the source.
  const actionsReserve = manualCheck
    // 1.5rem offset + hint 2.75rem + 0.75rem gap + check 2.75rem, doubled.
    ? (hintEnabled ? 'md:max-w-[calc(100%-15.5rem)]' : 'md:max-w-[calc(100%-8.5rem)]')
    // 2.5rem offset + hint 2.75rem, doubled.
    : 'md:max-w-[calc(100%-10.5rem)]';

  return (
    <div className="game-typing-area !gap-2">
      <div className={`relative mx-auto w-fit max-w-full ${actionsReserve}`}>
        <div className={`min-w-0 mx-auto ${useFreeAnswerInput ? 'w-[min(26rem,calc(100vw-7rem))]' : 'w-fit max-w-full'}`}>
          {useFreeAnswerInput ? (
            <input
              ref={inputRef}
              type="text"
              className={`w-full rounded-xl border-2 border-ink bg-paper-hi px-4 py-2 text-center !text-[1.5rem] sm:!text-[2.5rem] font-bold text-ink outline-none transition-colors focus:border-sea disabled:opacity-80 ${result ? `game-input--${result.match}` : ''}`}
              placeholder={t('game.typeTranslation')}
              onChange={(event) => onApplyValue(event.target.value)}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false;
                onApplyValue(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isComposingRef.current) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              {...commonInputProps}
            />
          ) : (
            <div
              className={[
                'game-typing-input-wrap !w-fit !max-w-full',
                result ? `game-typing-input-wrap--${result.match}` : '',
                isFocused ? 'is-focused' : '',
              ].filter(Boolean).join(' ')}
            >
              <div
                {...noTranslateProps(
                  'game-typing-mask !px-2 !py-1 !text-[1.5rem] sm:!text-[2.5rem] md:[@media(max-height:800px)]:!min-h-[2.7em] md:[@media(max-height:800px)]:!text-[2rem]',
                )}
                aria-hidden="true"
              >
                {mask}
              </div>
              <input
                ref={inputRef}
                type="text"
                className={`game-input game-input--masked selection:bg-transparent selection:text-transparent !px-2 !py-1 !text-[1.5rem] sm:!text-[2.5rem] md:[@media(max-height:800px)]:!text-[2rem]${result ? ` game-input--${result.match}` : ''}`}
                placeholder={t('game.typeTranslation')}
                onChange={(event) => {
                  onApplyValue(event.target.value);
                  onUpdateCaret(event.target);
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                  isComposingRef.current = false;
                  onApplyValue(event.currentTarget.value);
                  onUpdateCaret(event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (manualCheck && event.key === 'Enter' && !isComposingRef.current) {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                onPointerDown={(event) => {
                  // The default tap is cancelled so the caret lands on the slot
                  // the learner aimed at rather than wherever the browser puts
                  // it — but cancelling it also cancels the browser's own
                  // "raise the keyboard" behaviour, and re-focusing an element
                  // that already has focus is a no-op. A card that focused this
                  // input as it mounted therefore left the learner tapping a
                  // field that could never open a keyboard. Dropping the focus
                  // first makes the re-focus a real one, inside their gesture,
                  // which is what every mobile browser asks for.
                  event.preventDefault();
                  const input = event.currentTarget;
                  if (document.activeElement === input && !isAppKeyboardOpen()) {
                    input.blur();
                  }
                  input.focus({ preventScroll: true });
                  onSelectSlot(input, event.clientX, event.clientY);
                }}
                onKeyUp={(event) => onUpdateCaret(event.currentTarget)}
                onSelect={(event) => onUpdateCaret(event.currentTarget)}
                {...commonInputProps}
              />
            </div>
          )}
        </div>
        {!manualCheck && (
          <div className={`mx-auto mt-3 min-h-11 w-11 md:absolute md:left-[calc(100%+2.5rem)] md:top-1/2 md:mt-0 md:min-h-0 md:-translate-y-1/2 ${result ? 'invisible' : ''}`}>
            {hintButton}
          </div>
        )}
        {manualCheck && (
          <div className={`game-typing-actions mx-auto mt-3 !w-fit !gap-3 md:absolute md:left-[calc(100%+1.5rem)] md:top-1/2 md:mt-0 md:-translate-y-1/2 ${result ? 'invisible pointer-events-none' : ''}`}>
            {hintButton}
            <button
              type="button"
              className="game-check-btn !flex !h-11 !min-h-11 !w-11 !min-w-11 items-center justify-center !rounded-full !p-0 disabled:cursor-default disabled:opacity-50"
              onClick={onSubmit}
              disabled={!isManualAnswerComplete}
              aria-label={t('game.check')}
              title={t('game.check')}
            >
              <ClipboardCheckIcon size={22} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
