import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Plus, Search, TrendingUp, AlertTriangle,
  ChevronUp, ChevronDown, X, DollarSign, MoreVertical, Archive,
  RotateCcw, Trash2, GitMerge, Edit3, EyeOff, Star, BookOpen,
  Target, Trophy, Award, Activity, ChevronRight, FileText,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { fmtPct, fmtCurrency, daysSince } from '../data/calculations';
import type { Rep, RepSummary } from '../types';

// ─── Status System ────────────────────────────────────────────────────────────

type RepStatusKey = 'winning' | 'onTrack' | 'watch' | 'red' | 'needsCoaching' | 'noData';

const STATUS_CFG: Record<RepStatusKey, {
  label: string; cls: string; dotCls: string; valueCls: string; barCls: string;
}> = {
  winning:       { label: 'Winning',     cls: 'bg-signal-green/20 text-signal-green border border-signal-green/30',      dotCls: 'bg-signal-green',  valueCls: 'text-signal-green',  barCls: 'bg-signal-green'  },
  onTrack:       { label: 'On Track',    cls: 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/25',          dotCls: 'bg-emerald-400',   valueCls: 'text-emerald-400',   barCls: 'bg-emerald-400'   },
  watch:         { label: 'Watch',       cls: 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30',       dotCls: 'bg-signal-amber',  valueCls: 'text-signal-amber',  barCls: 'bg-signal-amber'  },
  red:           { label: 'Red Zone',    cls: 'bg-signal-red/20 text-signal-red border border-signal-red/30',             dotCls: 'bg-signal-red',    valueCls: 'text-signal-red',    barCls: 'bg-signal-red'    },
  needsCoaching: { label: 'Coach Today', cls: 'bg-accent-orange/20 text-accent-orange border border-accent-orange/30',   dotCls: 'bg-accent-orange', valueCls: 'text-signal-red',    barCls: 'bg-signal-red'    },
  noData:        { label: 'No Data',     cls: 'bg-navy-500/40 text-ink-muted border border-navy-500',                     dotCls: 'bg-navy-400',      valueCls: 'text-ink-muted',     barCls: 'bg-navy-500'      },
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getRepStatus(rs: RepSummary): RepStatusKey {
  const noData =
    rs.attachmentGoal === 0 ||
    (rs.mtdAttachments === 0 && rs.mtdBoxes === 0 && rs.bpPct === 0 && rs.atuPct === 0 && rs.reportCardPct === 0);
  if (noData) return 'noData';
  const pct = rs.attachmentPctToGoal;
  if (pct >= 100) return 'winning';
  if (pct >= 85)  return 'onTrack';
  if (pct >= 75)  return 'watch';
  if (rs.mtdBoxes === 0 || rs.bpPct === 0 || rs.atuPct === 0 || (rs.mtdBoxes >= 5 && pct < 60)) return 'needsCoaching';
  return 'red';
}

function getCoachingReason(rs: RepSummary): string {
  if (rs.mtdBoxes === 0)  return '0 boxes reported — no sales activity this month';
  if (rs.bpPct === 0)     return 'No Boost Protect (BP) activity — protection pitch missing';
  if (rs.atuPct === 0)    return 'No ATU (Auto Top Up) conversions this month';
  const pct = rs.attachmentPctToGoal;
  if (rs.mtdBoxes >= 5 && pct < 60) return `${rs.mtdBoxes} boxes sold but only ${pct.toFixed(1)}% attachment conversion`;
  if (pct < 60)           return `${pct.toFixed(1)}% to goal — significantly below target`;
  return `${pct.toFixed(1)}% to goal — below 75% threshold`;
}

function getGreatFocus(rs: RepSummary): string {
  if (rs.mtdBoxes === 0) return 'Greet + Engage';
  if (rs.bpPct === 0)    return 'Advise (BP Pitch)';
  if (rs.atuPct === 0)   return 'Transact (ATU Close)';
  return 'Advise + Transact';
}

function getAction(rs: RepSummary): string {
  const s = getRepStatus(rs);
  if (s === 'noData')       return 'Request EOD';
  if (s === 'winning')      return 'Recognize';
  if (s === 'onTrack')      return 'Open Scorecard';
  if (s === 'watch')        return 'Check In';
  if (rs.mtdBoxes === 0)    return 'Coach Activity';
  if (rs.bpPct === 0)       return 'Coach BP Pitch';
  if (rs.atuPct === 0)      return 'Coach ATU';
  return 'Coach Rep';
}

// ─── Derived lists ────────────────────────────────────────────────────────────

interface CoachEntry { rs: RepSummary; priority: number; reason: string; greatFocus: string }

function buildCoachingQueue(list: RepSummary[]): CoachEntry[] {
  const out: CoachEntry[] = [];
  for (const rs of list) {
    const s = getRepStatus(rs);
    if (s !== 'needsCoaching' && s !== 'red') continue;
    let p = 5;
    if (rs.mtdBoxes === 0)               p = 1;
    else if (rs.bpPct === 0)             p = 2;
    else if (rs.atuPct === 0)            p = 3;
    else if (rs.attachmentPctToGoal < 60) p = 4;
    out.push({ rs, priority: p, reason: getCoachingReason(rs), greatFocus: getGreatFocus(rs) });
  }
  return out.sort((a, b) => a.priority - b.priority || a.rs.rep.name.localeCompare(b.rs.rep.name)).slice(0, 5);
}

type RecogCat = 'topPct' | 'topBoxes' | 'topAtt' | 'topBP' | 'topComm';
interface RecogEntry {
  rs: RepSummary;
  cat: RecogCat;
  label: string;
  value: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

function buildRecognition(list: RepSummary[]): RecogEntry[] {
  const data = list.filter(rs => getRepStatus(rs) !== 'noData');
  if (data.length === 0) return [];
  const out: RecogEntry[] = [];
  const seen = new Set<string>();

  function tryAdd(
    sorted: RepSummary[],
    cat: RecogCat,
    label: string,
    getValue: (rs: RepSummary) => string,
    Icon: React.ComponentType<{ size?: number; className?: string }>,
    guard: (rs: RepSummary) => boolean,
  ) {
    const top = sorted[0];
    if (top && guard(top) && !seen.has(top.rep.id)) {
      seen.add(top.rep.id);
      out.push({ rs: top, cat, label, value: getValue(top), Icon });
    }
  }

  tryAdd([...data].sort((a, b) => b.attachmentPctToGoal - a.attachmentPctToGoal),
    'topPct', 'Top % to Goal', rs => fmtPct(rs.attachmentPctToGoal), Trophy, rs => rs.attachmentPctToGoal >= 90);
  tryAdd([...data].sort((a, b) => b.mtdBoxes - a.mtdBoxes),
    'topBoxes', 'Most Boxes', rs => `${rs.mtdBoxes} boxes`, Target, rs => rs.mtdBoxes > 0);
  tryAdd([...data].sort((a, b) => b.mtdAttachments - a.mtdAttachments),
    'topAtt', 'Top Attachments', rs => fmtCurrency(rs.mtdAttachments), TrendingUp, rs => rs.mtdAttachments > 0);
  tryAdd([...data].sort((a, b) => b.bpPct - a.bpPct),
    'topBP', 'Top BP%', rs => `${rs.bpPct}% BP`, Award, rs => rs.bpPct > 0);
  tryAdd([...data].sort((a, b) => (b.commission?.commissionAfterRC ?? 0) - (a.commission?.commissionAfterRC ?? 0)),
    'topComm', 'Top Commission', rs => fmtCurrency(rs.commission?.commissionAfterRC ?? 0), DollarSign,
    rs => (rs.commission?.commissionAfterRC ?? 0) > 0);

  return out;
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function RepStatusBadge({ status }: { status: RepStatusKey }) {
  const c = STATUS_CFG[status];
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${c.cls}`}>{c.label}</span>;
}

function GreatFocusBadge({ focus }: { focus: string }) {
  return (
    <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-orange/15 text-accent-orange border border-accent-orange/25 whitespace-nowrap">
      GREAT: {focus}
    </span>
  );
}

// ─── Section: Data Quality Banner ─────────────────────────────────────────────

function DataQualityBanner({ count, total, onDismiss }: { count: number; total: number; onDismiss: () => void }) {
  if (count === 0 || total === 0) return null;
  if (count / total < 0.5) return null;
  return (
    <div className="rounded-2xl border border-signal-amber/30 bg-signal-amber/5 p-4 flex items-start gap-3">
      <AlertTriangle size={16} className="text-signal-amber flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-signal-amber">Rep performance data appears incomplete</p>
        <p className="text-xs text-ink-secondary mt-0.5">
          {count} of {total} reps show no reported activity. This likely means EOD data hasn&apos;t been uploaded
          yet — not that reps are underperforming.
        </p>
        <div className="flex gap-2 mt-2">
          <Link to="/daily-numbers" className="text-xs font-semibold text-accent-orange hover:underline">Upload Numbers</Link>
          <span className="text-ink-muted text-xs">·</span>
          <Link to="/eod-reports" className="text-xs font-semibold text-accent-orange hover:underline">Request EOD</Link>
        </div>
      </div>
      <button onClick={onDismiss} className="btn-ghost p-1 flex-shrink-0 text-ink-muted"><X size={14} /></button>
    </div>
  );
}

// ─── Section: Rep Performance Pulse ──────────────────────────────────────────

interface PulseCardProps {
  label: string;
  value: string | number;
  sub?: string;
  valueCls?: string;
  action?: { label: string; to: string };
}

function PulseCard({ label, value, sub, valueCls = 'text-ink-primary', action }: PulseCardProps) {
  return (
    <div className="card-sm p-4 flex flex-col gap-1 min-w-0">
      <p className="metric-label">{label}</p>
      <p className={`text-2xl font-bold leading-none ${valueCls}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-muted leading-tight">{sub}</p>}
      {action && (
        <Link to={action.to} className="text-[11px] text-accent-orange hover:underline mt-1 flex items-center gap-0.5">
          {action.label} <ChevronRight size={10} />
        </Link>
      )}
    </div>
  );
}

// ─── Section: Priority Coaching Queue ────────────────────────────────────────

function CoachingQueueCard({ entry, storeName, onCoach }: { entry: CoachEntry; storeName: string; onCoach?: (entry: CoachEntry) => void }) {
  const { rs } = entry;
  const status = getRepStatus(rs);
  const cfg = STATUS_CFG[status];
  return (
    <div className="card border-l-4 border-l-accent-orange p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <RepStatusBadge status={status} />
          <Link to={`/reps/${rs.rep.id}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors block mt-1.5 truncate">
            {rs.rep.name}
          </Link>
          {storeName && <p className="text-xs text-ink-muted truncate">{storeName}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xl font-bold ${cfg.valueCls}`}>{fmtPct(rs.attachmentPctToGoal)}</p>
          <p className="text-[10px] text-ink-muted">% to goal</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-ink-secondary">
          <span className={`font-semibold ${rs.mtdBoxes === 0 ? 'text-signal-red' : 'text-ink-primary'}`}>{rs.mtdBoxes}</span> boxes
        </span>
        <span className="text-ink-secondary">
          BP <span className={`font-semibold ${rs.bpPct === 0 ? 'text-signal-red' : 'text-signal-amber'}`}>{rs.bpPct}%</span>
        </span>
        <span className="text-ink-secondary">
          ATU <span className={`font-semibold ${rs.atuPct === 0 ? 'text-signal-red' : 'text-signal-amber'}`}>{rs.atuPct}%</span>
        </span>
        <span className="text-ink-secondary">
          Att <span className="font-semibold text-ink-primary">{fmtCurrency(rs.mtdAttachments)}</span>
        </span>
      </div>

      <div className="flex gap-1.5 items-start">
        <AlertTriangle size={12} className="text-accent-orange flex-shrink-0 mt-0.5" />
        <p className="text-xs text-ink-secondary leading-relaxed">{entry.reason}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <GreatFocusBadge focus={entry.greatFocus} />
        {rs.lastCoachingDate && (
          <span className="text-[11px] text-ink-muted">Last coached {daysSince(rs.lastCoachingDate)}d ago</span>
        )}
      </div>

      <div className="flex gap-2 pt-1 border-t border-navy-600">
        <button
          onClick={() => onCoach?.(entry)}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          <BookOpen size={12} /> Coach Rep
        </button>
        <Link to={`/reps/${rs.rep.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <Activity size={12} /> Scorecard
        </Link>
      </div>
    </div>
  );
}

// ─── Section: Recognition ─────────────────────────────────────────────────────

function RecognitionCard({ entry, storeName }: { entry: RecogEntry; storeName: string }) {
  const { Icon } = entry;
  return (
    <div className="card border-l-4 border-l-signal-green p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-signal-green/15 flex items-center justify-center flex-shrink-0 text-signal-green">
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-signal-green uppercase tracking-wide">{entry.label}</p>
        <Link to={`/reps/${entry.rs.rep.id}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors block truncate mt-0.5">
          {entry.rs.rep.name}
        </Link>
        {storeName && <p className="text-xs text-ink-muted truncate">{storeName}</p>}
        <p className="text-sm font-bold text-signal-green mt-1">{entry.value}</p>
      </div>
      <Link to={`/reps/${entry.rs.rep.id}`} className="btn-ghost text-xs py-1 px-2 flex-shrink-0 text-signal-green flex items-center gap-1">
        <Star size={12} /> Recognize
      </Link>
    </div>
  );
}

// ─── Section: Rep Scorecard Card ──────────────────────────────────────────────

interface ScorecardCardProps {
  rs: RepSummary;
  storeName: string;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onCoach?: (rs: RepSummary) => void;
}

function RepScorecardCard({ rs, storeName, onEdit, onArchive, onDelete, onMerge, onCoach }: ScorecardCardProps) {
  const status = getRepStatus(rs);
  const cfg = STATUS_CFG[status];
  const action = getAction(rs);
  const pct = Math.min(100, Math.max(0, rs.attachmentPctToGoal));

  return (
    <div className={`card p-4 space-y-3 ${
      status === 'winning'                       ? 'border-signal-green/25' :
      status === 'needsCoaching' || status === 'red' ? 'border-signal-red/20' :
      status === 'watch'                         ? 'border-signal-amber/20' :
      'border-navy-500'
    }`}>

      {/* Name + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotCls}`} />
            <RepStatusBadge status={status} />
          </div>
          <Link to={`/reps/${rs.rep.id}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors block truncate">
            {rs.rep.name}
          </Link>
          {storeName && <p className="text-xs text-ink-muted truncate">{storeName}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xl font-bold leading-none ${cfg.valueCls}`}>
            {status === 'noData' ? '—' : fmtPct(rs.attachmentPctToGoal)}
          </p>
          <p className="text-[10px] text-ink-muted mt-0.5">% to goal</p>
        </div>
      </div>

      {/* Progress bar */}
      {status !== 'noData' && (
        <div className="h-1.5 bg-navy-600 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${cfg.barCls}`} style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* KPIs */}
      {status === 'noData' ? (
        <p className="text-xs text-ink-muted text-center py-1">No EOD data for this period</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className={`text-xs font-bold ${rs.mtdBoxes === 0 ? 'text-signal-red' : 'text-ink-primary'}`}>{rs.mtdBoxes}</p>
            <p className="text-[10px] text-ink-muted">Boxes</p>
          </div>
          <div>
            <p className="text-xs font-bold text-ink-primary">{fmtCurrency(rs.mtdAttachments)}</p>
            <p className="text-[10px] text-ink-muted">Att</p>
          </div>
          <div>
            <p className={`text-xs font-bold ${rs.bpPct === 0 ? 'text-signal-red' : rs.bpPct >= 75 ? 'text-signal-green' : 'text-signal-amber'}`}>{rs.bpPct}%</p>
            <p className="text-[10px] text-ink-muted">BP</p>
          </div>
          <div>
            <p className={`text-xs font-bold ${rs.atuPct === 0 ? 'text-signal-red' : rs.atuPct >= 65 ? 'text-signal-green' : 'text-signal-amber'}`}>{rs.atuPct}%</p>
            <p className="text-[10px] text-ink-muted">ATU</p>
          </div>
        </div>
      )}

      {/* Commission */}
      {rs.commission && status !== 'noData' && (
        <div className="flex items-center justify-between text-xs border-t border-navy-600 pt-2">
          <span className="text-ink-muted flex items-center gap-1"><DollarSign size={11} /> Est. Commission</span>
          <span className="font-bold text-signal-green">{fmtCurrency(rs.commission.commissionAfterRC)}</span>
        </div>
      )}

      {/* Coaching note */}
      {(status === 'needsCoaching' || status === 'red') && (
        <div className="flex gap-1.5 items-start">
          <AlertTriangle size={11} className="text-accent-orange flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-ink-secondary leading-snug">{getCoachingReason(rs)}</p>
        </div>
      )}
      {status === 'winning' && (
        <div className="flex items-center gap-1.5">
          <Star size={11} className="text-signal-green flex-shrink-0" />
          <p className="text-[11px] text-signal-green font-medium">Recognition opportunity</p>
        </div>
      )}

      {/* Action row */}
      <div className="flex gap-2 pt-1 border-t border-navy-600">
        {(status === 'needsCoaching' || status === 'red' || status === 'watch') && onCoach ? (
          <button
            onClick={() => onCoach(rs)}
            className="flex-1 text-center text-xs py-1.5 rounded-lg font-semibold transition-all bg-accent-orange/15 text-accent-orange hover:bg-accent-orange/25"
          >
            {action}
          </button>
        ) : (
          <Link
            to={status === 'noData' ? '/eod-reports' : `/reps/${rs.rep.id}`}
            className={`flex-1 text-center text-xs py-1.5 rounded-lg font-semibold transition-all ${
              status === 'winning'  ? 'bg-signal-green/15 text-signal-green hover:bg-signal-green/25' :
              status === 'noData'   ? 'bg-navy-600 text-ink-secondary hover:bg-navy-500' :
              'bg-accent-orange/15 text-accent-orange hover:bg-accent-orange/25'
            }`}
          >
            {action}
          </Link>
        )}
        <RepActionMenu rep={rs.rep} isArchived={false}
          onEdit={onEdit} onArchive={onArchive} onRestore={() => {}} onDelete={onDelete} onMerge={onMerge} />
      </div>
    </div>
  );
}

// ─── Preserved: Action Menu ───────────────────────────────────────────────────

function RepActionMenu({
  rep: _rep, isArchived, onEdit, onArchive, onRestore, onDelete, onMerge,
}: {
  rep: Rep; isArchived: boolean;
  onEdit: () => void; onArchive: () => void; onRestore: () => void;
  onDelete: () => void; onMerge: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={e => e.preventDefault()}>
      <button onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-lg bg-navy-600 border border-navy-500 hover:bg-navy-500 transition-colors text-ink-secondary">
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-navy-700 border border-navy-500 rounded-xl shadow-2xl overflow-hidden">
          {!isArchived && <button onClick={() => { setOpen(false); onEdit(); }} className="menu-row"><Edit3 size={12} /> Edit Rep</button>}
          {!isArchived && <button onClick={() => { setOpen(false); onMerge(); }} className="menu-row"><GitMerge size={12} /> Merge Duplicate</button>}
          {!isArchived && <button onClick={() => { setOpen(false); onArchive(); }} className="menu-row border-t border-navy-600 text-signal-amber"><Archive size={12} /> Archive Rep</button>}
          {isArchived  && <button onClick={() => { setOpen(false); onRestore(); }} className="menu-row text-signal-green"><RotateCcw size={12} /> Restore Rep</button>}
          <button onClick={() => { setOpen(false); onDelete(); }} className="menu-row border-t border-navy-600 text-signal-red"><Trash2 size={12} /> Delete Permanently</button>
        </div>
      )}
    </div>
  );
}

// ─── Preserved: Modals ────────────────────────────────────────────────────────

function RepFormModal({ title, initial, onClose, onSubmit }: {
  title: string; initial: Partial<Omit<Rep, 'id' | 'createdAt'>>;
  onClose: () => void; onSubmit: (r: Omit<Rep, 'id' | 'createdAt'>) => void;
}) {
  const { stores } = useData();
  const [form, setForm] = useState({
    name: initial.name ?? '', defaultStoreId: initial.defaultStoreId ?? '',
    phone: initial.phone ?? '', hireDate: initial.hireDate ?? '',
    notes: initial.notes ?? '', strengths: initial.strengths ?? [] as string[],
    gaps: initial.gaps ?? [] as string[], active: initial.active ?? true,
  });
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-ink-primary">{title}</p>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <input className="input-base w-full" placeholder="Rep name *" value={form.name} onChange={e => set('name', e.target.value)} />
          <select className="input-base w-full" value={form.defaultStoreId} onChange={e => set('defaultStoreId', e.target.value)}>
            <option value="">Select default store</option>
            {stores.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="input-base w-full" placeholder="Phone" value={form.phone} onChange={e => set('phone', e.target.value)} />
          <input className="input-base w-full" type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} />
          <textarea className="input-base w-full resize-none" rows={2} placeholder="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => { if (!form.name.trim()) return; onSubmit(form); onClose(); }}
            disabled={!form.name} className="btn-primary flex-1 disabled:opacity-50">{title}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmArchiveModal({ rep, onClose, onConfirm }: { rep: Rep; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><Archive size={18} className="text-signal-amber" /><p className="text-base font-bold text-ink-primary">Archive Rep</p></div>
        <p className="text-sm text-ink-secondary">Archive <strong className="text-ink-primary">{rep.name}</strong>? All history is preserved.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 text-xs px-3 py-2 rounded-xl bg-signal-amber text-navy-900 font-semibold">Archive</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ rep, onClose, onConfirm }: { rep: Rep; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-signal-red/30 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><Trash2 size={18} className="text-signal-red" /><p className="text-base font-bold text-ink-primary">Delete Permanently</p></div>
        <div className="bg-signal-red/10 border border-signal-red/20 rounded-xl p-3">
          <p className="text-xs text-signal-red font-semibold mb-1">This cannot be undone.</p>
          <p className="text-xs text-ink-secondary">If this rep has history, deletion will be blocked. Use Archive instead.</p>
        </div>
        <p className="text-xs text-ink-muted">Type <strong className="text-ink-primary">{rep.name}</strong> to confirm:</p>
        <input className="input-base w-full" placeholder={rep.name} value={typed} onChange={e => setTyped(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} disabled={typed !== rep.name}
            className="flex-1 text-xs px-3 py-2 rounded-xl bg-signal-red text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Delete</button>
        </div>
      </div>
    </div>
  );
}

function MergeRepModal({ dup, allReps, onClose, onConfirm }: {
  dup: Rep; allReps: Rep[]; onClose: () => void; onConfirm: (primaryId: string) => void;
}) {
  const [primaryId, setPrimaryId] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><GitMerge size={18} className="text-accent-blue-light" /><p className="text-base font-bold text-ink-primary">Merge Duplicate Rep</p></div>
        <p className="text-sm text-ink-secondary">All history from <strong className="text-ink-primary">{dup.name}</strong> moves to the primary rep. Duplicate will be archived.</p>
        <select className="input-base w-full" value={primaryId} onChange={e => setPrimaryId(e.target.value)}>
          <option value="">Select primary rep...</option>
          {allReps.filter(r => r.id !== dup.id && r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => { onConfirm(primaryId); onClose(); }} disabled={!primaryId}
            className="flex-1 text-xs px-3 py-2 rounded-xl bg-accent-blue-light text-white font-semibold disabled:opacity-40">Merge & Archive</button>
        </div>
      </div>
    </div>
  );
}

function DeleteBlockedModal({ reason, onClose }: { reason: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-signal-amber/30 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><AlertTriangle size={18} className="text-signal-amber" /><p className="text-base font-bold text-ink-primary">Cannot Delete</p></div>
        <p className="text-sm text-ink-secondary">{reason}</p>
        <button onClick={onClose} className="btn-primary w-full text-xs">Got It — Use Archive Instead</button>
      </div>
    </div>
  );
}

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

type SortCol = 'name' | 'store' | 'status' | 'attPct' | 'mtdAtt' | 'mtdBoxes' | 'bpPct' | 'atuPct' | 'commission';
type SortDir = 'asc' | 'desc';
type QuickFilter = 'all' | 'top5' | 'winning' | 'onTrack' | 'watch' | 'red' | 'coaching' | 'noData' | 'zeroBoxes' | 'highLowAtt';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={10} className="text-ink-muted opacity-30" />;
  return dir === 'asc' ? <ChevronUp size={10} className="text-accent-orange" /> : <ChevronDown size={10} className="text-accent-orange" />;
}

// ─── Modal state ──────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; rep: Rep }
  | { type: 'archive'; rep: Rep }
  | { type: 'delete'; rep: Rep }
  | { type: 'merge'; rep: Rep }
  | { type: 'blocked'; reason: string }
  | null;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Reps() {
  const { repSummaries, stores, reps, addRep, updateRep, mergeReps, permanentDeleteRep, addToCoachingQueue } = useData();

  const [search, setSearch]             = useState('');
  const [quickFilter, setQuickFilter]   = useState<QuickFilter>('all');
  const [sortCol, setSortCol]           = useState<SortCol>('attPct');
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [showArchived, setShowArchived] = useState(false);
  const [showAllCards, setShowAllCards] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [modal, setModal]               = useState<ModalState>(null);

  const storeMap   = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s.name])), [stores]);
  const archivedReps = reps.filter(r => !r.active);

  // ── Classified statuses ────────────────────────────────────────────────────
  const classified = useMemo(() => repSummaries.map(rs => ({ rs, status: getRepStatus(rs) })), [repSummaries]);

  // ── Pulse counts ───────────────────────────────────────────────────────────
  const pulse = useMemo(() => {
    const n = repSummaries.length;
    const count = (s: RepStatusKey) => classified.filter(x => x.status === s).length;
    const districtAvg = n > 0
      ? Math.round(repSummaries.reduce((acc, r) => acc + r.attachmentPctToGoal, 0) / n * 10) / 10
      : 0;
    return {
      total: n,
      winning: count('winning'), onTrack: count('onTrack'),
      watch: count('watch'), red: count('red'),
      needsCoaching: count('needsCoaching'), noData: count('noData'),
      districtAvg,
    };
  }, [repSummaries, classified]);

  // ── Action lists ───────────────────────────────────────────────────────────
  const coachingQueue   = useMemo(() => buildCoachingQueue(repSummaries), [repSummaries]);
  const recognitionList = useMemo(() => buildRecognition(repSummaries),   [repSummaries]);

  // ── Leaderboard sort + filter ──────────────────────────────────────────────
  const STATUS_ORDER: Record<RepStatusKey, number> = { winning: 0, onTrack: 1, watch: 2, red: 3, needsCoaching: 4, noData: 5 };

  const sorted = useMemo(() => {
    return [...repSummaries].sort((a, b) => {
      const m = sortDir === 'asc' ? 1 : -1;
      switch (sortCol) {
        case 'name':       return m * a.rep.name.localeCompare(b.rep.name);
        case 'store':      return m * ((storeMap[a.rep.defaultStoreId] ?? '').localeCompare(storeMap[b.rep.defaultStoreId] ?? ''));
        case 'status':     return m * (STATUS_ORDER[getRepStatus(a)] - STATUS_ORDER[getRepStatus(b)]);
        case 'attPct':     return m * (a.attachmentPctToGoal - b.attachmentPctToGoal);
        case 'mtdAtt':     return m * (a.mtdAttachments - b.mtdAttachments);
        case 'mtdBoxes':   return m * (a.mtdBoxes - b.mtdBoxes);
        case 'bpPct':      return m * (a.bpPct - b.bpPct);
        case 'atuPct':     return m * (a.atuPct - b.atuPct);
        case 'commission': return m * ((a.commission?.commissionAfterRC ?? 0) - (b.commission?.commissionAfterRC ?? 0));
        default:           return m * (a.attachmentPctToGoal - b.attachmentPctToGoal);
      }
    });
  }, [repSummaries, sortCol, sortDir, storeMap]);

  const rows = useMemo(() => {
    let result = sorted;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(rs =>
        rs.rep.name.toLowerCase().includes(q) ||
        (storeMap[rs.rep.defaultStoreId] ?? '').toLowerCase().includes(q),
      );
    }
    const s = (rs: RepSummary) => getRepStatus(rs);
    switch (quickFilter) {
      case 'top5':      return result.slice(0, 5);
      case 'winning':   return result.filter(rs => s(rs) === 'winning');
      case 'onTrack':   return result.filter(rs => s(rs) === 'onTrack');
      case 'watch':     return result.filter(rs => s(rs) === 'watch');
      case 'red':       return result.filter(rs => s(rs) === 'red');
      case 'coaching':  return result.filter(rs => s(rs) === 'needsCoaching');
      case 'noData':    return result.filter(rs => s(rs) === 'noData');
      case 'zeroBoxes': return result.filter(rs => rs.mtdBoxes === 0 && s(rs) !== 'noData');
      case 'highLowAtt':return result.filter(rs => rs.mtdBoxes >= 5 && rs.attachmentPctToGoal < 60);
      default:          return result;
    }
  }, [sorted, search, quickFilter, storeMap]);

  // ── Scorecard groups ───────────────────────────────────────────────────────
  const coachCards = useMemo(() => repSummaries.filter(rs => { const s = getRepStatus(rs); return s === 'needsCoaching' || s === 'red'; }), [repSummaries]);
  const winCards   = useMemo(() => repSummaries.filter(rs => getRepStatus(rs) === 'winning'),   [repSummaries]);
  const noDataReps = useMemo(() => repSummaries.filter(rs => getRepStatus(rs) === 'noData'),    [repSummaries]);
  const otherCards = useMemo(() => repSummaries.filter(rs => { const s = getRepStatus(rs); return s === 'onTrack' || s === 'watch'; }), [repSummaries]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleArchive = (rep: Rep) => updateRep(rep.id, { active: false });
  const handleRestore = (rep: Rep) => updateRep(rep.id, { active: true });
  const handleDelete  = (rep: Rep) => {
    const r = permanentDeleteRep(rep.id);
    if (!r.success) setModal({ type: 'blocked', reason: r.reason ?? 'Cannot delete.' });
  };

  const handleCoachRep = (rs: RepSummary) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    addToCoachingQueue({
      repId:      rs.rep.id,
      repName:    rs.rep.name,
      storeId:    rs.rep.defaultStoreId,
      storeName:  storeMap[rs.rep.defaultStoreId] ?? '',
      reason:     getCoachingReason(rs),
      priority:   (rs.mtdBoxes === 0 ? 1 : rs.bpPct === 0 ? 2 : rs.atuPct === 0 ? 3 : rs.attachmentPctToGoal < 60 ? 4 : 5) as 1 | 2 | 3 | 4 | 5,
      greatFocus: getGreatFocus(rs),
      sourcePage: 'reps',
      sourceType: getRepStatus(rs),
      dueDate:    today,
      status:     'open',
      notes:      '',
    });
  };

  const handleCoachEntry = (entry: CoachEntry) => handleCoachRep(entry.rs);

  const sortBy = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const renderCard = (rs: RepSummary) => (
    <RepScorecardCard
      key={rs.rep.id}
      rs={rs}
      storeName={storeMap[rs.rep.defaultStoreId] ?? ''}
      onEdit={() => setModal({ type: 'edit', rep: rs.rep })}
      onArchive={() => setModal({ type: 'archive', rep: rs.rep })}
      onDelete={() => handleDelete(rs.rep)}
      onMerge={() => setModal({ type: 'merge', rep: rs.rep })}
      onCoach={handleCoachRep}
    />
  );

  const thL = 'px-3 py-2.5 text-left text-[11px] font-semibold text-ink-muted cursor-pointer hover:text-ink-secondary select-none whitespace-nowrap';
  const thR = 'px-3 py-2.5 text-right text-[11px] font-semibold text-ink-muted cursor-pointer hover:text-ink-secondary select-none whitespace-nowrap';

  const chips: { key: QuickFilter; label: string; count?: number }[] = [
    { key: 'all',       label: 'All',             count: repSummaries.length },
    { key: 'top5',      label: 'Top 5'                                        },
    { key: 'winning',   label: 'Winning',          count: pulse.winning       },
    { key: 'onTrack',   label: 'On Track',         count: pulse.onTrack       },
    { key: 'watch',     label: 'Watch',            count: pulse.watch         },
    { key: 'red',       label: 'Red Zone',         count: pulse.red           },
    { key: 'coaching',  label: 'Coach Today',      count: pulse.needsCoaching },
    { key: 'noData',    label: 'No Data',          count: pulse.noData        },
    { key: 'zeroBoxes', label: 'Zero Boxes'                                   },
    { key: 'highLowAtt',label: 'High Boxes / Low Att'                         },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-screen-xl">

      {/* Modals */}
      {modal?.type === 'add'     && <RepFormModal title="Add Rep" initial={{}} onClose={() => setModal(null)} onSubmit={r => addRep(r)} />}
      {modal?.type === 'edit'    && <RepFormModal title="Edit Rep" initial={modal.rep} onClose={() => setModal(null)} onSubmit={r => updateRep(modal.rep.id, r)} />}
      {modal?.type === 'archive' && <ConfirmArchiveModal rep={modal.rep} onClose={() => setModal(null)} onConfirm={() => handleArchive(modal.rep)} />}
      {modal?.type === 'delete'  && <ConfirmDeleteModal  rep={modal.rep} onClose={() => setModal(null)} onConfirm={() => handleDelete(modal.rep)} />}
      {modal?.type === 'merge'   && <MergeRepModal dup={modal.rep} allReps={reps} onClose={() => setModal(null)} onConfirm={id => mergeReps(id, modal.rep.id)} />}
      {modal?.type === 'blocked' && <DeleteBlockedModal reason={modal.reason} onClose={() => setModal(null)} />}

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users size={20} className="text-accent-orange" />
            <h1 className="text-xl font-bold text-ink-primary">Reps</h1>
            {pulse.needsCoaching + pulse.red > 0 && (
              <span className="text-xs font-bold bg-accent-orange text-white rounded-full px-2 py-0.5">
                {pulse.needsCoaching + pulse.red} need coaching
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">Rep performance, coaching, and commissions · {pulse.total} active reps</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {archivedReps.length > 0 && (
            <button onClick={() => setShowArchived(v => !v)}
              className={`btn-ghost text-xs flex items-center gap-1.5 ${showArchived ? 'text-accent-blue-light' : ''}`}>
              <EyeOff size={13} /> {showArchived ? 'Hide Archived' : `${archivedReps.length} Archived`}
            </button>
          )}
          <Link to="/coaching"    className="btn-secondary text-xs flex items-center gap-1.5"><BookOpen size={13} /> Coaching Hub</Link>
          <Link to="/eod-reports" className="btn-secondary text-xs flex items-center gap-1.5"><FileText size={13} /> EOD Reports</Link>
          <button onClick={() => setModal({ type: 'add' })} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={14} /> Add Rep
          </button>
        </div>
      </div>

      {/* ── 2. Data Quality Banner ─────────────────────────────────────────── */}
      {!bannerHidden && (
        <DataQualityBanner count={pulse.noData} total={pulse.total} onDismiss={() => setBannerHidden(true)} />
      )}

      {/* ── 3. Rep Performance Pulse ───────────────────────────────────────── */}
      <div>
        <p className="metric-label mb-3 flex items-center gap-2">
          <Activity size={13} className="text-ink-muted" /> Rep Performance Pulse
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <PulseCard label="Active Reps"   value={pulse.total}        sub="District roster"     />
          <PulseCard label="Winning"       value={pulse.winning}      sub="≥ 100% to goal"      valueCls={pulse.winning > 0 ? 'text-signal-green' : 'text-ink-primary'} />
          <PulseCard label="On Track"      value={pulse.onTrack}      sub="85–99% to goal"      valueCls={pulse.onTrack > 0 ? 'text-emerald-400' : 'text-ink-primary'} />
          <PulseCard label="Watch"         value={pulse.watch}        sub="75–84% to goal"      valueCls={pulse.watch > 0 ? 'text-signal-amber' : 'text-ink-primary'} />
          <PulseCard label="Red Zone"      value={pulse.red}          sub="Below 75%"           valueCls={pulse.red > 0 ? 'text-signal-red' : 'text-ink-primary'} />
          <PulseCard label="Coach Today"   value={pulse.needsCoaching} sub="Specific gap found" valueCls={pulse.needsCoaching > 0 ? 'text-accent-orange' : 'text-ink-primary'}
            action={pulse.needsCoaching > 0 ? { label: 'See queue', to: '/coaching' } : undefined} />
          <PulseCard label="No Data"       value={pulse.noData}       sub="EOD not uploaded"    valueCls={pulse.noData > 0 ? 'text-ink-muted' : 'text-ink-primary'}
            action={pulse.noData > 0 ? { label: 'Request EOD', to: '/eod-reports' } : undefined} />
          <PulseCard label="District Avg"  value={fmtPct(pulse.districtAvg)} sub="Att % to goal"
            valueCls={pulse.districtAvg >= 100 ? 'text-signal-green' : pulse.districtAvg >= 75 ? 'text-signal-amber' : 'text-signal-red'} />
        </div>
      </div>

      {/* ── 4. Priority Coaching Queue + Recognition ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Coaching Queue */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <BookOpen size={15} className="text-accent-orange" /> Priority Coaching Queue
            </p>
            {coachingQueue.length > 0 && (
              <span className="text-[11px] text-ink-muted">{pulse.needsCoaching + pulse.red} total needing attention</span>
            )}
          </div>
          {coachingQueue.length === 0 ? (
            <div className="card p-8 text-center space-y-2">
              <Trophy size={28} className="text-signal-green mx-auto" />
              <p className="text-sm font-semibold text-ink-secondary">No coaching queue</p>
              <p className="text-xs text-ink-muted">
                {pulse.noData > 0
                  ? 'Upload EOD data to see who needs coaching today.'
                  : 'All reps are on track or winning.'}
              </p>
              {pulse.noData > 0 && (
                <Link to="/eod-reports" className="btn-primary text-xs inline-flex items-center gap-1.5 mt-2">
                  <FileText size={12} /> Request EOD
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {coachingQueue.map(entry => (
                <CoachingQueueCard
                  key={entry.rs.rep.id}
                  entry={entry}
                  storeName={storeMap[entry.rs.rep.defaultStoreId] ?? ''}
                  onCoach={handleCoachEntry}
                />
              ))}
              {pulse.needsCoaching + pulse.red > 5 && (
                <button onClick={() => setQuickFilter('coaching')} className="w-full text-xs text-accent-orange hover:underline py-1.5">
                  View all {pulse.needsCoaching + pulse.red} in leaderboard →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Recognition */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
            <Star size={15} className="text-signal-green" /> Recognition Opportunities
          </p>
          {recognitionList.length === 0 ? (
            <div className="card p-8 text-center space-y-2">
              <Star size={28} className="text-ink-muted mx-auto" />
              <p className="text-sm font-semibold text-ink-secondary">No recognition ready</p>
              <p className="text-xs text-ink-muted">Upload EOD data or check back after close.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recognitionList.map(entry => (
                <RecognitionCard
                  key={entry.rs.rep.id + '-' + entry.cat}
                  entry={entry}
                  storeName={storeMap[entry.rs.rep.defaultStoreId] ?? ''}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Rep Leaderboard ─────────────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm font-bold text-ink-primary">Rep Leaderboard</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                className="input-base pl-8 py-1.5 text-xs w-48"
                placeholder="Search reps or stores…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span className="text-xs text-ink-muted whitespace-nowrap">{rows.length} showing</span>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {chips.map(c => (
            <button key={c.key} onClick={() => setQuickFilter(c.key)}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                quickFilter === c.key ? 'bg-accent-orange text-white' : 'bg-navy-600 text-ink-muted hover:text-ink-secondary'
              }`}>
              {c.label}
              {c.count !== undefined && c.count > 0 && (
                <span className={`text-[10px] rounded-full px-1.5 ${quickFilter === c.key ? 'bg-white/20' : 'bg-navy-500'}`}>{c.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-navy-500">
                <th className={thL}>#</th>
                <th className={thL} onClick={() => sortBy('name')}><span className="flex items-center gap-1">Rep <SortIcon active={sortCol === 'name'} dir={sortDir} /></span></th>
                <th className={thR} onClick={() => sortBy('mtdBoxes')}><span className="flex items-center justify-end gap-1">Boxes <SortIcon active={sortCol === 'mtdBoxes'} dir={sortDir} /></span></th>
                <th className={thR} onClick={() => sortBy('mtdAtt')}><span className="flex items-center justify-end gap-1">ATT MTD <SortIcon active={sortCol === 'mtdAtt'} dir={sortDir} /></span></th>
                <th className={thR}>Goals</th>
                <th className={thR} onClick={() => sortBy('attPct')}><span className="flex items-center justify-end gap-1">% to Goal <SortIcon active={sortCol === 'attPct'} dir={sortDir} /></span></th>
                <th className={thL} onClick={() => sortBy('status')}><span className="flex items-center gap-1">Status <SortIcon active={sortCol === 'status'} dir={sortDir} /></span></th>
                <th className={thR} onClick={() => sortBy('bpPct')}><span className="flex items-center justify-end gap-1">BP% <SortIcon active={sortCol === 'bpPct'} dir={sortDir} /></span></th>
                <th className={thR} onClick={() => sortBy('commission')}><span className="flex items-center justify-end gap-1">Commission <SortIcon active={sortCol === 'commission'} dir={sortDir} /></span></th>
                <th className={thL}>Status</th>
                <th className={thL}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rs, _i) => {
                const status = getRepStatus(rs);
                const cfg    = STATUS_CFG[status];
                const rank   = sorted.indexOf(rs) + 1;
                const action = getAction(rs);
                const hasGoal = rs.attachmentGoal > 0;
                const hasBP   = rs.bpPct > 0 || status !== 'noData';
                const commTier = rs.commission?.tier;
                const commRcLabel = rs.commission?.rcLabel;
                return (
                  <tr key={rs.rep.id} className="border-b border-navy-600/60 hover:bg-navy-600/30 transition-colors">
                    <td className="px-3 py-3 text-ink-muted font-semibold text-[11px]">{rank}</td>
                    <td className="px-3 py-3">
                      <Link to={`/reps/${rs.rep.id}`} className="font-semibold text-ink-primary hover:text-white transition-colors">
                        {rs.rep.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {status === 'noData'
                        ? <span className="text-ink-muted">—</span>
                        : <span className={`font-semibold ${rs.mtdBoxes === 0 ? 'text-signal-red' : 'text-ink-primary'}`}>{rs.mtdBoxes}</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-right text-ink-secondary">
                      {status === 'noData' ? <span className="text-ink-muted">—</span> : fmtCurrency(rs.mtdAttachments)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {hasGoal
                        ? <span className="text-ink-secondary text-[11px]">{fmtCurrency(rs.attachmentGoal)}</span>
                        : <span className="text-ink-muted text-[10px]">Not synced</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-right">
                      {status === 'noData'
                        ? <span className="text-ink-muted text-[11px]">No data</span>
                        : hasGoal
                          ? <span className={`font-bold ${cfg.valueCls}`}>{fmtPct(rs.attachmentPctToGoal)}</span>
                          : <span className="text-ink-muted text-[10px]">Not synced</span>
                      }
                    </td>
                    <td className="px-3 py-3"><RepStatusBadge status={status} /></td>
                    <td className="px-3 py-3 text-right">
                      {status === 'noData'
                        ? <span className="text-ink-muted text-[10px]">Not synced</span>
                        : hasBP
                          ? <span className={`font-semibold ${rs.bpPct === 0 ? 'text-signal-red' : rs.bpPct >= 75 ? 'text-signal-green' : 'text-signal-amber'}`}>{rs.bpPct}%</span>
                          : <span className="text-ink-muted text-[10px]">Not synced</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-right">
                      {rs.commission
                        ? <span className="font-semibold text-signal-green">{fmtCurrency(rs.commission.commissionAfterRC)}</span>
                        : <span className="text-ink-muted text-[10px]">Not synced</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      {rs.commission && (commTier || commRcLabel)
                        ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            commRcLabel?.includes('Bonus') ? 'bg-signal-green/15 text-signal-green' :
                            commRcLabel?.includes('Penalty') ? 'bg-signal-red/15 text-signal-red' :
                            'bg-navy-600 text-ink-secondary'
                          }`}>{commTier ?? commRcLabel ?? '—'}</span>
                        : <span className="text-ink-muted text-[10px]">Not synced</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {(status === 'needsCoaching' || status === 'red' || status === 'watch') ? (
                          <button
                            onClick={() => handleCoachRep(rs)}
                            className="text-[11px] px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-all bg-accent-orange/15 text-accent-orange hover:bg-accent-orange/25"
                          >{action}</button>
                        ) : (
                          <Link
                            to={status === 'noData' ? '/eod-reports' : `/reps/${rs.rep.id}`}
                            className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-all ${
                              status === 'winning' ? 'bg-signal-green/15 text-signal-green hover:bg-signal-green/25'
                              : status === 'noData' ? 'bg-navy-600 text-ink-muted hover:bg-navy-500'
                              : 'bg-accent-orange/15 text-accent-orange hover:bg-accent-orange/25'
                            }`}
                          >{action}</Link>
                        )}
                        <RepActionMenu rep={rs.rep} isArchived={false}
                          onEdit={() => setModal({ type: 'edit', rep: rs.rep })}
                          onArchive={() => setModal({ type: 'archive', rep: rs.rep })}
                          onRestore={() => handleRestore(rs.rep)}
                          onDelete={() => handleDelete(rs.rep)}
                          onMerge={() => setModal({ type: 'merge', rep: rs.rep })}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-xs text-ink-muted">No reps match this filter</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 6. Rep Scorecard Grid ───────────────────────────────────────────── */}
      <div className="space-y-6">

        {coachCards.length > 0 && (
          <div>
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-orange" />
              Coach Today <span className="text-xs font-normal text-ink-muted">({coachCards.length})</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{coachCards.map(renderCard)}</div>
          </div>
        )}

        {winCards.length > 0 && (
          <div>
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-signal-green" />
              Recognition Ready <span className="text-xs font-normal text-ink-muted">({winCards.length})</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{winCards.map(renderCard)}</div>
          </div>
        )}

        {noDataReps.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-navy-400" />
                No Data <span className="text-xs font-normal text-ink-muted">({noDataReps.length})</span>
              </p>
              <Link to="/eod-reports" className="text-xs text-accent-orange hover:underline flex items-center gap-1">
                <FileText size={11} /> Request EOD
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{noDataReps.map(renderCard)}</div>
          </div>
        )}

        {otherCards.length > 0 && (
          <div>
            <button
              onClick={() => setShowAllCards(v => !v)}
              className="flex items-center gap-2 text-sm font-bold text-ink-secondary hover:text-ink-primary transition-colors mb-3 w-full text-left"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${showAllCards ? 'bg-signal-amber' : 'bg-navy-400'}`} />
              {showAllCards ? 'On Track & Watch' : 'Show On Track & Watch'}
              <span className="text-xs font-normal text-ink-muted">({otherCards.length})</span>
              <ChevronDown size={14} className={`ml-auto transition-transform ${showAllCards ? 'rotate-180' : ''}`} />
            </button>
            {showAllCards && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{otherCards.map(renderCard)}</div>
            )}
          </div>
        )}
      </div>

      {/* ── 7. Archived Reps ───────────────────────────────────────────────── */}
      {showArchived && archivedReps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <EyeOff size={14} className="text-ink-muted" />
            <p className="text-sm font-bold text-ink-secondary">Archived Reps ({archivedReps.length})</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {archivedReps
              .filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
              .map(rep => (
                <div key={rep.id} className="relative card p-4 border border-navy-600 opacity-70">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-navy-400" />
                    <p className="text-sm font-bold text-ink-secondary truncate">{rep.name}</p>
                    <span className="badge-neutral text-[10px]">Archived</span>
                  </div>
                  {storeMap[rep.defaultStoreId] && (
                    <p className="text-xs text-ink-muted mt-0.5 ml-3.5">{storeMap[rep.defaultStoreId]}</p>
                  )}
                  <div className="absolute top-3 right-3">
                    <RepActionMenu rep={rep} isArchived={true}
                      onEdit={() => setModal({ type: 'edit', rep })}
                      onArchive={() => setModal({ type: 'archive', rep })}
                      onRestore={() => handleRestore(rep)}
                      onDelete={() => handleDelete(rep)}
                      onMerge={() => setModal({ type: 'merge', rep })}
                    />
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
