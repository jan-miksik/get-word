'use client';

import { useId } from 'react';

interface AppLogoProps {
  size?: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
  labelClassName?: string;
}

const PATTERN_ORIGIN_X = 165;
const PATTERN_ORIGIN_Y = 570;

type PatternOffset = {
  x: number;
  y: number;
};

const STATIC_OFFSET: PatternOffset = { x: 0, y: 0 };

export function AppLogo({
  size = 40,
  showLabel = false,
  label = 'Get Word',
  className = '',
  labelClassName = '',
}: AppLogoProps) {
  const uid = useId().replace(/:/g, '-');
  const offset = STATIC_OFFSET;
  const fillPatId = `gw-fill${uid}`;
  const tx = PATTERN_ORIGIN_X + offset.x;
  const ty = PATTERN_ORIGIN_Y + offset.y;
  const title = `${label} logo`;

  const rootClassName = ['inline-flex items-center gap-3', className].filter(Boolean).join(' ');
  const textClassName = ['text-sm font-semibold uppercase tracking-[0.24em]', labelClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 rounded-[22%] shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
      >
        <title>{title}</title>
        <defs>
          <pattern
            id={fillPatId}
            patternUnits="userSpaceOnUse"
            width="10"
            height="6"
            patternTransform={`matrix(2.5,0,0,2.5,${tx},${ty})`}
          >
            <path d="M 0,6 V 0 H 10 V 6 C 10,3 8,1 5,1 2,1 0,3 0,6 Z" fill="#000000" />
          </pattern>
        </defs>
        <g transform="translate(-29.306184,325.35861)">
          <g fill={`url(#${fillPatId})`} transform="translate(29.306184,-325.35861)">
            <rect x="0" y="0" width="200" height="200" />
          </g>
          <g fill="#e9c6af" transform="translate(26.035714,-330.89713)">
            <path d="m 93.055842,39.786822 c 30.167388,-9.68662 64.021408,21.905596 64.021408,55.905599 0,17.999999 -6,31.999999 -18,43.999999 -8,8 -14,16 -18,26 -2.72055,14.48099 -12,10 -17,6 -8.999996,-6 -13.533623,-12.39912 -22.20176,-19.86549 -14,-12 -30.204508,-28.14186 -30.798236,-52.134509 C 50.291852,67.954222 68.300699,47.735592 93.055842,39.786822 Z" />
          </g>
        </g>
      </svg>
      {showLabel ? <span className={textClassName}>{label}</span> : null}
    </div>
  );
}
