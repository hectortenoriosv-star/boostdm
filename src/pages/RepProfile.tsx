import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Plus, Edit3, Save,
  CheckCircle, AlertTriangle, DollarSign, Star, MessageSquare, CheckSquare,
  Archive, RotateCcw, Trash2, GitMerge, MoreVertical, X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { PerformanceTrendChart } from '../components/PerformanceTrendChart';
import {
  fmtPct, fmtCurrency, buildChartData, fmtDate, daysSince,
} from '../data/calculations';
import type { CoachingNote } from '../types';

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusBadge(pct: number, isRed: boolean) {
  if (isRed || pct < 60) return <span className="badge-red">Red Status</span>;
  if (pct >= 100) return <span className="badge-green">On Fire</span>;
  if (pct >= 75) return <span className="badge-green">On Track</span>;
  return <span className="badge-amber">Watch</span>;
}


// ─── Modal types ──────────────────────────────────────────────────────────────

type RepModal =
  | { type: 'archive' }
  | { type: 'restore' }
  | { type: 'delete' }
  | { type: 'merge' }
  | { type: 'blocked'; reason: string }
  | null;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RepProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    reps, stores, repSummaries, dailyPerf, tasks, coachingNotes, reportingPeriod,
    updateRep, addCoachingNote, updateCoachingNote, mergeReps, permanentDeleteRep,
  } = useData();

  const rep = reps.find(r => r.id === id);
  const rs = repSummaries.find(r => r.rep.id === id);
  const store = stores.find(s => s.id === rep?.defaultStoreId);
  // Deduplicate coaching notes: same date + type + first 60 chars of notes text
  const repNotesRaw = coachingNotes.filter(n => n.repId === id).sort((a, b) => b.date.localeCompare(a.date));
  const repNotes = repNotesRaw.filter((note, idx) => {
    const key = `${note.date}|${note.type}|${note.notes.slice(0, 60).toLowerCase().trim()}`;
    return repNotesRaw.findIndex(n => `${n.date}|${n.type}|${n.notes.slice(0, 60).toLowerCase().trim()}` === key) === idx;
  });
  const repTasks = tasks.filter(t => t.repId === id).sort((a, b) => (a.status === 'completed' ? 1 : -1) - (b.status === 'completed' ? 1 : -1));

  // ── Chart + selectedDate ────────────────────────────────────────────────────
  const periodDailyPerf = useMemo(
    () => dailyPerf.filter(d => {
      const [y, m] = d.date.split('-').map(Number);
      return y === reportingPeriod.year && m === reportingPeriod.month;
    }),
    [dailyPerf, reportingPeriod.month, reportingPeriod.year],
  );
  const repDailyAll = periodDailyPerf.filter(d => d.repId === id).sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = repDailyAll.length > 0 ? repDailyAll[repDailyAll.length - 1].date : undefined;
  const [selectedDate, setSelectedDate] = useState<string | undefined>(latestDate);

  const chartData = useMemo(
    () => buildChartData(periodDailyPerf, id, undefined, selectedDate),
    [periodDailyPerf, id, selectedDate],
  );

  const selectedDayEntries = repDailyAll.filter(d => d.date === selectedDate);
  const selectedDayAtt = selectedDayEntries.reduce((s, d) => s + d.attachment, 0);
  const selectedDayBoxes = selectedDayEntries.reduce((s, d) => s + d.boxes, 0);
  const selectedDayGoal = selectedDayEntries.reduce((s, d) => s + d.dailyGoal, 0);
  const selectedDayPct = selectedDayGoal > 0 ? Math.round((selectedDayAtt / selectedDayGoal) * 100 * 10) / 10 : 0;

  // ── Month highlights ────────────────────────────────────────────────────────
  const daysAtGoal = repDailyAll.filter(d => d.attachmentPctToDaily >= 100).length;
  const daysBelow60 = repDailyAll.filter(d => d.attachmentPctToDaily < 60).length;
  const bestDay = repDailyAll.length > 0
    ? repDailyAll.reduce((best, d) => d.attachmentPctToDaily > best.attachmentPctToDaily ? d : best, repDailyAll[0])
    : null;
  const worstDay = repDailyAll.length > 0
    ? repDailyAll.reduce((worst, d) => d.attachmentPctToDaily < worst.attachmentPctToDaily ? d : worst, repDailyAll[0])
    : null;

  // ── Edit mode ───────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editNotes, setEditNotes] = useState(rep?.notes ?? '');
  const [editStrengths, setEditStrengths] = useState(rep?.strengths?.join(', ') ?? '');
  const [editGaps, setEditGaps] = useState(rep?.gaps?.join(', ') ?? '');

  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [noteForm, setNoteForm] = useState<{
    type: CoachingNote['type'];
    notes: string;
    behaviors: string;
    followUp: string;
    followUpDue: string;
  }>({ type: 'coaching', notes: '', behaviors: '', followUp: '', followUpDue: '' });

  // ── Management state ────────────────────────────────────────────────────────
  const [modal, setModal] = useState<RepModal>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  if (!rep) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/reps')} className="btn-ghost mb-4 flex items-center gap-2">
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-ink-muted">Rep not found.</p>
      </div>
    );
  }

  const isArchived = !rep.active;
  const comm = rs?.commission;
  const rank = rs
    ? [...repSummaries].sort((a, b) => b.attachmentPctToGoal - a.attachmentPctToGoal).findIndex(r => r.rep.id === id) + 1
    : null;
  const total = repSummaries.length;

  const signalColor = !rs ? 'text-ink-muted'
    : rs.signal === 'green' ? 'text-signal-green'
    : rs.signal === 'amber' ? 'text-signal-amber'
    : rs.signal === 'red' ? 'text-signal-red'
    : 'text-accent-orange';

  const signalBorder = !rs ? 'border-t-navy-500'
    : rs.signal === 'green' ? 'border-t-signal-green'
    : rs.signal === 'amber' ? 'border-t-signal-amber'
    : rs.signal === 'red' ? 'border-t-signal-red'
    : 'border-t-accent-orange';

  const saveEdit = () => {
    updateRep(rep.id, {
      notes: editNotes,
      strengths: editStrengths.split(',').map(s => s.trim()).filter(Boolean),
      gaps: editGaps.split(',').map(s => s.trim()).filter(Boolean),
    });
    setEditMode(false);
  };

  const submitNote = () => {
    if (!noteForm.notes.trim()) return;
    addCoachingNote({
      repId: rep.id,
      date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
      type: noteForm.type,
      notes: noteForm.notes,
      behaviors: noteForm.behaviors.split(',').map(s => s.trim()).filter(Boolean),
      followUp: noteForm.followUp || undefined,
      followUpDue: noteForm.followUpDue || undefined,
      status: 'open',
    });
    setNoteForm({ type: 'coaching', notes: '', behaviors: '', followUp: '', followUpDue: '' });
    setShowNoteForm(false);
  };

  // ── Management handlers ─────────────────────────────────────────────────────
  const handleArchive = () => {
    updateRep(rep.id, { active: false });
    setModal(null);
    navigate('/reps');
  };

  const handleRestore = () => {
    updateRep(rep.id, { active: true });
    setModal(null);
  };

  const handleDelete = () => {
    if (deleteConfirm !== rep.name) return;
    const result = permanentDeleteRep(rep.id);
    if (!result.success) {
      setModal({ type: 'blocked', reason: result.reason ?? 'Cannot delete this rep — linked data exists.' });
      setDeleteConfirm('');
    } else {
      setModal(null);
      navigate('/reps');
    }
  };

  const handleMerge = () => {
    if (!mergeTargetId) return;
    mergeReps(mergeTargetId, rep.id);
    setModal(null);
    navigate(`/reps/${mergeTargetId}`);
  };

  // Merge target options — active reps except current
  const mergeTargets = reps.filter(r => r.active && r.id !== rep.id);

  // Prev / next navigation
  const sortedRepIds = useMemo(
    () => [...reps].filter(r => r.active).sort((a, b) => a.name.localeCompare(b.name)).map(r => r.id),
    [reps],
  );
  const currentRepIdx = sortedRepIds.indexOf(rep.id);
  const prevRepId = currentRepIdx > 0 ? sortedRepIds[currentRepIdx - 1] : null;
  const nextRepId = currentRepIdx < sortedRepIds.length - 1 ? sortedRepIds[currentRepIdx + 1] : null;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">

      {/* ── Archived Banner ── */}
      {isArchived && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-signal-amber/10 border border-signal-amber/30">
          <div className="flex items-center gap-2">
            <Archive size={15} className="text-signal-amber flex-shrink-0" />
            <p className="text-sm font-semibold text-signal-amber">This rep is archived</p>
            <p className="text-xs text-ink-muted">Performance data is preserved. The rep won't appear in the leaderboard.</p>
          </div>
          <button
            onClick={() => setModal({ type: 'restore' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-signal-amber/20 text-signal-amber text-xs font-semibold hover:bg-signal-amber/30 transition-colors flex-shrink-0"
          >
            <RotateCcw size={12} /> Restore
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-1 mt-0.5">
            <button onClick={() => navigate('/reps')} className="btn-ghost p-2" title="All Reps">
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={() => prevRepId && navigate(`/reps/${prevRepId}`)}
              disabled={!prevRepId}
              className="btn-ghost p-2 disabled:opacity-30 disabled:cursor-not-allowed"
              title={prevRepId ? `Previous rep` : undefined}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => nextRepId && navigate(`/reps/${nextRepId}`)}
              disabled={!nextRepId}
              className="btn-ghost p-2 disabled:opacity-30 disabled:cursor-not-allowed"
              title={nextRepId ? `Next rep` : undefined}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-bold text-ink-primary">{rep.name}</h1>
              {rs && statusBadge(rs.attachmentPctToGoal, rs.isRed)}
              {isArchived && <span className="badge-neutral">Archived</span>}
              {rank !== null && <span className="badge-neutral">#{rank} of {total}</span>}
            </div>
            <div className="flex items-center flex-wrap gap-3 text-xs text-ink-muted">
              {store && (
                <Link to={`/stores/${store.id}`} className="flex items-center gap-1 hover:text-ink-secondary transition-colors">
                  {store.name}
                </Link>
              )}
              {rep.hireDate && <span>Hired {fmtDate(rep.hireDate)}</span>}
              {rep.phone && <span>{rep.phone}</span>}
              {rs?.lastCoachingDate && (
                <span className={daysSince(rs.lastCoachingDate) > 7 ? 'text-signal-amber' : 'text-ink-muted'}>
                  Last coached {daysSince(rs.lastCoachingDate)}d ago
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {!isArchived && (
            <>
              <button
                onClick={() => {
                  setEditMode(e => !e);
                  setEditNotes(rep.notes);
                  setEditStrengths(rep.strengths.join(', '));
                  setEditGaps(rep.gaps.join(', '));
                }}
                className="btn-secondary text-xs"
              >
                <Edit3 size={14} /> {editMode ? 'Cancel' : 'Edit'}
              </button>
              {editMode && (
                <button onClick={saveEdit} className="btn-primary text-xs">
                  <Save size={14} /> Save
                </button>
              )}
            </>
          )}

          {/* Action menu */}
          <div
            className="relative"
            ref={menuRef}
            onBlur={e => { if (!menuRef.current?.contains(e.relatedTarget as Node)) setMenuOpen(false); }}
          >
            <button
              onClick={() => setMenuOpen(o => !o)}
              tabIndex={0}
              className="bg-navy-600 border border-navy-500 text-ink-secondary hover:text-ink-primary hover:border-navy-400 rounded-lg p-1.5 transition-colors"
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-navy-700 border border-navy-500 rounded-xl shadow-xl py-1 min-w-[150px]">
                {!isArchived && (
                  <>
                    <button
                      onClick={() => { setModal({ type: 'archive' }); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-secondary hover:bg-navy-600 hover:text-signal-amber transition-colors text-left"
                    >
                      <Archive size={13} /> Archive Rep
                    </button>
                    <button
                      onClick={() => { setMergeTargetId(''); setModal({ type: 'merge' }); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-secondary hover:bg-navy-600 hover:text-ink-primary transition-colors text-left"
                    >
                      <GitMerge size={13} /> Merge Into…
                    </button>
                  </>
                )}
                {isArchived && (
                  <button
                    onClick={() => { setModal({ type: 'restore' }); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-secondary hover:bg-navy-600 hover:text-signal-green transition-colors text-left"
                  >
                    <RotateCcw size={13} /> Restore Rep
                  </button>
                )}
                <div className="border-t border-navy-600 my-1" />
                <button
                  onClick={() => { setDeleteConfirm(''); setModal({ type: 'delete' }); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-signal-red hover:bg-navy-600 transition-colors text-left"
                >
                  <Trash2 size={13} /> Delete Rep
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 1: MTD KPI Cards ── */}
      {rs && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className={`card p-4 border-t-2 ${signalBorder}`}>
            <p className="metric-label mb-1">Att % to Goal</p>
            <p className={`text-xl font-bold ${signalColor}`}>{fmtPct(rs.attachmentPctToGoal)}</p>
          </div>
          <div className={`card p-4 border-t-2 ${rs.bpPct >= 75 ? 'border-t-signal-green' : 'border-t-signal-red'}`}>
            <p className="metric-label mb-1">BP%</p>
            <p className={`text-xl font-bold ${rs.bpPct >= 75 ? 'text-signal-green' : 'text-signal-red'}`}>{rs.bpPct}%</p>
          </div>
          <div className={`card p-4 border-t-2 ${rs.atuPct >= 65 ? 'border-t-signal-green' : 'border-t-signal-amber'}`}>
            <p className="metric-label mb-1">ATU%</p>
            <p className={`text-xl font-bold ${rs.atuPct >= 65 ? 'text-signal-green' : 'text-signal-amber'}`}>{rs.atuPct}%</p>
          </div>
          <div className="card p-4 border-t-2 border-t-navy-500">
            <p className="metric-label mb-1">ATT/hr</p>
            <p className="text-xl font-bold text-ink-primary">
              {rs.attHr !== undefined ? fmtCurrency(rs.attHr) : '—'}
            </p>
          </div>
          <div className="card p-4 border-t-2 border-t-navy-400">
            <p className="metric-label mb-1">Current Tier</p>
            <p className="text-xs font-bold text-ink-primary leading-tight">{comm?.tier ?? '—'}</p>
            {comm?.tierBonus !== undefined && (
              <p className="text-[10px] text-signal-green mt-0.5">{comm.tierBonus}% bonus</p>
            )}
          </div>
          <div className={`card p-4 border-t-2 ${rs.reportCardPct >= 80 ? 'border-t-signal-green' : rs.reportCardPct >= 75 ? 'border-t-signal-amber' : 'border-t-signal-red'}`}>
            <p className="metric-label mb-1">Report Card</p>
            <p className={`text-xl font-bold ${rs.reportCardPct >= 80 ? 'text-signal-green' : rs.reportCardPct >= 75 ? 'text-signal-amber' : 'text-signal-red'}`}>{rs.reportCardPct > 0 ? `${rs.reportCardPct}%` : '—'}</p>
          </div>
        </div>
      )}

      {/* ── Section 2: Daily Numbers Chart ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-ink-primary">Daily Numbers</p>
          {selectedDate && (
            <p className="text-xs text-ink-muted">
              Selected: <span className="text-ink-secondary font-semibold">{fmtDate(selectedDate)}</span>
            </p>
          )}
        </div>
        {chartData.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-ink-muted">No daily data available</p>
          </div>
        ) : (
          <PerformanceTrendChart
            data={chartData}
            onSelectDate={setSelectedDate}
            height={240}
          />
        )}
      </div>

      {/* ── Section 3: Selected-Day KPIs + Table ── */}
      {selectedDate && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink-primary">Day Detail —</p>
            <p className="text-sm text-ink-secondary">{fmtDate(selectedDate)}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4">
              <p className="metric-label mb-1">Attachments</p>
              <p className="text-xl font-bold text-ink-primary">{fmtCurrency(selectedDayAtt)}</p>
            </div>
            <div className="card p-4">
              <p className="metric-label mb-1">Daily Goal</p>
              <p className="text-xl font-bold text-ink-primary">{fmtCurrency(selectedDayGoal)}</p>
            </div>
            <div className="card p-4">
              <p className="metric-label mb-1">% to Goal</p>
              <p className={`text-xl font-bold ${selectedDayPct >= 100 ? 'text-signal-green' : selectedDayPct >= 75 ? 'text-signal-amber' : 'text-signal-red'}`}>
                {fmtPct(selectedDayPct)}
              </p>
            </div>
            <div className="card p-4">
              <p className="metric-label mb-1">Boxes</p>
              <p className="text-xl font-bold text-ink-primary">{selectedDayBoxes}</p>
            </div>
          </div>
          {selectedDayEntries.length > 0 && (
            <div className="card p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-navy-500">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted">Date</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted">Rep</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted">Store</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold text-ink-muted">Boxes</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold text-ink-muted">Goal</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold text-ink-muted">Attachment</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold text-ink-muted">% to Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDayEntries.map(d => {
                      const entryStore = stores.find(s => s.id === d.storeId);
                      return (
                        <tr key={d.id} className="border-b border-navy-600">
                          <td className="px-3 py-2.5 text-ink-secondary">{fmtDate(d.date)}</td>
                          <td className="px-3 py-2.5 text-ink-primary font-semibold">{rep.name}</td>
                          <td className="px-3 py-2.5">
                            {entryStore ? (
                              <Link to={`/stores/${entryStore.id}`} className="text-ink-secondary hover:text-ink-primary transition-colors">
                                {entryStore.name}
                              </Link>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-ink-primary font-semibold">{d.boxes}</td>
                          <td className="px-3 py-2.5 text-right text-ink-muted">{fmtCurrency(d.dailyGoal)}</td>
                          <td className="px-3 py-2.5 text-right text-ink-primary">{fmtCurrency(d.attachment)}</td>
                          <td className={`px-3 py-2.5 text-right font-bold ${d.attachmentPctToDaily >= 100 ? 'text-signal-green' : d.attachmentPctToDaily >= 75 ? 'text-signal-amber' : 'text-signal-red'}`}>
                            {fmtPct(d.attachmentPctToDaily)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 4: Commission Breakdown ── */}
      {comm && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={15} className="text-signal-green" />
            <p className="text-sm font-bold text-ink-primary">Commission Breakdown</p>
            <span className="badge-green">{fmtCurrency(comm.commissionAfterRC)}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-navy-600/50 rounded-xl p-4 border border-navy-500">
              <p className="text-[11px] text-ink-muted mb-1">Attachment Trend</p>
              <p className="text-base font-bold text-ink-primary">{fmtCurrency(comm.attachmentTrend)}</p>
              <p className="text-[10px] text-ink-muted mt-1">Projected end-of-month</p>
              <div className="mt-2 pt-2 border-t border-navy-500/50">
                <p className="text-[11px] text-ink-muted">Attachment Commission</p>
                <p className="text-sm font-bold text-signal-green">{fmtCurrency(comm.attachmentCommission)}</p>
              </div>
            </div>
            <div className="bg-navy-600/50 rounded-xl p-4 border border-navy-500">
              <p className="text-[11px] text-ink-muted mb-1">Box Trend</p>
              <p className="text-base font-bold text-ink-primary">{comm.boxTrend} boxes</p>
              <p className="text-[10px] text-ink-muted mt-1">Projected end-of-month</p>
              <div className="mt-2 pt-2 border-t border-navy-500/50">
                <p className="text-[11px] text-ink-muted">Box Commission</p>
                <p className="text-sm font-bold text-signal-green">{fmtCurrency(comm.boxCommission)}</p>
              </div>
            </div>
            <div className="bg-navy-600/50 rounded-xl p-4 border border-navy-500">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-ink-muted">Before RC</p>
                  <p className="text-xs font-bold text-ink-primary">{fmtCurrency(comm.commissionBeforeRC)}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-ink-muted">Report Card</p>
                  <p className="text-xs font-semibold text-ink-secondary">{comm.reportCardPct}% → <span className={comm.rcMultiplier >= 1 ? 'text-signal-green' : 'text-signal-red'}>{comm.rcLabel}</span></p>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-navy-500/50">
                  <p className="text-[11px] font-bold text-ink-primary">After RC</p>
                  <p className="text-sm font-bold text-signal-green">{fmtCurrency(comm.commissionAfterRC)}</p>
                </div>
                {comm.amountForNextTier > 0 && (
                  <div className="flex justify-between items-center pt-1">
                    <p className="text-[11px] text-ink-muted">To {comm.nextTierLabel} tier</p>
                    <p className="text-xs font-bold text-signal-amber">{fmtCurrency(comm.amountForNextTier)} needed</p>
                  </div>
                )}
                {comm.amountForNextTier === 0 && (
                  <div className="flex items-center gap-1 pt-1">
                    <Star size={11} className="text-signal-green" />
                    <p className="text-[11px] text-signal-green">At max tier</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 5: Month Highlights ── */}
      {repDailyAll.length > 0 && (
        <div className="card p-5">
          <p className="text-sm font-bold text-ink-primary mb-3">Month Highlights</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-signal-green/5 border border-signal-green/20 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted mb-1">Best Day</p>
              {bestDay ? (
                <>
                  <p className="text-xs font-bold text-signal-green">{fmtPct(bestDay.attachmentPctToDaily)}</p>
                  <p className="text-[10px] text-ink-muted">{fmtDate(bestDay.date)}</p>
                </>
              ) : <p className="text-xs text-ink-muted">—</p>}
            </div>
            <div className="bg-signal-red/5 border border-signal-red/20 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted mb-1">Worst Day</p>
              {worstDay ? (
                <>
                  <p className="text-xs font-bold text-signal-red">{fmtPct(worstDay.attachmentPctToDaily)}</p>
                  <p className="text-[10px] text-ink-muted">{fmtDate(worstDay.date)}</p>
                </>
              ) : <p className="text-xs text-ink-muted">—</p>}
            </div>
            <div className="bg-navy-600/50 border border-navy-500 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted mb-1">Days at Goal</p>
              <p className="text-xl font-bold text-signal-green">{daysAtGoal}</p>
              <p className="text-[10px] text-ink-muted">of {repDailyAll.length} days</p>
            </div>
            <div className="bg-navy-600/50 border border-navy-500 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted mb-1">Days Below 60%</p>
              <p className={`text-xl font-bold ${daysBelow60 > 0 ? 'text-signal-red' : 'text-signal-green'}`}>{daysBelow60}</p>
              <p className="text-[10px] text-ink-muted">of {repDailyAll.length} days</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Grid: left col (strengths/gaps/notes/tasks) + right col (coaching) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4 lg:col-span-1">
          {/* Strengths */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-signal-green" />
              <p className="text-sm font-bold text-ink-primary">Strengths</p>
            </div>
            {editMode ? (
              <input
                className="input-base w-full text-xs"
                value={editStrengths}
                onChange={e => setEditStrengths(e.target.value)}
                placeholder="Comma-separated..."
              />
            ) : rep.strengths.length === 0 ? (
              <p className="text-xs text-ink-muted">No strengths recorded</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rep.strengths.map(s => (
                  <span key={s} className="text-xs bg-signal-green/10 text-signal-green border border-signal-green/20 px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            )}
          </div>

          {/* Gaps */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown size={14} className="text-signal-red" />
              <p className="text-sm font-bold text-ink-primary">Gaps</p>
            </div>
            {editMode ? (
              <input
                className="input-base w-full text-xs"
                value={editGaps}
                onChange={e => setEditGaps(e.target.value)}
                placeholder="Comma-separated..."
              />
            ) : rep.gaps.length === 0 ? (
              <p className="text-xs text-ink-muted">No gaps recorded</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rep.gaps.map(g => (
                  <span key={g} className="text-xs bg-signal-red/10 text-signal-red border border-signal-red/20 px-2 py-0.5 rounded-full">{g}</span>
                ))}
              </div>
            )}
          </div>

          {/* Manager Notes */}
          <div className="card p-5">
            <p className="text-sm font-bold text-ink-primary mb-3">Manager Notes</p>
            {editMode ? (
              <textarea
                className="input-base w-full resize-none text-xs"
                rows={4}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Notes about this rep..."
              />
            ) : (
              <p className="text-xs text-ink-secondary leading-relaxed">{rep.notes || 'No notes recorded'}</p>
            )}
          </div>

          {/* Tasks */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare size={14} className="text-ink-secondary" />
                <p className="text-sm font-bold text-ink-primary">Tasks</p>
                <span className="badge-neutral">{repTasks.filter(t => t.status !== 'completed').length} open</span>
              </div>
              <Link to="/tasks" className="btn-ghost text-xs"><Plus size={12} /></Link>
            </div>
            {repTasks.length === 0 ? (
              <p className="text-xs text-ink-muted">No tasks</p>
            ) : (
              <div className="space-y-2">
                {repTasks.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-2">
                    {t.status === 'completed'
                      ? <CheckCircle size={13} className="text-signal-green flex-shrink-0" />
                      : <AlertTriangle size={13} className={t.priority === 'urgent' ? 'text-signal-red flex-shrink-0' : 'text-signal-amber flex-shrink-0'} />
                    }
                    <p className={`text-xs flex-1 ${t.status === 'completed' ? 'text-ink-muted line-through' : 'text-ink-secondary'}`}>{t.title}</p>
                    {t.dueDate && t.status !== 'completed' && (
                      <span className="text-[10px] text-ink-muted">{fmtDate(t.dueDate)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Coaching Notes */}
        <div className="lg:col-span-2">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-accent-orange" />
                <p className="text-sm font-bold text-ink-primary">Coaching Notes</p>
                <span className="badge-neutral">{repNotes.length}</span>
              </div>
              <button onClick={() => setShowNoteForm(s => !s)} className="btn-primary text-xs">
                <Plus size={12} /> Add Note
              </button>
            </div>

            {showNoteForm && (
              <div className="bg-navy-600 rounded-xl p-4 border border-navy-500 mb-4 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {(['coaching', 'observation', 'recognition', 'follow-up'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setNoteForm(f => ({ ...f, type: t }))}
                      className={`px-2 py-1 rounded-lg text-xs font-medium capitalize ${noteForm.type === t ? 'bg-accent-orange text-white' : 'bg-navy-500 text-ink-muted hover:text-ink-secondary'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  className="input-base w-full resize-none text-xs"
                  rows={3}
                  placeholder="Coaching notes..."
                  value={noteForm.notes}
                  onChange={e => setNoteForm(f => ({ ...f, notes: e.target.value }))}
                />
                <input
                  className="input-base w-full text-xs"
                  placeholder="Behaviors observed (comma-separated)"
                  value={noteForm.behaviors}
                  onChange={e => setNoteForm(f => ({ ...f, behaviors: e.target.value }))}
                />
                <input
                  className="input-base w-full text-xs"
                  placeholder="Follow-up action"
                  value={noteForm.followUp}
                  onChange={e => setNoteForm(f => ({ ...f, followUp: e.target.value }))}
                />
                <input
                  className="input-base w-full text-xs"
                  type="date"
                  value={noteForm.followUpDue}
                  onChange={e => setNoteForm(f => ({ ...f, followUpDue: e.target.value }))}
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowNoteForm(false)} className="btn-secondary text-xs flex-1">Cancel</button>
                  <button onClick={submitNote} className="btn-primary text-xs flex-1">Save Note</button>
                </div>
              </div>
            )}

            {repNotes.length === 0 ? (
              <div className="py-8 text-center">
                <MessageSquare size={24} className="text-ink-muted mx-auto mb-2" />
                <p className="text-xs text-ink-secondary">No coaching notes yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(showAllNotes ? repNotes : repNotes.slice(0, 3)).map(note => (
                  <div
                    key={note.id}
                    className={`p-4 rounded-xl border ${note.type === 'recognition' ? 'border-signal-green/20 bg-signal-green/5' : note.type === 'coaching' ? 'border-accent-orange/20 bg-accent-orange/5' : 'border-navy-500 bg-navy-700'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full ${note.type === 'recognition' ? 'bg-signal-green/15 text-signal-green' : note.type === 'coaching' ? 'bg-accent-orange/15 text-accent-orange-light' : 'bg-navy-500 text-ink-secondary'}`}>
                          {note.type}
                        </span>
                        <span className="text-xs text-ink-muted">{fmtDate(note.date)}</span>
                        {note.status === 'open' && <span className="badge-amber text-[10px]">Open</span>}
                      </div>
                      {note.status === 'open' && (
                        <button
                          onClick={() => updateCoachingNote(note.id, { status: 'closed' })}
                          className="text-[10px] text-ink-muted hover:text-ink-secondary"
                        >
                          Close
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed">{note.notes}</p>
                    {note.behaviors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {note.behaviors.map(b => (
                          <span key={b} className="text-[10px] bg-navy-500 text-ink-muted px-1.5 py-0.5 rounded">{b}</span>
                        ))}
                      </div>
                    )}
                    {note.followUp && (
                      <p className="text-[11px] text-accent-blue-light mt-2">
                        → {note.followUp}{note.followUpDue ? ` (due ${fmtDate(note.followUpDue)})` : ''}
                      </p>
                    )}
                  </div>
                ))}
                {repNotes.length > 3 && (
                  <button
                    onClick={() => setShowAllNotes(s => !s)}
                    className="text-xs text-accent-blue-light hover:underline w-full text-center py-1"
                  >
                    {showAllNotes ? 'Show less' : `Show ${repNotes.length - 3} more`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Archive */}
      {modal?.type === 'archive' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-navy-700 border border-navy-500 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Archive size={16} className="text-signal-amber" />
                <h3 className="text-sm font-bold text-ink-primary">Archive Rep</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-ink-secondary mb-1">Archive <span className="font-semibold text-ink-primary">{rep.name}</span>?</p>
            <p className="text-xs text-ink-muted mb-5">They'll be hidden from the leaderboard. All data is preserved and can be restored at any time.</p>
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary text-xs flex-1">Cancel</button>
              <button onClick={handleArchive} className="flex-1 px-3 py-2 rounded-lg bg-signal-amber/20 text-signal-amber border border-signal-amber/30 text-xs font-semibold hover:bg-signal-amber/30 transition-colors">
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore */}
      {modal?.type === 'restore' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-navy-700 border border-navy-500 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RotateCcw size={16} className="text-signal-green" />
                <h3 className="text-sm font-bold text-ink-primary">Restore Rep</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-ink-secondary mb-5">Restore <span className="font-semibold text-ink-primary">{rep.name}</span> to active status? They'll reappear in the leaderboard.</p>
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary text-xs flex-1">Cancel</button>
              <button onClick={handleRestore} className="btn-primary text-xs flex-1">Restore</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      {modal?.type === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-navy-700 border border-navy-500 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-signal-red" />
                <h3 className="text-sm font-bold text-ink-primary">Delete Rep</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-signal-red font-semibold mb-1">This is permanent and cannot be undone.</p>
            <p className="text-xs text-ink-secondary mb-4">Type <span className="font-mono font-bold text-ink-primary">{rep.name}</span> to confirm deletion.</p>
            <input
              className="input-base w-full text-xs mb-4"
              placeholder={`Type "${rep.name}" to confirm`}
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary text-xs flex-1">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== rep.name}
                className="flex-1 px-3 py-2 rounded-lg bg-signal-red/20 text-signal-red border border-signal-red/30 text-xs font-semibold hover:bg-signal-red/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge */}
      {modal?.type === 'merge' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-navy-700 border border-navy-500 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GitMerge size={16} className="text-accent-blue-light" />
                <h3 className="text-sm font-bold text-ink-primary">Merge Rep</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-ink-secondary mb-1">Merge <span className="font-semibold text-ink-primary">{rep.name}</span> into another rep.</p>
            <p className="text-xs text-ink-muted mb-4">All daily performance data will move to the selected rep. {rep.name} will be archived.</p>
            <select
              className="input-base w-full text-xs mb-4"
              value={mergeTargetId}
              onChange={e => setMergeTargetId(e.target.value)}
            >
              <option value="">— Select primary rep —</option>
              {mergeTargets.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {mergeTargets.length === 0 && (
              <p className="text-xs text-signal-amber mb-4">No other active reps available to merge into.</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary text-xs flex-1">Cancel</button>
              <button
                onClick={handleMerge}
                disabled={!mergeTargetId}
                className="flex-1 px-3 py-2 rounded-lg bg-accent-blue/20 text-accent-blue-light border border-accent-blue/30 text-xs font-semibold hover:bg-accent-blue/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked */}
      {modal?.type === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-navy-700 border border-navy-500 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-signal-amber" />
                <h3 className="text-sm font-bold text-ink-primary">Cannot Delete</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-ink-secondary mb-5">{modal.reason}</p>
            <p className="text-xs text-ink-muted mb-4">Archive the rep instead to hide them from the leaderboard while preserving their data.</p>
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary text-xs flex-1">Close</button>
              <button
                onClick={() => setModal({ type: 'archive' })}
                className="flex-1 px-3 py-2 rounded-lg bg-signal-amber/20 text-signal-amber border border-signal-amber/30 text-xs font-semibold hover:bg-signal-amber/30 transition-colors"
              >
                Archive Instead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
