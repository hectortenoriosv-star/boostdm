import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, AlertTriangle, X,
  ChevronUp, ChevronDown, MoreVertical, Archive, RotateCcw,
  Trash2, GitMerge, Edit3, EyeOff, Store as StoreIcon,
  Users, Activity, FileText, Star, BookOpen,
  ChevronRight, Shield, MapPin, TrendingUp,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { fmtPct, fmtCurrency, daysSince } from '../data/calculations';
import type { Store as StoreType, StoreSummary } from '../types';

// ─── Preserved: Store Form Modal ─────────────────────────────────────────────

function StoreFormModal({
  title, initial, onClose, onSubmit,
}: {
  title: string;
  initial: Partial<Omit<StoreType, 'id' | 'createdAt'>>;
  onClose: () => void;
  onSubmit: (s: Omit<StoreType, 'id' | 'createdAt'>) => void;
}) {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    address: initial.address ?? '',
    city: initial.city ?? 'Houston',
    state: initial.state ?? 'TX',
    phone: initial.phone ?? '',
    hours: initial.hours ?? { open: '10:00', close: '20:00' },
    monthlyAttachmentGoal: initial.monthlyAttachmentGoal ?? 7200,
    bpGoal: initial.bpGoal ?? 75,
    atuGoal: initial.atuGoal ?? 65,
    active: initial.active ?? true,
    notes: initial.notes ?? '',
    eventNotes: initial.eventNotes ?? ([] as StoreType['eventNotes']),
  });
  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-ink-primary">{title}</p>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <input className="input-base w-full" placeholder="Store name *"
            value={form.name} onChange={e => set('name', e.target.value)} />
          <input className="input-base w-full" placeholder="Address"
            value={form.address} onChange={e => set('address', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-base" placeholder="City"
              value={form.city} onChange={e => set('city', e.target.value)} />
            <input className="input-base" placeholder="State"
              value={form.state} onChange={e => set('state', e.target.value)} />
          </div>
          <input className="input-base w-full" placeholder="Phone"
            value={form.phone} onChange={e => set('phone', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-ink-muted block mb-1">Opens</label>
              <input className="input-base w-full" type="time" value={form.hours.open}
                onChange={e => setForm(f => ({ ...f, hours: { ...f.hours, open: e.target.value } }))} />
            </div>
            <div>
              <label className="text-xs text-ink-muted block mb-1">Closes</label>
              <input className="input-base w-full" type="time" value={form.hours.close}
                onChange={e => setForm(f => ({ ...f, hours: { ...f.hours, close: e.target.value } }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Monthly Attachment Goal ($)</label>
            <input className="input-base w-full" type="number"
              value={form.monthlyAttachmentGoal}
              onChange={e => set('monthlyAttachmentGoal', Number(e.target.value))} />
          </div>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="Notes"
            value={form.notes} onChange={e => set('notes', e.target.value)} />
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

// ─── Preserved: Action Menu ───────────────────────────────────────────────────

function StoreActionMenu({
  store: _store, isArchived, onEdit, onArchive, onRestore, onDelete, onMerge,
}: {
  store: StoreType; isArchived: boolean;
  onEdit: () => void; onArchive: () => void; onRestore: () => void;
  onDelete: () => void; onMerge: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div ref={ref} className="relative" onClick={e => e.preventDefault()}>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-lg bg-navy-600 border border-navy-500 hover:bg-navy-500 transition-colors text-ink-secondary"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-44 bg-navy-700 border border-navy-500 rounded-xl shadow-2xl overflow-hidden">
          {!isArchived && <button onClick={() => { setOpen(false); onEdit(); }} className="menu-row"><Edit3 size={12} /> Edit Store</button>}
          {!isArchived && <button onClick={() => { setOpen(false); onMerge(); }} className="menu-row"><GitMerge size={12} /> Merge Duplicate</button>}
          {!isArchived && <button onClick={() => { setOpen(false); onArchive(); }} className="menu-row border-t border-navy-600 text-signal-amber"><Archive size={12} /> Archive Store</button>}
          {isArchived  && <button onClick={() => { setOpen(false); onRestore(); }} className="menu-row text-signal-green"><RotateCcw size={12} /> Restore Store</button>}
          <button onClick={() => { setOpen(false); onDelete(); }} className="menu-row border-t border-navy-600 text-signal-red"><Trash2 size={12} /> Delete Permanently</button>
        </div>
      )}
    </div>
  );
}

// ─── Preserved: Confirm Modals ────────────────────────────────────────────────

function ConfirmArchiveStoreModal({ store, onClose, onConfirm }: { store: StoreType; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><Archive size={18} className="text-signal-amber" /><p className="text-base font-bold text-ink-primary">Archive Store</p></div>
        <p className="text-sm text-ink-secondary">Archive <strong className="text-ink-primary">{store.name}</strong>? All visits, tasks, and history are preserved.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 text-xs px-3 py-2 rounded-xl bg-signal-amber text-navy-900 font-semibold">Archive Store</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteStoreModal({ store, onClose, onConfirm }: { store: StoreType; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-signal-red/30 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><Trash2 size={18} className="text-signal-red" /><p className="text-base font-bold text-ink-primary">Delete Permanently</p></div>
        <div className="bg-signal-red/10 border border-signal-red/20 rounded-xl p-3">
          <p className="text-xs text-signal-red font-semibold mb-1">This cannot be undone.</p>
          <p className="text-xs text-ink-secondary">If this store has visits, daily numbers, or tasks, deletion will be blocked. Use Archive instead.</p>
        </div>
        <p className="text-xs text-ink-muted">Type <strong className="text-ink-primary">{store.name}</strong> to confirm:</p>
        <input className="input-base w-full" placeholder={store.name} value={typed} onChange={e => setTyped(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} disabled={typed !== store.name}
            className="flex-1 text-xs px-3 py-2 rounded-xl bg-signal-red text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Delete</button>
        </div>
      </div>
    </div>
  );
}

function MergeStoreModal({ dup, allStores, onClose, onConfirm }: {
  dup: StoreType; allStores: StoreType[]; onClose: () => void; onConfirm: (primaryId: string) => void;
}) {
  const [primaryId, setPrimaryId] = useState('');
  const candidates = allStores.filter(s => s.id !== dup.id && s.active);
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2"><GitMerge size={18} className="text-accent-blue-light" /><p className="text-base font-bold text-ink-primary">Merge Duplicate Store</p></div>
        <p className="text-sm text-ink-secondary">All visits, daily numbers, and tasks from <strong className="text-ink-primary">{dup.name}</strong> will move to the primary store. The duplicate will be archived.</p>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Merge into (primary store)</label>
          <select className="input-base w-full" value={primaryId} onChange={e => setPrimaryId(e.target.value)}>
            <option value="">Select primary store...</option>
            {candidates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="bg-signal-amber/10 border border-signal-amber/20 rounded-xl p-3">
          <p className="text-xs text-signal-amber">The duplicate <strong>{dup.name}</strong> will be archived after merge.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => { onConfirm(primaryId); onClose(); }} disabled={!primaryId}
            className="flex-1 text-xs px-3 py-2 rounded-xl bg-accent-blue-light text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed">Merge & Archive Duplicate</button>
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

// ─── Status System ────────────────────────────────────────────────────────────

type StoreStatusKey = 'winning' | 'onTrack' | 'watch' | 'red' | 'noData' | 'missingEOD';

const STATUS_CFG: Record<StoreStatusKey, {
  label: string; cls: string; dotCls: string; valueCls: string; barCls: string; borderCls: string;
}> = {
  winning:    { label: 'Winning',     cls: 'bg-signal-green/20 text-signal-green border border-signal-green/30',    dotCls: 'bg-signal-green',  valueCls: 'text-signal-green',  barCls: 'bg-signal-green',  borderCls: 'border-l-signal-green'  },
  onTrack:    { label: 'On Track',    cls: 'bg-emerald-400/15 text-emerald-400 border border-emerald-400/25',        dotCls: 'bg-emerald-400',   valueCls: 'text-emerald-400',   barCls: 'bg-emerald-400',   borderCls: 'border-l-emerald-400'   },
  watch:      { label: 'Watch',       cls: 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30',     dotCls: 'bg-signal-amber',  valueCls: 'text-signal-amber',  barCls: 'bg-signal-amber',  borderCls: 'border-l-signal-amber'  },
  red:        { label: 'Red Zone',    cls: 'bg-signal-red/20 text-signal-red border border-signal-red/30',           dotCls: 'bg-signal-red',    valueCls: 'text-signal-red',    barCls: 'bg-signal-red',    borderCls: 'border-l-signal-red'    },
  noData:     { label: 'No Data',     cls: 'bg-navy-500/40 text-ink-muted border border-navy-500',                   dotCls: 'bg-navy-400',      valueCls: 'text-ink-muted',     barCls: 'bg-navy-500',      borderCls: 'border-l-navy-500'      },
  missingEOD: { label: 'Missing EOD', cls: 'bg-signal-amber/15 text-signal-amber border border-signal-amber/25',     dotCls: 'bg-signal-amber',  valueCls: 'text-signal-amber',  barCls: 'bg-signal-amber',  borderCls: 'border-l-signal-amber'  },
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getStoreStatus(ss: StoreSummary): StoreStatusKey {
  const noGoal = ss.attachmentGoal === 0;
  const noActivity = ss.mtdAttachments === 0 && ss.mtdBoxes === 0 && ss.bpPct === 0 && ss.atuPct === 0 && ss.reportCardPct === 0;
  if (noGoal && noActivity) return 'noData';
  if (noActivity) return 'missingEOD';
  const pct = ss.attachmentPctToGoal;
  if (pct >= 100) return 'winning';
  if (pct >= 85)  return 'onTrack';
  if (pct >= 75)  return 'watch';
  return 'red';
}

function getStoreRiskReasons(ss: StoreSummary, redRepCount: number): string[] {
  const status = getStoreStatus(ss);
  if (status === 'noData')     return ['No goal or activity data recorded'];
  if (status === 'missingEOD') return ['Goal set but no EOD numbers uploaded this month'];
  const reasons: string[] = [];
  const pct = ss.attachmentPctToGoal;
  if (pct < 60)  reasons.push(`${pct.toFixed(1)}% to goal — significantly below target`);
  else if (pct < 75) reasons.push(`${pct.toFixed(1)}% to goal — below 75% threshold`);
  if (ss.bpPct === 0 && ss.mtdBoxes > 0)  reasons.push('No Boost Protect sales this month');
  if (ss.atuPct === 0 && ss.mtdBoxes > 0) reasons.push('No ATU conversions this month');
  if (ss.mtdBoxes >= 10 && pct < 75) reasons.push(`${ss.mtdBoxes} boxes sold but low attachment pace`);
  if (redRepCount >= 2) reasons.push(`${redRepCount} reps in red zone`);
  if (!ss.lastVisitDate) reasons.push('No store visit recorded');
  else if (daysSince(ss.lastVisitDate) >= 7) reasons.push(`Last visit ${daysSince(ss.lastVisitDate)} days ago`);
  return reasons.length > 0 ? reasons : [`${pct.toFixed(1)}% to goal`];
}

function getVisitPriorityScore(ss: StoreSummary, redRepCount: number): number {
  let score = 0;
  const status = getStoreStatus(ss);
  if (!ss.lastVisitDate) score += 100;
  else {
    const d = daysSince(ss.lastVisitDate);
    score += d >= 14 ? 80 : d >= 7 ? 50 : 0;
  }
  if (status === 'red') score += 80;
  else if (status === 'watch') score += 30;
  else if (status === 'missingEOD') score += 60;
  if (ss.bpPct === 0 && ss.mtdBoxes > 0) score += 40;
  if (ss.atuPct === 0 && ss.mtdBoxes > 0) score += 40;
  if (ss.mtdBoxes >= 10 && ss.attachmentPctToGoal < 75) score += 50;
  if (ss.attachmentPctToGoal > 0 && ss.attachmentPctToGoal < 60) score += 30;
  score += redRepCount * 20;
  return score;
}

function getRecommendedAction(ss: StoreSummary): string {
  const status = getStoreStatus(ss);
  if (status === 'noData' || status === 'missingEOD') return 'Request EOD';
  if (status === 'winning') return 'Recognize';
  if (ss.bpPct === 0 && ss.mtdBoxes > 0) return 'Coach BP';
  if (ss.atuPct === 0 && ss.mtdBoxes > 0) return 'Coach ATU';
  if (ss.attachmentPctToGoal < 75) return 'Plan Visit';
  if (!ss.lastVisitDate || daysSince(ss.lastVisitDate) >= 7) return 'Plan Visit';
  return 'Check In';
}

function getVisitFocus(ss: StoreSummary): string {
  const status = getStoreStatus(ss);
  if (status === 'noData' || status === 'missingEOD') return 'Confirm EOD reporting and data sync';
  if (ss.bpPct === 0 && ss.atuPct === 0) return 'Observe GREAT · BP pitch · ATU ask';
  if (ss.bpPct === 0) return 'Observe GREAT · Focus on BP protection pitch';
  if (ss.atuPct === 0) return 'Observe GREAT · Focus on ATU close';
  if (ss.mtdBoxes >= 10 && ss.attachmentPctToGoal < 75) return 'Observe GREAT · Attachment close · ATU ask';
  return 'Observe GREAT · Reinforce all KPIs';
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function StoreStatusBadge({ status }: { status: StoreStatusKey }) {
  const c = STATUS_CFG[status];
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${c.cls}`}>{c.label}</span>;
}

// ─── Section: Data Quality Banner ────────────────────────────────────────────

function DataQualityBanner({ noDataCount, total, onDismiss }: { noDataCount: number; total: number; onDismiss: () => void }) {
  if (noDataCount === 0 || total === 0 || noDataCount / total < 0.5) return null;
  return (
    <div className="rounded-2xl border border-signal-amber/30 bg-signal-amber/5 p-4 flex items-start gap-3">
      <AlertTriangle size={16} className="text-signal-amber flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-signal-amber">Store performance data appears incomplete</p>
        <p className="text-xs text-ink-secondary mt-0.5">
          {noDataCount} of {total} stores show no activity or no goal set. This likely means EOD data hasn't been
          uploaded yet — stores are not confirmed as underperforming.
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

// ─── Section: Store District Pulse ───────────────────────────────────────────

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

// ─── Section: Visit Priority Card ────────────────────────────────────────────

function VisitPriorityCard({ ss, rank, redRepCount }: { ss: StoreSummary; rank: number; redRepCount: number }) {
  const status = getStoreStatus(ss);
  const cfg = STATUS_CFG[status];
  const lastVisitLabel = ss.lastVisitDate
    ? `${daysSince(ss.lastVisitDate)}d ago`
    : 'Never';
  const isNoData = status === 'noData' || status === 'missingEOD';

  return (
    <div className={`card border-l-4 ${cfg.borderCls} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className="text-xs font-bold text-ink-muted bg-navy-600 rounded-lg px-2 py-1 flex-shrink-0 mt-0.5">
            #{rank}
          </span>
          <div className="min-w-0">
            <Link to={`/stores/${ss.store.id}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors block truncate">
              {ss.store.name}
            </Link>
            {ss.store.address && <p className="text-xs text-ink-muted truncate">{ss.store.address}</p>}
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <StoreStatusBadge status={status} />
          {!isNoData && (
            <p className={`text-lg font-bold leading-none ${cfg.valueCls}`}>{fmtPct(ss.attachmentPctToGoal)}</p>
          )}
        </div>
      </div>

      {!isNoData && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-ink-secondary">
            <span className={`font-semibold ${ss.mtdBoxes === 0 ? 'text-signal-red' : 'text-ink-primary'}`}>{ss.mtdBoxes}</span> boxes
          </span>
          <span className="text-ink-secondary">
            BP <span className={`font-semibold ${ss.bpPct === 0 ? 'text-signal-red' : ss.bpPct >= (ss.store.bpGoal ?? 75) ? 'text-signal-green' : 'text-signal-amber'}`}>{ss.bpPct}%</span>
          </span>
          <span className="text-ink-secondary">
            ATU <span className={`font-semibold ${ss.atuPct === 0 ? 'text-signal-red' : ss.atuPct >= (ss.store.atuGoal ?? 65) ? 'text-signal-green' : 'text-signal-amber'}`}>{ss.atuPct}%</span>
          </span>
          {redRepCount > 0 && (
            <span className="text-signal-red font-semibold">{redRepCount} rep{redRepCount > 1 ? 's' : ''} red</span>
          )}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        <AlertTriangle size={12} className="text-accent-orange flex-shrink-0 mt-0.5" />
        <p className="text-xs text-ink-secondary leading-relaxed">
          {getStoreRiskReasons(ss, redRepCount)[0]}
        </p>
      </div>

      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span className="flex items-center gap-1">
          <MapPin size={10} /> Last visit: <span className={!ss.lastVisitDate ? 'text-signal-red font-semibold' : daysSince(ss.lastVisitDate ?? '') >= 7 ? 'text-signal-amber font-semibold' : ''}>{lastVisitLabel}</span>
        </span>
      </div>

      <div className="text-[11px] text-ink-muted bg-navy-700/50 rounded-lg px-2.5 py-1.5 border border-navy-600">
        <span className="font-semibold text-accent-orange">Visit focus:</span> {getVisitFocus(ss)}
      </div>

      <div className="flex gap-2 pt-1 border-t border-navy-600">
        <Link to="/visits" className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1 justify-center">
          <MapPin size={12} /> {isNoData ? 'Request EOD' : 'Plan Visit'}
        </Link>
        <Link to={`/stores/${ss.store.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <TrendingUp size={12} /> Scorecard
        </Link>
      </div>
    </div>
  );
}

// ─── Section: Store Risk Panel ────────────────────────────────────────────────

interface RiskItem { ss: StoreSummary; issue: string; severity: 'urgent' | 'warning' | 'info'; action: string; actionPath: string }

function StoreRiskGroup({ title, icon, items, dotCls }: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: RiskItem[];
  dotCls: string;
}) {
  const Icon = icon;
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold text-ink-secondary uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full ${dotCls}`} />
        <Icon size={11} /> {title} <span className="font-normal text-ink-muted">({items.length})</span>
      </p>
      <div className="space-y-1.5">
        {items.map(({ ss, issue, severity, action, actionPath }) => (
          <div key={ss.store.id} className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border ${
            severity === 'urgent' ? 'bg-signal-red/5 border-signal-red/20' :
            severity === 'warning' ? 'bg-signal-amber/5 border-signal-amber/20' :
            'bg-navy-700 border-navy-600'
          }`}>
            <div className="min-w-0 flex-1">
              <Link to={`/stores/${ss.store.id}`} className="text-xs font-semibold text-ink-primary hover:text-white truncate block">
                {ss.store.name}
              </Link>
              <p className="text-[11px] text-ink-muted truncate">{issue}</p>
            </div>
            <Link to={actionPath} className={`text-[11px] font-semibold whitespace-nowrap flex-shrink-0 px-2.5 py-1 rounded-lg transition-colors ${
              severity === 'urgent' ? 'bg-signal-red/15 text-signal-red hover:bg-signal-red/25' :
              severity === 'warning' ? 'bg-signal-amber/15 text-signal-amber hover:bg-signal-amber/25' :
              'bg-navy-600 text-ink-secondary hover:bg-navy-500'
            }`}>{action}</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Store Scorecard Card ───────────────────────────────────────────

interface ScorecardCardProps {
  ss: StoreSummary;
  rank: number;
  redRepCount: number;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMerge: () => void;
}

function StoreScorecardCard({ ss, rank, redRepCount, onEdit, onArchive, onDelete, onMerge }: ScorecardCardProps) {
  const status = getStoreStatus(ss);
  const cfg = STATUS_CFG[status];
  const isNoData = status === 'noData' || status === 'missingEOD';
  const gap = ss.attachmentGoal - ss.attachmentTrend;
  const lastVisitDays = ss.lastVisitDate ? daysSince(ss.lastVisitDate) : null;
  const reasons = getStoreRiskReasons(ss, redRepCount);

  return (
    <div className={`card border-l-4 ${cfg.borderCls} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <StoreStatusBadge status={status} />
            <span className="text-[10px] text-ink-muted font-semibold">#{rank}</span>
          </div>
          <Link to={`/stores/${ss.store.id}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors block truncate mt-1">
            {ss.store.name}
          </Link>
          {ss.store.address && <p className="text-xs text-ink-muted truncate">{ss.store.address}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isNoData && (
            <div className="text-right">
              <p className={`text-xl font-bold leading-none ${cfg.valueCls}`}>{fmtPct(ss.attachmentPctToGoal)}</p>
              <p className="text-[10px] text-ink-muted">% to goal</p>
            </div>
          )}
          <StoreActionMenu store={ss.store} isArchived={false}
            onEdit={onEdit} onArchive={onArchive} onRestore={() => {}} onDelete={onDelete} onMerge={onMerge} />
        </div>
      </div>

      {!isNoData && (
        <>
          <div className="h-1 bg-navy-600 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${cfg.barCls}`} style={{ width: `${Math.min(100, ss.attachmentPctToGoal)}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <span className="text-ink-muted">MTD Att </span>
              <span className="font-semibold text-ink-primary">{fmtCurrency(ss.mtdAttachments)}</span>
            </div>
            <div>
              <span className="text-ink-muted">Gap </span>
              <span className={`font-semibold ${gap <= 0 ? 'text-signal-green' : 'text-signal-red'}`}>
                {gap <= 0 ? '+' : '-'}{fmtCurrency(Math.abs(gap))}
              </span>
            </div>
            <div>
              <span className="text-ink-muted">Boxes </span>
              <span className={`font-semibold ${ss.mtdBoxes === 0 ? 'text-signal-red' : 'text-ink-primary'}`}>{ss.mtdBoxes}</span>
            </div>
            <div>
              <span className="text-ink-muted">Goal </span>
              <span className="font-semibold text-ink-muted">{fmtCurrency(ss.attachmentGoal)}</span>
            </div>
            <div>
              <span className="text-ink-muted">BP </span>
              <span className={`font-semibold ${ss.bpPct === 0 ? 'text-signal-red' : ss.bpPct >= (ss.store.bpGoal ?? 75) ? 'text-signal-green' : 'text-signal-amber'}`}>{ss.bpPct}%</span>
            </div>
            <div>
              <span className="text-ink-muted">ATU </span>
              <span className={`font-semibold ${ss.atuPct === 0 ? 'text-signal-red' : ss.atuPct >= (ss.store.atuGoal ?? 65) ? 'text-signal-green' : 'text-signal-amber'}`}>{ss.atuPct}%</span>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className={`px-2 py-0.5 rounded-full border ${!ss.lastVisitDate ? 'bg-signal-red/10 border-signal-red/20 text-signal-red' : lastVisitDays !== null && lastVisitDays >= 7 ? 'bg-signal-amber/10 border-signal-amber/20 text-signal-amber' : 'bg-navy-600 border-navy-500 text-ink-muted'}`}>
          {!ss.lastVisitDate ? 'Never visited' : `Visit ${lastVisitDays}d ago`}
        </span>
        {redRepCount > 0 && (
          <span className="px-2 py-0.5 rounded-full border bg-signal-red/10 border-signal-red/20 text-signal-red">
            {redRepCount} rep{redRepCount > 1 ? 's' : ''} red
          </span>
        )}
        {ss.reps.length > 0 && (
          <span className="px-2 py-0.5 rounded-full border bg-navy-600 border-navy-500 text-ink-muted">
            {ss.reps.length} rep{ss.reps.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {(status !== 'winning') && reasons.length > 0 && (
        <div className="text-[11px] text-ink-secondary border-t border-navy-600 pt-2 leading-relaxed">
          {reasons[0]}
        </div>
      )}

      <div className="flex gap-2 pt-1 border-t border-navy-600">
        {status === 'winning' ? (
          <Link to={`/stores/${ss.store.id}`} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1 justify-center text-signal-green bg-signal-green/20 border-signal-green/30 hover:bg-signal-green/30">
            <Star size={12} /> Recognize Store
          </Link>
        ) : (status === 'noData' || status === 'missingEOD') ? (
          <Link to="/eod-reports" className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1 justify-center">
            <FileText size={12} /> Request EOD
          </Link>
        ) : (
          <Link to="/visits" className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1 justify-center">
            <MapPin size={12} /> Plan Visit
          </Link>
        )}
        <Link to={`/stores/${ss.store.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <TrendingUp size={12} /> Scorecard
        </Link>
      </div>
    </div>
  );
}

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

type SortCol = 'rank' | 'name' | 'status' | 'attPct' | 'gap' | 'mtdAtt' | 'goal' | 'boxes' | 'bpPct' | 'atuPct' | 'lastVisit' | 'redsInStore';
type SortDir = 'asc' | 'desc';
type QuickFilter = 'all' | 'winning' | 'onTrack' | 'watch' | 'red' | 'needsVisit' | 'noData' | 'missingEOD';

const STATUS_ORDER: Record<StoreStatusKey, number> = { winning: 0, onTrack: 1, watch: 2, red: 3, missingEOD: 4, noData: 5 };

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={10} className="text-ink-muted opacity-30" />;
  return dir === 'asc' ? <ChevronUp size={10} className="text-accent-orange" /> : <ChevronDown size={10} className="text-accent-orange" />;
}

// ─── Modal state ──────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; store: StoreType }
  | { type: 'archive'; store: StoreType }
  | { type: 'delete'; store: StoreType }
  | { type: 'merge'; store: StoreType }
  | { type: 'blocked'; reason: string }
  | null;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Stores() {
  const { storeSummaries, stores, repSummaries, addStore, updateStore, mergeStores, permanentDeleteStore, reportingPeriod } = useData();

  const [search, setSearch]             = useState('');
  const [quickFilter, setQuickFilter]   = useState<QuickFilter>('all');
  const [sortCol, setSortCol]           = useState<SortCol>('attPct');
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [showArchived, setShowArchived] = useState(false);
  const [showAllCards, setShowAllCards] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(false);
  const [modal, setModal]               = useState<ModalState>(null);

  const archivedStores = stores.filter(s => !s.active);

  // ── Red reps per store ─────────────────────────────────────────────────────
  const redRepsPerStore = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ss of storeSummaries) {
      const repIds = new Set(ss.reps.map(r => r.id));
      map[ss.store.id] = repSummaries.filter(rs => repIds.has(rs.rep.id) && rs.isRed).length;
    }
    return map;
  }, [storeSummaries, repSummaries]);

  // ── Classified statuses ────────────────────────────────────────────────────
  const classified = useMemo(() =>
    storeSummaries.map(ss => ({ ss, status: getStoreStatus(ss) })),
  [storeSummaries]);

  // ── Pulse counts ───────────────────────────────────────────────────────────
  const pulse = useMemo(() => {
    const n = storeSummaries.length;
    const count = (s: StoreStatusKey) => classified.filter(x => x.status === s).length;
    const needsVisit = storeSummaries.filter(ss => !ss.lastVisitDate || daysSince(ss.lastVisitDate) >= 7).length;
    const hasData = storeSummaries.filter(ss => {
      const s = getStoreStatus(ss);
      return s !== 'noData' && s !== 'missingEOD';
    });
    const districtAvg = hasData.length > 0
      ? Math.round(hasData.reduce((acc, ss) => acc + ss.attachmentPctToGoal, 0) / hasData.length * 10) / 10
      : 0;
    return {
      total: n,
      winning: count('winning'),
      onTrack: count('onTrack'),
      watch: count('watch'),
      red: count('red'),
      needsVisit,
      noData: count('noData') + count('missingEOD'),
      noDataOnly: count('noData'),
      missingEOD: count('missingEOD'),
      districtAvg,
    };
  }, [storeSummaries, classified]);

  // ── Visit priority queue ───────────────────────────────────────────────────
  const visitQueue = useMemo(() => {
    return [...storeSummaries]
      .map(ss => ({ ss, score: getVisitPriorityScore(ss, redRepsPerStore[ss.store.id] ?? 0) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.ss);
  }, [storeSummaries, redRepsPerStore]);

  // ── Risk panel ─────────────────────────────────────────────────────────────
  const riskGroups = useMemo(() => {
    const perf: RiskItem[] = [];
    const reporting: RiskItem[] = [];
    const visitRisk: RiskItem[] = [];
    const coaching: RiskItem[] = [];

    for (const ss of storeSummaries) {
      const status = getStoreStatus(ss);
      const redReps = redRepsPerStore[ss.store.id] ?? 0;
      const pct = ss.attachmentPctToGoal;

      if (status === 'noData') {
        reporting.push({ ss, issue: 'No goal or data recorded', severity: 'info', action: 'Configure', actionPath: `/stores/${ss.store.id}` });
      } else if (status === 'missingEOD') {
        reporting.push({ ss, issue: 'No numbers uploaded this month', severity: 'warning', action: 'Request EOD', actionPath: '/eod-reports' });
      }

      if (status === 'red') {
        perf.push({ ss, issue: pct < 60 ? `${pct.toFixed(1)}% — significantly below target` : `${pct.toFixed(1)}% — below 75% threshold`, severity: 'urgent', action: 'Plan Visit', actionPath: '/visits' });
      } else if (status === 'watch' && ss.mtdBoxes >= 10) {
        perf.push({ ss, issue: `${ss.mtdBoxes} boxes but only ${pct.toFixed(1)}% attachment`, severity: 'warning', action: 'Coach Attach', actionPath: `/stores/${ss.store.id}` });
      }

      if (!ss.lastVisitDate) {
        visitRisk.push({ ss, issue: 'No store visit recorded', severity: 'urgent', action: 'Plan Visit', actionPath: '/visits' });
      } else if (daysSince(ss.lastVisitDate) >= 7 && (status === 'red' || status === 'watch')) {
        visitRisk.push({ ss, issue: `Last visit ${daysSince(ss.lastVisitDate)} days ago — needs check-in`, severity: 'warning', action: 'Plan Visit', actionPath: '/visits' });
      }

      if (ss.mtdBoxes > 0) {
        if (ss.bpPct === 0 || ss.atuPct === 0) {
          const issue = ss.bpPct === 0 && ss.atuPct === 0 ? 'BP 0% and ATU 0%' : ss.bpPct === 0 ? 'BP 0% — no protection sales' : 'ATU 0% — no recurring revenue';
          coaching.push({ ss, issue, severity: 'urgent', action: 'Coach Today', actionPath: `/stores/${ss.store.id}` });
        } else if (redReps >= 2) {
          coaching.push({ ss, issue: `${redReps} reps in red zone`, severity: 'warning', action: 'View Reps', actionPath: '/reps' });
        }
      }
    }

    return { perf, reporting, visitRisk, coaching };
  }, [storeSummaries, redRepsPerStore]);

  // ── Ranked summaries ───────────────────────────────────────────────────────
  const ranked = useMemo(() => {
    const sorted = [...storeSummaries].sort((a, b) => b.attachmentPctToGoal - a.attachmentPctToGoal);
    return sorted.map((ss, i) => ({ ...ss, rank: i + 1 }));
  }, [storeSummaries]);

  // ── Leaderboard sort + filter ──────────────────────────────────────────────
  const sorted = useMemo(() => {
    const m = sortDir === 'asc' ? 1 : -1;
    return [...storeSummaries].sort((a, b) => {
      switch (sortCol) {
        case 'rank':        return m * (a.attachmentPctToGoal - b.attachmentPctToGoal) * -1;
        case 'name':        return m * a.store.name.localeCompare(b.store.name);
        case 'status':      return m * (STATUS_ORDER[getStoreStatus(a)] - STATUS_ORDER[getStoreStatus(b)]);
        case 'attPct':      return m * (a.attachmentPctToGoal - b.attachmentPctToGoal);
        case 'gap':         return m * ((a.attachmentGoal - a.attachmentTrend) - (b.attachmentGoal - b.attachmentTrend));
        case 'mtdAtt':      return m * (a.mtdAttachments - b.mtdAttachments);
        case 'goal':        return m * (a.attachmentGoal - b.attachmentGoal);
        case 'boxes':       return m * (a.mtdBoxes - b.mtdBoxes);
        case 'bpPct':       return m * (a.bpPct - b.bpPct);
        case 'atuPct':      return m * (a.atuPct - b.atuPct);
        case 'lastVisit':   return m * ((a.lastVisitDate ?? '').localeCompare(b.lastVisitDate ?? ''));
        case 'redsInStore': return m * ((redRepsPerStore[a.store.id] ?? 0) - (redRepsPerStore[b.store.id] ?? 0));
        default:            return m * (a.attachmentPctToGoal - b.attachmentPctToGoal);
      }
    });
  }, [storeSummaries, sortCol, sortDir, redRepsPerStore]);

  const rows = useMemo(() => {
    let result = sorted;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(ss =>
        ss.store.name.toLowerCase().includes(q) ||
        ss.store.address.toLowerCase().includes(q),
      );
    }
    const nv = (ss: StoreSummary) => !ss.lastVisitDate || daysSince(ss.lastVisitDate) >= 7;
    switch (quickFilter) {
      case 'winning':    return result.filter(ss => getStoreStatus(ss) === 'winning');
      case 'onTrack':    return result.filter(ss => getStoreStatus(ss) === 'onTrack');
      case 'watch':      return result.filter(ss => getStoreStatus(ss) === 'watch');
      case 'red':        return result.filter(ss => getStoreStatus(ss) === 'red');
      case 'needsVisit': return result.filter(nv);
      case 'noData':     return result.filter(ss => { const s = getStoreStatus(ss); return s === 'noData' || s === 'missingEOD'; });
      case 'missingEOD': return result.filter(ss => getStoreStatus(ss) === 'missingEOD');
      default:           return result;
    }
  }, [sorted, search, quickFilter]);

  // ── Scorecard groups ───────────────────────────────────────────────────────
  const redCards    = useMemo(() => ranked.filter(ss => getStoreStatus(ss) === 'red'),    [ranked]);
  const winCards    = useMemo(() => ranked.filter(ss => getStoreStatus(ss) === 'winning'), [ranked]);
  const noDataCards = useMemo(() => ranked.filter(ss => { const s = getStoreStatus(ss); return s === 'noData' || s === 'missingEOD'; }), [ranked]);
  const otherCards  = useMemo(() => ranked.filter(ss => { const s = getStoreStatus(ss); return s === 'onTrack' || s === 'watch'; }), [ranked]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleArchive = (store: StoreType) => updateStore(store.id, { active: false });
  const handleRestore = (store: StoreType) => updateStore(store.id, { active: true });
  const handleDelete  = (store: StoreType) => {
    const r = permanentDeleteStore(store.id);
    if (!r.success) setModal({ type: 'blocked', reason: r.reason ?? 'Cannot delete.' });
  };

  const sortBy = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'name' || col === 'lastVisit' ? 'asc' : 'desc'); }
  };

  const thL = 'px-3 py-2.5 text-left text-[11px] font-semibold text-ink-muted cursor-pointer hover:text-ink-secondary select-none whitespace-nowrap';
  const thR = 'px-3 py-2.5 text-right text-[11px] font-semibold text-ink-muted cursor-pointer hover:text-ink-secondary select-none whitespace-nowrap';

  const chips: { key: QuickFilter; label: string; count?: number }[] = [
    { key: 'all',        label: 'All',          count: storeSummaries.length  },
    { key: 'winning',    label: 'Winning',       count: pulse.winning         },
    { key: 'onTrack',    label: 'On Track',      count: pulse.onTrack         },
    { key: 'watch',      label: 'Watch',         count: pulse.watch           },
    { key: 'red',        label: 'Red Zone',      count: pulse.red             },
    { key: 'needsVisit', label: 'Needs Visit',   count: pulse.needsVisit      },
    { key: 'noData',     label: 'No Data',       count: pulse.noData          },
    { key: 'missingEOD', label: 'Missing EOD',   count: pulse.missingEOD      },
  ];

  const riskTotal = riskGroups.perf.length + riskGroups.reporting.length + riskGroups.visitRisk.length + riskGroups.coaching.length;

  const renderScorecardCard = (ss: StoreSummary & { rank: number }) => (
    <StoreScorecardCard
      key={ss.store.id}
      ss={ss}
      rank={ss.rank}
      redRepCount={redRepsPerStore[ss.store.id] ?? 0}
      onEdit={() => setModal({ type: 'edit', store: ss.store })}
      onArchive={() => setModal({ type: 'archive', store: ss.store })}
      onDelete={() => handleDelete(ss.store)}
      onMerge={() => setModal({ type: 'merge', store: ss.store })}
    />
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-screen-xl">

      {/* Modals */}
      {modal?.type === 'add'     && <StoreFormModal title="Add Store" initial={{}} onClose={() => setModal(null)} onSubmit={s => addStore(s)} />}
      {modal?.type === 'edit'    && <StoreFormModal title="Edit Store" initial={modal.store} onClose={() => setModal(null)} onSubmit={s => updateStore(modal.store.id, s)} />}
      {modal?.type === 'archive' && <ConfirmArchiveStoreModal store={modal.store} onClose={() => setModal(null)} onConfirm={() => handleArchive(modal.store)} />}
      {modal?.type === 'delete'  && <ConfirmDeleteStoreModal  store={modal.store} onClose={() => setModal(null)} onConfirm={() => handleDelete(modal.store)} />}
      {modal?.type === 'merge'   && <MergeStoreModal dup={modal.store} allStores={stores} onClose={() => setModal(null)} onConfirm={id => mergeStores(id, modal.store.id)} />}
      {modal?.type === 'blocked' && <DeleteBlockedModal reason={modal.reason} onClose={() => setModal(null)} />}

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StoreIcon size={20} className="text-accent-orange" />
            <h1 className="text-xl font-bold text-ink-primary">Stores</h1>
            {pulse.red > 0 && (
              <span className="text-xs font-bold bg-signal-red/20 text-signal-red border border-signal-red/30 rounded-full px-2 py-0.5">
                {pulse.red} in red
              </span>
            )}
            {pulse.needsVisit > 0 && (
              <span className="text-xs font-bold bg-accent-orange/20 text-accent-orange border border-accent-orange/30 rounded-full px-2 py-0.5">
                {pulse.needsVisit} need visit
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">Store performance, visit priority, and red-zone management · {pulse.total} active stores</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {archivedStores.length > 0 && (
            <button onClick={() => setShowArchived(v => !v)}
              className={`btn-ghost text-xs flex items-center gap-1.5 ${showArchived ? 'text-accent-blue-light' : ''}`}>
              <EyeOff size={13} /> {showArchived ? 'Hide Archived' : `${archivedStores.length} Archived`}
            </button>
          )}
          <Link to="/visits" className="btn-secondary text-xs flex items-center gap-1.5"><MapPin size={13} /> Plan Visits</Link>
          <Link to="/eod-reports" className="btn-secondary text-xs flex items-center gap-1.5"><FileText size={13} /> EOD Reports</Link>
          <button onClick={() => setModal({ type: 'add' })} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={14} /> Add Store
          </button>
        </div>
      </div>

      {/* ── 2. Data Quality Banner ─────────────────────────────────────────── */}
      {!bannerHidden && (
        <DataQualityBanner noDataCount={pulse.noData} total={pulse.total} onDismiss={() => setBannerHidden(true)} />
      )}

      {/* ── 3. Store District Pulse ────────────────────────────────────────── */}
      <div>
        <p className="metric-label mb-3 flex items-center gap-2">
          <Activity size={13} className="text-ink-muted" /> Store District Pulse
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <PulseCard label="Total Stores"  value={pulse.total}      sub="Active stores"          />
          <PulseCard label="Winning"       value={pulse.winning}    sub="≥ 100% to goal"         valueCls={pulse.winning > 0 ? 'text-signal-green' : 'text-ink-primary'} />
          <PulseCard label="On Track"      value={pulse.onTrack}    sub="85–99% to goal"         valueCls={pulse.onTrack > 0 ? 'text-emerald-400' : 'text-ink-primary'} />
          <PulseCard label="Watch"         value={pulse.watch}      sub="75–84% to goal"         valueCls={pulse.watch > 0 ? 'text-signal-amber' : 'text-ink-primary'} />
          <PulseCard label="Red Zone"      value={pulse.red}        sub="Below 75%"              valueCls={pulse.red > 0 ? 'text-signal-red' : 'text-ink-primary'} />
          <PulseCard label="Needs Visit"   value={pulse.needsVisit} sub="7+ days or never"       valueCls={pulse.needsVisit > 0 ? 'text-accent-orange' : 'text-ink-primary'}
            action={pulse.needsVisit > 0 ? { label: 'Plan visits', to: '/visits' } : undefined} />
          <PulseCard label="No Data"       value={pulse.noData}     sub="Missing EOD or goal"    valueCls={pulse.noData > 0 ? 'text-ink-muted' : 'text-ink-primary'}
            action={pulse.noData > 0 ? { label: 'Request EOD', to: '/eod-reports' } : undefined} />
          <PulseCard label="District Avg"  value={fmtPct(pulse.districtAvg)} sub="Att % to goal"
            valueCls={pulse.districtAvg >= 100 ? 'text-signal-green' : pulse.districtAvg >= 75 ? 'text-signal-amber' : 'text-signal-red'} />
        </div>
      </div>

      {/* ── 4. Store Leaderboard ───────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-navy-600 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <TrendingUp size={14} className="text-ink-muted" /> Store Leaderboard
            </p>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                className="input-base pl-8 text-xs w-52"
                placeholder="Search stores..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {chips.map(c => (
              <button key={c.key} onClick={() => setQuickFilter(c.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  quickFilter === c.key ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
                }`}>
                {c.label}
                {c.count !== undefined && c.count > 0 && (
                  <span className={`text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                    quickFilter === c.key ? 'bg-navy-400' : 'bg-navy-600'
                  }`}>{c.count > 9 ? '9+' : c.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-navy-600 bg-navy-800/60">
              <tr>
                <th className={thL} onClick={() => sortBy('rank')}>
                  <span className="inline-flex items-center gap-1"># <SortIcon active={sortCol==='rank'} dir={sortDir} /></span>
                </th>
                <th className={thL} onClick={() => sortBy('name')}>
                  <span className="inline-flex items-center gap-1">Store <SortIcon active={sortCol==='name'} dir={sortDir} /></span>
                </th>
                <th className={thL} onClick={() => sortBy('status')}>
                  <span className="inline-flex items-center gap-1">Status <SortIcon active={sortCol==='status'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('attPct')}>
                  <span className="inline-flex items-center gap-1 justify-end">% to Goal <SortIcon active={sortCol==='attPct'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('gap')}>
                  <span className="inline-flex items-center gap-1 justify-end">Gap <SortIcon active={sortCol==='gap'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('mtdAtt')}>
                  <span className="inline-flex items-center gap-1 justify-end">MTD Att <SortIcon active={sortCol==='mtdAtt'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('goal')}>
                  <span className="inline-flex items-center gap-1 justify-end">Goal <SortIcon active={sortCol==='goal'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('boxes')}>
                  <span className="inline-flex items-center gap-1 justify-end">Boxes <SortIcon active={sortCol==='boxes'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('bpPct')}>
                  <span className="inline-flex items-center gap-1 justify-end">BP% <SortIcon active={sortCol==='bpPct'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('atuPct')}>
                  <span className="inline-flex items-center gap-1 justify-end">ATU% <SortIcon active={sortCol==='atuPct'} dir={sortDir} /></span>
                </th>
                <th className={thL} onClick={() => sortBy('lastVisit')}>
                  <span className="inline-flex items-center gap-1">Last Visit <SortIcon active={sortCol==='lastVisit'} dir={sortDir} /></span>
                </th>
                <th className={thR} onClick={() => sortBy('redsInStore')}>
                  <span className="inline-flex items-center gap-1 justify-end">Reps Red <SortIcon active={sortCol==='redsInStore'} dir={sortDir} /></span>
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-ink-muted whitespace-nowrap">Action</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {rows.map((ss, idx) => {
                const status = getStoreStatus(ss);
                const cfg = STATUS_CFG[status];
                const isNoData = status === 'noData' || status === 'missingEOD';
                const gap = ss.attachmentGoal - ss.attachmentTrend;
                const lastVisitDays = ss.lastVisitDate ? daysSince(ss.lastVisitDate) : null;
                const redReps = redRepsPerStore[ss.store.id] ?? 0;
                const action = getRecommendedAction(ss);

                return (
                  <tr key={ss.store.id} className="hover:bg-navy-700/40 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-bold text-ink-muted">#{idx + 1}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link to={`/stores/${ss.store.id}`} className="text-sm font-semibold text-ink-primary hover:text-white transition-colors">
                        {ss.store.name}
                      </Link>
                      {ss.store.address && <p className="text-[11px] text-ink-muted truncate max-w-[140px]">{ss.store.address}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <StoreStatusBadge status={status} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isNoData ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        <span className={`text-sm font-bold ${cfg.valueCls}`}>{fmtPct(ss.attachmentPctToGoal)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isNoData ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        <span className={`text-xs font-semibold ${gap <= 0 ? 'text-signal-green' : 'text-signal-red'}`}>
                          {gap <= 0 ? '+' : '-'}{fmtCurrency(Math.abs(gap))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-ink-secondary">
                      {isNoData ? <span className="text-ink-muted">No data</span> : fmtCurrency(ss.mtdAttachments)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-ink-muted">
                      {ss.attachmentGoal > 0 ? fmtCurrency(ss.attachmentGoal) : <span className="text-ink-muted">No goal</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-ink-secondary">
                      {isNoData ? <span className="text-ink-muted">—</span> : ss.mtdBoxes}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isNoData ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        <span className={`text-xs font-semibold ${ss.bpPct === 0 ? 'text-signal-red' : ss.bpPct >= (ss.store.bpGoal ?? 75) ? 'text-signal-green' : 'text-signal-amber'}`}>
                          {ss.bpPct}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isNoData ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        <span className={`text-xs font-semibold ${ss.atuPct === 0 ? 'text-signal-red' : ss.atuPct >= (ss.store.atuGoal ?? 65) ? 'text-signal-green' : 'text-signal-amber'}`}>
                          {ss.atuPct}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {ss.lastVisitDate ? (
                        <span className={lastVisitDays !== null && lastVisitDays >= 7 ? 'text-signal-amber font-semibold' : 'text-ink-secondary'}>
                          {lastVisitDays}d ago
                        </span>
                      ) : (
                        <span className="text-signal-red font-semibold">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {redReps > 0 ? (
                        <span className="text-xs font-bold text-signal-red">{redReps}</span>
                      ) : (
                        <span className="text-xs text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={status === 'noData' || status === 'missingEOD' ? '/eod-reports' : status === 'winning' ? `/stores/${ss.store.id}` : '/visits'}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors ${
                          status === 'winning' ? 'bg-signal-green/15 text-signal-green hover:bg-signal-green/25' :
                          status === 'noData' || status === 'missingEOD' ? 'bg-navy-600 text-ink-secondary hover:bg-navy-500' :
                          'bg-accent-orange/15 text-accent-orange hover:bg-accent-orange/25'
                        }`}
                      >
                        {action}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <StoreActionMenu store={ss.store} isArchived={false}
                        onEdit={() => setModal({ type: 'edit', store: ss.store })}
                        onArchive={() => setModal({ type: 'archive', store: ss.store })}
                        onRestore={() => handleRestore(ss.store)}
                        onDelete={() => setModal({ type: 'delete', store: ss.store })}
                        onMerge={() => setModal({ type: 'merge', store: ss.store })}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-3 py-10 text-center text-xs text-ink-muted">No stores match this filter</td>
                </tr>
              )}
              {rows.length > 0 && (() => {
                const hasDataRows = rows.filter(ss => { const s = getStoreStatus(ss); return s !== 'noData' && s !== 'missingEOD'; });
                if (hasDataRows.length === 0) return null;
                const totalAtt = hasDataRows.reduce((s, ss) => s + ss.mtdAttachments, 0);
                const totalGoal = hasDataRows.reduce((s, ss) => s + ss.attachmentGoal, 0);
                const totalTrend = hasDataRows.reduce((s, ss) => s + ss.attachmentTrend, 0);
                const totalBoxes = hasDataRows.reduce((s, ss) => s + ss.mtdBoxes, 0);
                const boxPace = reportingPeriod.daysElapsed > 0 ? Math.round((totalBoxes / reportingPeriod.daysElapsed) * reportingPeriod.daysInMonth) : 0;
                const totalPct = totalGoal > 0 ? Math.round((totalTrend / totalGoal) * 100 * 10) / 10 : 0;
                const avgBp = Math.round(hasDataRows.reduce((s, ss) => s + ss.bpPct, 0) / hasDataRows.length);
                const avgAtu = Math.round(hasDataRows.reduce((s, ss) => s + ss.atuPct, 0) / hasDataRows.length);
                return (
                  <tr className="border-t-2 border-navy-500 bg-navy-800/40">
                    <td className="px-3 py-2.5 text-[10px] text-ink-muted uppercase tracking-wide" colSpan={2}>District Total</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-sm font-bold ${totalPct >= 100 ? 'text-signal-green' : totalPct >= 75 ? 'text-signal-amber' : 'text-signal-red'}`}>{fmtPct(totalPct)}</span>
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right text-xs text-ink-primary font-semibold">{fmtCurrency(totalAtt)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-ink-muted">{fmtCurrency(totalGoal)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-ink-primary">{totalBoxes} <span className="text-ink-muted text-[10px]">({boxPace}p)</span></td>
                    <td className="px-3 py-2.5 text-right"><span className={`text-xs font-semibold ${avgBp >= 75 ? 'text-signal-green' : 'text-signal-red'}`}>{avgBp}%</span></td>
                    <td className="px-3 py-2.5 text-right"><span className={`text-xs font-semibold ${avgAtu >= 65 ? 'text-signal-green' : 'text-signal-amber'}`}>{avgAtu}%</span></td>
                    <td colSpan={4} />
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Visit Priority Queue + Store Risk Panel ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Visit Priority Queue */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <MapPin size={15} className="text-accent-orange" /> Visit Priority Queue
            </p>
            {visitQueue.length > 0 && (
              <span className="text-[11px] text-ink-muted">{pulse.needsVisit} total needing attention</span>
            )}
          </div>
          {visitQueue.length === 0 ? (
            <div className="card p-6 text-center">
              <MapPin size={20} className="text-signal-green mx-auto mb-2" />
              <p className="text-sm font-semibold text-signal-green">All stores visited recently</p>
              <p className="text-xs text-ink-muted mt-1">No urgent visit priorities right now.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visitQueue.map((ss, i) => (
                <VisitPriorityCard key={ss.store.id} ss={ss} rank={i + 1} redRepCount={redRepsPerStore[ss.store.id] ?? 0} />
              ))}
              {pulse.needsVisit > visitQueue.length && (
                <Link to="/visits" className="flex items-center justify-center gap-1.5 text-xs text-accent-orange hover:text-white transition-colors py-2 border border-navy-600 rounded-xl hover:border-accent-orange/30">
                  View all {pulse.needsVisit} stores needing visits <ChevronRight size={12} />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Store Risk Panel */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
            <Shield size={15} className="text-signal-amber" /> Store Risk Panel
            {riskTotal > 0 && <span className="text-[11px] text-ink-muted font-normal">{riskTotal} issues</span>}
          </p>
          {riskTotal === 0 ? (
            <div className="card p-6 text-center">
              <Shield size={20} className="text-signal-green mx-auto mb-2" />
              <p className="text-sm font-semibold text-signal-green">No risk flags</p>
              <p className="text-xs text-ink-muted mt-1">All stores look healthy.</p>
            </div>
          ) : (
            <div className="card p-4 space-y-4">
              <StoreRiskGroup title="Performance Risk" icon={TrendingUp} items={riskGroups.perf} dotCls="bg-signal-red" />
              <StoreRiskGroup title="Reporting Risk" icon={FileText} items={riskGroups.reporting} dotCls="bg-signal-amber" />
              <StoreRiskGroup title="Visit Risk" icon={MapPin} items={riskGroups.visitRisk} dotCls="bg-accent-orange" />
              <StoreRiskGroup title="Coaching Risk" icon={BookOpen} items={riskGroups.coaching} dotCls="bg-accent-orange" />
            </div>
          )}
        </div>
      </div>

      {/* ── 6. Store Scorecard Grid ────────────────────────────────────────── */}
      <div className="space-y-6">

        {redCards.length > 0 && (
          <div>
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-signal-red" />
              Red Zone <span className="text-xs font-normal text-ink-muted">({redCards.length})</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{redCards.map(renderScorecardCard)}</div>
          </div>
        )}

        {winCards.length > 0 && (
          <div>
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-signal-green" />
              Recognition Ready <span className="text-xs font-normal text-ink-muted">({winCards.length})</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{winCards.map(renderScorecardCard)}</div>
          </div>
        )}

        {noDataCards.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-navy-400" />
                Missing Data <span className="text-xs font-normal text-ink-muted">({noDataCards.length})</span>
              </p>
              <Link to="/eod-reports" className="text-xs text-accent-orange hover:underline flex items-center gap-1">
                <FileText size={11} /> Request EOD
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{noDataCards.map(renderScorecardCard)}</div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{otherCards.map(renderScorecardCard)}</div>
            )}
          </div>
        )}
      </div>

      {/* ── 7. Archived Stores ─────────────────────────────────────────────── */}
      {showArchived && archivedStores.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <EyeOff size={14} className="text-ink-muted" />
            <p className="text-sm font-bold text-ink-secondary">Archived Stores ({archivedStores.length})</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {archivedStores
              .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
              .map(store => (
                <div key={store.id} className="relative card p-4 border border-navy-600 opacity-70">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-navy-400" />
                    <p className="text-sm font-bold text-ink-secondary truncate">{store.name}</p>
                    <span className="badge-neutral text-[10px]">Archived</span>
                  </div>
                  {store.address && <p className="text-xs text-ink-muted mt-0.5 ml-3.5">{store.address}</p>}
                  <div className="absolute top-3 right-3">
                    <StoreActionMenu store={store} isArchived={true}
                      onEdit={() => setModal({ type: 'edit', store })}
                      onArchive={() => setModal({ type: 'archive', store })}
                      onRestore={() => handleRestore(store)}
                      onDelete={() => setModal({ type: 'delete', store })}
                      onMerge={() => setModal({ type: 'merge', store })}
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
