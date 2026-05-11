import type { SignalType } from '../../types';

interface Props {
  label: string;
  detail?: string;
  signal?: SignalType;
  size?: 'sm' | 'md';
}

const chipMap: Record<SignalType, string> = {
  green: 'bg-signal-green/10 border-signal-green/25 text-signal-green',
  amber: 'bg-signal-amber/10 border-signal-amber/25 text-signal-amber',
  red: 'bg-signal-red/10 border-signal-red/25 text-signal-red',
  blue: 'bg-accent-blue/10 border-accent-blue/25 text-accent-blue-light',
  orange: 'bg-accent-orange/10 border-accent-orange/25 text-accent-orange-light',
  purple: 'bg-signal-purple/10 border-signal-purple/25 text-signal-purple',
  neutral: 'bg-navy-600 border-navy-500 text-ink-secondary',
};

const dotMap: Record<SignalType, string> = {
  green: 'bg-signal-green glow-dot-green',
  amber: 'bg-signal-amber glow-dot-amber',
  red: 'bg-signal-red glow-dot-red',
  blue: 'bg-accent-blue glow-dot-blue',
  orange: 'bg-accent-orange',
  purple: 'bg-signal-purple',
  neutral: 'bg-ink-muted',
};

export default function SignalChip({ label, detail, signal = 'neutral', size = 'md' }: Props) {
  const chip = chipMap[signal];
  const dot = dotMap[signal];
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`inline-flex items-center gap-2 border rounded-full ${chip} ${padding} ${textSize} font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <span>{label}</span>
      {detail && <span className="opacity-70">{detail}</span>}
    </div>
  );
}
