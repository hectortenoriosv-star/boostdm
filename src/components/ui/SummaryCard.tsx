import type { LucideIcon } from 'lucide-react';
import type { SignalType } from '../../types';

interface Props {
  label: string;
  value?: string | number;
  icon?: LucideIcon;
  signal?: SignalType;
  description?: string;
  loading?: boolean;
  onClick?: () => void;
  accent?: boolean;
}

const signalIconBg: Record<SignalType, string> = {
  green: 'bg-signal-green/10 text-signal-green',
  amber: 'bg-signal-amber/10 text-signal-amber',
  red: 'bg-signal-red/10 text-signal-red',
  blue: 'bg-accent-blue/10 text-accent-blue-light',
  orange: 'bg-accent-orange/10 text-accent-orange-light',
  purple: 'bg-signal-purple/10 text-signal-purple',
  neutral: 'bg-navy-500 text-ink-secondary',
};

export default function SummaryCard({ label, value, icon: Icon, signal = 'neutral', description, loading, onClick, accent }: Props) {
  const iconBg = signalIconBg[signal];

  if (loading) {
    return (
      <div className="card p-4">
        <div className="skeleton h-3 w-20 mb-3" />
        <div className="skeleton h-7 w-16" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`card p-4 ${onClick ? 'cursor-pointer hover:border-navy-400 transition-colors' : ''} ${accent ? 'border-accent-orange/30 bg-gradient-to-br from-navy-700 to-navy-600' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
        {Icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon size={14} />
          </div>
        )}
      </div>
      {value !== undefined ? (
        <p className="text-2xl font-bold text-ink-primary tabular-nums">{value}</p>
      ) : (
        <p className="text-2xl font-semibold text-ink-muted">—</p>
      )}
      {description && (
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">{description}</p>
      )}
    </div>
  );
}
