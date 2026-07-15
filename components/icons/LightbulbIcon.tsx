interface LightbulbIconProps {
  size?: number;
  className?: string;
}

export function LightbulbIcon({ size = 18, className = '' }: LightbulbIconProps) {
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 bg-current ${className}`}
      style={{
        width: size,
        height: size,
        WebkitMask: "url('/icons/lightbulb.svg') center / contain no-repeat",
        mask: "url('/icons/lightbulb.svg') center / contain no-repeat",
      }}
    />
  );
}
