'use client';

import { useI18n } from '@/components/I18nProvider';
import { noTranslateProps } from '@/lib/i18n/no-translate';
import { SuccessMark } from '../games/SuccessMark';
import type { TypingResult } from './evaluation';

export function TypingFeedback({
  result,
  correctAnswer,
  wordId,
}: {
  result: TypingResult | null;
  correctAnswer: string;
  wordId: string;
}) {
  const { t } = useI18n();
  const matchedAnswer = result?.matchedAnswer ?? correctAnswer;
  const labels: Record<TypingResult['presentation'], React.ReactNode> = {
    exact: <SuccessMark key={wordId} label={t('game.perfect')} />,
    close: <>{`~ ${t('game.close')} `}<strong {...noTranslateProps()}>{matchedAnswer}</strong></>,
    typo: <>{`~ ${t('game.close')} `}<strong {...noTranslateProps()}>{matchedAnswer}</strong></>,
    wrong: <>{`✗ ${t('game.correctAnswer')} `}<strong {...noTranslateProps()}>{matchedAnswer}</strong></>,
  };
  const tone = result?.presentation === 'close' || result?.presentation === 'typo'
    ? '!border-[#C28A24] !bg-[#FFF0BD] !text-[#5B3A00] shadow-[0_2px_0_rgba(91,58,0,0.12)]'
    : result?.presentation === 'wrong'
      ? '!border-brick/30 !bg-brick/10 !text-brick-deep'
      : '!border-transparent !bg-transparent !text-moss !shadow-none';

  return (
    <div
      role={result ? 'status' : undefined}
      aria-hidden={result ? undefined : true}
      className={`relative flex min-h-24 w-[min(34rem,calc(100vw-2rem))] shrink-0 items-center justify-center self-center px-3 ${result ? '' : 'invisible'}`}
    >
      <span className={`game-feedback !max-w-full !justify-center !rounded-xl !border !border-transparent !px-4 !py-2 text-center !text-[1rem] leading-tight sm:!text-[1.1rem] [&_strong]:font-extrabold ${result ? `game-feedback--${result.presentation === 'typo' ? 'close' : result.presentation} ${tone}` : ''}`}>
        {result ? labels[result.presentation] : '\u00A0'}
      </span>
    </div>
  );
}
