import type { LucideIcon } from 'lucide-react';
import StatusPill from './StatusPill';
import type { SignalType } from '../../types';

interface Breadcrumb {
  label: string;
  onClick?: () => void;
}

interface Props {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  statusLabel?: string;
  statusSignal?: SignalType;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, icon: Icon, statusLabel, statusSignal, breadcrumbs, actions, meta }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-accent-orange/10 border border-accent-orange/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon size={18} className="text-accent-orange" />
          </div>
        )}
        <div>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1.5 mb-1">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-ink-faint text-xs">/</span>}
                  <button
                    onClick={b.onClick}
                    className="text-xs text-ink-muted hover:text-ink-secondary transition-colors"
                  >
                    {b.label}
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-ink-primary leading-none">{title}</h1>
            {statusLabel && <StatusPill label={statusLabel} signal={statusSignal} dot />}
          </div>
          {subtitle && <p className="text-sm text-ink-secondary mt-1">{subtitle}</p>}
          {meta && <div className="mt-2">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
