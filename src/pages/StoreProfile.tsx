import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Store, MapPin, Users, AlertTriangle,
  CheckCircle, Plus, Edit3, Save, Clock, Calendar,
  TrendingUp, TrendingDown,
  Archive, RotateCcw, Trash2, GitMerge, MoreVertical, X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { PerformanceTrendChart } from '../components/PerformanceTrendChart';
import {
  fmtPct, fmtCurrency, buildChartData, fmtDate, daysSince, fmt12h,
} from '../data/calculations';
import type { ChartDayData, Rep } from '../types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signalTextColor(signal: string) {
  if (signal === 'green') return 'text-signal-green';
  if (signal === 'amber') return 'text-signal-amber';
  if (signal === 'orange') return 'text-accent-orange';
  return 'text-signal-red';
}

function signalBorderTop(signal: string) {
  if (signal === 'green') return 'border-t-signal-green';
  if (signal === 'amber') return 'border-t-signal-amber';
  if (signal === 'orange') return 'border-t-accent-orange';
  return 'border-t-signal-red';
}

function getStoreStatus(pct: number, isRed: boolean) {
  if (isRed || pct < 60) return 'red';
  if (pct < 75) return 'watch';
  if (pct < 100) return 'on-track';
  return 'over-goal';
}

function StoreStatusBadge({ pct, isRed }: { pct: number; isRed: boolean }) {
  const s = getStoreStatus(pct, isRed);
  if (s === 'over-goal') return <span className="badge-green">Over Goal</span>;
  if (s === 'on-track') return <span className="badge-green">On Track</span>;
  if (s === 'watch') return <span className="badge-amber">Watch</span>;
  return <span className="badge-red">Red Status</span>;
}

// ─── Sortable table header ─────────────────────────────────────────────────────

type RepSortCol = 'name' | 'boxes' | 'attachments' | 'goal' | 'pct' | 'bp';

function RepSortHeader({
  col,
  label,
  current,
  dir,
  onSort,
}: {
  col: RepSortCol;
  label: string;
  current: RepSortCol;
  dir: 'asc' | 'desc';
  onSort: (c: RepSortCol) => void;
}) {
  const active = current === col;
  return (
    <th
      className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide cursor-pointer select-none hover:text-ink-secondary whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}
      {active ? (
        dir === 'asc' ? ' ▲' : ' ▼'
      ) : (
        <span className="opacity-30"> ▼</span>
      )}
    </th>
  );
}

// ─── Day sort ─────────────────────────────────────────────────────────────────

type DaySortCol = 'date' | 'rep' | 'boxes' | 'goal' | 'attachment' | 'pct';

function DaySortHeader({
  col,
  label,
  current,
  dir,
  onSort,
}: {
  col: DaySortCol;
  label: string;
  current: DaySortCol;
  dir: 'asc' | 'desc';
  onSort: (c: DaySortCol) => void;
}) {
  const active = current === col;
  return (
    <th
      className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide cursor-pointer select-none hover:text-ink-secondary whitespace-nowrap"
      onClick={() => onSort(col)}
    >
      {label}
      {active ? (dir === 'asc' ? ' ▲' : ' ▼') : <span className="opacity-30"> ▼</span>}
    </th>
  );
}

// ─── Modal types ──────────────────────────────────────────────────────────────

