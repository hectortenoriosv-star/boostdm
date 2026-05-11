import type { SignalType } from '../../types';

interface Props {
  value?: number;
  label?: string;
  sublabel?: string;
  signal?: SignalType;
  showPct?: boolean;
  height?: 'thin' | 'normal' | 'thick';
}

const fillMap: Record<SignalType, string> = {
  green: 'bg-signal-green',
  amber: 'bg-signal-amber',
  red: 'bg-signal-red',
  blue: 'bg-accent-blue',
  orange: 'bg-accent-orange',
  purple: 'bg-signal-purple',
  neutral: 'bg-ink-muted',
};

function autoSignal(pct: number): SignalType {
  if (pct >= 100) return 'green';
  if (pct >= 80) return 'blue';
  if (pct >= 60) return 'amber';
  return 'red';
}

const heightMap = { thin: 'h-1', normal: 'h-1.5', thick: 'h-2.5' };

export default function ProgressRail({ value, label, sublabel, signal, showPct = true, height = 'normal' }: Props) {
  const pct = value ?? 0;
  const sig = signal ?? autoSignal(pct);
  const fill = fillMap[sig] || 'bg-ink-muted';
  const h = heightMap[height];

  return (
    <div className="w-full">
      {(label || showPct) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-xs text-ink-secondary">{label}</span>}
          {showPct && value !== undefined && (
            <span className={`text-xs font-bold tabular-nums ${sig === 'red' ? 'text-signal-red' : sig === 'amber' ? 'text-signal-amber' : sig === 'green' ? 'text-signal-green' : 'text-ink-secondary'}`}>
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full ${h} bg-navy-500 rounded-full overflow-hidden`}>
        {value !== undefined ? (
          <div
            className={`${h} ${fill} rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        ) : (
          <div className={`${h} bg-navy-400 rounded-full animate-pulse w-full`} />
        )}
      </div>
      {sublabel && <p className="text-xs text-ink-muted mt-1">{sublabel}</p>}
    </div>
  );
}
