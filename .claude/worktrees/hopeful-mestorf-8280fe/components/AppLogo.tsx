interface AppLogoProps {
  size?: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
  labelClassName?: string;
}

export function AppLogo({
  size = 40,
  showLabel = false,
  label = 'Get Word',
  className = '',
  labelClassName = '',
}: AppLogoProps) {
  const rootClassName = ['inline-flex items-center gap-3', className].filter(Boolean).join(' ');
  const textClassName = [
    'text-sm font-semibold uppercase tracking-[0.24em]',
    labelClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName}>
      <img
        src="/get-word-logo.svg"
        alt={`${label} logo`}
        width={size}
        height={size}
        className="shrink-0 rounded-[22%] object-cover shadow-[0_10px_28px_rgba(15,23,42,0.18)]"
      />
      {showLabel ? <span className={textClassName}>{label}</span> : null}
    </div>
  );
}
