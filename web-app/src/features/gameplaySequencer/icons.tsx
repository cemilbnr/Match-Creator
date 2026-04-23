import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'currentColor',
  xmlns: 'http://www.w3.org/2000/svg',
} as const;

export function JumpStartIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="2" y="3" width="2" height="10" rx="0.5" />
      <path d="M14 3.2v9.6a.4.4 0 0 1-.62.33L6 8.33a.4.4 0 0 1 0-.66l7.38-4.8A.4.4 0 0 1 14 3.2Z" />
    </svg>
  );
}

export function PrevFrameIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3.2v9.6a.4.4 0 0 1-.62.33L4 8.33a.4.4 0 0 1 0-.66l7.38-4.8A.4.4 0 0 1 12 3.2Z" />
    </svg>
  );
}

export function PlayIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 3.2v9.6a.4.4 0 0 0 .62.33L12 8.33a.4.4 0 0 0 0-.66L4.62 2.87A.4.4 0 0 0 4 3.2Z" />
    </svg>
  );
}

export function PauseIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="4" y="3" width="3" height="10" rx="0.6" />
      <rect x="9" y="3" width="3" height="10" rx="0.6" />
    </svg>
  );
}

export function NextFrameIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 3.2v9.6a.4.4 0 0 0 .62.33L12 8.33a.4.4 0 0 0 0-.66L4.62 2.87A.4.4 0 0 0 4 3.2Z" />
    </svg>
  );
}

export function JumpEndIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M2 3.2v9.6a.4.4 0 0 0 .62.33L10 8.33a.4.4 0 0 0 0-.66L2.62 2.87A.4.4 0 0 0 2 3.2Z" />
      <rect x="12" y="3" width="2" height="10" rx="0.5" />
    </svg>
  );
}

export function RecordIcon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="8" r="4" />
    </svg>
  );
}

export function ZoomInIcon(p: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      xmlns="http://www.w3.org/2000/svg"
      {...p}
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
      <path d="M7 5v4M5 7h4" />
    </svg>
  );
}

export function ZoomOutIcon(p: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      xmlns="http://www.w3.org/2000/svg"
      {...p}
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
      <path d="M5 7h4" />
    </svg>
  );
}
