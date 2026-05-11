import type { SignalType } from '../../types';

interface Props {
  label: string;
  signal?: SignalType;
  dot?: boolean;
  size?: 'sm' | 'md';
}

const signalMap: Record<SignalType, string> = {
  green: 'badge-green',
  amber: 'badge-amber',
  red: 'badge-red',
  blue: 'badge-blue',
  orange: 'badge-orange',
  purple: 'badge-purple',
  neutral: 'badge-neutral',
};

const dotColorMap: Record<SignalType, string> = {
  green: 'bg-signal-green glow-dot-green',
  amber: 'bg-signal-amber glow-dot-amber',
  red: 'bg-signal-red glow-dot-red',
  blue: 'bg-accent-blue glow-dot-blue',
  orange: 'bg-accent-orange',
  purple: 'bg-signal-purple',
  neutral: 'bg-ink-muted',
};

export default function StatusPill({ label, signal = 'neutral', dot = false, size = 'md' }: Props) {
  const cls = signalMap[signal] || 'badge-neutral';
  const dotCls = dotColorMap[signal] || 'bg-ink-muted';
  const sizeClass = size === 'sm' ? 'text-[10px] px-2 py-0' : '';

  return (
    <span className={`${cls} ${sizeClass}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />}
      {label}
    </span>
  );
}
