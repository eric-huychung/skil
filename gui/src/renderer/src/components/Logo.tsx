import { cn } from './cn';

type LogoMarkProps = {
  className?: string;
};

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn('size-4', className)}>
      <rect x="5" y="4" width="14" height="3.4" rx="1.7" fill="currentColor" />
      <path
        d="M7.4 7.4v6.5a2 2 0 0 0 2 2H10M7.4 10.8a2 2 0 0 0 2 2H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <rect x="11" y="10.6" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.85" />
      <rect x="11" y="15.9" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

type LogoProps = {
  withWordmark?: boolean;
  chipClassName?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  className?: string;
};

export function Logo({
  withWordmark = true,
  chipClassName,
  markClassName,
  wordmarkClassName,
  className,
}: LogoProps) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-lg bg-[var(--brand)] text-[var(--brand-foreground)]',
          chipClassName
        )}
      >
        <LogoMark className={cn('size-5', markClassName)} />
      </span>
      {withWordmark && (
        <span className={cn('wordmark', wordmarkClassName)}>Skil</span>
      )}
    </span>
  );
}
