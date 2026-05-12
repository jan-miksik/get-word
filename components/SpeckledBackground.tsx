'use client';

interface SpeckledBackgroundProps {
  className?: string;
}

// Strip thickness in px — keep in sync with --bg-strip in layout.css
const S = 28;
const SCALE = S / 15;
const TILE = Math.round(14 * SCALE); // ~26 px — horizontal repeat unit

// The teardrop shape from the original pattern (tip at y=0, fat end at y=15)
const TEAR = 'M12,10 C12,12.761 9.761,15 7,15 4.239,15 1.963,12.761 2,10 2.053,6.062 7,0 7,0 c0,0 5,6 5,10z';

// Vertical strip: translate chosen so the rotated teardrop is centred in the tile
const V_TY = TILE / 2 + 7 * SCALE;

export function SpeckledBackground({ className = '' }: SpeckledBackgroundProps) {
  const cls = ['app-background', className].filter(Boolean).join(' ');
  return (
    <div aria-hidden="true" className={cls}>
      {/* Top — teardrops pointing up (outward) */}
      <svg className="bg-strip bg-strip--top" width="100%" height={S}>
        <defs>
          <pattern id="bgT" x="0" y="0" width={TILE} height={S} patternUnits="userSpaceOnUse">
            <g transform={`scale(${SCALE})`}>
              <path fill="black" fillRule="evenodd" d={TEAR} />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgT)" />
      </svg>

      {/* Bottom — same strip, flipped so teardrops point down */}
      <svg className="bg-strip bg-strip--bottom" width="100%" height={S} style={{ transform: 'scaleY(-1)' }}>
        <defs>
          <pattern id="bgB" x="0" y="0" width={TILE} height={S} patternUnits="userSpaceOnUse">
            <g transform={`scale(${SCALE})`}>
              <path fill="black" fillRule="evenodd" d={TEAR} />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgB)" />
      </svg>

      {/* Left — teardrops rotated 90°, tip pointing left (outward) */}
      <svg className="bg-strip bg-strip--left" width={S} height="100%">
        <defs>
          <pattern id="bgL" x="0" y="0" width={S} height={TILE} patternUnits="userSpaceOnUse">
            <g transform={`translate(0,${V_TY}) rotate(90) scale(${SCALE})`}>
              <path fill="black" fillRule="evenodd" d={TEAR} />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgL)" />
      </svg>

      {/* Right — mirror of left so tip points right (outward) */}
      <svg className="bg-strip bg-strip--right" width={S} height="100%" style={{ transform: 'scaleX(-1)' }}>
        <defs>
          <pattern id="bgR" x="0" y="0" width={S} height={TILE} patternUnits="userSpaceOnUse">
            <g transform={`translate(0,${V_TY}) rotate(90) scale(${SCALE})`}>
              <path fill="black" fillRule="evenodd" d={TEAR} />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgR)" />
      </svg>
    </div>
  );
}
