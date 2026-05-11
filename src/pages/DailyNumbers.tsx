import { useState, useMemo } from 'react';
import {
  BarChart3, AlertTriangle, CheckCircle, TrendingUp, TrendingDown,
  ChevronLeft, ChevronRight, RefreshCw, ExternalLink,
  Award, MessageSquare, Search, Copy, BookOpen, Star,
  ArrowDown, ArrowUp, Minus, Building2, Sparkles, ClipboardList, Zap, Activity,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PerformanceTrendChart } from '../components/PerformanceTrendChart';
import { useData } from '../context/DataContext';
import { useSheetSync } from '../hooks/useSheetSync';
import { extractSpreadsheetId } from '../services/sheetsSync';
import {
  fmtCurrency, buildChartData, fmtDate, fmtDateFull,
} from '../data/calculations';
import type { DailyPerformance } from '../types';

// ─── Domain types ─────────────────────────────────────────────────────────────

type DailyStatus = 'winning' | 'watch' | 'urgent';
type RepDailyStatus = 'winning' | 'watch' | 'urgent' | 'zeroBoxes' | 'missingData';
type FilterStatus = 'all' | 'red' | 'zero' | 'below75' | 'atGoal' | 'aboveGoal';
type SortKey = 'rep' | 'store' | 'boxes' | 'goal' | 'attachment' | 'gap' | 'pct';
type SBFilter = 'all' | 'red' | 'winning' | 'zero';

interface StoreSummaryRow {
  storeId: string;
  storeName: string;
  attachment: number;
  goal: number;
  boxes: number;
  repCount: number;
  pct: number;
  gap: number;
  status: DailyStatus;
}

interface WinnerItem {
  key: string;
  repId: string;
  storeId: string;
  label: string;
  primaryValue: string;
  secondaryValue: string;
  iconType: 'att' | 'boxes' | 'pct';
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getDailyStatus(pct: number): DailyStatus {
  if (pct >= 100) return 'winning';
  if (pct >= 75) return 'watch';
  return 'urgent';
}

function getRepDailyStatus(row: DailyPerformance): RepDailyStatus {
  if (row.attachment === 0 && row.boxes === 0 && row.dailyGoal === 0) return 'missingData';
  if (row.boxes === 0) return 'zeroBoxes';
  if (row.attachmentPctToDaily >= 100) return 'winning';
  if (row.attachmentPctToDaily >= 75) return 'watch';
  return 'urgent';
}

function buildStoreBreakdown(
  entries: DailyPerformance[],
  stores: { id: string; name: string }[],
): StoreSummaryRow[] {
  const map = new Map<string, { att: number; goal: number; boxes: number; repIds: Set<string> }>();
  for (const e of entries) {
    const d = map.get(e.storeId) ?? { att: 0, goal: 0, boxes: 0, repIds: new Set<string>() };
    d.att += e.attachment;
    d.goal += e.dailyGoal;
    d.boxes += e.boxes;
    d.repIds.add(e.repId);
    map.set(e.storeId, d);
  }
  return Array.from(map.entries())
    .map(([storeId, d]) => {
      const pct = d.goal > 0 ? Math.round((d.att / d.goal) * 100) : 0;
      return {
        storeId,
        storeName: stores.find(s => s.id === storeId)?.name ?? storeId,
        attachment: d.att,
        goal: d.goal,
        boxes: d.boxes,
        repCount: d.repIds.size,
        pct,
        gap: d.goal - d.att,
        status: getDailyStatus(pct),
      };
    })
    .sort((a, b) => a.pct - b.pct);
}

function buildInsight(
  pct: number,
  entries: DailyPerformance[],
  reps: { id: string; name: string }[],
): string {
  if (entries.length === 0) return 'No entries for this date.';
  const sn = (id: string) => {
    const n = reps.find(r => r.id === id)?.name ?? id;
    const parts = n.split(', ');
    return parts.length > 1 ? `${parts[1].split(' ')[0]} ${parts[0]}` : n;
  };
  const below75 = entries.filter(e => e.attachmentPctToDaily < 75);
  const zeroBox = entries.filter(e => e.boxes === 0);
  const atGoal = entries.filter(e => e.attachmentPctToDaily >= 100);
  const topAtt = [...entries].sort((a, b) => b.attachment - a.attachment)[0];
  const topBox = [...entries].sort((a, b) => b.boxes - a.boxes)[0];

  const parts: string[] = [`District finished at ${pct}% to goal.`];
  if (atGoal.length > 0) parts.push(`${atGoal.length} rep${atGoal.length > 1 ? 's' : ''} hit goal.`);
  if (below75.length > 0) parts.push(`${below75.length} ${below75.length > 1 ? 'reps were' : 'rep was'} below 75%.`);
  if (topAtt && topAtt.attachment > 0) parts.push(`${sn(topAtt.repId)} led attachments at ${fmtCurrency(topAtt.attachment)}.`);
  if (topBox && topBox.boxes > 0 && topBox.repId !== topAtt?.repId)
    parts.push(`${sn(topBox.repId)} led with ${topBox.boxes} box${topBox.boxes !== 1 ? 'es' : ''}.`);
  if (zeroBox.length > 0) {
    const names = zeroBox.slice(0, 2).map(e => sn(e.repId)).join(', ');
    const more = zeroBox.length > 2 ? ` +${zeroBox.length - 2} more` : '';
    parts.push(`Verify box activity for ${names}${more}.`);
  }
  return parts.join(' ');
}

// ─── Status style maps ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<DailyStatus, string> = {
  winning: 'badge-green',
  watch: 'badge-amber',
  urgent: 'badge-red',
};
const STATUS_LABEL: Record<DailyStatus, string> = {
  winning: 'Winning', watch: 'Watch', urgent: 'Urgent',
};
const STATUS_TEXT: Record<DailyStatus, string> = {
  winning: 'text-signal-green', watch: 'text-signal-amber', urgent: 'text-signal-red',
};
const STATUS_DOT: Record<DailyStatus, string> = {
  winning: 'bg-signal-green glow-dot-green',
  watch: 'bg-signal-amber glow-dot-amber',
  urgent: 'bg-signal-red glow-dot-red',
};
const STATUS_HERO: Record<DailyStatus, string> = {
  winning: 'border-signal-green/40 bg-signal-green/5',
  watch: 'border-signal-amber/40 bg-signal-amber/5',
  urgent: 'border-signal-red/40 bg-signal-red/5',
};

