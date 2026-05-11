import { Search, SlidersHorizontal } from 'lucide-react';

interface SegmentOption {
  label: string;
  value: string;
}

interface Props {
  search?: string;
  onSearch?: (v: string) => void;
  segments?: SegmentOption[];
  activeSegment?: string;
  onSegment?: (v: string) => void;
  placeholder?: string;
  actions?: React.ReactNode;
}

export default function FilterBar({ search, onSearch, segments, activeSegment, onSegment, placeholder = 'Search...', actions }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {onSearch !== undefined && (
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={placeholder}
            className="input-base pl-9 w-full"
          />
        </div>
      )}

      {segments && segments.length > 0 && (
        <div className="flex items-center gap-1 bg-navy-800 rounded-xl p-1 border border-navy-500">
          {segments.map(s => (
            <button
              key={s.value}
              onClick={() => onSegment?.(s.value)}
              className={`seg-btn ${activeSegment === s.value ? 'seg-btn-active' : 'seg-btn-inactive'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {actions && <div className="flex items-center gap-2">{actions}</div>}

      {!actions && (
        <button className="btn-ghost">
          <SlidersHorizontal size={14} />
          Filter
        </button>
      )}
    </div>
  );
}
