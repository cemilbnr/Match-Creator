import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

// ---------- Button ---------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-neutral-100 text-neutral-900 hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-500',
  secondary:
    'border border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-600 hover:text-neutral-50 disabled:text-neutral-600 disabled:hover:border-neutral-800',
  ghost:
    'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100 disabled:text-neutral-600 disabled:hover:bg-transparent',
  danger:
    'border border-rose-700/60 bg-rose-500/10 text-rose-200 hover:border-rose-500 hover:bg-rose-500/15 disabled:opacity-50',
  success:
    'border border-emerald-600/60 bg-emerald-500/15 text-emerald-200 hover:border-emerald-500 disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  leading,
  trailing,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center whitespace-nowrap font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {leading}
      {children}
      {trailing}
    </button>
  );
}

// ---------- IconButton -----------------------------------------------------

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'default' | 'danger';
  size?: 'sm' | 'md';
}

export function IconButton({
  tone = 'default',
  size = 'md',
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const toneCls =
    tone === 'danger'
      ? 'text-neutral-500 hover:bg-rose-500/10 hover:text-rose-300'
      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100';
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-not-allowed disabled:opacity-40 ${box} ${toneCls} ${className}`}
    >
      {children}
    </button>
  );
}

// ---------- Input ----------------------------------------------------------

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
}

export function Input({ leading, className = '', ...rest }: InputProps) {
  if (leading) {
    return (
      <div
        className={`flex h-9 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 transition focus-within:border-neutral-500 ${className}`}
      >
        <span className="text-neutral-500">{leading}</span>
        <input
          {...rest}
          className="flex-1 bg-transparent placeholder:text-neutral-600 focus:outline-none"
        />
      </div>
    );
  }
  return (
    <input
      {...rest}
      className={`h-9 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-600 transition focus:border-neutral-500 focus:outline-none ${className}`}
    />
  );
}

// ---------- Section --------------------------------------------------------

interface SectionProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A light-weight grouping block for sidebars/right-rails. No card chrome —
 * just a small uppercase label and spacing. Reserves the "card" treatment
 * for truly embedded content (match slots, board cards).
 */
export function Section({ title, action, children, className = '' }: SectionProps) {
  return (
    <section className={`flex flex-col gap-2.5 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between">
          {title && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

// ---------- Field / Label --------------------------------------------------

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-400">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
    </label>
  );
}

// ---------- Page shell (breadcrumb / header / body) -----------------------

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  tabs,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-neutral-800 bg-neutral-950 px-6 pb-3 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-xs text-neutral-500">{eyebrow}</div>
          )}
          <h1 className="truncate text-xl font-semibold text-neutral-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="-mb-px">{tabs}</div>}
    </header>
  );
}

// ---------- Status pill ----------------------------------------------------

type PillTone = 'neutral' | 'success' | 'warn' | 'danger';

const pillTone: Record<PillTone, string> = {
  neutral: 'border-neutral-800 bg-neutral-900 text-neutral-300',
  success: 'border-emerald-600/50 bg-emerald-500/10 text-emerald-300',
  warn: 'border-amber-600/50 bg-amber-500/10 text-amber-300',
  danger: 'border-rose-600/50 bg-rose-500/10 text-rose-300',
};

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${pillTone[tone]}`}
    >
      {children}
    </span>
  );
}

// ---------- Toggle ---------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}
    >
      <div className="min-w-0">
        <div className="text-sm text-neutral-100">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs leading-snug text-neutral-500">
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
          checked ? 'bg-emerald-500/80' : 'bg-neutral-700'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-neutral-50 shadow transition ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ---------- Tabs -----------------------------------------------------------

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-neutral-800">
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
              active
                ? 'border-neutral-100 text-neutral-50'
                : 'border-transparent text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
