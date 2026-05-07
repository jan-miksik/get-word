'use client';

interface SpeckledBackgroundProps {
  className?: string;
}

const GET_WORD_BACKGROUND_SRC = '/backgrounds/bg-get-word.svg';

export function SpeckledBackground({ className = '' }: SpeckledBackgroundProps) {
  const rootClassName = ['app-background', className].filter(Boolean).join(' ');

  return (
    <div aria-hidden="true" className={rootClassName}>
      <img
        src={GET_WORD_BACKGROUND_SRC}
        alt=""
        className="app-background__image"
        draggable={false}
      />
    </div>
  );
}
