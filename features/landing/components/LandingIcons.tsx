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

export function IconCamera({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3.5 8.5A1.8 1.8 0 0 1 5.3 6.7h1.9l1.2-2h7.2l1.2 2h1.9a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8Z" />
      <circle cx="12" cy="12.4" r="3.4" />
    </svg>
  );
}

export function IconPen({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M15.6 4.4a2 2 0 0 1 2.9 2.9L8.9 16.9l-3.9 1 1-3.9Z" />
      <path d="M14 6l4 4" />
      <path d="M4.5 20.5h15" />
    </svg>
  );
}

export function IconBot({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="4" y="8" width="16" height="10.5" rx="3" />
      <path d="M12 4v4" />
      <circle cx="12" cy="3.4" r="1.2" />
      <path d="M9 12.4v1.4M15 12.4v1.4" />
      <path d="M1.8 12.5v2M22.2 12.5v2" />
    </svg>
  );
}

export function IconMic({ className }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <rect x="9" y="2.8" width="6" height="10.5" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3.2M9 21.2h6" />
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