const REP_STATUS_BADGE: Record<RepDailyStatus, { cls: string; label: string }> = {
  winning:     { cls: 'badge-green',   label: 'Winning' },
  watch:       { cls: 'badge-amber',   label: 'Watch' },
  urgent:      { cls: 'badge-red',     label: 'Urgent' },
  zeroBoxes:   { cls: 'badge-red',     label: 'Zero Boxes' },
  missingData: { cls: 'badge-neutral', label: 'Missing' },
};

function pctColor(pct: number): string {
  if (pct >= 100) return 'text-signal-green';
  if (pct >= 75) return 'text-signal-amber';
  return 'text-signal-red';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricTile({ label, value, sub, valueClass = 'text-ink-primary' }: {
  label: string; value: string | number; sub?: string; valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</span>
      <span className={`text-xl font-bold tabular-nums leading-tight ${valueClass}`}>{value}</span>
      {sub && <span className="text-[11px] text-ink-muted leading-tight">{sub}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DailyNumbers() {
  const { dailyPerf, reps, stores, settings, reportingPeriod } = useData();
  const { syncing, syncResult, syncError, doSync } = useSheetSync();

  // Only show daily entries that belong to the current reporting period month.
  const periodDailyPerf = useMemo(
    () => dailyPerf.filter(d => {
      const parts = d.date.split('-');
      return parseInt(parts[1]) === reportingPeriod.month && parseInt(parts[0]) === reportingPeriod.year;
    }),
    [dailyPerf, reportingPeriod.month, reportingPeriod.year],
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('pct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [storeFilter, setStoreFilter] = useState('');
  const [repFilter, setRepFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sbFilter, setSbFilter] = useState<SBFilter>('all');
  const [showBoxes, setShowBoxes] = useState(true);
  const [showGoal, setShowGoal] = useState(true);
  const [insightCopied, setInsightCopied] = useState(false);

  // ── Date navigation ────────────────────────────────────────────────────────
  const availableDates = useMemo(
    () => [...new Set(periodDailyPerf.map(d => d.date))].sort(),
    [periodDailyPerf],
  );
  const latestDate = availableDates[availableDates.length - 1] ?? '';
  const [selectedDate, setSelectedDate] = useState(latestDate || '2026-04-28');

  const currentDateIdx = availableDates.indexOf(selectedDate);
  const canGoPrev = currentDateIdx > 0;
  const canGoNext = currentDateIdx < availableDates.length - 1;
  const prevDate = canGoPrev ? availableDates[currentDateIdx - 1] : null;

  // ── Sync ───────────────────────────────────────────────────────────────────
  const spreadsheetId = settings.sheetsSpreadsheetId || extractSpreadsheetId(settings.sheetsUrl ?? '');
  const canSync = Boolean(spreadsheetId && settings.sheetsApiKey);
  const handleSync = () => { if (canSync) doSync(spreadsheetId, settings.sheetsApiKey!); };

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(
    () => buildChartData(periodDailyPerf, undefined, undefined, selectedDate),
    [periodDailyPerf, selectedDate],
  );

  // ── Selected day rows ──────────────────────────────────────────────────────
  const selectedDayRows = useMemo(
    () => periodDailyPerf.filter(d => d.date === selectedDate),
    [periodDailyPerf, selectedDate],
  );
  const dayAtt   = selectedDayRows.reduce((s, d) => s + d.attachment, 0);
  const dayGoal  = selectedDayRows.reduce((s, d) => s + d.dailyGoal, 0);
  const dayBoxes = selectedDayRows.reduce((s, d) => s + d.boxes, 0);
  const dayPct   = dayGoal > 0 ? Math.round((dayAtt / dayGoal) * 100) : 0;
  const dayGap   = dayGoal - dayAtt;
  const dayStatus = getDailyStatus(dayPct);
  const atGoalCount  = selectedDayRows.filter(d => d.attachmentPctToDaily >= 100).length;
  const below75Count = selectedDayRows.filter(d => d.attachmentPctToDaily < 75).length;

  // ── Prev day comparison ────────────────────────────────────────────────────
  const prevDayRows = useMemo(
    () => (prevDate ? periodDailyPerf.filter(d => d.date === prevDate) : []),
    [periodDailyPerf, prevDate],
  );
  const prevDayGoal = prevDayRows.reduce((s, d) => s + d.dailyGoal, 0);
  const prevDayAtt  = prevDayRows.reduce((s, d) => s + d.attachment, 0);
  const prevDayPct  = prevDayGoal > 0 ? Math.round((prevDayAtt / prevDayGoal) * 100) : 0;
  const vsYesterday = prevDate ? dayPct - prevDayPct : null;

  // ── MTD stats ──────────────────────────────────────────────────────────────
  const mtdData      = chartData.filter(d => d.date <= selectedDate);
  const mtdTotalAtt  = mtdData.reduce((s, d) => s + d.attachment, 0);
  const mtdTotalGoal = mtdData.reduce((s, d) => s + d.goal, 0);
  const mtdAvgPct    = mtdData.length > 0
    ? Math.round(mtdData.reduce((s, d) => s + d.pctToGoal, 0) / mtdData.length)
    : 0;
  const avgDailyGoal = mtdData.length > 0 ? mtdTotalGoal / mtdData.length : dayGoal;
  const selectedDayNum   = selectedDate ? parseInt(selectedDate.split('-')[2]) : 0;
  const daysRemaining    = Math.max(0, reportingPeriod.daysInMonth - selectedDayNum);
  const estimatedMonthlyGoal = avgDailyGoal * reportingPeriod.daysInMonth;
  const neededPerDay = daysRemaining > 0
    ? Math.max(0, Math.round((estimatedMonthlyGoal - mtdTotalAtt) / daysRemaining))
    : 0;

  // ── Chart insight chips ────────────────────────────────────────────────────
  const bestDay  = [...mtdData].sort((a, b) => b.pctToGoal - a.pctToGoal)[0];
  const worstDay = [...mtdData].sort((a, b) => a.pctToGoal - b.pctToGoal)[0];
  const daysBelowGoal  = mtdData.filter(d => d.pctToGoal < 75).length;
  const selectedDayRank = mtdData.length > 1
    ? [...mtdData].sort((a, b) => b.pctToGoal - a.pctToGoal).findIndex(d => d.date === selectedDate) + 1
    : 0;

  // ── Winners ────────────────────────────────────────────────────────────────
  const winners = useMemo((): WinnerItem[] => {
    if (selectedDayRows.length === 0) return [];
    const seen = new Set<string>();
    const result: WinnerItem[] = [];

    const topAtt = [...selectedDayRows].sort((a, b) => b.attachment - a.attachment)[0];
    if (topAtt && topAtt.attachment > 0) {
      result.push({
        key: 'att', repId: topAtt.repId, storeId: topAtt.storeId,
        label: 'Top Attachment',
        primaryValue: fmtCurrency(topAtt.attachment),
        secondaryValue: `${topAtt.attachmentPctToDaily}% to goal`,
        iconType: 'att',
      });
      seen.add(topAtt.repId);
    }
    const topBox = [...selectedDayRows].sort((a, b) => b.boxes - a.boxes)[0];
    if (topBox && topBox.boxes > 0 && !seen.has(topBox.repId)) {
      result.push({
        key: 'boxes', repId: topBox.repId, storeId: topBox.storeId,
        label: 'Most Boxes',
        primaryValue: `${topBox.boxes} box${topBox.boxes !== 1 ? 'es' : ''}`,
        secondaryValue: `${topBox.attachmentPctToDaily}% to goal`,
        iconType: 'boxes',
      });
      seen.add(topBox.repId);
    }
    const topPct = [...selectedDayRows]
      .filter(r => r.attachmentPctToDaily >= 100 && !seen.has(r.repId))
      .sort((a, b) => b.attachmentPctToDaily - a.attachmentPctToDaily)[0];
    if (topPct) {
      result.push({
        key: 'pct', repId: topPct.repId, storeId: topPct.storeId,
        label: 'Highest % to Goal',
        primaryValue: `${topPct.attachmentPctToDaily}%`,
        secondaryValue: fmtCurrency(topPct.attachment),
        iconType: 'pct',
      });
      seen.add(topPct.repId);
    }
    // Remaining reps at goal
    selectedDayRows
      .filter(r => r.attachmentPctToDaily >= 100 && !seen.has(r.repId))
      .sort((a, b) => b.attachment - a.attachment)
      .slice(0, 2)
      .forEach(r => {
        result.push({
          key: r.repId, repId: r.repId, storeId: r.storeId,
          label: 'At Goal',
          primaryValue: `${r.attachmentPctToDaily}%`,
          secondaryValue: fmtCurrency(r.attachment),
          iconType: 'pct',
        });
        seen.add(r.repId);
      });
    return result;
  }, [selectedDayRows]);

  // ── Coaching & recognition queues ──────────────────────────────────────────
  const coachingQueue = useMemo(
    () => [...selectedDayRows]
      .filter(r => r.attachmentPctToDaily < 75 || r.boxes === 0)
      .sort((a, b) => a.attachmentPctToDaily - b.attachmentPctToDaily),
    [selectedDayRows],
  );
  const recognitionQueue = useMemo(
    () => [...selectedDayRows]
      .filter(r => r.attachmentPctToDaily >= 100)
      .sort((a, b) => b.attachment - a.attachment),
    [selectedDayRows],
  );
  const verifyQueue = useMemo(
    () => selectedDayRows.filter(r => r.boxes === 0),
    [selectedDayRows],
  );

  // ── Store breakdown ────────────────────────────────────────────────────────
  const allStoreBreakdown = useMemo(
    () => buildStoreBreakdown(selectedDayRows, stores),
    [selectedDayRows, stores],
  );
  const filteredSB = useMemo(() => {
    switch (sbFilter) {
      case 'red':     return allStoreBreakdown.filter(s => s.status === 'urgent');
      case 'winning': return allStoreBreakdown.filter(s => s.status === 'winning');
      case 'zero':    return allStoreBreakdown.filter(s => s.boxes === 0);
      default:        return allStoreBreakdown;
    }
  }, [allStoreBreakdown, sbFilter]);

  // ── Insight text ───────────────────────────────────────────────────────────
  const insight = useMemo(
    () => buildInsight(dayPct, selectedDayRows, reps),
    [dayPct, selectedDayRows, reps],
  );

  // ── Filtered + sorted table rows ───────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let rows = [...selectedDayRows];

    switch (filterStatus) {
      case 'red':
      case 'below75': rows = rows.filter(r => r.attachmentPctToDaily < 75); break;
      case 'zero':    rows = rows.filter(r => r.boxes === 0); break;
      case 'atGoal':  rows = rows.filter(r => r.attachmentPctToDaily >= 100); break;
      case 'aboveGoal': rows = rows.filter(r => r.attachmentPctToDaily > 100); break;
    }
    if (storeFilter) rows = rows.filter(r => r.storeId === storeFilter);
    if (repFilter)   rows = rows.filter(r => r.repId === repFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => {
        const rn = reps.find(rep => rep.id === r.repId)?.name ?? '';
        const sn = stores.find(s => s.id === r.storeId)?.name ?? '';
        return rn.toLowerCase().includes(q) || sn.toLowerCase().includes(q);
      });
    }

    rows.sort((a, b) => {
      const m = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'rep': {
          const ra = reps.find(r => r.id === a.repId)?.name ?? '';
          const rb = reps.find(r => r.id === b.repId)?.name ?? '';
          return m * ra.localeCompare(rb);
        }
        case 'store': {
          const sa = stores.find(s => s.id === a.storeId)?.name ?? '';
          const sb = stores.find(s => s.id === b.storeId)?.name ?? '';
          return m * sa.localeCompare(sb);
        }
        case 'pct':        return m * (a.attachmentPctToDaily - b.attachmentPctToDaily);
        case 'gap':        return m * ((a.dailyGoal - a.attachment) - (b.dailyGoal - b.attachment));
        case 'attachment': return m * (a.attachment - b.attachment);
        case 'boxes':      return m * (a.boxes - b.boxes);
        case 'goal':       return m * (a.dailyGoal - b.dailyGoal);
        default: return 0;
      }
    });
    return rows;
  }, [selectedDayRows, filterStatus, storeFilter, repFilter, searchQuery, sortKey, sortDir, reps, stores]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const copyInsight = async () => {
    await navigator.clipboard.writeText(insight);
    setInsightCopied(true);
    setTimeout(() => setInsightCopied(false), 2000);
  };

  const repName   = (id: string) => reps.find(r => r.id === id)?.name ?? id;
  const storeName = (id: string) => stores.find(s => s.id === id)?.name ?? id;

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? (sortDir === 'asc'
          ? <ArrowUp size={9} className="text-accent-blue-light" />
          : <ArrowDown size={9} className="text-accent-blue-light" />)
      : <Minus size={9} className="opacity-25 text-ink-muted" />;

  const winnerIcon = (t: WinnerItem['iconType']) => {
    if (t === 'att')   return <TrendingUp size={14} className="text-signal-green" />;
    if (t === 'boxes') return <Star size={14} className="text-accent-blue-light" />;
    return <Award size={14} className="text-signal-green" />;
  };

  const monthLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-screen-2xl">

      {/* ── 1. HEADER ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <BarChart3 size={18} className="text-accent-blue-light" />
            <h1 className="text-xl font-bold text-ink-primary">Daily Numbers</h1>
          </div>
          <p className="text-sm text-ink-secondary">
            {monthLabel} · District performance by day
            {settings.lastSyncedAt && (
              <span className="text-ink-muted ml-2">
                · Synced {new Date(settings.lastSyncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSync && (
            <button onClick={handleSync} disabled={syncing} className="btn-secondary text-xs disabled:opacity-60">
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <Link to="/settings" className="btn-ghost text-xs">
            <ExternalLink size={12} /> Settings
          </Link>
        </div>
      </div>

      {syncError && (
        <div className="flex items-center gap-2 text-xs text-signal-red bg-signal-red/10 border border-signal-red/20 rounded-xl px-4 py-2">
          <AlertTriangle size={13} /> {syncError}
        </div>
      )}
      {syncResult && !syncError && (
        <div className="flex items-center gap-3 text-xs bg-signal-green/10 border border-signal-green/20 rounded-xl px-4 py-2">
          <CheckCircle size={13} className="text-signal-green" />
          <span className="text-signal-green font-semibold">Sync complete:</span>
          <span className="text-ink-secondary">
            {syncResult.rowsImported} imported · {syncResult.rowsUpdated} updated
            {syncResult.missingReps.length > 0 && ` · ${syncResult.missingReps.length} missing reps`}
          </span>
        </div>
      )}

      {/* ── 2. DATE + FILTER BAR ─────────────────────────────────────────── */}
      <div className="card-sm p-3 flex flex-wrap items-center gap-3">
        {/* Date navigation */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => canGoPrev && setSelectedDate(availableDates[currentDateIdx - 1])}
            disabled={!canGoPrev}
            className="p-1.5 rounded-lg bg-navy-600 hover:bg-navy-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft size={14} className="text-ink-secondary" />
          </button>
          <span className="text-sm font-bold text-ink-primary min-w-[96px] text-center">
            {selectedDate ? fmtDateFull(selectedDate) : '—'}
          </span>
          <button
            onClick={() => canGoNext && setSelectedDate(availableDates[currentDateIdx + 1])}
            disabled={!canGoNext}
            className="p-1.5 rounded-lg bg-navy-600 hover:bg-navy-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronRight size={14} className="text-ink-secondary" />
          </button>
          {selectedDate !== latestDate && latestDate && (
            <button onClick={() => setSelectedDate(latestDate)}
              className="text-[11px] text-accent-blue-light hover:underline ml-1">
              Latest →
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-navy-500 shrink-0 hidden sm:block" />

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ['all', 'All'],
            ['below75', 'Below 75%'],
            ['zero', 'Zero Boxes'],
            ['atGoal', 'At Goal'],
            ['aboveGoal', 'Above Goal'],
          ] as [FilterStatus, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilterStatus(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                filterStatus === v
                  ? 'bg-accent-blue/20 text-accent-blue-light border border-accent-blue/30'
                  : 'text-ink-muted hover:text-ink-secondary hover:bg-navy-600'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Store + Rep dropdowns */}
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={storeFilter}
            onChange={e => setStoreFilter(e.target.value)}
            className="input-base text-xs py-1 h-8 pr-7">
            <option value="">All Stores</option>
            {stores.filter(s => s.active).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={repFilter}
            onChange={e => setRepFilter(e.target.value)}
            className="input-base text-xs py-1 h-8 pr-7">
            <option value="">All Reps</option>
            {reps.filter(r => r.active).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── EMPTY STATE ───────────────────────────────────────────────────── */}
      {selectedDayRows.length === 0 ? (
        <div className="card p-16 text-center">
          <BarChart3 size={36} className="mx-auto mb-3 text-ink-muted opacity-30" />
          <p className="text-sm font-semibold text-ink-secondary">
            No data for {selectedDate ? fmtDate(selectedDate) : 'this date'}
          </p>
          <p className="text-xs text-ink-muted mt-1 mb-4">
            Sync from Google Sheets or select another date with the arrows above.
          </p>
          {canSync && (
            <button onClick={handleSync} disabled={syncing} className="btn-secondary text-xs mx-auto">
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── 3. DAILY PERFORMANCE PULSE ───────────────────────────────── */}
          <div className={`rounded-2xl border-2 p-5 ${STATUS_HERO[dayStatus]}`}>
            {/* Top row */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[dayStatus]}`} />
                  <span className={`text-xs font-bold uppercase tracking-widest ${STATUS_TEXT[dayStatus]}`}>
                    {STATUS_LABEL[dayStatus]}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-ink-primary leading-snug">
                  {fmtDateFull(selectedDate)} ·{' '}
                  {dayStatus === 'winning'
                    ? `District beat goal by ${fmtCurrency(Math.round(Math.abs(dayGap)))}`
                    : `District missed goal by ${fmtCurrency(Math.round(Math.abs(dayGap)))}`}
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link to="/tasks" className="btn-primary text-xs py-1.5 px-3">
                  <ClipboardList size={13} /> Build Coaching Plan
                </Link>
                <Link to="/" className="btn-secondary text-xs py-1.5 px-3">
                  <Zap size={13} /> Power Hour
                </Link>
                <button onClick={() => setFilterStatus('below75')} className="btn-secondary text-xs py-1.5 px-3">
                  <AlertTriangle size={13} /> Red Reps
                </button>
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-x-5 gap-y-4 pb-5 border-b border-white/10">
              <MetricTile label="Attachments"  value={fmtCurrency(dayAtt)}    valueClass="text-ink-primary" />
              <MetricTile label="Goal"         value={fmtCurrency(dayGoal)}   valueClass="text-ink-muted" />
              <MetricTile
                label="Gap"
                value={dayGap > 0 ? `-${fmtCurrency(Math.round(dayGap))}` : `+${fmtCurrency(Math.round(Math.abs(dayGap)))}`}
                valueClass={dayGap > 0 ? 'text-signal-red' : 'text-signal-green'}
              />
              <MetricTile label="% to Goal"   value={`${dayPct}%`}            valueClass={pctColor(dayPct)} />
              <MetricTile label="Boxes"        value={dayBoxes}                valueClass="text-accent-blue-light" />
              <MetricTile
                label="At Goal"
                value={`${atGoalCount}/${selectedDayRows.length}`}
                sub="reps hit 100%"
                valueClass={atGoalCount > 0 ? 'text-signal-green' : 'text-ink-secondary'}
              />
              <MetricTile
                label="Below 75%"
                value={below75Count}
                sub="need coaching"
                valueClass={below75Count > 0 ? 'text-signal-red' : 'text-signal-green'}
              />
            </div>

            {/* Context row */}
            <div className="flex flex-wrap gap-4 py-4 border-b border-white/10 text-xs">
              {vsYesterday !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-muted">vs {prevDate ? fmtDate(prevDate) : 'Yesterday'}:</span>
                  <span className={`font-semibold flex items-center gap-0.5 ${vsYesterday >= 0 ? 'text-signal-green' : 'text-signal-red'}`}>
                    {vsYesterday >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                    {Math.abs(vsYesterday)}%
                  </span>
                  <span className="text-ink-muted">({prevDayPct}%)</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-ink-muted">vs MTD avg:</span>
                <span className={`font-semibold ${dayPct >= mtdAvgPct ? 'text-signal-green' : 'text-signal-red'}`}>
                  {dayPct >= mtdAvgPct ? '+' : ''}{dayPct - mtdAvgPct}%
                </span>
                <span className="text-ink-muted">({mtdAvgPct}% avg)</span>
              </div>
              {daysRemaining > 0 && neededPerDay > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-muted">Needed/day to pace:</span>
                  <span className="font-semibold text-signal-amber">{fmtCurrency(neededPerDay)}</span>
                  <span className="text-ink-muted">({daysRemaining} days left)</span>
                </div>
              )}
              {winners[0] && (
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-muted">Best rep:</span>
                  <span className="font-semibold text-ink-primary">{repName(winners[0].repId).split(', ')[0]}</span>
                  <span className="text-ink-muted">{winners[0].primaryValue}</span>
                </div>
              )}
            </div>

            {/* Insight */}
            <div className="flex items-start gap-3 pt-4">
              <Sparkles size={14} className="text-accent-blue-light mt-0.5 shrink-0" />
              <p className="text-sm text-ink-secondary leading-relaxed flex-1">{insight}</p>
              <button onClick={copyInsight} className="btn-ghost text-xs py-1 px-2 shrink-0">
                <Copy size={12} />
                {insightCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* ── 4. DAILY ACTION QUEUE ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={15} className="text-accent-orange-light" />
              <h2 className="text-sm font-bold text-ink-primary">Daily Action Queue</h2>
              <span className="badge-neutral text-[10px]">{fmtDate(selectedDate)}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* COACH */}
              <div className="card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-signal-red" />
                  <span className="text-xs font-bold text-ink-primary uppercase tracking-wider">Coach</span>
                  {coachingQueue.length > 0 && (
                    <span className="badge-red text-[10px] ml-auto">{coachingQueue.length}</span>
                  )}
                </div>
                {coachingQueue.length === 0 ? (
                  <p className="text-xs text-ink-muted py-3 text-center">All reps above 75% today.</p>
                ) : (
                  coachingQueue.slice(0, 4).map(row => {
                    const rep = reps.find(r => r.id === row.repId);
                    const issue = row.boxes === 0
                      ? 'Zero boxes — confirm shift activity and sales process.'
                      : row.attachmentPctToDaily < 40
                        ? 'Very low attachment — review offer stack and close attempt.'
                        : 'Below 75% — review discovery, bundle, and BP close.';
                    return (
                      <div key={row.id} className="bg-navy-600 rounded-xl p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink-primary truncate">
                              {rep
                                ? <Link to={`/reps/${rep.id}`} className="hover:text-accent-blue-light hover:underline">{rep.name}</Link>
                                : row.repId}
                            </p>
                            <p className="text-[11px] text-ink-muted truncate">{storeName(row.storeId)}</p>
                          </div>
                          {row.boxes === 0
                            ? <span className="badge-red text-[10px] shrink-0">0 boxes</span>
                            : <span className={`text-xs font-bold shrink-0 ${pctColor(row.attachmentPctToDaily)}`}>{row.attachmentPctToDaily}%</span>}
                        </div>
                        <p className="text-[11px] text-ink-secondary leading-relaxed">{issue}</p>
                        <div className="flex gap-1.5">
                          <Link
                            to={rep ? `/reps/${rep.id}` : '/reps'}
                            className="flex-1 text-center text-[11px] font-semibold text-accent-orange-light bg-accent-orange/10 hover:bg-accent-orange/20 border border-accent-orange/20 rounded-lg py-1.5 transition-colors">
                            {row.boxes === 0 ? 'Verify Activity' : 'Coach Rep'}
                          </Link>
                          <Link to="/tasks" className="text-[11px] font-medium text-ink-muted hover:text-ink-secondary bg-navy-700 rounded-lg px-2.5 py-1.5 transition-colors">
                            Task
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
                {coachingQueue.length > 4 && (
                  <button onClick={() => setFilterStatus('below75')}
                    className="text-xs text-accent-blue-light hover:underline text-center mt-auto">
                    +{coachingQueue.length - 4} more — show all below
                  </button>
                )}
              </div>

              {/* RECOGNIZE */}
              <div className="card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Star size={14} className="text-signal-green" />
                  <span className="text-xs font-bold text-ink-primary uppercase tracking-wider">Recognize</span>
                  {recognitionQueue.length > 0 && (
                    <span className="badge-green text-[10px] ml-auto">{recognitionQueue.length}</span>
                  )}
                </div>
                {recognitionQueue.length === 0 ? (
                  <p className="text-xs text-ink-muted py-3 text-center">No reps at goal today.</p>
                ) : (
                  recognitionQueue.slice(0, 4).map(row => {
                    const rep = reps.find(r => r.id === row.repId);
                    return (
                      <div key={row.id} className="bg-navy-600 rounded-xl p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink-primary truncate">
                              {rep
                                ? <Link to={`/reps/${rep.id}`} className="hover:text-accent-blue-light hover:underline">{rep.name}</Link>
                                : row.repId}
                            </p>
                            <p className="text-[11px] text-ink-muted truncate">{storeName(row.storeId)}</p>
                          </div>
                          <span className="text-xs font-bold text-signal-green shrink-0">{row.attachmentPctToDaily}%</span>
                        </div>
                        <p className="text-[11px] text-ink-secondary">
                          {fmtCurrency(row.attachment)} attachments · {row.boxes} box{row.boxes !== 1 ? 'es' : ''}
                        </p>
                        <div className="flex gap-1.5">
                          <Link
                            to={rep ? `/reps/${rep.id}` : '/reps'}
                            className="flex-1 text-center text-[11px] font-semibold text-signal-green bg-signal-green/10 hover:bg-signal-green/20 border border-signal-green/20 rounded-lg py-1.5 transition-colors">
                            Recognize
                          </Link>
                          <Link to="/" className="text-[11px] font-medium text-ink-muted hover:text-ink-secondary bg-navy-700 rounded-lg px-2.5 py-1.5 transition-colors">
                            Share
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* VERIFY */}
              <div className="card p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-signal-amber" />
                  <span className="text-xs font-bold text-ink-primary uppercase tracking-wider">Verify / Follow Up</span>
                </div>

                {verifyQueue.length > 0 && (
                  <div className="bg-navy-600 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-ink-primary">Zero-Box Reps</p>
                        <p className="text-[11px] text-ink-muted">{verifyQueue.length} rep{verifyQueue.length !== 1 ? 's' : ''} · {fmtDate(selectedDate)}</p>
                      </div>
                      <span className="badge-red text-[10px] shrink-0">{verifyQueue.length}</span>
                    </div>
                    <p className="text-[11px] text-ink-secondary">Confirm shift activity, customer traffic, and sales process.</p>
                    <button
                      onClick={() => setFilterStatus('zero')}
                      className="w-full text-[11px] font-semibold text-signal-amber bg-signal-amber/10 hover:bg-signal-amber/20 border border-signal-amber/20 rounded-lg py-1.5 transition-colors">
                      View Zero-Box Reps
                    </button>
                  </div>
                )}

                {below75Count > 0 && (
                  <div className="bg-navy-600 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-ink-primary">Below 75%</p>
                        <p className="text-[11px] text-ink-muted">{below75Count} rep{below75Count !== 1 ? 's' : ''} need coaching</p>
                      </div>
                      <span className="badge-amber text-[10px] shrink-0">{below75Count}</span>
                    </div>
                    <p className="text-[11px] text-ink-secondary">Create a coaching queue and reach out before the next shift.</p>
                    <button
                      onClick={() => setFilterStatus('below75')}
                      className="w-full text-[11px] font-semibold text-accent-blue-light bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/20 rounded-lg py-1.5 transition-colors">
                      Build Coaching Queue
                    </button>
                  </div>
                )}

                {verifyQueue.length === 0 && below75Count === 0 && (
                  <p className="text-xs text-ink-muted py-3 text-center">No follow-up actions needed today.</p>
                )}

                {/* MTD pace bar */}
                <div className="bg-navy-600 rounded-xl p-3 space-y-1.5 mt-auto">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-primary">MTD Pace</p>
                    <span className={`text-xs font-bold ${pctColor(mtdAvgPct)}`}>{mtdAvgPct}%</span>
                  </div>
                  <div className="progress-rail">
                    <div
                      className={`h-full rounded-full transition-all ${
                        mtdAvgPct >= 100 ? 'bg-signal-green' : mtdAvgPct >= 75 ? 'bg-signal-amber' : 'bg-signal-red'
                      }`}
                      style={{ width: `${Math.min(100, mtdAvgPct)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-ink-muted">{mtdData.length} days tracked · {daysRemaining} remaining</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── 5. TREND CHART ────────────────────────────────────────────── */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-sm font-bold text-ink-primary">{monthLabel} · Daily Trend</p>
                <p className="text-xs text-ink-muted">Click a bar to change selected date</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGoal(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    showGoal
                      ? 'bg-signal-red/15 text-signal-red border-signal-red/30'
                      : 'text-ink-muted border-navy-500 hover:text-ink-secondary'
                  }`}>
                  <span className="w-4 inline-block border-t-2 border-dashed border-current" />
                  Goal
                </button>
                <button
                  onClick={() => setShowBoxes(v => !v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    showBoxes
                      ? 'bg-accent-blue/15 text-accent-blue-light border-accent-blue/30'
                      : 'text-ink-muted border-navy-500 hover:text-ink-secondary'
                  }`}>
                  <span className="w-4 h-0.5 inline-block bg-current rounded" />
                  Boxes
                </button>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 size={32} className="mx-auto mb-2 opacity-30 text-ink-muted" />
                  <p className="text-sm text-ink-muted">No data — sync from Google Sheets in Settings</p>
                </div>
              </div>
            ) : (
              <PerformanceTrendChart
                data={chartData}
                onSelectDate={setSelectedDate}
                height={260}
                showBoxes={showBoxes}
                showGoal={showGoal}
              />
            )}

            {/* Insight chips */}
            {chartData.length > 1 && (
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-navy-500">
                {bestDay && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingUp size={11} className="text-signal-green" />
                    <span className="text-ink-muted">Best day:</span>
                    <button onClick={() => setSelectedDate(bestDay.date)}
                      className="font-semibold text-signal-green hover:underline">
                      {fmtDate(bestDay.date)} ({bestDay.pctToGoal}%)
                    </button>
                  </div>
                )}
                {worstDay && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <TrendingDown size={11} className="text-signal-red" />
                    <span className="text-ink-muted">Weakest:</span>
                    <button onClick={() => setSelectedDate(worstDay.date)}
                      className="font-semibold text-signal-red hover:underline">
                      {fmtDate(worstDay.date)} ({worstDay.pctToGoal}%)
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs">
                  <Activity size={11} className="text-ink-muted" />
                  <span className="text-ink-muted">MTD avg:</span>
                  <span className={`font-semibold ${pctColor(mtdAvgPct)}`}>{mtdAvgPct}%</span>
                </div>
                {daysBelowGoal > 0 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <AlertTriangle size={11} className="text-signal-amber" />
                    <span className="text-ink-muted">Days below 75%:</span>
                    <span className="font-semibold text-signal-amber">{daysBelowGoal}</span>
                  </div>
                )}
                {selectedDayRank > 0 && mtdData.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Star size={11} className="text-ink-muted" />
                    <span className="text-ink-muted">Selected rank:</span>
                    <span className="font-semibold text-ink-primary">#{selectedDayRank} of {mtdData.length}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 6. WINNERS + COACHING QUEUE ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Winners */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Award size={15} className="text-signal-green" />
                <h3 className="text-sm font-bold text-ink-primary">Winners</h3>
                <span className="text-xs text-ink-muted">— {fmtDate(selectedDate)}</span>
              </div>
              {winners.length === 0 ? (
                <p className="text-xs text-ink-muted py-4 text-center">No reps hit goal today.</p>
              ) : (
                <div className="space-y-2">
                  {winners.map(w => {
                    const rep = reps.find(r => r.id === w.repId);
                    return (
                      <div key={w.key} className="flex items-center justify-between p-3 bg-navy-600 rounded-xl gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${
                            w.iconType === 'boxes' ? 'bg-accent-blue/20' : 'bg-signal-green/20'
                          }`}>
                            {winnerIcon(w.iconType)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink-primary truncate">
                              {rep
                                ? <Link to={`/reps/${rep.id}`} className="hover:text-accent-blue-light hover:underline">{rep.name}</Link>
                                : w.repId}
                            </p>
                            <p className="text-[11px] text-ink-muted truncate">{storeName(w.storeId)} · {w.label}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${w.iconType === 'boxes' ? 'text-accent-blue-light' : 'text-signal-green'}`}>
                            {w.primaryValue}
                          </p>
                          <p className="text-[11px] text-ink-muted">{w.secondaryValue}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Coaching Queue */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen size={15} className="text-signal-red" />
                <h3 className="text-sm font-bold text-ink-primary">Coaching Queue</h3>
                {coachingQueue.length > 0 && (
                  <span className="badge-red text-[10px] ml-auto">{coachingQueue.length} reps</span>
                )}
              </div>
              {coachingQueue.length === 0 ? (
                <p className="text-xs text-ink-muted py-4 text-center">All reps above 75% today.</p>
              ) : (
                <div className="space-y-2">
                  {coachingQueue.slice(0, 6).map(row => {
                    const rep = reps.find(r => r.id === row.repId);
                    const st = getRepDailyStatus(row);
                    const { cls, label } = REP_STATUS_BADGE[st];
                    return (
                      <div key={row.id} className="flex items-center justify-between p-3 bg-navy-600 rounded-xl gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink-primary truncate">
                            {rep
                              ? <Link to={`/reps/${rep.id}`} className="hover:text-accent-blue-light hover:underline">{rep.name}</Link>
                              : row.repId}
                          </p>
                          <p className="text-[11px] text-ink-muted truncate">{storeName(row.storeId)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className={`text-xs font-bold ${pctColor(row.attachmentPctToDaily)}`}>
                              {row.attachmentPctToDaily}%
                            </p>
                            <p className="text-[11px] text-ink-muted">{row.boxes} box{row.boxes !== 1 ? 'es' : ''}</p>
                          </div>
                          <span className={`${cls} text-[10px] hidden sm:inline-flex`}>{label}</span>
                        </div>
                      </div>
                    );
                  })}
                  {coachingQueue.length > 6 && (
                    <p className="text-[11px] text-ink-muted text-center pt-1">
                      +{coachingQueue.length - 6} more — see entries table below
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── 7. STORE BREAKDOWN ────────────────────────────────────────── */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Building2 size={15} className="text-accent-blue-light" />
                <h3 className="text-sm font-bold text-ink-primary">Store Breakdown</h3>
                <span className="text-xs text-ink-muted">— {fmtDate(selectedDate)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'red', 'winning', 'zero'] as SBFilter[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setSbFilter(v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      sbFilter === v
                        ? 'bg-navy-500 text-ink-primary'
                        : 'text-ink-muted hover:text-ink-secondary hover:bg-navy-600'
                    }`}>
                    {v === 'all' ? 'All' : v === 'red' ? 'Red Stores' : v === 'winning' ? 'Winning' : 'Zero Boxes'}
                  </button>
                ))}
              </div>
            </div>

            {filteredSB.length === 0 ? (
              <p className="text-xs text-ink-muted py-4 text-center">No stores match this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-muted border-b border-navy-500">
                      <th className="text-left py-2 pr-4 font-semibold">Store</th>
                      <th className="text-right py-2 pr-4 font-semibold whitespace-nowrap">Attachments</th>
                      <th className="text-right py-2 pr-4 font-semibold">Goal</th>
                      <th className="text-right py-2 pr-4 font-semibold">Gap</th>
                      <th className="text-right py-2 pr-4 font-semibold whitespace-nowrap">% to Goal</th>
                      <th className="text-right py-2 pr-4 font-semibold">Boxes</th>
                      <th className="text-right py-2 pr-4 font-semibold">Reps</th>
                      <th className="text-right py-2 pr-4 font-semibold">Status</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSB.map(sb => (
                      <tr key={sb.storeId}
                        className={`border-b border-navy-600 hover:bg-navy-700/40 transition-colors ${
                          sb.status === 'urgent' ? 'bg-signal-red/[0.03]' : ''
                        }`}>
                        <td className="py-2.5 pr-4">
                          <Link to={`/stores/${sb.storeId}`}
                            className="font-medium text-ink-primary hover:text-accent-blue-light hover:underline">
                            {sb.storeName}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 text-right font-medium text-ink-primary tabular-nums">
                          {fmtCurrency(sb.attachment)}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-ink-muted tabular-nums">
                          {fmtCurrency(sb.goal)}
                        </td>
                        <td className={`py-2.5 pr-4 text-right tabular-nums font-medium ${sb.gap > 0 ? 'text-signal-red' : 'text-signal-green'}`}>
                          {sb.gap > 0
                            ? `-${fmtCurrency(Math.round(sb.gap))}`
                            : `+${fmtCurrency(Math.round(Math.abs(sb.gap)))}`}
                        </td>
                        <td className={`py-2.5 pr-4 text-right font-bold tabular-nums ${pctColor(sb.pct)}`}>
                          {sb.pct}%
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {sb.boxes === 0
                            ? <span className="font-bold text-signal-red">0</span>
                            : <span className="text-ink-secondary">{sb.boxes}</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-ink-muted">{sb.repCount}</td>
                        <td className="py-2.5 pr-4 text-right">
                          <span className={`${STATUS_BADGE[sb.status]} text-[10px]`}>
                            {STATUS_LABEL[sb.status]}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <Link to={`/stores/${sb.storeId}`}
                            className={`text-[11px] hover:underline ${
                              sb.status === 'urgent'
                                ? 'text-accent-orange-light'
                                : sb.status === 'winning'
                                  ? 'text-signal-green'
                                  : 'text-ink-muted hover:text-ink-secondary'
                            }`}>
                            {sb.status === 'urgent' ? 'Plan Visit' : sb.status === 'winning' ? 'Recognize' : 'View'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 8. ENTRIES TABLE ──────────────────────────────────────────── */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare size={15} className="text-ink-secondary" />
                <h3 className="text-sm font-bold text-ink-primary">
                  {fmtDate(selectedDate)} Entries
                </h3>
                <span className="badge-neutral text-[10px]">
                  {filteredRows.length}{filteredRows.length !== selectedDayRows.length && ` / ${selectedDayRows.length}`}
                </span>
              </div>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  placeholder="Search rep or store…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="input-base text-xs pl-7 py-1.5 h-8 w-48"
                />
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-8">No entries match the current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-muted border-b border-navy-500">
                      {([
                        ['rep', 'Rep'],
                        ['store', 'Store'],
                        ['boxes', 'Boxes'],
                        ['goal', 'Goal'],
                        ['attachment', 'Attachments'],
                        ['gap', 'Gap'],
                        ['pct', '% to Goal'],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <th
                          key={key}
                          className="text-left py-2 pr-4 font-semibold cursor-pointer hover:text-ink-secondary select-none whitespace-nowrap"
                          onClick={() => handleSort(key)}>
                          <span className="flex items-center gap-1">{label} <SortIcon col={key} /></span>
                        </th>
                      ))}
                      <th className="py-2 pr-4 font-semibold text-left">Status</th>
                      <th className="py-2 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => {
                      const rep   = reps.find(r => r.id === row.repId);
                      const store = stores.find(s => s.id === row.storeId);
                      const st = getRepDailyStatus(row);
                      const { cls, label } = REP_STATUS_BADGE[st];
                      const gap = row.dailyGoal - row.attachment;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-navy-600 hover:bg-navy-700/40 transition-colors ${
                            st === 'urgent' || st === 'zeroBoxes' ? 'bg-signal-red/[0.03]' : ''
                          }`}>
                          <td className="py-2.5 pr-4 whitespace-nowrap font-medium">
                            {rep
                              ? <Link to={`/reps/${rep.id}`} className="text-ink-primary hover:text-accent-blue-light hover:underline">{rep.name}</Link>
                              : <span className="text-ink-muted">{row.repId}</span>}
                          </td>
                          <td className="py-2.5 pr-4 max-w-[160px]">
                            {store
                              ? <Link to={`/stores/${store.id}`} className="text-ink-secondary hover:text-accent-blue-light hover:underline truncate block">{store.name}</Link>
                              : <span className="text-ink-muted">{row.storeId}</span>}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums text-center">
                            {row.boxes === 0
                              ? <span className="font-bold text-signal-red">0</span>
                              : <span className="text-ink-secondary">{row.boxes}</span>}
                          </td>
                          <td className="py-2.5 pr-4 text-ink-muted tabular-nums">
                            {fmtCurrency(row.dailyGoal)}
                          </td>
                          <td className="py-2.5 pr-4 text-ink-primary font-medium tabular-nums">
                            {fmtCurrency(row.attachment)}
                          </td>
                          <td className={`py-2.5 pr-4 tabular-nums font-medium ${gap > 0 ? 'text-signal-red' : 'text-signal-green'}`}>
                            {gap > 0
                              ? `-${fmtCurrency(Math.round(gap))}`
                              : `+${fmtCurrency(Math.round(Math.abs(gap)))}`}
                          </td>
                          <td className={`py-2.5 pr-4 font-bold tabular-nums ${pctColor(row.attachmentPctToDaily)}`}>
                            {row.attachmentPctToDaily}%
                          </td>
                          <td className="py-2.5 pr-4">
                            <span className={`${cls} text-[10px]`}>{label}</span>
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {st === 'winning' ? (
                              <Link to={`/reps/${row.repId}`} className="text-[11px] text-signal-green hover:underline">Recognize</Link>
                            ) : st === 'zeroBoxes' ? (
                              <Link to={`/reps/${row.repId}`} className="text-[11px] text-signal-amber hover:underline">Verify</Link>
                            ) : st === 'missingData' ? (
                              <span className="text-[11px] text-ink-muted">Request EOD</span>
                            ) : (
                              <Link to={`/reps/${row.repId}`} className="text-[11px] text-accent-orange-light hover:underline">Coach</Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── SYNC FOOTER ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-ink-muted pb-2">
        <RefreshCw size={11} className={settings.sheetsConnected ? 'text-signal-green' : 'text-ink-muted'} />
        {settings.sheetsConnected ? (
          <span>
            Google Sheets connected
            {settings.lastSyncedAt && ` · Last sync: ${new Date(settings.lastSyncedAt).toLocaleString()}`}
          </span>
        ) : (
          <span>
            Google Sheets not connected —{' '}
            <Link to="/settings" className="text-accent-blue-light hover:underline">configure in Settings</Link>
          </span>
        )}
      </div>
    </div>
  );
}
