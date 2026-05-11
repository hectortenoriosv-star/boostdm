import type { LucideIcon } from 'lucide-react';

interface Action {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: Action[];
  size?: 'sm' | 'md' | 'lg';
}

export default function EmptyState({ icon: Icon, title, description, actions, size = 'md' }: Props) {
  const iconSize = size === 'sm' ? 32 : size === 'lg' ? 64 : 48;
  const py = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-20' : 'py-14';

  return (
    <div className={`empty-state ${py}`}>
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-navy-600 border border-navy-500 flex items-center justify-center mb-4">
          <Icon size={iconSize} className="text-ink-muted" />
        </div>
      )}
      <p className="text-base font-semibold text-ink-primary mb-1">{title}</p>
      {description && (
        <p className="text-sm text-ink-secondary max-w-sm leading-relaxed mb-5">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="flex gap-3">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className={a.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
