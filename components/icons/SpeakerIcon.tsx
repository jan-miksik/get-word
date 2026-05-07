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
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 10.25v3.5h3.55L12 17.6V6.4l-4.45 3.85H4Z" fill="currentColor" stroke="none" />
      <path d="M15.35 9.1a4.15 4.15 0 0 1 0 5.8" />
      <path d="M18 6.55a7.75 7.75 0 0 1 0 10.9" />
      <path d="M18.95 4.2h.1" />
    </svg>
  );
}
