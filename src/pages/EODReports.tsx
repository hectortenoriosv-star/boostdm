import { useState, useMemo } from 'react';
import {
  FileText, Plus, ChevronLeft, ChevronRight, AlertTriangle,
  CheckCircle, BookOpen, Star, X, Clock, Filter,
  RefreshCw, ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { fmtDate, fmtDateFull } from '../data/calculations';
import type { EODReport, CoachingNote } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'new' | 'reviewed' | 'actioned';
type DateFilter = 'today' | 'yesterday' | 'week' | 'all';

// ─── Status styles ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<EODReport['status'], { badge: string; label: string }> = {
  new:      { badge: 'badge-amber', label: 'New' },
  reviewed: { badge: 'badge-blue',  label: 'Reviewed' },
  actioned: { badge: 'badge-green', label: 'Coaching Created' },
};

// ─── Add EOD Modal ────────────────────────────────────────────────────────────

function AddEODModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (r: Omit<EODReport, 'id' | 'createdAt'>) => void;
}) {
  const { reps, stores } = useData();
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    date: today,
    repId: '',
    storeId: '',
    issue: '',
    coachingFocus: '',
    actionPlan: '',
    wins: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.repId) return;
    onAdd({ ...form, status: 'new', source: 'manual' });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-ink-primary">Add EOD Report</p>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Date</label>
            <input type="date" className="input-base w-full" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Rep *</label>
            <select className="input-base w-full" value={form.repId} onChange={e => set('repId', e.target.value)}>
              <option value="">Select rep…</option>
              {reps.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Store</label>
          <select className="input-base w-full" value={form.storeId} onChange={e => set('storeId', e.target.value)}>
            <option value="">Select store…</option>
            {stores.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Issue / Gap</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What went wrong or what was missed?" value={form.issue} onChange={e => set('issue', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Coaching Focus</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What specifically needs to be coached?" value={form.coachingFocus} onChange={e => set('coachingFocus', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Action Plan</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What actions were agreed on?" value={form.actionPlan} onChange={e => set('actionPlan', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Wins</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What went well?" value={form.wins} onChange={e => set('wins', e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={submit} disabled={!form.repId} className="btn-primary flex-1 justify-center disabled:opacity-50">
            Save EOD Report
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Coaching Note Modal ───────────────────────────────────────────────

function CreateCoachingModal({
  report,
  repName,
  onClose,
  onConfirm,
}: {
  report: EODReport;
  repName: string;
  onClose: () => void;
  onConfirm: (note: Omit<CoachingNote, 'id' | 'createdAt'>) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const threeDays = new Date();
  threeDays.setDate(threeDays.getDate() + 3);
  const followUpDue = threeDays.toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: today,
    notes: report.coachingFocus || report.issue,
    behaviors: report.issue ? [report.issue.split('.')[0].trim()] : [] as string[],
    followUp: report.actionPlan,
    followUpDue,
    newBehavior: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const addBehavior = () => {
    if (!form.newBehavior.trim()) return;
    setForm(f => ({ ...f, behaviors: [...f.behaviors, f.newBehavior.trim()], newBehavior: '' }));
  };
  const removeBehavior = (i: number) =>
    setForm(f => ({ ...f, behaviors: f.behaviors.filter((_, idx) => idx !== i) }));

  const submit = () => {
    onConfirm({
      repId: report.repId,
      date: form.date,
      type: 'coaching',
      notes: form.notes,
      behaviors: form.behaviors,
      followUp: form.followUp || undefined,
      followUpDue: form.followUpDue || undefined,
      status: 'open',
      eodReportId: report.id,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-ink-primary">Create Coaching Note</p>
            <p className="text-xs text-ink-muted">From EOD report · {repName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="bg-navy-600 rounded-xl p-3 text-xs text-ink-secondary space-y-1">
          <p className="font-semibold text-ink-primary text-[11px] uppercase tracking-wider mb-1.5">EOD Source</p>
          {report.coachingFocus && <p><span className="text-ink-muted">Focus:</span> {report.coachingFocus}</p>}
          {report.actionPlan && <p><span className="text-ink-muted">Plan:</span> {report.actionPlan}</p>}
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Coaching Notes</label>
          <textarea className="input-base w-full resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Observed Behaviors</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.behaviors.map((b, i) => (
              <span key={i} className="flex items-center gap-1 bg-navy-600 border border-navy-500 rounded-lg px-2 py-0.5 text-xs text-ink-secondary">
                {b}
                <button onClick={() => removeBehavior(i)} className="text-ink-muted hover:text-signal-red">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input-base flex-1 text-xs py-1.5 h-8" placeholder="Add behavior…" value={form.newBehavior}
              onChange={e => setForm(f => ({ ...f, newBehavior: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBehavior(); } }} />
            <button onClick={addBehavior} className="btn-secondary text-xs py-1.5 h-8 px-3">Add</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Follow-Up Action</label>
            <input className="input-base w-full text-xs" placeholder="Next steps…" value={form.followUp} onChange={e => set('followUp', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Due Date</label>
            <input type="date" className="input-base w-full" value={form.followUpDue} onChange={e => set('followUpDue', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={submit} className="btn-primary flex-1 justify-center">
            <BookOpen size={14} /> Create Coaching Note
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EODReports() {
  const { eodReports, reps, stores, coachingNotes, addEODReport, updateEODReport, addCoachingNote } = useData();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter]   = useState<DateFilter>('week');
  const [showAdd, setShowAdd]         = useState(false);
  const [coachingFrom, setCoachingFrom] = useState<EODReport | null>(null);

  // ── Date range ─────────────────────────────────────────────────────────────
  const todayStr     = new Date().toISOString().split('T')[0];
  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();
  const weekAgoStr   = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; })();

  const availableDates = useMemo(
    () => [...new Set(eodReports.map(r => r.date))].sort().reverse(),
    [eodReports],
  );

  // ── Filtered reports ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...eodReports];

    if (dateFilter === 'today')     rows = rows.filter(r => r.date === todayStr);
    else if (dateFilter === 'yesterday') rows = rows.filter(r => r.date === yesterdayStr);
    else if (dateFilter === 'week') rows = rows.filter(r => r.date >= weekAgoStr);

    if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);

    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [eodReports, dateFilter, statusFilter, todayStr, yesterdayStr, weekAgoStr]);

  // ── Summary counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const base = dateFilter === 'today' ? eodReports.filter(r => r.date === todayStr)
      : dateFilter === 'yesterday' ? eodReports.filter(r => r.date === yesterdayStr)
      : dateFilter === 'week' ? eodReports.filter(r => r.date >= weekAgoStr)
      : eodReports;
    return {
      total:    base.length,
      newCount: base.filter(r => r.status === 'new').length,
      withFocus: base.filter(r => r.coachingFocus).length,
      actioned: base.filter(r => r.status === 'actioned').length,
    };
  }, [eodReports, dateFilter, todayStr, yesterdayStr, weekAgoStr]);

  // ── Grouped by date ────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const arr = map.get(r.date) ?? [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const repName = (id: string) => reps.find(r => r.id === id)?.name ?? id;
  const storeName = (id: string) => stores.find(s => s.id === id)?.name ?? id;

  const handleMarkReviewed = (report: EODReport) => {
    if (report.status === 'new') updateEODReport(report.id, { status: 'reviewed' });
  };

  const handleCoachingCreated = (report: EODReport, note: Omit<CoachingNote, 'id' | 'createdAt'>) => {
    const noteId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    addCoachingNote({ ...note });
    // We get the note ID from DataContext's genId but can't access it directly.
    // Instead we mark the report as actioned; the Coaching Hub will show the link via eodReportId.
    updateEODReport(report.id, { status: 'actioned' });
    setCoachingFrom(null);
  };

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <FileText size={18} className="text-accent-blue-light" />
            <h1 className="text-xl font-bold text-ink-primary">EOD Reports</h1>
          </div>
          <p className="text-sm text-ink-secondary">End of day reports from reps and managers</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/coaching" className="btn-secondary text-xs">
            <BookOpen size={13} /> Coaching Hub
          </Link>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs">
            <Plus size={13} /> Add Report
          </button>
        </div>
      </div>

      {/* ── Date + Status Filter ─────────────────────────────────────────── */}
      <div className="card-sm p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {([
            ['today',     'Today'],
            ['yesterday', 'Yesterday'],
            ['week',      'This Week'],
            ['all',       'All Time'],
          ] as [DateFilter, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setDateFilter(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                dateFilter === v
                  ? 'bg-accent-blue/20 text-accent-blue-light border border-accent-blue/30'
                  : 'text-ink-muted hover:text-ink-secondary hover:bg-navy-600'
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-navy-500 hidden sm:block" />

        <div className="flex items-center gap-1.5 ml-auto">
          <Filter size={12} className="text-ink-muted" />
          {([
            ['all',      'All'],
            ['new',      'New'],
            ['reviewed', 'Reviewed'],
            ['actioned', 'Coaching Created'],
          ] as [StatusFilter, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                statusFilter === v
                  ? 'bg-navy-500 text-ink-primary'
                  : 'text-ink-muted hover:text-ink-secondary hover:bg-navy-600'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Reports', value: counts.total, sub: 'in selected range', cls: 'border-t-navy-400' },
          { label: 'Needs Review', value: counts.newCount, sub: 'unreviewed reports', cls: counts.newCount > 0 ? 'border-t-signal-amber' : 'border-t-navy-400' },
          { label: 'Has Coaching Focus', value: counts.withFocus, sub: 'reports with action needed', cls: counts.withFocus > 0 ? 'border-t-accent-orange' : 'border-t-navy-400' },
          { label: 'Coaching Created', value: counts.actioned, sub: 'notes added to hub', cls: counts.actioned > 0 ? 'border-t-signal-green' : 'border-t-navy-400' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className={`card p-4 border-t-2 ${cls}`}>
            <p className="metric-label mb-1">{label}</p>
            <p className="text-2xl font-bold text-ink-primary tabular-nums">{value}</p>
            <p className="text-xs text-ink-muted mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Reports list ─────────────────────────────────────────────────── */}
      {grouped.length === 0 ? (
        <div className="card p-16 text-center">
          <FileText size={36} className="mx-auto mb-3 text-ink-muted opacity-30" />
          <p className="text-sm font-semibold text-ink-secondary">No EOD reports for this filter</p>
          <p className="text-xs text-ink-muted mt-1 mb-4">Reports sync from Google Sheets or can be added manually.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs mx-auto">
            <Plus size={13} /> Add Report
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, reports]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                  {fmtDateFull(date)}
                </p>
                <span className="badge-neutral text-[10px]">{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
                <div className="flex-1 h-px bg-navy-500" />
              </div>

              <div className="space-y-3">
                {reports.map(report => {
                  const hasIssue = Boolean(report.issue);
                  const hasFocus = Boolean(report.coachingFocus);
                  const hasWins  = Boolean(report.wins);
                  const { badge, label: statusLabel } = STATUS_STYLES[report.status];
                  const linkedNote = report.linkedCoachingNoteId
                    ? coachingNotes.find(n => n.id === report.linkedCoachingNoteId)
                    : coachingNotes.find(n => n.eodReportId === report.id);

                  return (
                    <div key={report.id} className="card p-4 space-y-3">
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to={`/reps/${report.repId}`}
                              className="text-sm font-bold text-ink-primary hover:text-accent-blue-light hover:underline">
                              {repName(report.repId)}
                            </Link>
                            <span className="text-ink-muted text-xs">·</span>
                            <Link to={`/stores/${report.storeId}`}
                              className="text-xs text-ink-secondary hover:text-accent-blue-light hover:underline">
                              {storeName(report.storeId)}
                            </Link>
                          </div>
                          <p className="text-[11px] text-ink-muted mt-0.5">
                            {fmtDate(report.date)} · {report.source === 'sheets' ? 'Synced from Sheets' : 'Manual entry'}
                          </p>
                        </div>
                        <span className={`${badge} text-[10px] shrink-0`}>{statusLabel}</span>
                      </div>

                      {/* Content */}
                      <div className="space-y-2">
                        {hasIssue && (
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={13} className="text-signal-red mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-signal-red mb-0.5">Issue</p>
                              <p className="text-xs text-ink-secondary leading-relaxed">{report.issue}</p>
                            </div>
                          </div>
                        )}

                        {hasFocus && (
                          <div className="flex items-start gap-2">
                            <BookOpen size={13} className="text-accent-orange-light mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-accent-orange-light mb-0.5">Coaching Focus</p>
                              <p className="text-xs text-ink-secondary leading-relaxed">{report.coachingFocus}</p>
                            </div>
                          </div>
                        )}

                        {report.actionPlan && (
                          <div className="flex items-start gap-2 pl-5">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Action Plan</p>
                              <p className="text-xs text-ink-muted leading-relaxed">{report.actionPlan}</p>
                            </div>
                          </div>
                        )}

                        {hasWins && (
                          <div className="flex items-start gap-2">
                            <Star size={13} className="text-signal-green mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-signal-green mb-0.5">Wins</p>
                              <p className="text-xs text-ink-secondary leading-relaxed">{report.wins}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1 border-t border-navy-500 flex-wrap">
                        {report.status === 'new' && (
                          <button
                            onClick={() => handleMarkReviewed(report)}
                            className="btn-ghost text-xs py-1 px-2.5">
                            <CheckCircle size={12} /> Mark Reviewed
                          </button>
                        )}

                        {(report.status === 'new' || report.status === 'reviewed') && hasFocus && (
                          <button
                            onClick={() => setCoachingFrom(report)}
                            className="btn-primary text-xs py-1.5 px-3">
                            <BookOpen size={12} /> Create Coaching Note
                          </button>
                        )}

                        {report.status === 'actioned' && linkedNote && (
                          <Link
                            to="/coaching"
                            className="btn-secondary text-xs py-1.5 px-3">
                            <ArrowRight size={12} /> View in Coaching Hub
                          </Link>
                        )}

                        {report.status === 'actioned' && !linkedNote && (
                          <span className="flex items-center gap-1.5 text-xs text-signal-green">
                            <CheckCircle size={12} /> Coaching note created
                          </span>
                        )}

                        <Link to={`/reps/${report.repId}`}
                          className="btn-ghost text-xs py-1 px-2.5 ml-auto">
                          View Rep
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Date nav footer ──────────────────────────────────────────────── */}
      {availableDates.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-ink-muted px-1 pb-2">
          <Clock size={11} />
          <span>Reports available for:</span>
          <div className="flex gap-1.5 flex-wrap">
            {availableDates.slice(0, 7).map(d => (
              <button key={d}
                onClick={() => { setDateFilter('all'); }}
                className="text-accent-blue-light hover:underline">
                {fmtDate(d)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {showAdd && (
        <AddEODModal onClose={() => setShowAdd(false)} onAdd={r => { addEODReport(r); setShowAdd(false); }} />
      )}
      {coachingFrom && (
        <CreateCoachingModal
          report={coachingFrom}
          repName={repName(coachingFrom.repId)}
          onClose={() => setCoachingFrom(null)}
          onConfirm={(note) => handleCoachingCreated(coachingFrom, note)}
        />
      )}
    </div>
  );
}
