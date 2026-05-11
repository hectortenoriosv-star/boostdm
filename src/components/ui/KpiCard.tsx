import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { KpiCardData, SignalType } from '../../types';

const progressColorMap: Record<SignalType, string> = {
  green: 'progress-fill-green',
  amber: 'progress-fill-amber',
  red: 'progress-fill-red',
  blue: 'progress-fill-blue',
  orange: 'progress-fill-orange',
  purple: 'bg-signal-purple h-full rounded-full transition-all duration-500',
  neutral: 'bg-ink-muted h-full rounded-full',
};

const borderMap: Record<SignalType, string> = {
  green: 'border-t-signal-green',
  amber: 'border-t-signal-amber',
  red: 'border-t-signal-red',
  blue: 'border-t-accent-blue',
  orange: 'border-t-accent-orange',
  purple: 'border-t-signal-purple',
  neutral: 'border-t-navy-500',
};

interface Props {
  data: KpiCardData;
  loading?: boolean;
}

export default function KpiCard({ data, loading }: Props) {
  const { label, value, subValue, change, changeLabel, progress, signal = 'neutral', helperText } = data;
  const sig = signal as SignalType;

  if (loading) {
    return (
      <div className="card p-5">
        <div className="skeleton h-3 w-24 mb-3" />
        <div className="skeleton h-8 w-20 mb-2" />
        <div className="skeleton h-1.5 w-full rounded-full" />
      </div>
    );
  }

  const topBorder = borderMap[sig] || 'border-t-navy-500';

  return (
    <div className={`card p-5 border-t-2 ${topBorder} hover:shadow-card-hover transition-shadow`}>
      <p className="metric-label mb-2">{label}</p>

      {value !== undefined ? (
        <p className="metric-value">{value}</p>
      ) : (
        <p className="text-2xl font-semibold text-ink-muted">—</p>
      )}

      {subValue && (
        <p className="text-xs text-ink-secondary mt-0.5">{subValue}</p>
      )}

      {progress !== undefined && (
        <div className="mt-3">
          <div className="progress-rail">
            <div
              className={progressColorMap[sig] || 'bg-ink-muted h-full rounded-full'}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {change !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          {change > 0 ? (
            <TrendingUp size={12} className="text-signal-green" />
          ) : change < 0 ? (
            <TrendingDown size={12} className="text-signal-red" />
          ) : (
            <Minus size={12} className="text-ink-muted" />
          )}
          <span className={`text-xs font-medium ${change > 0 ? 'text-signal-green' : change < 0 ? 'text-signal-red' : 'text-ink-muted'}`}>
            {change > 0 ? '+' : ''}{change}%
          </span>
          {changeLabel && <span className="text-xs text-ink-muted">{changeLabel}</span>}
        </div>
      )}

      {!value && helperText && (
        <p className="text-xs text-ink-muted mt-2 leading-relaxed">{helperText}</p>
      )}
    </div>
  );
}
