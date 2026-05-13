interface SpeakerIconProps {
  size?: number;
  className?: string;
}

export function SpeakerIcon({ size = 18, className = '' }: SpeakerIconProps) {
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
      className={className}
      aria-hidden="true"
    >
      <path d="M5 9.5v5H8.5L13 18V6L8.5 9.5H5Z" fill="currentColor" stroke="none" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M17.5 7a6.5 6.5 0 0 1 0 10" />
    </svg>
  );
}
