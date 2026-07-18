import type { SVGProps } from 'react';

function svgProps(className?: string) {
  return {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function IconBrain({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 5.5a2.5 2.5 0 0 0-5 .2 2.4 2.4 0 0 0-2 3.3A2.5 2.5 0 0 0 5.5 14 2.4 2.4 0 0 0 8 17.5a2.5 2.5 0 0 0 4 .9Z" />
      <path d="M12 5.5a2.5 2.5 0 0 1 5 .2 2.4 2.4 0 0 1 2 3.3A2.5 2.5 0 0 1 18.5 14 2.4 2.4 0 0 1 16 17.5a2.5 2.5 0 0 1-4 .9Z" />
      <path d="M12 5.5v13" />
    </svg>
  );
}

export function IconCards({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="3" y="6" width="13" height="13" rx="2.2" />
      <path d="M8 3.5h10.2A1.8 1.8 0 0 1 20 5.3V15" />
      <path d="M6.5 11h6M6.5 14.2h4" />
    </svg>
  );
}

export function IconSpeaker({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 9v6h3l5 4V5L7 9Z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

export function IconSpark({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9Z" />
      <path d="M18.5 4.5v3M20 6h-3M5.5 16v2.5M6.75 17.25h-2.5" />
    </svg>
  );
}

export function IconSync({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  );
}

export function IconInstall({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 17.5v1A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

export function IconArrow({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13" />
      <path d="m12.5 6 6 6-6 6" />
    </svg>
  );
}

export function IconGithub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1.8a10.2 10.2 0 0 0-3.23 19.88c.51.1.7-.22.7-.49l-.01-1.92c-2.84.62-3.44-1.2-3.44-1.2-.46-1.18-1.13-1.5-1.13-1.5-.93-.63.07-.62.07-.62 1.03.07 1.57 1.06 1.57 1.06.91 1.57 2.4 1.12 2.99.85.09-.66.36-1.12.65-1.37-2.27-.26-4.66-1.14-4.66-5.06 0-1.12.4-2.03 1.05-2.74-.1-.26-.46-1.3.1-2.7 0 0 .86-.27 2.82 1.05a9.7 9.7 0 0 1 5.13 0c1.96-1.32 2.81-1.05 2.81-1.05.56 1.4.21 2.44.1 2.7.66.71 1.05 1.62 1.05 2.74 0 3.93-2.39 4.79-4.67 5.05.37.32.69.94.69 1.9l-.01 2.82c0 .27.19.6.71.49A10.2 10.2 0 0 0 12 1.8Z" />
    </svg>
  );
}
