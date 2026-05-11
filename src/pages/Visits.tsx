import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin, Plus, CheckCircle, AlertTriangle,
  TrendingUp, TrendingDown, Calendar, ChevronRight, X, Store,
  Clock, Flag, ClipboardList, Edit3, Trash2, RotateCcw,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { daysSince, fmtPct } from '../data/calculations';
import type { Visit, VisitType } from '../types';

const VISIT_TYPES: VisitType[] = [
  'Sales Focused Visit',
  'GREAT Sales Observation Visit',
  'AE Ride-Along',
  'Store Follow-Up Visit',
  'Coaching Visit',
];

const TYPE_COLORS: Record<VisitType, string> = {
  'Sales Focused Visit': 'text-accent-blue-light',
  'GREAT Sales Observation Visit': 'text-signal-green',
  'AE Ride-Along': 'text-brand-primary',
  'Store Follow-Up Visit': 'text-signal-amber',
  'Coaching Visit': 'text-purple-400',
};

function VisitFormModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: Partial<Visit>;
  onClose: () => void;
  onSubmit: (v: Omit<Visit, 'id' | 'createdAt'>) => void;
}) {
  const { stores } = useData();
  const _todayD = new Date();
  const today = `${_todayD.getFullYear()}-${String(_todayD.getMonth() + 1).padStart(2, '0')}-${String(_todayD.getDate()).padStart(2, '0')}`;
  const [form, setForm] = useState({
    date: initial?.date ?? today,
    storeId: initial?.storeId ?? '',
    visitType: (initial?.visitType ?? 'Sales Focused Visit') as VisitType,
    timeInStore: initial?.timeInStore ?? '',
    notes: initial?.notes ?? '',
    coachingCompleted: initial?.coachingCompleted ?? false,
    redFlagsFound: initial?.redFlagsFound?.join(', ') ?? '',
    status: (initial?.status ?? 'completed') as Visit['status'],
  });

  const submit = () => {
    if (!form.storeId) return;
    onSubmit({
      ...form,
      redFlagsFound: form.redFlagsFound.split(',').map(s => s.trim()).filter(Boolean),
      followUpTaskIds: initial?.followUpTaskIds ?? [],
      source: 'manual',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-ink-primary">{title}</p>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Date</label>
            <input className="input-base w-full" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Status</label>
            <select className="input-base w-full" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Visit['status'] }))}>
              <option value="completed">Completed</option>
              <option value="planned">Planned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Store *</label>
          <select className="input-base w-full" value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
            <option value="">Select store</option>
            {stores.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Visit Type</label>
          <select className="input-base w-full" value={form.visitType} onChange={e => setForm(f => ({ ...f, visitType: e.target.value as VisitType }))}>
            {VISIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Time in Store</label>
          <input className="input-base w-full" placeholder="e.g. 1h 30m" value={form.timeInStore} onChange={e => setForm(f => ({ ...f, timeInStore: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Notes</label>
          <textarea className="input-base w-full resize-none" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="What did you observe? What was coached?" />
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Red Flags Found (comma-separated)</label>
          <input className="input-base w-full" value={form.redFlagsFound} onChange={e => setForm(f => ({ ...f, redFlagsFound: e.target.value }))} placeholder="e.g. No pitching, Missing signage" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.coachingCompleted} onChange={e => setForm(f => ({ ...f, coachingCompleted: e.target.checked }))} className="w-4 h-4 rounded" />
          <span className="text-sm text-ink-secondary">Coaching completed during this visit</span>
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={!form.storeId} className="btn-primary flex-1 disabled:opacity-50">Save Visit</button>
        </div>
      </div>
    </div>
  );
}

function VisitDrawer({
  visit, onClose, onEdit, onDelete,
}: {
  visit: Visit;
  onClose: () => void;
  onEdit: (v: Visit) => void;
  onDelete: (v: Visit) => void;
}) {
  const { stores, storeSummaries } = useData();
  const store = stores.find(s => s.id === visit.storeId);
  const ss = storeSummaries.find(s => s.store.id === visit.storeId);

  const statusColor = visit.status === 'completed'
    ? 'text-signal-green'
    : visit.status === 'planned'
    ? 'text-accent-blue-light'
    : 'text-ink-muted';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-navy-800 border-l border-navy-500 flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-navy-500 sticky top-0 bg-navy-800 z-10">
          <div>
            <p className="text-base font-bold text-ink-primary">{store?.name ?? visit.storeId}</p>
            <p className={`text-xs font-semibold mt-0.5 ${statusColor}`}>{visit.status} · {visit.date}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(visit)} className="btn-ghost p-1.5 text-accent-blue-light" title="Edit visit"><Edit3 size={14} /></button>
            <button onClick={() => onDelete(visit)} className="btn-ghost p-1.5 text-signal-red" title="Delete visit"><Trash2 size={14} /></button>
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Visit type + time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-navy-700 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">Visit Type</p>
              <p className={`text-xs font-semibold ${TYPE_COLORS[visit.visitType] ?? 'text-ink-primary'}`}>{visit.visitType}</p>
            </div>
            <div className="bg-navy-700 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">Time in Store</p>
              <p className="text-xs font-semibold text-ink-primary flex items-center gap-1">
                <Clock size={11} /> {visit.timeInStore || '—'}
              </p>
            </div>
          </div>

          {/* Store status badge */}
          {ss?.isRed && (
            <div className="flex items-center gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
              <Flag size={13} className="text-signal-red" />
              <p className="text-xs font-semibold text-signal-red">Store is currently in RED status</p>
            </div>
          )}

          {/* Notes */}
          {visit.notes && (
            <div>
              <p className="text-xs font-semibold text-ink-secondary mb-2 flex items-center gap-1.5">
                <ClipboardList size={12} /> Visit Notes
              </p>
              <p className="text-sm text-ink-primary leading-relaxed bg-navy-700 rounded-xl p-3">{visit.notes}</p>
            </div>
          )}

          {/* Red flags */}
          {visit.redFlagsFound.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-signal-amber mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Red Flags Found
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visit.redFlagsFound.map(f => (
                  <span key={f} className="text-xs bg-signal-amber/10 text-signal-amber border border-signal-amber/20 px-2 py-1 rounded-lg">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Coaching */}
          <div className="flex items-center gap-2">
            {visit.coachingCompleted
              ? <><CheckCircle size={14} className="text-signal-green" /><p className="text-sm text-signal-green font-semibold">Coaching completed</p></>
              : <><div className="w-3.5 h-3.5 rounded-full border border-navy-400" /><p className="text-sm text-ink-muted">No coaching this visit</p></>
            }
          </div>

          {/* Store link */}
          <Link
            to={`/stores/${visit.storeId}`}
            className="flex items-center justify-between p-3 bg-navy-700 rounded-xl border border-navy-500 hover:border-brand-primary/40 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Store size={13} className="text-ink-muted" />
              <p className="text-xs font-medium text-ink-secondary group-hover:text-ink-primary transition-colors">View Store Profile</p>
            </div>
            <ChevronRight size={13} className="text-ink-muted" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Visits() {
  const {
    visits, stores, storeSummaries, settings,
    visitStats, reportingPeriod,
    addVisit, updateVisit, removeVisit,
    clearDemoVisits, clearMonthVisits,
    openPlanVisit,
  } = useData();

  const [showLog, setShowLog] = useState(false);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Visit | null>(null);
  const [confirmResetMonth, setConfirmResetMonth] = useState(false);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'planned'>('all');
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

  const { completed, trend, remaining, onPace, paceMessage, planned } = visitStats;

  const demoCount = visits.filter(v => v.source !== 'manual' && v.source !== 'google_calendar').length;

  // Recommended visits: active stores sorted by visit urgency score
  const recommendedVisits = useMemo(() => {
    return storeSummaries
      .filter(ss => ss.store.active)
      .map(ss => {
        const days = ss.lastVisitDate ? daysSince(ss.lastVisitDate) : 999;
        const score = days * 2 + (ss.isRed ? 50 : 0) + (!ss.lastVisitDate ? 100 : 0);
        return { ss, days, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [storeSummaries]);

  const lastVisitByStore: Record<string, string> = {};
  visits.filter(v => v.status === 'completed').forEach(v => {
    if (!lastVisitByStore[v.storeId] || v.date > lastVisitByStore[v.storeId]) {
      lastVisitByStore[v.storeId] = v.date;
    }
  });

  const visitsByType = VISIT_TYPES.map(t => ({
    type: t,
    count: visits.filter(v => v.visitType === t && v.status === 'completed' && v.source !== 'demo').length,
  }));

  let filteredVisits = [...visits];
  if (filterStatus !== 'all') filteredVisits = filteredVisits.filter(v => v.status === filterStatus);
  filteredVisits = filteredVisits.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {showLog && (
        <VisitFormModal
          title="Log Store Visit"
          onClose={() => setShowLog(false)}
          onSubmit={addVisit}
        />
      )}
      {editVisit && (
        <VisitFormModal
          title="Edit Visit"
          initial={editVisit}
          onClose={() => setEditVisit(null)}
          onSubmit={v => updateVisit(editVisit.id, v)}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy-700 rounded-2xl border border-signal-red/30 w-full max-w-sm p-6 space-y-4">
            <p className="text-base font-bold text-ink-primary">Delete Visit?</p>
            <p className="text-sm text-ink-secondary">
              Remove the visit to <strong className="text-ink-primary">{stores.find(s => s.id === confirmDelete.storeId)?.name ?? confirmDelete.storeId}</strong> on {confirmDelete.date}? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => { removeVisit(confirmDelete.id); setConfirmDelete(null); setSelectedVisit(null); }}
                className="flex-1 text-xs px-3 py-2 rounded-xl bg-signal-red text-white font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
      {confirmClearDemo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy-700 rounded-2xl border border-signal-amber/30 w-full max-w-sm p-6 space-y-4">
            <p className="text-base font-bold text-ink-primary">Clear Demo Visits?</p>
            <p className="text-sm text-ink-secondary">
              Removes {demoCount} demo/seed visit{demoCount !== 1 ? 's' : ''}. Manually logged visits are preserved.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClearDemo(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => { clearDemoVisits(); setConfirmClearDemo(false); }}
                className="flex-1 text-xs px-3 py-2 rounded-xl bg-signal-amber text-navy-900 font-semibold">Clear Demo Visits</button>
            </div>
          </div>
        </div>
      )}
      {confirmResetMonth && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy-700 rounded-2xl border border-signal-red/30 w-full max-w-sm p-6 space-y-4">
            <p className="text-base font-bold text-ink-primary">Reset {reportingPeriod.monthName} Visits?</p>
            <p className="text-sm text-ink-secondary">
              Deletes all visit records for {reportingPeriod.monthName} {reportingPeriod.year}. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmResetMonth(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => { clearMonthVisits(reportingPeriod.month, reportingPeriod.year); setConfirmResetMonth(false); }}
                className="flex-1 text-xs px-3 py-2 rounded-xl bg-signal-red text-white font-semibold">Reset Month</button>
            </div>
          </div>
        </div>
      )}
      {selectedVisit && !editVisit && (
        <VisitDrawer
          visit={selectedVisit}
          onClose={() => setSelectedVisit(null)}
          onEdit={v => { setSelectedVisit(null); setEditVisit(v); }}
          onDelete={v => { setSelectedVisit(null); setConfirmDelete(v); }}
        />
      )}

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={18} className="text-accent-blue-light" />
            <h1 className="text-xl font-bold text-ink-primary">Store Visits</h1>
          </div>
          <p className="text-sm text-ink-secondary">{reportingPeriod.monthName} {reportingPeriod.year} · Goal: {settings.monthlyVisitGoal} visits/month</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {demoCount > 0 && (
            <button onClick={() => setConfirmClearDemo(true)} className="btn-ghost text-xs text-signal-amber flex items-center gap-1.5">
              <RotateCcw size={13} /> Clear Demo ({demoCount})
            </button>
          )}
          <button onClick={() => setConfirmResetMonth(true)} className="btn-ghost text-xs text-signal-red flex items-center gap-1.5">
            <RotateCcw size={13} /> Reset Month
          </button>
          <button onClick={() => setShowLog(true)} className="btn-primary text-xs">
            <Plus size={14} /> Log Visit
          </button>
        </div>
      </div>

      {/* Visit Progress Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`card p-4 border-t-2 ${onPace ? 'border-t-signal-green' : 'border-t-signal-amber'}`}>
          <p className="metric-label mb-2">Completed MTD</p>
          <p className="text-3xl font-bold text-ink-primary">{completed}</p>
          <p className="text-xs text-ink-muted mt-1">of {settings.monthlyVisitGoal} goal</p>
        </div>
        <div className={`card p-4 border-t-2 ${onPace ? 'border-t-signal-green' : 'border-t-signal-red'}`}>
          <p className="metric-label mb-2">Visit Trend</p>
          <p className="text-3xl font-bold text-ink-primary">{trend}</p>
          <p className={`text-xs mt-1 font-semibold ${onPace ? 'text-signal-green' : 'text-signal-red'}`}>
            {onPace ? 'On pace' : `${remaining} below goal`}
          </p>
        </div>
        <div className="card p-4 border-t-2 border-t-navy-500">
          <p className="metric-label mb-2">Remaining</p>
          <p className="text-3xl font-bold text-ink-primary">{remaining}</p>
          <p className="text-xs text-ink-muted mt-1">to hit goal</p>
        </div>
        <div className="card p-4 border-t-2 border-t-accent-blue">
          <p className="metric-label mb-2">Planned</p>
          <p className="text-3xl font-bold text-ink-primary">{planned}</p>
          <p className="text-xs text-ink-muted mt-1">upcoming</p>
        </div>
      </div>

      {/* Pace message */}
      <div className={`card p-4 border ${onPace ? 'border-signal-green/20 bg-signal-green/5' : 'border-signal-amber/20 bg-signal-amber/5'}`}>
        <div className="flex items-center gap-2">
          {onPace ? <TrendingUp size={16} className="text-signal-green" /> : <TrendingDown size={16} className="text-signal-amber" />}
          <p className={`text-sm font-semibold ${onPace ? 'text-signal-green' : 'text-signal-amber'}`}>{paceMessage}</p>
        </div>
        <p className="text-xs text-ink-muted mt-1 ml-6">Progress: {Math.min(100, Math.round((completed / settings.monthlyVisitGoal) * 100))}% of goal</p>
        <div className="mt-2 ml-6 h-1.5 bg-navy-500 rounded-full overflow-hidden max-w-xs">
          <div className={`h-full rounded-full ${onPace ? 'bg-signal-green' : 'bg-signal-amber'}`} style={{ width: `${Math.min(100, (completed / settings.monthlyVisitGoal) * 100)}%` }} />
        </div>
      </div>

      {/* By Type + Store Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Type */}
        <div className="card p-5">
          <p className="text-sm font-bold text-ink-primary mb-4">Visits by Type</p>
          <div className="space-y-3">
            {visitsByType.map(({ type, count }) => (
              <div key={type} className="flex items-center gap-3">
                <p className={`text-xs flex-1 font-medium ${TYPE_COLORS[type] ?? 'text-ink-secondary'}`}>{type}</p>
                <div className="w-24 h-1.5 bg-navy-500 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue rounded-full" style={{ width: `${completed > 0 ? (count / completed) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-bold text-ink-primary w-4 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Store Coverage */}
        <div className="card p-5">
          <p className="text-sm font-bold text-ink-primary mb-4">Store Coverage</p>
          <div className="space-y-2">
            {stores.filter(s => s.active).map(store => {
              const lastVisit = lastVisitByStore[store.id];
              const days = lastVisit ? daysSince(lastVisit) : 999;
              const storeVisitCount = visits.filter(v => v.storeId === store.id && v.status === 'completed').length;
              return (
                <div key={store.id} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${days > 7 ? 'bg-signal-red' : days > 5 ? 'bg-signal-amber' : 'bg-signal-green'}`} />
                  <p className="text-xs text-ink-primary flex-1 font-medium">{store.name}</p>
                  <p className="text-[11px] text-ink-muted">{storeVisitCount} visits</p>
                  <p className={`text-[11px] font-semibold w-24 text-right ${days > 7 ? 'text-signal-red' : days > 5 ? 'text-signal-amber' : 'text-ink-muted'}`}>
                    {lastVisit ? `${days}d ago` : 'Never visited'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recommended Visits */}
      {recommendedVisits.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <Flag size={15} className="text-accent-orange" /> Recommended Visits
            </p>
            <p className="text-xs text-ink-muted">Ranked by priority · Red zone + overdue</p>
          </div>
          <div className="space-y-2">
            {recommendedVisits.map(({ ss, days }) => (
              <div key={ss.store.id} className={`flex items-center gap-3 p-3 rounded-xl border ${ss.isRed ? 'border-signal-red/20 bg-signal-red/5' : 'border-navy-500 bg-navy-700'}`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${days > 7 ? 'bg-signal-red' : days > 5 ? 'bg-signal-amber' : 'bg-signal-green'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink-primary">{ss.store.name}</p>
                    {ss.isRed && <span className="badge-red text-[10px]">Red Zone</span>}
                  </div>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    {!ss.lastVisitDate ? 'Never visited' : `Last visit ${days}d ago`}
                    {ss.isRed ? ` · ${fmtPct(ss.attachmentPctToGoal)} to goal` : ''}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => openPlanVisit({ storeId: ss.store.id })}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    Plan Visit
                  </button>
                  <Link to={`/stores/${ss.store.id}`} className="btn-ghost text-xs py-1.5 px-3">
                    Store
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visit Log — compact fixed-height with scroll */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-ink-secondary" />
            <p className="text-sm font-bold text-ink-primary">Visit Log</p>
            <span className="badge-neutral">{filteredVisits.length}</span>
          </div>
          <div className="flex gap-1 bg-navy-700 rounded-xl p-1">
            {(['all', 'completed', 'planned'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${filterStatus === f ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Fixed-height scrollable log */}
        <div className="h-80 overflow-y-auto space-y-2 pr-1">
          {filteredVisits.length === 0 ? (
            <div className="flex items-center justify-center h-full text-ink-muted text-sm">No visits found</div>
          ) : filteredVisits.map(v => {
            const store = stores.find(s => s.id === v.storeId);
            const ss = storeSummaries.find(s => s.store.id === v.storeId);
            const isDemo = v.source !== 'manual' && v.source !== 'google_calendar';
            return (
              <div
                key={v.id}
                className={`p-3 rounded-xl border transition-all ${
                  v.status === 'planned'
                    ? 'border-accent-blue/20 bg-accent-blue/5'
                    : v.redFlagsFound.length > 0
                    ? 'border-signal-amber/20 bg-signal-amber/5'
                    : 'border-navy-500 bg-navy-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button className="flex items-center gap-2 min-w-0 flex-1 text-left" onClick={() => setSelectedVisit(v)}>
                    <p className="text-xs font-semibold text-ink-primary truncate">{store?.name ?? v.storeId}</p>
                    {ss?.isRed && <span className="badge-red text-[9px] flex-shrink-0">RED</span>}
                    {isDemo && <span className="text-[9px] text-ink-muted bg-navy-600 px-1.5 py-0.5 rounded flex-shrink-0">demo</span>}
                    {v.redFlagsFound.length > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-signal-amber flex-shrink-0">
                        <AlertTriangle size={9} /> {v.redFlagsFound.length}
                      </span>
                    )}
                    {v.coachingCompleted && (
                      <CheckCircle size={10} className="text-signal-green flex-shrink-0" />
                    )}
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] font-medium ${TYPE_COLORS[v.visitType] ?? 'text-ink-muted'}`}>{v.visitType}</span>
                    <span className="text-[10px] text-ink-muted">{v.date}</span>
                    {v.timeInStore && <span className="text-[10px] text-ink-muted">{v.timeInStore}</span>}
                    <button onClick={() => setEditVisit(v)} className="p-1 rounded hover:bg-navy-600 text-ink-muted hover:text-accent-blue-light transition-colors" title="Edit">
                      <Edit3 size={11} />
                    </button>
                    <button onClick={() => setConfirmDelete(v)} className="p-1 rounded hover:bg-navy-600 text-ink-muted hover:text-signal-red transition-colors" title="Delete">
                      <Trash2 size={11} />
                    </button>
                    <button onClick={() => setSelectedVisit(v)} className="p-1 rounded hover:bg-navy-600 text-ink-muted transition-colors" title="View details">
                      <ChevronRight size={11} />
                    </button>
                  </div>
                </div>
                {v.notes && (
                  <p className="text-[11px] text-ink-muted mt-1 line-clamp-1 text-left">{v.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