type StoreModal =
  | { type: 'archive' }
  | { type: 'restore' }
  | { type: 'delete' }
  | { type: 'merge' }
  | { type: 'blocked'; reason: string }
  | null;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoreProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    stores,
    storeSummaries,
    reps,
    repSummaries,
    dailyPerf,
    tasks,
    visits,
    updateStore,
    mergeStores,
    permanentDeleteStore,
    reportingPeriod,
  } = useData();

  const store = stores.find(s => s.id === id);
  const ss = storeSummaries.find(s => s.store.id === id);
  const storeReps = repSummaries.filter(r => r.rep.defaultStoreId === id);
  const storeVisits = visits
    .filter(v => v.storeId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const storeTasks = tasks.filter(t => t.storeId === id);

  // Store rank by attachmentPctToGoal
  const storeRank = useMemo(() => {
    const sorted = [...storeSummaries].sort(
      (a, b) => b.attachmentPctToGoal - a.attachmentPctToGoal,
    );
    const idx = sorted.findIndex(s => s.store.id === id);
    return idx >= 0 ? idx + 1 : null;
  }, [storeSummaries, id]);

  // Filter daily perf to current reporting period before building charts
  const periodDailyPerf = useMemo(
    () => dailyPerf.filter(d => {
      const [y, m] = d.date.split('-').map(Number);
      return y === reportingPeriod.year && m === reportingPeriod.month;
    }),
    [dailyPerf, reportingPeriod.month, reportingPeriod.year],
  );

  // Chart data
  const chartData: ChartDayData[] = useMemo(
    () => buildChartData(periodDailyPerf, undefined, id),
    [periodDailyPerf, id],
  );

  const defaultSelectedDate =
    chartData.length > 0 ? chartData[chartData.length - 1].date : undefined;

  const [selectedDate, setSelectedDate] = useState<string | undefined>(
    defaultSelectedDate,
  );

  // Rebuild chart data with selected date highlight
  const chartDataWithSelected: ChartDayData[] = useMemo(
    () => buildChartData(periodDailyPerf, undefined, id, selectedDate),
    [periodDailyPerf, id, selectedDate],
  );

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editNotes, setEditNotes] = useState(store?.notes ?? '');
  const [newEventNote, setNewEventNote] = useState('');

  // Per-day hours edit state
  type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  const DAY_LABELS_H: { key: DayKey; label: string }[] = [
    { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' },
    { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
  ];
  const [editHoursMode, setEditHoursMode] = useState(false);
  const initHoursData = () => {
    const dh = store?.dailyHours ?? {};
    const def = store?.hours ?? { open: '10:00', close: '20:00' };
    return Object.fromEntries(
      (['mon','tue','wed','thu','fri','sat','sun'] as DayKey[]).map(k => [
        k,
        { open: dh[k]?.open ?? def.open, close: dh[k]?.close ?? def.close, closed: dh[k]?.closed ?? false },
      ]),
    ) as Record<DayKey, { open: string; close: string; closed: boolean }>;
  };
  const [editHoursData, setEditHoursData] = useState<Record<DayKey, { open: string; close: string; closed: boolean }>>(initHoursData);

  const saveHours = () => {
    updateStore(store!.id, { dailyHours: editHoursData });
    setEditHoursMode(false);
  };
  const cancelHours = () => {
    setEditHoursData(initHoursData());
    setEditHoursMode(false);
  };
  const setDayHours = (key: DayKey, field: 'open' | 'close' | 'closed', val: string | boolean) => {
    setEditHoursData(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));
  };

  // Rep table sort
  const [repSortCol, setRepSortCol] = useState<RepSortCol>('pct');
  const [repSortDir, setRepSortDir] = useState<'asc' | 'desc'>('desc');

  const handleRepSort = (col: RepSortCol) => {
    if (repSortCol === col) {
      setRepSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRepSortCol(col);
      setRepSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  // Day table sort
  const [daySortCol, setDaySortCol] = useState<DaySortCol>('date');
  const [daySortDir, setDaySortDir] = useState<'asc' | 'desc'>('desc');

  const handleDaySort = (col: DaySortCol) => {
    if (daySortCol === col) {
      setDaySortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setDaySortCol(col);
      setDaySortDir('desc');
    }
  };

  // ── Management state ────────────────────────────────────────────────────────
  const [modal, setModal] = useState<StoreModal>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  if (!store) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/stores')}
          className="btn-ghost mb-4 flex items-center gap-2"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-ink-muted">Store not found.</p>
      </div>
    );
  }

  const isArchived = !store.active;

  const saveEdit = () => {
    updateStore(store.id, { notes: editNotes });
    setEditMode(false);
  };

  const addEventNote = () => {
    if (!newEventNote.trim()) return;
    const newNote = {
      id: Date.now().toString(),
      date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
      note: newEventNote,
    };
    updateStore(store.id, { eventNotes: [...store.eventNotes, newNote] });
    setNewEventNote('');
  };

  // ── Management handlers ─────────────────────────────────────────────────────
  const handleArchive = () => {
    updateStore(store.id, { active: false });
    setModal(null);
    navigate('/stores');
  };

  const handleRestore = () => {
    updateStore(store.id, { active: true });
    setModal(null);
  };

  const handleDelete = () => {
    if (deleteConfirm !== store.name) return;
    const result = permanentDeleteStore(store.id);
    if (!result.success) {
      setModal({ type: 'blocked', reason: result.reason ?? 'Cannot delete this store — linked data exists.' });
      setDeleteConfirm('');
    } else {
      setModal(null);
      navigate('/stores');
    }
  };

  const handleMerge = () => {
    if (!mergeTargetId) return;
    mergeStores(mergeTargetId, store.id);
    setModal(null);
    navigate(`/stores/${mergeTargetId}`);
  };

  const signalBorderT = ss ? signalBorderTop(ss.signal) : 'border-t-navy-500';
  const trendUp = ss ? ss.attachmentTrend > ss.attachmentGoal * 0.9 : false;

  // ── Selected day perf rows ─────────────────────────────────────────────────

  const selectedDayPerf = useMemo(() => {
    if (!selectedDate) return [];
    return dailyPerf.filter(
      dp => dp.date === selectedDate && dp.storeId === id,
    );
  }, [dailyPerf, selectedDate, id]);

  const selectedDayKpi = useMemo(() => {
    const totalAtt = selectedDayPerf.reduce((s, dp) => s + dp.attachment, 0);
    const totalBoxes = selectedDayPerf.reduce((s, dp) => s + dp.boxes, 0);
    const totalGoal = selectedDayPerf.reduce((s, dp) => s + dp.dailyGoal, 0);
    const pct = totalGoal > 0 ? Math.round((totalAtt / totalGoal) * 100) : 0;
    return { totalAtt, totalBoxes, totalGoal, pct };
  }, [selectedDayPerf]);

  const sortedDayPerf = useMemo(() => {
    const rows = [...selectedDayPerf].map(dp => {
      const rep = reps.find(r => r.id === dp.repId);
      const pct =
        dp.dailyGoal > 0
          ? Math.round((dp.attachment / dp.dailyGoal) * 100)
          : 0;
      return { ...dp, repName: rep?.name ?? dp.repId, repId: dp.repId, pct };
    });

    return rows.sort((a, b) => {
      let cmp = 0;
      if (daySortCol === 'date') cmp = a.date.localeCompare(b.date);
      else if (daySortCol === 'rep') cmp = a.repName.localeCompare(b.repName);
      else if (daySortCol === 'boxes') cmp = a.boxes - b.boxes;
      else if (daySortCol === 'goal') cmp = a.dailyGoal - b.dailyGoal;
      else if (daySortCol === 'attachment') cmp = a.attachment - b.attachment;
      else if (daySortCol === 'pct') cmp = a.pct - b.pct;
      return daySortDir === 'asc' ? cmp : -cmp;
    });
  }, [selectedDayPerf, reps, daySortCol, daySortDir]);

  // ── Rep perf aggregated for this store from dailyPerf ─────────────────────

  const repPerfAtStore = useMemo(() => {
    type StoreRepEntry = {
      repId: string;
      rep: Rep;
      attachment: number;
      boxes: number;
      goal: number;
      pct: number;
      bpPct: number;
      attHr?: number;
      isRed: boolean;
    };
    const map = new Map<string, { attachment: number; boxes: number; goal: number }>();
    for (const dp of periodDailyPerf.filter(dp => dp.storeId === id)) {
      const prev = map.get(dp.repId) ?? { attachment: 0, boxes: 0, goal: 0 };
      map.set(dp.repId, {
        attachment: prev.attachment + dp.attachment,
        boxes: prev.boxes + dp.boxes,
        goal: prev.goal + dp.dailyGoal,
      });
    }
    const result: StoreRepEntry[] = [];
    for (const [repId, totals] of map.entries()) {
      const rep = reps.find(r => r.id === repId);
      if (!rep) continue;
      const rs = repSummaries.find(r => r.rep.id === repId);
      const pct = totals.goal > 0 ? Math.round((totals.attachment / totals.goal) * 100) : 0;
      result.push({
        repId,
        rep,
        attachment: totals.attachment,
        boxes: totals.boxes,
        goal: totals.goal,
        pct,
        bpPct: rs?.bpPct ?? 0,
        attHr: rs?.attHr,
        isRed: rs?.isRed ?? false,
      });
    }
    return result;
  }, [dailyPerf, id, reps, repSummaries]);

  // ── Store Highlights ───────────────────────────────────────────────────────

  const highlights = useMemo(() => {
    const topPerformer =
      repPerfAtStore.length > 0
        ? repPerfAtStore.reduce((best, r) => r.attachment > best.attachment ? r : best)
        : null;

    const storeDayData = chartData.filter(d => d.attachment > 0);
    const bestDay =
      storeDayData.length > 0
        ? storeDayData.reduce((best, d) => (d.pctToGoal > best.pctToGoal ? d : best))
        : null;
    const worstDay =
      storeDayData.length > 0
        ? storeDayData.reduce((worst, d) => (d.pctToGoal < worst.pctToGoal ? d : worst))
        : null;

    const repsAtGoal = repPerfAtStore.filter(r => r.pct >= 100).length;
    const repsNeedCoaching = repPerfAtStore.filter(r => r.isRed).length;

    let biggestImprovement: { dayLabel: string; change: number } | null = null;
    if (chartData.length >= 2) {
      let maxChange = -Infinity;
      let maxLabel = '';
      for (let i = 1; i < chartData.length; i++) {
        const change = chartData[i].pctToGoal - chartData[i - 1].pctToGoal;
        if (change > maxChange) {
          maxChange = change;
          maxLabel = chartData[i].dayLabel;
        }
      }
      if (maxChange > 0) {
        biggestImprovement = { dayLabel: maxLabel, change: maxChange };
      }
    }

    return { topPerformer, bestDay, worstDay, repsAtGoal, repsNeedCoaching, biggestImprovement };
  }, [repPerfAtStore, chartData]);

  // ── Rep performance table ──────────────────────────────────────────────────

  const sortedReps = useMemo(() => {
    return [...repPerfAtStore].sort((a, b) => {
      let cmp = 0;
      if (repSortCol === 'name') cmp = a.rep.name.localeCompare(b.rep.name);
      else if (repSortCol === 'boxes') cmp = a.boxes - b.boxes;
      else if (repSortCol === 'attachments') cmp = a.attachment - b.attachment;
      else if (repSortCol === 'goal') cmp = a.goal - b.goal;
      else if (repSortCol === 'pct') cmp = a.pct - b.pct;
      else if (repSortCol === 'bp') cmp = a.bpPct - b.bpPct;
      return repSortDir === 'asc' ? cmp : -cmp;
    });
  }, [repPerfAtStore, repSortCol, repSortDir]);

  // Merge target options — active stores except current
  const mergeTargets = stores.filter(s => s.active && s.id !== store.id);

  // Prev / next navigation
  const sortedStoreIds = useMemo(
    () => [...stores].filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name)).map(s => s.id),
    [stores],
  );
  const currentStoreIdx = sortedStoreIds.indexOf(store.id);
  const prevStoreId = currentStoreIdx > 0 ? sortedStoreIds[currentStoreIdx - 1] : null;
  const nextStoreId = currentStoreIdx < sortedStoreIds.length - 1 ? sortedStoreIds[currentStoreIdx + 1] : null;

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">

      {/* ── Archived Banner ── */}
      {isArchived && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-signal-amber/10 border border-signal-amber/30">
          <div className="flex items-center gap-2">
            <Archive size={15} className="text-signal-amber flex-shrink-0" />
            <p className="text-sm font-semibold text-signal-amber">This store is archived</p>
            <p className="text-xs text-ink-muted">Performance data is preserved. The store won't appear in the leaderboard.</p>
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
            <button onClick={() => navigate('/stores')} className="btn-ghost p-2" title="All Stores">
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={() => prevStoreId && navigate(`/stores/${prevStoreId}`)}
              disabled={!prevStoreId}
              className="btn-ghost p-2 disabled:opacity-30 disabled:cursor-not-allowed"
              title={prevStoreId ? 'Previous store' : undefined}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => nextStoreId && navigate(`/stores/${nextStoreId}`)}
              disabled={!nextStoreId}
              className="btn-ghost p-2 disabled:opacity-30 disabled:cursor-not-allowed"
              title={nextStoreId ? 'Next store' : undefined}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Store size={18} className="text-ink-secondary" />
              <h1 className="text-xl font-bold text-ink-primary">{store.name}</h1>
              {ss && <StoreStatusBadge pct={ss.attachmentPctToGoal} isRed={ss.isRed} />}
              {isArchived && <span className="badge-neutral">Archived</span>}
              {storeRank && (
                <span className="badge-neutral">Rank #{storeRank}</span>
              )}
              {ss && (trendUp ? (
                <TrendingUp size={14} className="text-signal-green" />
              ) : (
                <TrendingDown size={14} className="text-signal-red" />
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-muted flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {store.address}, {store.city}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} /> {fmt12h(store.hours.open)}–{fmt12h(store.hours.close)}
              </span>
              {ss?.lastVisitDate && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} /> Last visit:{' '}
                  {fmtDate(ss.lastVisitDate)} (
                  {daysSince(ss.lastVisitDate)}d ago)
                </span>
              )}
            </div>
            {storeReps.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <Users size={11} className="text-ink-muted" />
                {storeReps.map((rs, idx) => (
                  <span key={rs.rep.id} className="text-xs text-ink-muted">
                    <Link
                      to={`/reps/${rs.rep.id}`}
                      className="hover:text-ink-secondary transition-colors"
                    >
                      {rs.rep.name}
                    </Link>
                    {idx < storeReps.length - 1 && ','}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {!isArchived && (
            <>
              <button
                onClick={() => {
                  setEditMode(e => !e);
                  setEditNotes(store.notes);
                }}
                className="btn-secondary text-xs flex items-center gap-1"
              >
                <Edit3 size={14} /> {editMode ? 'Cancel' : 'Edit Notes'}
              </button>
              {editMode && (
                <button
                  onClick={saveEdit}
                  className="btn-primary text-xs flex items-center gap-1"
                >
                  <Save size={14} /> Save
                </button>
              )}
              <Link to="/visits" className="btn-primary text-xs flex items-center gap-1">
                <Plus size={14} /> Log Visit
              </Link>
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
                      <Archive size={13} /> Archive Store
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
                    <RotateCcw size={13} /> Restore Store
                  </button>
                )}
                <div className="border-t border-navy-600 my-1" />
                <button
                  onClick={() => { setDeleteConfirm(''); setModal({ type: 'delete' }); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-signal-red hover:bg-navy-600 transition-colors text-left"
                >
                  <Trash2 size={13} /> Delete Store
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 1: MTD KPI Cards (8) ── */}
      {ss && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="card p-4 border-t-2 border-t-accent-orange col-span-1">
            <p className="metric-label mb-1">MTD Att</p>
            <p className="text-xl font-bold text-ink-primary">
              {fmtCurrency(ss.mtdAttachments)}
            </p>
          </div>
          <div className="card p-4 border-t-2 border-t-navy-400">
            <p className="metric-label mb-1">Goal</p>
            <p className="text-xl font-bold text-ink-primary">
              {fmtCurrency(ss.attachmentGoal)}
            </p>
          </div>
          <div className={`card p-4 border-t-2 ${signalBorderT}`}>
            <p className="metric-label mb-1">Trend</p>
            <p className={`text-xl font-bold ${signalTextColor(ss.signal)}`}>
              {fmtCurrency(ss.attachmentTrend)}
            </p>
            <p className="text-[10px] text-ink-muted">Proj. EOM</p>
          </div>
          <div className={`card p-4 border-t-2 ${signalBorderT}`}>
            <p className="metric-label mb-1">% to Goal</p>
            <p className={`text-xl font-bold ${signalTextColor(ss.signal)}`}>
              {fmtPct(ss.attachmentPctToGoal)}
            </p>
            <p className="text-[10px] text-ink-muted">Trend-based</p>
          </div>
          <div className="card p-4 border-t-2 border-t-accent-blue">
            <p className="metric-label mb-1">MTD Boxes</p>
            <p className="text-xl font-bold text-ink-primary">{ss.mtdBoxes}</p>
          </div>
          <div
            className={`card p-4 border-t-2 ${ss.bpPct >= 75 ? 'border-t-signal-green' : 'border-t-signal-red'}`}
          >
            <p className="metric-label mb-1">BP%</p>
            <p
              className={`text-xl font-bold ${ss.bpPct >= 75 ? 'text-signal-green' : 'text-signal-red'}`}
            >
              {ss.bpPct}%
            </p>
          </div>
          <div
            className={`card p-4 border-t-2 ${ss.atuPct >= 65 ? 'border-t-signal-green' : 'border-t-signal-amber'}`}
          >
            <p className="metric-label mb-1">ATU%</p>
            <p
              className={`text-xl font-bold ${ss.atuPct >= 65 ? 'text-signal-green' : 'text-signal-amber'}`}
            >
              {ss.atuPct}%
            </p>
          </div>
          <div className="card p-4 border-t-2 border-t-navy-400">
            <p className="metric-label mb-1">Last Visit</p>
            {ss.lastVisitDate ? (
              <>
                <p className="text-sm font-bold text-ink-primary">
                  {fmtDate(ss.lastVisitDate)}
                </p>
                <p
                  className={`text-[10px] ${daysSince(ss.lastVisitDate) >= 7 ? 'text-signal-amber' : 'text-ink-muted'}`}
                >
                  {daysSince(ss.lastVisitDate)}d ago
                </p>
              </>
            ) : (
              <p className="text-sm font-bold text-signal-red">Never</p>
            )}
          </div>
        </div>
      )}

      {/* ── Section 2: Daily Numbers Chart ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-sm font-bold text-ink-primary">Daily Numbers</p>
          {selectedDate && (
            <p className="text-xs text-ink-muted">
              Selected:{' '}
              <span className="text-ink-secondary font-semibold">
                {fmtDate(selectedDate)}
              </span>{' '}
              — click a bar to drill down
            </p>
          )}
        </div>

        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-ink-muted text-sm">
            No daily performance data for this store.
          </div>
        ) : (
          <PerformanceTrendChart
            data={chartDataWithSelected}
            onSelectDate={setSelectedDate}
            height={260}
          />
        )}
      </div>

      {/* ── Section 3: Selected Day KPIs ── */}
      {selectedDate && (
        <div className="space-y-3">
          <p className="text-sm font-bold text-ink-primary">
            {fmtDate(selectedDate)} — Performance Snapshot
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 border-t-2 border-t-accent-orange">
              <p className="metric-label mb-1">Attachments</p>
              <p className="text-xl font-bold text-ink-primary">
                {fmtCurrency(selectedDayKpi.totalAtt)}
              </p>
            </div>
            <div className="card p-4 border-t-2 border-t-navy-400">
              <p className="metric-label mb-1">Goal</p>
              <p className="text-xl font-bold text-ink-primary">
                {fmtCurrency(selectedDayKpi.totalGoal)}
              </p>
            </div>
            <div
              className={`card p-4 border-t-2 ${selectedDayKpi.pct >= 100 ? 'border-t-signal-green' : selectedDayKpi.pct >= 75 ? 'border-t-signal-amber' : 'border-t-signal-red'}`}
            >
              <p className="metric-label mb-1">% to Goal</p>
              <p
                className={`text-xl font-bold ${selectedDayKpi.pct >= 100 ? 'text-signal-green' : selectedDayKpi.pct >= 75 ? 'text-signal-amber' : 'text-signal-red'}`}
              >
                {selectedDayKpi.pct}%
              </p>
            </div>
            <div className="card p-4 border-t-2 border-t-accent-blue">
              <p className="metric-label mb-1">Boxes</p>
              <p className="text-xl font-bold text-ink-primary">
                {selectedDayKpi.totalBoxes}
              </p>
            </div>
          </div>

          {sortedDayPerf.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 pt-3 pb-2 border-b border-navy-600">
                <p className="text-sm font-bold text-ink-primary">
                  Rep Detail — {fmtDate(selectedDate)}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-navy-600 bg-navy-800/60">
                    <tr>
                      <DaySortHeader col="date" label="Date" current={daySortCol} dir={daySortDir} onSort={handleDaySort} />
                      <DaySortHeader col="rep" label="Rep" current={daySortCol} dir={daySortDir} onSort={handleDaySort} />
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Store</th>
                      <DaySortHeader col="boxes" label="Boxes" current={daySortCol} dir={daySortDir} onSort={handleDaySort} />
                      <DaySortHeader col="goal" label="Goal" current={daySortCol} dir={daySortDir} onSort={handleDaySort} />
                      <DaySortHeader col="attachment" label="Attachment" current={daySortCol} dir={daySortDir} onSort={handleDaySort} />
                      <DaySortHeader col="pct" label="% to Goal" current={daySortCol} dir={daySortDir} onSort={handleDaySort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-700">
                    {sortedDayPerf.map(row => (
                      <tr key={row.id} className="hover:bg-navy-700/40 transition-colors">
                        <td className="px-3 py-2.5 text-xs text-ink-secondary">
                          {fmtDate(row.date)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link
                            to={`/reps/${row.repId}`}
                            className="text-sm font-semibold text-ink-primary hover:text-white transition-colors"
                          >
                            {row.repName}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-secondary">
                          {store.name}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-secondary">
                          {row.boxes}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-secondary">
                          {fmtCurrency(row.dailyGoal)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-secondary">
                          {fmtCurrency(row.attachment)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`text-xs font-bold ${row.pct >= 100 ? 'text-signal-green' : row.pct >= 75 ? 'text-signal-amber' : 'text-signal-red'}`}
                          >
                            {row.pct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 4: Store Highlights ── */}
      <div>
        <p className="text-sm font-bold text-ink-primary mb-3">Store Highlights</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-4 border-t-2 border-t-signal-green">
            <p className="metric-label mb-1">Top Performer</p>
            {highlights.topPerformer ? (
              <>
                <Link
                  to={`/reps/${highlights.topPerformer.rep.id}`}
                  className="text-sm font-bold text-ink-primary hover:text-white transition-colors block truncate"
                >
                  {highlights.topPerformer.rep.name}
                </Link>
                <p className="text-[10px] text-signal-green">
                  {fmtCurrency(highlights.topPerformer.attachment)} MTD
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-muted">No data</p>
            )}
          </div>
          <div className="card p-4 border-t-2 border-t-signal-green">
            <p className="metric-label mb-1">Best Day</p>
            {highlights.bestDay ? (
              <>
                <p className="text-sm font-bold text-ink-primary">
                  {highlights.bestDay.dayLabel}
                </p>
                <p className="text-[10px] text-signal-green">
                  {highlights.bestDay.pctToGoal}% to goal
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-muted">No data</p>
            )}
          </div>
          <div className="card p-4 border-t-2 border-t-signal-red">
            <p className="metric-label mb-1">Worst Day</p>
            {highlights.worstDay ? (
              <>
                <p className="text-sm font-bold text-ink-primary">
                  {highlights.worstDay.dayLabel}
                </p>
                <p className="text-[10px] text-signal-red">
                  {highlights.worstDay.pctToGoal}% to goal
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-muted">No data</p>
            )}
          </div>
          <div className="card p-4 border-t-2 border-t-signal-green">
            <p className="metric-label mb-1">Reps At Goal</p>
            <p className="text-2xl font-bold text-signal-green">
              {highlights.repsAtGoal}
            </p>
            <p className="text-[10px] text-ink-muted">of {repPerfAtStore.length}</p>
          </div>
          <div className="card p-4 border-t-2 border-t-signal-red">
            <p className="metric-label mb-1">Needs Coaching</p>
            <p
              className={`text-2xl font-bold ${highlights.repsNeedCoaching > 0 ? 'text-signal-red' : 'text-signal-green'}`}
            >
              {highlights.repsNeedCoaching}
            </p>
            <p className="text-[10px] text-ink-muted">Red flag reps</p>
          </div>
          <div className="card p-4 border-t-2 border-t-accent-blue">
            <p className="metric-label mb-1">Best Improvement</p>
            {highlights.biggestImprovement ? (
              <>
                <p className="text-sm font-bold text-ink-primary">
                  {highlights.biggestImprovement.dayLabel}
                </p>
                <p className="text-[10px] text-signal-green">
                  +{highlights.biggestImprovement.change}% DoD
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-muted">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 5: Rep Performance Table ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-navy-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-ink-secondary" />
            <p className="text-sm font-bold text-ink-primary">Rep Performance</p>
            <span className="badge-neutral">{repPerfAtStore.length}</span>
          </div>
        </div>
        {repPerfAtStore.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-muted">
            No performance data at this store yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-navy-600 bg-navy-800/60">
                <tr>
                  <RepSortHeader col="name" label="Rep" current={repSortCol} dir={repSortDir} onSort={handleRepSort} />
                  <RepSortHeader col="boxes" label="Boxes" current={repSortCol} dir={repSortDir} onSort={handleRepSort} />
                  <RepSortHeader col="attachments" label="Attachments" current={repSortCol} dir={repSortDir} onSort={handleRepSort} />
                  <RepSortHeader col="goal" label="Goal" current={repSortCol} dir={repSortDir} onSort={handleRepSort} />
                  <RepSortHeader col="pct" label="% to Goal" current={repSortCol} dir={repSortDir} onSort={handleRepSort} />
                  <RepSortHeader col="bp" label="BP%" current={repSortCol} dir={repSortDir} onSort={handleRepSort} />
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-ink-muted uppercase tracking-wide whitespace-nowrap">ATT/hr</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Coaching</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700">
                {sortedReps.map(rs => (
                  <tr
                    key={rs.rep.id}
                    className={`hover:bg-navy-700/40 transition-colors ${rs.isRed ? 'bg-signal-red/5' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/reps/${rs.rep.id}`}
                        className="text-sm font-semibold text-ink-primary hover:text-white transition-colors"
                      >
                        {rs.rep.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-secondary">
                      {rs.boxes}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-secondary">
                      {fmtCurrency(rs.attachment)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-secondary">
                      {fmtCurrency(rs.goal)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-sm font-bold ${rs.pct >= 100 ? 'text-signal-green' : rs.pct >= 75 ? 'text-signal-amber' : 'text-signal-red'}`}
                      >
                        {fmtPct(rs.pct)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`text-xs font-semibold ${rs.bpPct >= 75 ? 'text-signal-green' : 'text-signal-red'}`}
                      >
                        {rs.bpPct}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-ink-secondary">
                      {rs.attHr !== undefined ? fmtCurrency(rs.attHr) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {rs.isRed ? (
                        <span className="flex items-center gap-1 text-[10px] text-signal-amber">
                          <AlertTriangle size={10} /> Needed
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/reps/${rs.rep.id}`}
                        className="text-xs text-accent-blue-light hover:text-white transition-colors"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 6: Tasks + Visit History ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-ink-primary">Open Tasks</p>
            <Link to="/tasks" className="btn-ghost text-xs flex items-center gap-1">
              <Plus size={12} /> Add
            </Link>
          </div>
          {storeTasks.filter(t => t.status !== 'completed').length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <CheckCircle size={13} className="text-signal-green" />
              <span>No open tasks</span>
            </div>
          ) : (
            <div className="space-y-2">
              {storeTasks
                .filter(t => t.status !== 'completed')
                .map(t => (
                  <div key={t.id} className="flex items-start gap-2 text-xs">
                    <AlertTriangle
                      size={12}
                      className={
                        t.priority === 'urgent'
                          ? 'text-signal-red flex-shrink-0 mt-0.5'
                          : 'text-signal-amber flex-shrink-0 mt-0.5'
                      }
                    />
                    <div>
                      <p className="text-ink-secondary font-medium">{t.title}</p>
                      {t.dueDate && (
                        <p className="text-ink-muted text-[10px]">Due: {t.dueDate}</p>
                      )}
                    </div>
                    <span
                      className={`ml-auto text-[10px] font-semibold ${
                        t.priority === 'urgent'
                          ? 'text-signal-red'
                          : t.priority === 'high'
                          ? 'text-signal-amber'
                          : 'text-ink-muted'
                      }`}
                    >
                      {t.priority}
                    </span>
                  </div>
                ))}
            </div>
          )}
          {repPerfAtStore.some(rs => rs.isRed) && (
            <div className="mt-4 pt-3 border-t border-navy-600">
              <p className="text-xs font-semibold text-signal-amber mb-2 flex items-center gap-1">
                <AlertTriangle size={11} /> Coaching Needed
              </p>
              <div className="space-y-1">
                {repPerfAtStore
                  .filter(rs => rs.isRed)
                  .map(rs => (
                    <div
                      key={rs.rep.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <Link
                        to={`/reps/${rs.rep.id}`}
                        className="text-ink-secondary hover:text-ink-primary transition-colors"
                      >
                        {rs.rep.name}
                      </Link>
                      <span className="text-signal-red">
                        {fmtPct(rs.pct)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-accent-blue-light" />
              <p className="text-sm font-bold text-ink-primary">Visit History</p>
              <span className="badge-neutral">
                {storeVisits.filter(v => v.status === 'completed').length} completed
              </span>
            </div>
            <Link
              to="/visits"
              className="btn-ghost text-xs flex items-center gap-1"
            >
              <Plus size={12} /> Log
            </Link>
          </div>
          {storeVisits.length === 0 ? (
            <p className="text-xs text-ink-muted">No visits recorded</p>
          ) : (
            <div className="space-y-2">
              {storeVisits.slice(0, 5).map(v => (
                <div
                  key={v.id}
                  className={`p-2.5 rounded-xl border ${
                    v.status === 'planned'
                      ? 'border-accent-blue/20 bg-accent-blue/5'
                      : v.redFlagsFound.length > 0
                      ? 'border-signal-amber/20'
                      : 'border-navy-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-primary">
                      {v.date}
                    </p>
                    <span
                      className={`text-[10px] font-semibold ${
                        v.status === 'planned'
                          ? 'text-accent-blue-light'
                          : 'text-signal-green'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted">{v.visitType}</p>
                  {v.coachingCompleted && (
                    <p className="text-[10px] text-signal-green">Coaching completed</p>
                  )}
                  {v.redFlagsFound.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle size={10} className="text-signal-amber" />
                      <p className="text-[10px] text-signal-amber">
                        {v.redFlagsFound[0]}
                        {v.redFlagsFound.length > 1 &&
                          ` +${v.redFlagsFound.length - 1} more`}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 7: Store Hours ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-ink-secondary" />
            <p className="text-sm font-bold text-ink-primary">Store Hours</p>
          </div>
          {!isArchived && (
            <div className="flex gap-2">
              {editHoursMode ? (
                <>
                  <button onClick={cancelHours} className="btn-secondary text-xs !py-1 !px-2.5">Cancel</button>
                  <button onClick={saveHours} className="btn-primary text-xs !py-1 !px-2.5 flex items-center gap-1"><Save size={11} /> Save</button>
                </>
              ) : (
                <button onClick={() => { setEditHoursData(initHoursData()); setEditHoursMode(true); }} className="btn-secondary text-xs !py-1 !px-2.5 flex items-center gap-1">
                  <Edit3 size={11} /> Edit Hours
                </button>
              )}
            </div>
          )}
        </div>

        {editHoursMode ? (
          <div className="space-y-2">
            <p className="text-[11px] text-ink-muted mb-2">Override hours per day. Leave as default to use store default ({fmt12h(store.hours.open)}–{fmt12h(store.hours.close)}).</p>
            {DAY_LABELS_H.map(({ key, label }) => {
              const day = editHoursData[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-ink-secondary w-8 flex-shrink-0">{label}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={day.closed}
                      onChange={e => setDayHours(key, 'closed', e.target.checked)}
                      className="accent-signal-red w-3 h-3"
                    />
                    <span className="text-[11px] text-ink-muted">Closed</span>
                  </label>
                  {!day.closed && (
                    <>
                      <input
                        type="time"
                        value={day.open}
                        onChange={e => setDayHours(key, 'open', e.target.value)}
                        className="input-base !py-1 !px-2 text-xs w-28 flex-shrink-0"
                      />
                      <span className="text-ink-faint text-xs flex-shrink-0">–</span>
                      <input
                        type="time"
                        value={day.close}
                        onChange={e => setDayHours(key, 'close', e.target.value)}
                        className="input-base !py-1 !px-2 text-xs w-28 flex-shrink-0"
                      />
                    </>
                  )}
                  {day.closed && <span className="text-xs text-signal-red font-medium">Closed</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_LABELS_H.map(({ key, label }) => {
              const dh = store.dailyHours?.[key];
              const open  = dh?.open  ?? store.hours.open;
              const close = dh?.close ?? store.hours.close;
              const closed = dh?.closed ?? false;
              const isOverride = !!dh;
              return (
                <div key={key} className={`rounded-xl p-2 border text-center ${
                  closed ? 'bg-signal-red/5 border-signal-red/20' :
                  isOverride ? 'bg-accent-blue/5 border-accent-blue/20' :
                  'bg-navy-700 border-navy-600'
                }`}>
                  <p className="text-[10px] font-bold text-ink-muted mb-1">{label}</p>
                  {closed ? (
                    <p className="text-[10px] font-semibold text-signal-red">Closed</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-ink-primary tabular-nums">{fmt12h(open)}</p>
                      <p className="text-[10px] text-ink-muted tabular-nums">{fmt12h(close)}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 8: Notes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="text-sm font-bold text-ink-primary mb-3">Manager Notes</p>
          {editMode ? (
            <textarea
              className="input-base w-full resize-none text-xs"
              rows={5}
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
            />
          ) : (
            <p className="text-xs text-ink-secondary leading-relaxed whitespace-pre-wrap">
              {store.notes || 'No notes recorded'}
            </p>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-ink-secondary" />
            <p className="text-sm font-bold text-ink-primary">Event Notes</p>
          </div>
          {store.eventNotes.length > 0 ? (
            <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
              {store.eventNotes.map(en => (
                <div
                  key={en.id}
                  className="text-xs text-ink-secondary p-2 bg-navy-700 rounded-lg border border-navy-500"
                >
                  <p className="text-ink-muted mb-0.5 text-[10px]">{en.date}</p>
                  <p>{en.note}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted mb-3">No event notes</p>
          )}
          <div className="flex gap-2">
            <input
              className="input-base flex-1 text-xs"
              placeholder="Add event note..."
              value={newEventNote}
              onChange={e => setNewEventNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEventNote()}
            />
            <button
              onClick={addEventNote}
              className="btn-primary text-xs px-3 flex items-center gap-1"
            >
              <Plus size={12} />
            </button>
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
                <h3 className="text-sm font-bold text-ink-primary">Archive Store</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-ink-secondary mb-1">Archive <span className="font-semibold text-ink-primary">{store.name}</span>?</p>
            <p className="text-xs text-ink-muted mb-5">The store will be hidden from the leaderboard. All data is preserved and can be restored at any time.</p>
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
                <h3 className="text-sm font-bold text-ink-primary">Restore Store</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-ink-secondary mb-5">Restore <span className="font-semibold text-ink-primary">{store.name}</span> to active status? It'll reappear in the leaderboard.</p>
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
                <h3 className="text-sm font-bold text-ink-primary">Delete Store</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-signal-red font-semibold mb-1">This is permanent and cannot be undone.</p>
            <p className="text-xs text-ink-secondary mb-4">Type <span className="font-mono font-bold text-ink-primary">{store.name}</span> to confirm deletion.</p>
            <input
              className="input-base w-full text-xs mb-4"
              placeholder={`Type "${store.name}" to confirm`}
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary text-xs flex-1">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== store.name}
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
                <h3 className="text-sm font-bold text-ink-primary">Merge Store</h3>
              </div>
              <button onClick={() => setModal(null)} className="text-ink-muted hover:text-ink-primary"><X size={16} /></button>
            </div>
            <p className="text-xs text-ink-secondary mb-1">Merge <span className="font-semibold text-ink-primary">{store.name}</span> into another store.</p>
            <p className="text-xs text-ink-muted mb-4">All daily performance data will move to the selected store. {store.name} will be archived.</p>
            <select
              className="input-base w-full text-xs mb-4"
              value={mergeTargetId}
              onChange={e => setMergeTargetId(e.target.value)}
            >
              <option value="">— Select primary store —</option>
              {mergeTargets.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {mergeTargets.length === 0 && (
              <p className="text-xs text-signal-amber mb-4">No other active stores available to merge into.</p>
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
            <p className="text-xs text-ink-muted mb-4">Archive the store instead to hide it from the leaderboard while preserving its data.</p>
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
