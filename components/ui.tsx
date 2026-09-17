import type { ReactNode } from 'react';

export function GlassPanel({
  children,
  className = '',
  strong = false,
  breakMode = false,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  breakMode?: boolean;
}) {
  const cls = [
    'glass',
    strong ? 'glass-strong' : '',
    breakMode ? 'glass-break' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <div className={cls}>{children}</div>;
}

export function ProgressRing({
  progress,
  size = 220,
  mode = 'focus',
}: {
  progress: number;
  size?: number;
  mode?: string;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const offset = c * (1 - p);
  const modeClass =
    mode === 'break' || mode === 'break-prompt' ? 'is-break' : '';

  return (
    <div className="ring-wrap" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className={`ring-progress ${modeClass}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

export function PinIcon({ on = false, size = 16 }: { on?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={on ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    </svg>
  );
}

export function SunIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function MoonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z" />
    </svg>
  );
}

export function SystemThemeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function CheckMark({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <path
        d="M2.5 6.5 5 9l4.5-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ActivityIcon({ id, size = 18 }: { id: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (id === 'toilet') {
    return (
      <svg {...common}>
        <path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" />
        <path d="M9 20h6" />
        <path d="M12 15v5" />
      </svg>
    );
  }
  if (id === 'eyes') {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  if (id === 'water') {
    return (
      <svg {...common}>
        <path d="M12 3s6 6.2 6 11a6 6 0 1 1-12 0c0-4.8 6-11 6-11Z" />
      </svg>
    );
  }
  if (id === 'walk') {
    return (
      <svg {...common}>
        <circle cx="13" cy="4" r="2" />
        <path d="m10 21 2-7-2-3 2-3 3 2 2 1" />
        <path d="m14 21 2-5" />
        <path d="M6 12h4" />
      </svg>
    );
  }
  if (id === 'breathe' || id === 'rest') {
    return (
      <svg {...common}>
        <path d="M4 12h10a3 3 0 1 0-3-3" />
        <path d="M4 16h12a3 3 0 1 1-3 3" />
        <path d="M4 8h6" />
      </svg>
    );
  }
  if (id === 'neck' || id === 'shoulder') {
    return (
      <svg {...common}>
        <circle cx="12" cy="7" r="3" />
        <path d="M8 14c1 2 2.5 3 4 3s3-1 4-3" />
        <path d="M5 19h14" />
      </svg>
    );
  }
  if (id === 'eyes20') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (id === 'stand') {
    return (
      <svg {...common}>
        <circle cx="12" cy="4" r="2" />
        <path d="M12 6v7" />
        <path d="m8 21 4-8 4 8" />
        <path d="M7 10h10" />
      </svg>
    );
  }
  if (id === 'face') {
    return (
      <svg {...common}>
        <path d="M12 3c4 0 7 3 7 7v3c0 4-3 8-7 8s-7-4-7-8v-3c0-4 3-7 7-7Z" />
        <path d="M9 11h.01M15 11h.01" />
        <path d="M9 16c1 .8 2 1.2 3 1.2s2-.4 3-1.2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 4v5" />
      <path d="M16 4v5" />
      <path d="M5 11h14" />
      <path d="M9 11v9" />
      <path d="M15 11v9" />
      <path d="M7 20h4" />
      <path d="M13 20h4" />
    </svg>
  );
}
