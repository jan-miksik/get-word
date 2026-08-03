interface LightbulbIconProps {
  size?: number;
  className?: string;
}

/**
 * Inline paths rather than a CSS mask on `/icons/lightbulb.svg`: the native
 * bundle ships no `public/` directory, so the mask URL 404s there and the hint
 * button renders as an empty circle.
 */
export function LightbulbIcon({ size = 18, className = '' }: LightbulbIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`block shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path
        d="m 8.8651018,14.271929 a 5.3741112,5.3741112 0 1 1 6.2697962,0 c -0.806116,0.537412 -1.343528,1.433097 -1.343528,2.418351 h -3.58274 c 0,-0.985254 -0.5374115,-1.880939 -1.3435282,-2.418351 z"
        strokeWidth={1.61223}
      />
      <path d="M 9.9847083,17.406828 H 14.015292" strokeWidth={1.61223} />
      <path d="m 10.656472,20.093883 h 2.687056" strokeWidth={1.61223} />
      <path d="M12 2V1" />
      <path d="m5.1 5.1-.7-.7" />
      <path d="m 3.6901203,11.103889 h -1" strokeWidth={1.61223} />
      <path d="m18.9 5.1.7-.7" />
      <path d="m 20.41077,10.892969 h 1" strokeWidth={1.61223} />
    </svg>
  );
}
