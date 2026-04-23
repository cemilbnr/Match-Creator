import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const stroke = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  xmlns: 'http://www.w3.org/2000/svg',
} as const;

export function GridIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function LayersIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 18l9 5 9-5" />
    </svg>
  );
}

export function FilmIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M10 9h4M10 15h4" />
    </svg>
  );
}

export function BoxIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

export function CopyIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function EditIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
    </svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function SendIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

export function SaveIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

export function RefreshIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function EraserIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M20 20H7l-4-4a2 2 0 0 1 0-2.8l9.2-9.2a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L12 20" />
      <path d="m6 11 7 7" />
    </svg>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ContinueHereIcon(p: IconProps) {
  // A back-arrow that curls to signal "rewind to this point and resume".
  return (
    <svg {...stroke} {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6h-3" />
    </svg>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ViewfinderIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M3 8V5a2 2 0 0 1 2-2h3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CropIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="m5 12 5 5 9-11" />
    </svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function UndoIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

export function RedoIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </svg>
  );
}

export function BrushIcon(p: IconProps) {
  return (
    <svg {...stroke} {...p}>
      <path d="M9 11a3 3 0 0 1 3-3l7.5-5.5a2 2 0 0 1 2.8 2.8L17 13a3 3 0 0 1-3 3" />
      <path d="M7 13a4 4 0 0 0-4 4c0 1.5-1 2-2 2 1.5 2 4 3 6 3a4 4 0 0 0 4-4 4 4 0 0 0-4-5Z" />
    </svg>
  );
}

// Pipeline step icons for sidebar nav
export { GridIcon as BoardsIcon };
export { FilmIcon as GameplayIcon };
export { BoxIcon as BlenderIcon };

// Re-export the existing transport icons so callers can keep one import site.
export {
  JumpStartIcon,
  PrevFrameIcon,
  PlayIcon,
  PauseIcon,
  NextFrameIcon,
  JumpEndIcon,
  RecordIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../features/gameplaySequencer/icons';
