import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Zap, TrendingUp, AlertTriangle, CheckCircle, CheckSquare,
  MapPin, Users, ChevronRight, ChevronLeft, RefreshCw,
  Star, Clock, MessageSquare, ArrowUp, ArrowDown, Minus,
  Bot, Plus, Target, Activity, Copy, Calendar,
  MoreHorizontal, X, ChevronDown, FileText,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import type { CalendarEvent } from '../types';
import {
  fmtCurrency, fmtPct, calcDailyMovement, isOverdue,
} from '../data/calculations';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(isoStr: string): string {
  if (!isoStr || !isoStr.includes('T')) return 'All day';
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

function fmtShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type DistrictStatus = 'winning' | 'watch' | 'urgent';
type MetricStatus   = 'winning' | 'watch' | 'urgent' | 'neutral';

function getDistrictStatus(attPct: number, avgAtu: number, avgBp: number, redCount: number): DistrictStatus {
  if (attPct < 70 || avgAtu < 30 || redCount >= 4) return 'urgent';
  if (attPct < 90 || avgAtu < 50 || avgBp < 60)   return 'watch';
  return 'winning';
}

function genInsight(
  attPct: number, avgAtu: number, avgBp: number, daysLeft: number,
  repNames: string[], _storeNames: string[], atuGoal: number, bpGoal: number,
): string {
  const parts: string[] = [];
  if (attPct >= 90) {
    parts.push(`District is at ${fmtPct(attPct)} to attachment goal with ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining. Strong pace — protect the finish.`);
  } else {
    parts.push(`District is at ${fmtPct(attPct)} to attachment goal with ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining. ${(100 - attPct).toFixed(1)}% gap to close.`);
  }
  const gaps: string[] = [];
  if (avgAtu < atuGoal) gaps.push(`ATU at ${avgAtu}% vs ${atuGoal}% goal`);
  if (avgBp  < bpGoal)  gaps.push(`BP at ${avgBp}% vs ${bpGoal}% goal`);
  if (gaps.length) parts.push(`Biggest gap: ${gaps.join(', ')}.`);
  if (repNames.length) {
    const top = repNames.slice(0, 3).map(n => n.split(',')[0].trim()).join(', ');
    parts.push(`Focus coaching on ${top}${repNames.length > 3 ? ` +${repNames.length - 3} more` : ''}.`);
  }
  return parts.join(' ');
}

function genMessage(
  attPct: number, avgAtu: number, avgBp: number, daysLeft: number,
  atuGoal: number, bpGoal: number, repNames: string[], storeNames: string[],
): string {
  let focus: string;
  if (avgAtu < 40)            focus = `Today's focus: ATU is at ${avgAtu}% vs our ${atuGoal}% goal. Every eligible customer needs an Auto Top Up offer — no exceptions.`;
  else if (avgBp < bpGoal - 15) focus = `Today's focus: BP is at ${avgBp}% vs our ${bpGoal}% goal. Boost Protect must be offered on every activation, every time.`;
  else                         focus = `Today's focus: Attach on every box, offer BP every time, and push ATU on every eligible customer.`;
  const redPart = repNames.slice(0, 2).map(n => n.split(',')[0].trim()).concat(storeNames.slice(0, 1)).join(', ');
  const coda    = redPart ? ` ${redPart} — let's close the gap today.` : '';
  return `Team — we are at ${fmtPct(attPct)} to goal with ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining. ${focus}${coda} Managers, send updates at 3 PM with boxes, attachments, BP, and ATU numbers.`;
}

// ─── Shared mini components ───────────────────────────────────────────────────

function SignalDot({ signal }: { signal: string }) {
  const c = signal === 'green' ? 'bg-signal-green glow-dot-green' :
            signal === 'amber' ? 'bg-signal-amber glow-dot-amber' :
            signal === 'red'   ? 'bg-signal-red glow-dot-red'     : 'bg-accent-orange';
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c}`} />;
}

function PctBar({ pct, signal }: { pct: number; signal: string }) {
  const color = signal === 'green' ? 'bg-signal-green' :
                signal === 'amber' ? 'bg-signal-amber' :
                signal === 'red'   ? 'bg-signal-red'   : 'bg-accent-orange';
  return (
    <div className="flex-1 h-1.5 bg-navy-500 rounded-full overflow-hidden min-w-0">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

const STATUS_CHIP_CFG: Record<DistrictStatus | MetricStatus, { label: string; cls: string }> = {
  winning: { label: 'Winning', cls: 'badge-green'   },
  watch:   { label: 'Watch',   cls: 'badge-amber'   },
  urgent:  { label: 'Urgent',  cls: 'badge-red'     },
  neutral: { label: 'Info',    cls: 'badge-neutral' },
};
function StatusChip({ status, mini }: { status: DistrictStatus | MetricStatus; mini?: boolean }) {
  const cfg = STATUS_CHIP_CFG[status] ?? STATUS_CHIP_CFG.neutral;
  return <span className={`${cfg.cls}${mini ? ' !text-[10px] !px-1.5 !py-0.5' : ''}`}>{cfg.label}</span>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    repSummaries, storeSummaries, districtStats, visitStats,
    tasks, visits, dailyPerf, reps, settings, shifts, reportingPeriod,
    calendarEvents, googleTasks, coachingNotes, openPlanVisit, addTask,
  } = useData();

  const navigate = useNavigate();

  // ── UI state ───────────────────────────────────────────────────────────────
  const [msgTab, setMsgTab]                   = useState<'morning' | 'powerHour' | 'eod' | 'monthEnd'>('morning');
  const [copied, setCopied]                   = useState(false);
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);
  const [weekOffset, setWeekOffset]           = useState(0);
  const [selectedDay, setSelectedDay]         = useState<string | null>(null);
  const [glanceOpen, setGlanceOpen]           = useState(false);
  const [moreOpen, setMoreOpen]               = useState(false);
  const [quickTaskDate, setQuickTaskDate]     = useState<string | null>(null);
  const [quickTaskTitle, setQuickTaskTitle]   = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const moreRef                                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  // ── Date / time ────────────────────────────────────────────────────────────
  const _td = new Date();
  const todayStr    = `${_td.getFullYear()}-${String(_td.getMonth() + 1).padStart(2, '0')}-${String(_td.getDate()).padStart(2, '0')}`;
  const todayLabel  = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const monthName   = reportingPeriod.monthName;
  const daysElapsed = reportingPeriod.daysElapsed;
  const daysLeft    = Math.max(0, reportingPeriod.daysInMonth - daysElapsed);

  // ── Core derived data ──────────────────────────────────────────────────────
  const top5Reps    = [...repSummaries].sort((a, b) => b.attachmentPctToGoal - a.attachmentPctToGoal).slice(0, 5);
  const top5Stores  = [...storeSummaries].sort((a, b) => b.attachmentPctToGoal - a.attachmentPctToGoal).slice(0, 5);
  const repsInRed   = repSummaries.filter(r => r.isRed).sort((a, b) => a.attachmentPctToGoal - b.attachmentPctToGoal);
  const storesInRed = storeSummaries.filter(s => s.isRed).sort((a, b) => a.attachmentPctToGoal - b.attachmentPctToGoal);

  const openTasks    = tasks.filter(t => t.status !== 'completed');
  const urgentTasks  = openTasks.filter(t => t.priority === 'urgent');
  const overdueTasks = openTasks.filter(t => isOverdue(t.dueDate, t.status));

  const todayVisits    = visits.filter(v => v.date === todayStr && v.source !== 'demo');
  const todayPlanned   = todayVisits.filter(v => v.status === 'planned');
  const todayShifts    = shifts.filter(s => s.date === todayStr);
  const todayCalEvents = calendarEvents.filter(e =>
    e.source === 'google_calendar' && e.status !== 'cancelled' && e.start.startsWith(todayStr),
  );
  const calSynced = calendarEvents.some(e => e.source === 'google_calendar');

  const movement = calcDailyMovement(dailyPerf, reps, []);

  const { avgBpPct, avgAtuPct, avgRcPct, mtdAttachments, mtdBoxes, attachmentPctToGoal, totalGoal } = districtStats;
  const { completed: visitsCompleted, remaining: visitsRemaining, onPace: visitOnPace } = visitStats;

  const atuGoal = settings.atuGoal ?? 65;
  const bpGoal  = settings.bpGoal  ?? 75;

  const districtStatus = getDistrictStatus(attachmentPctToGoal, avgAtuPct, avgBpPct, repsInRed.length + storesInRed.length);
  const insight        = genInsight(attachmentPctToGoal, avgAtuPct, avgBpPct, daysLeft,
    repsInRed.map(r => r.rep.name), storesInRed.map(s => s.store.name), atuGoal, bpGoal);
  const morningMsg     = genMessage(attachmentPctToGoal, avgAtuPct, avgBpPct, daysLeft,
    atuGoal, bpGoal, repsInRed.map(r => r.rep.name), storesInRed.map(s => s.store.name));

  // ── Fix Before EOD items ───────────────────────────────────────────────────
  type FixItem = { id: string; title: string; detail: string; cta: string; path: string; sev: 'urgent' | 'watch' };
  const fixItems: FixItem[] = [];
  if (avgAtuPct < atuGoal)  fixItems.push({ id: 'atu',    title: 'ATU below goal',    detail: `${avgAtuPct}% vs ${atuGoal}% goal — ${atuGoal - avgAtuPct}% gap`,                    cta: 'Build ATU Push', path: '/messages', sev: avgAtuPct < atuGoal * 0.5 ? 'urgent' : 'watch' });
  if (avgBpPct  < bpGoal)   fixItems.push({ id: 'bp',     title: 'BP below goal',     detail: `${avgBpPct}% vs ${bpGoal}% goal — ${bpGoal - avgBpPct}% gap`,                        cta: 'Coach BP',       path: '/reps',     sev: avgBpPct < bpGoal * 0.75 ? 'urgent' : 'watch' });
  if (!visitOnPace)         fixItems.push({ id: 'visits', title: 'Visit pace behind', detail: `${visitsCompleted}/${settings.monthlyVisitGoal} MTD · ${visitsRemaining} needed`, cta: 'Plan Visit',     path: '/visits',   sev: visitsRemaining > 5 ? 'urgent' : 'watch' });
  urgentTasks.slice(0, 2).forEach(t => fixItems.push({ id: t.id, title: t.title, detail: `Due ${t.dueDate}`, cta: 'View Task', path: '/tasks', sev: 'urgent' }));

  // ── Priority coach items ───────────────────────────────────────────────────
  const coachItems = repsInRed.slice(0, 3).map(rs => ({
    id:     rs.rep.id,
    name:   rs.rep.name,
    metric: `${fmtPct(rs.attachmentPctToGoal)} to goal`,
    detail: `${rs.mtdBoxes} boxes · BP ${rs.bpPct}% · ATU ${rs.atuPct}%`,
    issue:  rs.bpPct === 0   ? 'No BP activity — coach protection pitch on every box.' :
            rs.atuPct < 20   ? 'ATU below 20% — coach Auto Top Up offer on eligibles.' :
                               'Below goal — coach attach per box using GREAT.',
    path:   `/reps/${rs.rep.id}`,
  }));
  const visitItems = storesInRed.filter(ss => !todayPlanned.some(v => v.storeId === ss.store.id)).slice(0, 3).map(ss => ({
    id:     ss.store.id,
    name:   ss.store.name,
    metric: `${fmtPct(ss.attachmentPctToGoal)} to goal`,
    detail: `RC ${ss.reportCardPct}% · BP ${ss.bpPct}% · ${ss.mtdBoxes} boxes`,
    issue:  'Red-zone store — plan a sales-focused GREAT observation visit.',
  }));

  // ── Message text ───────────────────────────────────────────────────────────
  const powerHourMsg = `Power hour is ON! Current standing: ${fmtPct(attachmentPctToGoal)} to goal. ${avgAtuPct < atuGoal ? `ATU needs to move — we're at ${avgAtuPct}% vs ${atuGoal}% goal. ` : ''}${avgBpPct < bpGoal ? `BP is at ${avgBpPct}% vs ${bpGoal}% goal — offer on every box. ` : ''}Every rep, every customer, every attach. Let's close strong!`;
  const eodMsg       = `EOD Update needed. Current numbers: ${fmtPct(attachmentPctToGoal)} to goal · ${mtdBoxes} boxes · BP ${avgBpPct}% · ATU ${avgAtuPct}%. Managers, submit final counts by close. ${repsInRed.length > 0 ? `Coaching notes needed for: ${repsInRed.slice(0, 2).map(r => r.rep.name.split(',')[0].trim()).join(', ')}.` : 'Great effort today, team.'}`;
  const monthEndMsg  = `Month-end push — we are at ${fmtPct(attachmentPctToGoal)} to goal with ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining.${!visitOnPace ? ` Visit pace is behind — ${visitsRemaining} visits still needed.` : ''} Every store, every rep, finish strong. Let's protect the rank.`;
  const currentMsg   = msgTab === 'morning' ? morningMsg : msgTab === 'powerHour' ? powerHourMsg : msgTab === 'eod' ? eodMsg : monthEndMsg;

  const copyMessage = () => {
    navigator.clipboard?.writeText(currentMsg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  // ── Week at a Glance data ──────────────────────────────────────────────────
  const weekStart = useMemo(() => {
    const d = getWeekMonday(new Date());
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart],
  );

  interface WeekDayData {
    date: Date; dateStr: string; dayShort: string; dateLabel: string;
    calItems:   { id: string; label: string; time: string }[];
    taskItems:  { id: string; label: string; urgent: boolean }[];
    visitItems: { id: string; label: string }[];
    isToday: boolean; isPast: boolean;
  }

  const weekData = useMemo((): WeekDayData[] =>
    weekDays.map(date => {
      const ds = toDateStr(date);
      return {
        date, dateStr: ds,
        dayShort:  date.toLocaleDateString('en-US', { weekday: 'short' }),
        dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calItems: calendarEvents
          .filter(e => e.source === 'google_calendar' && e.status !== 'cancelled' && e.start.startsWith(ds))
          .map(e => ({ id: e.id, label: e.title, time: fmtTime(e.start) }))
          .sort((a, b) => a.time.localeCompare(b.time)),
        taskItems: [
          ...tasks.filter(t => t.status !== 'completed' && t.dueDate === ds)
            .map(t => ({ id: t.id, label: t.title, urgent: t.priority === 'urgent' || isOverdue(t.dueDate, t.status) })),
          ...googleTasks.filter(t => t.status !== 'completed' && t.dueDate === ds)
            .map(t => ({ id: t.id, label: t.title, urgent: false })),
        ],
        visitItems: visits
          .filter(v => v.date === ds && v.source !== 'demo')
          .map(v => {
            const ss = storeSummaries.find(s => s.store.id === v.storeId);
            return { id: v.id, label: ss?.store.name ?? v.storeId };
          }),
        isToday: ds === todayStr,
        isPast:  ds < todayStr,
      };
    }),
    [weekDays, calendarEvents, googleTasks, tasks, visits, storeSummaries, todayStr],
  );

  const selectedDayData = useMemo(() => weekData.find(d => d.dateStr === selectedDay) ?? null, [weekData, selectedDay]);

  const weekHasAnyData = weekData.some(d => d.calItems.length + d.taskItems.length + d.visitItems.length > 0);

  // ── Month at a Glance data ─────────────────────────────────────────────────
  const monthEndStr = useMemo(() => {
    const d = new Date(reportingPeriod.year, reportingPeriod.month, 0);
    return toDateStr(d);
  }, [reportingPeriod]);

  const reportingMonthPrefix = `${reportingPeriod.year}-${String(reportingPeriod.month).padStart(2, '0')}`;

  const upcomingCalEvents = useMemo(() =>
    calendarEvents.filter(e =>
      e.source === 'google_calendar' && e.status !== 'cancelled' &&
      e.start >= todayStr && e.start.startsWith(reportingMonthPrefix),
    ).slice(0, 6),
    [calendarEvents, todayStr, reportingMonthPrefix],
  );

  const upcomingTasksDue = useMemo(() => [
    ...tasks.filter(t => t.status !== 'completed' && t.dueDate >= todayStr && t.dueDate <= monthEndStr)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5),
    ...googleTasks.filter(t => t.status !== 'completed' && t.dueDate != null && t.dueDate >= todayStr && t.dueDate <= monthEndStr)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')).slice(0, 3),
  ], [tasks, googleTasks, todayStr, monthEndStr]);

  const storesNotVisitedThisMonth = useMemo(() => {
    const visitedIds = new Set(
      visits.filter(v => {
        const [y, m] = v.date.split('-').map(Number);
        return y === reportingPeriod.year && m === reportingPeriod.month && v.status === 'completed' && v.source !== 'demo';
      }).map(v => v.storeId),
    );
    return storeSummaries.filter(ss => !visitedIds.has(ss.store.id)).slice(0, 4);
  }, [visits, storeSummaries, reportingPeriod]);

  const openCoachFollowUps = useMemo(() =>
    coachingNotes.filter(n => n.status === 'open' && n.followUpDue != null && n.followUpDue >= todayStr && n.followUpDue <= monthEndStr)
      .sort((a, b) => (a.followUpDue ?? '').localeCompare(b.followUpDue ?? '')).slice(0, 4),
    [coachingNotes, todayStr, monthEndStr],
  );

  const paceAmount = useMemo(() => {
    if (reportingPeriod.daysInMonth <= 0 || totalGoal <= 0) return 0;
    return mtdAttachments - totalGoal * (daysElapsed / reportingPeriod.daysInMonth);
  }, [totalGoal, mtdAttachments, daysElapsed, reportingPeriod]);

  const dailyAvgNeeded = useMemo(() => {
    if (daysLeft <= 0 || totalGoal <= 0) return 0;
    const remaining = totalGoal - mtdAttachments;
    return remaining > 0 ? remaining / daysLeft : 0;
  }, [totalGoal, mtdAttachments, daysLeft]);

  // ── Style helpers ──────────────────────────────────────────────────────────
  const distBorderAccent = districtStatus === 'winning' ? 'border-l-signal-green' :
                           districtStatus === 'watch'   ? 'border-l-signal-amber' : 'border-l-signal-red';
  const distActivityColor = districtStatus === 'winning' ? 'text-signal-green' :
                            districtStatus === 'watch'   ? 'text-signal-amber' : 'text-signal-red';

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">

      {/* ═══ 1. COMMAND HEADER ══════════════════════════════════════════════ */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Zap size={18} className="text-accent-orange" />
            <h1 className="text-xl font-bold text-ink-primary">District Command Center</h1>
          </div>
          <p className="text-sm text-ink-secondary">
            {todayLabel} · {daysElapsed} day{daysElapsed !== 1 ? 's' : ''} elapsed · {daysLeft} remaining
          </p>
          {settings.lastSyncedAt && (
            <p className="text-[11px] text-ink-muted mt-0.5 flex items-center gap-1">
              <RefreshCw size={9} /> Last synced {new Date(settings.lastSyncedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setGlanceOpen(true)}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <Activity size={13} /> AI Glance
          </button>
          <Link to="/daily-numbers" className="btn-secondary text-xs flex items-center gap-1.5">
            <RefreshCw size={13} /> Upload Numbers
          </Link>
          <Link to="/messages" className="btn-primary text-xs flex items-center gap-1.5">
            <MessageSquare size={13} /> Build Team Message
          </Link>
          {/* More actions dropdown */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="btn-secondary text-xs flex items-center gap-1 px-2.5"
            >
              <MoreHorizontal size={14} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-navy-700 border border-navy-500 rounded-xl shadow-xl z-30 overflow-hidden py-1">
                {[
                  { label: 'Log Visit',       icon: MapPin,       action: () => navigate('/visits')  },
                  { label: 'View Schedule',   icon: Calendar,     action: () => navigate('/schedule')},
                  { label: 'Add Task',        icon: CheckSquare,  action: () => navigate('/tasks')   },
                  { label: 'Sync Data',       icon: RefreshCw,    action: () => navigate('/settings')},
                  { label: 'Export Snapshot', icon: FileText,     action: () => {
                    const data = JSON.parse(localStorage.getItem('dm_dashboard_v1') || '{}');
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url  = URL.createObjectURL(blob);
                    const a    = Object.assign(document.createElement('a'), { href: url, download: `dm_snapshot_${new Date().toISOString().split('T')[0]}.json` });
                    a.click(); URL.revokeObjectURL(url);
                    setMoreOpen(false);
                  }},
                ].map(({ label, icon: Icon, action }) => (
                  <button key={label} onClick={() => { action(); setMoreOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink-secondary hover:bg-navy-600 hover:text-ink-primary transition-colors text-left">
                    <Icon size={12} className="flex-shrink-0 text-ink-muted" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 2. DISTRICT PULSE ══════════════════════════════════════════════ */}
      <section>
        <div className={`card p-5 border-l-4 ${distBorderAccent}`}>
          {/* Status bar */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <Activity size={15} className={distActivityColor} />
              <p className="text-sm font-bold text-ink-primary">District Pulse</p>
            </div>
            <StatusChip status={districtStatus} />
            {settings.districtRank != null && (
              <span className="badge-blue">
                #{settings.districtRank}{settings.districtRankOutOf ? ` of ${settings.districtRankOutOf}` : ''}
              </span>
            )}
            <span className="text-xs text-ink-muted ml-auto">
              {monthName} · {daysElapsed} days elapsed · {daysLeft} remaining
            </span>
          </div>

          {/* Metric tiles */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {([
              { label: 'Att % to Goal',   value: fmtPct(attachmentPctToGoal), color: attachmentPctToGoal >= 90 ? 'text-signal-green' : attachmentPctToGoal >= 70 ? 'text-signal-amber' : 'text-signal-red' },
              { label: 'MTD Attachments', value: fmtCurrency(mtdAttachments),  color: 'text-ink-primary' },
              { label: 'MTD Boxes',       value: mtdBoxes,                     color: 'text-ink-primary' },
              { label: 'BP %',            value: `${avgBpPct}%`,               color: avgBpPct >= bpGoal   ? 'text-signal-green' : avgBpPct >= 60   ? 'text-signal-amber' : 'text-signal-red' },
              { label: 'ATU %',           value: `${avgAtuPct}%`,              color: avgAtuPct >= atuGoal ? 'text-signal-green' : avgAtuPct >= 40  ? 'text-signal-amber' : 'text-signal-red' },
              { label: 'Report Card',     value: `${avgRcPct}%`,               color: avgRcPct >= 80       ? 'text-signal-green' : avgRcPct >= 75   ? 'text-signal-amber' : 'text-signal-red' },
            ] as const).map(m => (
              <div key={m.label} className="bg-navy-600 rounded-xl px-3 py-2.5 border border-navy-500">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-0.5">{m.label}</p>
                <p className={`text-lg font-bold tabular-nums ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* AI insight */}
          <div className="bg-navy-600 border border-navy-500 rounded-xl px-4 py-3 mb-4">
            <div className="flex items-start gap-2">
              <Bot size={13} className="text-accent-blue-light flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ink-secondary leading-relaxed">{insight}</p>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-2 flex-wrap">
            <Link to="/messages" className="btn-primary text-xs flex items-center gap-1.5"><MessageSquare size={13} /> Build Power Hour Message</Link>
            <a href="#red-zone" onClick={e => { e.preventDefault(); document.getElementById('red-zone')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="btn-secondary text-xs flex items-center gap-1.5">
              <AlertTriangle size={13} /> View Red Zone
            </a>
            <Link to="/visits" className="btn-secondary text-xs flex items-center gap-1.5"><MapPin size={13} /> Plan Visit</Link>
            <button onClick={() => setShowMoreMetrics(m => !m)} className="btn-ghost text-xs flex items-center gap-1 ml-auto">
              <ChevronDown size={12} className={showMoreMetrics ? 'rotate-180 transition-transform' : 'transition-transform'} />
              {showMoreMetrics ? 'Less metrics' : 'More metrics'}
            </button>
          </div>
        </div>

        {/* Collapsible More Metrics */}
        {showMoreMetrics && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              {
                label: 'District Rank',
                value: settings.districtRank != null ? `#${settings.districtRank}` : '—',
                sub: settings.districtRankOutOf ? `of ${settings.districtRankOutOf} districts` : 'Not synced',
                color: settings.districtRank != null && settings.districtRank <= 3 ? 'text-signal-green' : 'text-ink-primary',
              },
              {
                label: 'Visits MTD',
                value: visitsCompleted,
                sub: `Goal: ${settings.monthlyVisitGoal}`,
                color: visitOnPace ? 'text-signal-green' : 'text-signal-amber',
              },
              {
                label: 'Visit Gap',
                value: visitsRemaining > 0 ? `${visitsRemaining} needed` : 'On track',
                sub: visitOnPace ? 'Trending on pace ✓' : 'Plan field time',
                color: visitOnPace ? 'text-signal-green' : visitsRemaining > 5 ? 'text-signal-red' : 'text-signal-amber',
              },
              {
                label: 'Pending Tasks',
                value: openTasks.length,
                sub: urgentTasks.length > 0 ? `${urgentTasks.length} urgent` : openTasks.length === 0 ? 'All clear ✓' : `${openTasks.length} open`,
                color: urgentTasks.length > 0 ? 'text-signal-red' : openTasks.length === 0 ? 'text-signal-green' : 'text-ink-primary',
              },
              {
                label: "Today's Events",
                value: calSynced ? todayCalEvents.length : todayShifts.length,
                sub: calSynced ? (todayCalEvents.length > 0 ? 'From Google Calendar' : 'No events today') : 'Schedule shifts',
                color: 'text-ink-primary',
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="card p-4 border border-navy-500">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted mb-1.5">{label}</p>
                <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
                <p className="text-[10px] text-ink-muted mt-1">{sub}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ 3. TODAY'S PRIORITY ACTIONS ════════════════════════════════════ */}
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted mb-3">Today's Priority Actions</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Coach Now */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-navy-500">
              <Users size={13} className="text-signal-red" />
              <p className="text-sm font-bold text-signal-red">Coach Now</p>
              {coachItems.length > 0 && <span className="badge-red !text-[10px] !px-1.5 !py-0.5 ml-auto">{coachItems.length}</span>}
            </div>
            {coachItems.length === 0 ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <CheckCircle size={14} className="text-signal-green" />
                <p className="text-xs text-ink-secondary">No reps in red zone</p>
              </div>
            ) : coachItems.map((item, idx) => (
              <div key={item.id} className={`space-y-2 ${idx < coachItems.length - 1 ? 'pb-3 border-b border-navy-600' : ''}`}>
                <div>
                  <p className="text-xs font-bold text-ink-primary">{item.name}</p>
                  <p className="text-[11px] text-signal-red font-semibold">{item.metric}</p>
                  <p className="text-[11px] text-ink-muted">{item.detail}</p>
                  <p className="text-[11px] text-ink-secondary mt-0.5">→ {item.issue}</p>
                </div>
                <Link to={item.path} className="btn-secondary text-xs !py-1.5 w-full justify-center">Coach Rep</Link>
              </div>
            ))}
          </div>

          {/* Visit Today */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-navy-500">
              <MapPin size={13} className="text-accent-orange" />
              <p className="text-sm font-bold text-accent-orange-light">Visit Today</p>
              {todayPlanned.length > 0 && <span className="badge-blue !text-[10px] !px-1.5 !py-0.5 ml-auto">{todayPlanned.length} planned</span>}
            </div>

            {todayPlanned.length === 0 && storesInRed.length > 0 && (
              <div className="space-y-2">
                <div className="bg-signal-amber/10 border border-signal-amber/25 rounded-xl p-3">
                  <p className="text-xs font-bold text-ink-primary mb-0.5">No visits planned</p>
                  <p className="text-[11px] text-signal-amber font-semibold">Red-zone activity exists</p>
                  <p className="text-[11px] text-ink-secondary mt-0.5">
                    → {storesInRed.slice(0, 2).map(s => s.store.name).join(', ')} should be considered for a sales-focused visit.
                  </p>
                </div>
                <Link to="/visits" className="btn-primary text-xs !py-1.5 w-full justify-center"><Plus size={12} /> Plan a Visit</Link>
              </div>
            )}

            {todayPlanned.length === 0 && storesInRed.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle size={14} className="text-signal-green" />
                <p className="text-xs text-ink-secondary">No red-zone stores</p>
                <Link to="/visits" className="btn-secondary text-xs mt-1">Plan a Visit</Link>
              </div>
            )}

            {visitItems.map((item, idx) => (
              <div key={item.id} className={`space-y-2 ${idx < visitItems.length - 1 ? 'pb-3 border-b border-navy-600' : ''}`}>
                <div>
                  <p className="text-xs font-bold text-ink-primary">{item.name}</p>
                  <p className="text-[11px] text-signal-red font-semibold">{item.metric}</p>
                  <p className="text-[11px] text-ink-muted">{item.detail}</p>
                  <p className="text-[11px] text-ink-secondary mt-0.5">→ {item.issue}</p>
                </div>
                <button onClick={() => openPlanVisit()} className="btn-secondary text-xs !py-1.5 w-full justify-center">Plan Visit</button>
              </div>
            ))}

            {todayPlanned.length > 0 && visitItems.length === 0 && (
              <div className="space-y-1.5 pt-1">
                {todayPlanned.map(v => {
                  const ss = storeSummaries.find(s => s.store.id === v.storeId);
                  return (
                    <div key={v.id} className="flex items-center gap-2 py-1.5 px-3 bg-navy-600 rounded-xl border border-navy-500">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ss?.isRed ? 'bg-signal-red glow-dot-red' : 'bg-signal-green'}`} />
                      <p className="text-xs text-ink-primary flex-1 truncate">{ss?.store.name ?? v.storeId}</p>
                      {ss?.isRed && <span className="badge-red !text-[10px] !px-1.5 !py-0.5">RED</span>}
                    </div>
                  );
                })}
                <p className="text-[11px] text-ink-muted text-center pt-1">
                  MTD: {visitsCompleted}/{settings.monthlyVisitGoal} · {visitOnPace ? 'On pace ✓' : `${visitsRemaining} needed`}
                </p>
              </div>
            )}
          </div>

          {/* Fix Before EOD */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-navy-500">
              <Target size={13} className="text-signal-amber" />
              <p className="text-sm font-bold text-signal-amber">Fix Before EOD</p>
              {fixItems.length > 0 && <span className="badge-amber !text-[10px] !px-1.5 !py-0.5 ml-auto">{fixItems.length}</span>}
            </div>
            {fixItems.length === 0 ? (
              <div className="flex items-center gap-2 py-6 justify-center">
                <CheckCircle size={14} className="text-signal-green" />
                <p className="text-xs text-ink-secondary">All metrics on track</p>
              </div>
            ) : fixItems.map((item, idx) => (
              <div key={item.id} className={`space-y-2 ${idx < fixItems.length - 1 ? 'pb-3 border-b border-navy-600' : ''}`}>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <p className="text-xs font-bold text-ink-primary">{item.title}</p>
                    <StatusChip status={item.sev} mini />
                  </div>
                  <p className="text-[11px] text-ink-muted">{item.detail}</p>
                </div>
                <Link to={item.path} className="btn-secondary text-xs !py-1.5 w-full justify-center">{item.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 4. WEEK AT A GLANCE ════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Calendar size={14} className="text-accent-blue-light" />
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Week at a Glance</p>
          <span className="text-[10px] text-ink-muted">
            {weekData[0]?.dateLabel} – {weekData[6]?.dateLabel}
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => { setWeekOffset(0); setSelectedDay(null); }}
              className={`btn-ghost text-[10px] px-2 py-1 ${weekOffset === 0 ? 'text-accent-blue-light font-semibold' : ''}`}>
              This Week
            </button>
            <button onClick={() => { setWeekOffset(1); setSelectedDay(null); }}
              className={`btn-ghost text-[10px] px-2 py-1 ${weekOffset === 1 ? 'text-accent-blue-light font-semibold' : ''}`}>
              Next Week
            </button>
            <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} className="btn-ghost p-1" disabled={weekOffset === 0}>
              <ChevronLeft size={12} />
            </button>
            <button onClick={() => setWeekOffset(o => o + 1)} className="btn-ghost p-1">
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* 7-day strip */}
        <div className="overflow-x-auto pb-1">
          <div className="grid grid-cols-7 gap-2 min-w-[700px]">
            {weekData.map(day => {
              const totalItems = day.calItems.length + day.taskItems.length + day.visitItems.length;
              const isSelected = day.dateStr === selectedDay;
              const urgentCount = day.taskItems.filter(t => t.urgent).length;
              return (
                <button
                  key={day.dateStr}
                  onClick={() => setSelectedDay(isSelected ? null : day.dateStr)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    day.isToday
                      ? 'border-accent-blue-light/50 bg-accent-blue/10'
                      : isSelected
                      ? 'border-accent-blue-light/40 bg-navy-600'
                      : day.isPast
                      ? 'border-navy-600 bg-navy-700/50 opacity-70'
                      : 'border-navy-500 bg-navy-700 hover:border-navy-400 hover:bg-navy-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[11px] font-bold ${day.isToday ? 'text-accent-blue-light' : 'text-ink-muted'}`}>
                      {day.dayShort}
                    </span>
                    {day.isToday && <span className="text-[9px] bg-accent-blue/30 text-accent-blue-light px-1 rounded font-bold">TODAY</span>}
                    {urgentCount > 0 && <span className="text-[9px] bg-signal-red/20 text-signal-red px-1 rounded font-bold">{urgentCount}!</span>}
                  </div>
                  <p className="text-xs font-semibold text-ink-primary mb-2">{day.dateLabel}</p>
                  {totalItems === 0 ? (
                    <p className="text-[10px] text-ink-faint italic">No items</p>
                  ) : (
                    <>
                      <div className="flex gap-1 flex-wrap mb-2">
                        {day.calItems.length > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue-light font-semibold">
                            {day.calItems.length} ev
                          </span>
                        )}
                        {day.taskItems.length > 0 && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${urgentCount > 0 ? 'bg-signal-red/20 text-signal-red' : 'bg-signal-amber/20 text-signal-amber'}`}>
                            {day.taskItems.length} task{day.taskItems.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {day.visitItems.length > 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-orange/20 text-accent-orange-light font-semibold">
                            {day.visitItems.length} visit{day.visitItems.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {[...day.calItems.slice(0, 1).map(i => ({ label: i.label, time: i.time, color: 'text-accent-blue-light' })),
                          ...day.visitItems.slice(0, 1).map(i => ({ label: i.label, time: '', color: 'text-accent-orange-light' })),
                          ...day.taskItems.slice(0, 1).map(i => ({ label: i.label, time: '', color: i.urgent ? 'text-signal-red' : 'text-signal-amber' })),
                        ].slice(0, 2).map((item, idx) => (
                          <p key={idx} className={`text-[10px] truncate leading-tight ${item.color}`}>
                            {item.time ? `${item.time} ` : ''}{item.label}
                          </p>
                        ))}
                        {totalItems > 2 && <p className="text-[9px] text-ink-faint">+{totalItems - 2} more</p>}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day detail expand */}
        {selectedDayData && (
          <div className="mt-3 card p-5 space-y-4 border border-accent-blue/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-ink-primary">
                  {selectedDayData.dayShort}, {selectedDayData.dateLabel}
                  {selectedDayData.isToday && <span className="ml-2 badge-blue !text-[10px]">Today</span>}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setQuickTaskDate(selectedDayData.dateStr); setQuickTaskTitle(''); setQuickTaskPriority('medium'); }}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-signal-amber/15 text-signal-amber hover:bg-signal-amber/25 transition-all"
                  >
                    <Plus size={10} /> Task
                  </button>
                  <button
                    onClick={() => openPlanVisit({ date: selectedDayData.dateStr })}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-accent-orange/15 text-accent-orange hover:bg-accent-orange/25 transition-all"
                  >
                    <Plus size={10} /> Visit
                  </button>
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} className="btn-ghost p-1"><X size={13} /></button>
            </div>

            {/* Quick-add task inline form */}
            {quickTaskDate === selectedDayData.dateStr && (
              <div className="bg-navy-800/60 border border-signal-amber/20 rounded-xl p-3 space-y-2">
                <p className="text-[11px] font-bold text-signal-amber uppercase tracking-wide">New Task — {selectedDayData.dateLabel}</p>
                <input
                  autoFocus
                  className="input-base w-full text-sm"
                  placeholder="Task title…"
                  value={quickTaskTitle}
                  onChange={e => setQuickTaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && quickTaskTitle.trim()) {
                      addTask({ title: quickTaskTitle.trim(), description: '', notes: '', priority: quickTaskPriority, status: 'open', dueDate: quickTaskDate, source: 'manual' });
                      setQuickTaskDate(null);
                      setQuickTaskTitle('');
                    }
                    if (e.key === 'Escape') setQuickTaskDate(null);
                  }}
                />
                <div className="flex items-center gap-2">
                  <select
                    className="input-base text-xs py-1 flex-1"
                    value={quickTaskPriority}
                    onChange={e => setQuickTaskPriority(e.target.value as typeof quickTaskPriority)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <button
                    onClick={() => {
                      if (quickTaskTitle.trim()) {
                        addTask({ title: quickTaskTitle.trim(), description: '', notes: '', priority: quickTaskPriority, status: 'open', dueDate: quickTaskDate!, source: 'manual' });
                        setQuickTaskDate(null);
                        setQuickTaskTitle('');
                      }
                    }}
                    disabled={!quickTaskTitle.trim()}
                    className="btn-primary text-xs py-1 px-3 disabled:opacity-40"
                  >Add</button>
                  <button onClick={() => setQuickTaskDate(null)} className="btn-ghost text-xs py-1 px-2">Cancel</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Calendar events */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-accent-blue-light flex items-center gap-1">
                  <Calendar size={10} /> Events ({selectedDayData.calItems.length})
                </p>
                {selectedDayData.calItems.length === 0
                  ? <p className="text-[11px] text-ink-muted italic">No calendar events</p>
                  : selectedDayData.calItems.map(e => (
                    <div key={e.id} className="px-3 py-2 bg-accent-blue/10 border border-accent-blue/20 rounded-xl">
                      <p className="text-xs font-semibold text-ink-primary truncate">{e.label}</p>
                      <p className="text-[10px] text-accent-blue-light">{e.time}</p>
                    </div>
                  ))
                }
              </div>
              {/* Tasks */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-signal-amber flex items-center gap-1">
                  <CheckSquare size={10} /> Tasks ({selectedDayData.taskItems.length})
                </p>
                {selectedDayData.taskItems.length === 0
                  ? <p className="text-[11px] text-ink-muted italic">No tasks due</p>
                  : selectedDayData.taskItems.map(t => (
                    <div key={t.id} className={`px-3 py-2 rounded-xl border ${t.urgent ? 'bg-signal-red/10 border-signal-red/20' : 'bg-signal-amber/10 border-signal-amber/20'}`}>
                      <p className={`text-xs font-semibold truncate ${t.urgent ? 'text-signal-red' : 'text-ink-primary'}`}>{t.label}</p>
                      {t.urgent && <p className="text-[10px] text-signal-red">Urgent</p>}
                    </div>
                  ))
                }
              </div>
              {/* Visits */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-accent-orange-light flex items-center gap-1">
                  <MapPin size={10} /> Visits ({selectedDayData.visitItems.length})
                </p>
                {selectedDayData.visitItems.length === 0
                  ? <p className="text-[11px] text-ink-muted italic">No visits planned</p>
                  : selectedDayData.visitItems.map(v => (
                    <div key={v.id} className="px-3 py-2 bg-accent-orange/10 border border-accent-orange/20 rounded-xl">
                      <p className="text-xs font-semibold text-ink-primary truncate">{v.label}</p>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {!weekHasAnyData && !calSynced && googleTasks.length === 0 && (
          <div className="card p-4 mt-3 flex items-center gap-3 border border-navy-500">
            <Calendar size={14} className="text-ink-muted flex-shrink-0" />
            <p className="text-xs text-ink-secondary">
              Connect Google Calendar and Tasks in{' '}
              <Link to="/settings" className="text-accent-blue-light hover:underline">Settings</Link>{' '}
              to see your events and tasks here.
            </p>
          </div>
        )}
      </section>

      {/* ═══ 5. MONTH AT A GLANCE ═══════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-signal-green" />
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Month at a Glance</p>
          <span className="text-[10px] text-ink-muted">{reportingPeriod.monthName} {reportingPeriod.year}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Month-End Pace */}
          <div className="card p-5 space-y-4">
            <p className="text-sm font-bold text-ink-primary">Month-End Pace</p>
            <div className="space-y-3">
              {[
                {
                  label: 'Days remaining',
                  value: daysLeft,
                  valueClass: daysLeft <= 5 ? 'text-signal-red' : daysLeft <= 10 ? 'text-signal-amber' : 'text-ink-primary',
                },
                {
                  label: `Att % to goal (${monthName})`,
                  value: fmtPct(attachmentPctToGoal),
                  valueClass: attachmentPctToGoal >= 100 ? 'text-signal-green' : attachmentPctToGoal >= 80 ? 'text-signal-amber' : 'text-signal-red',
                },
                {
                  label: 'MTD Attachments',
                  value: fmtCurrency(mtdAttachments),
                  valueClass: 'text-ink-primary',
                },
                {
                  label: paceAmount >= 0 ? 'Pace surplus' : 'Pace gap',
                  value: paceAmount >= 0
                    ? `+${fmtCurrency(paceAmount)} ahead`
                    : `${fmtCurrency(Math.abs(paceAmount))} behind`,
                  valueClass: paceAmount >= 0 ? 'text-signal-green' : 'text-signal-red',
                },
                ...(dailyAvgNeeded > 0 ? [{
                  label: 'Needed daily avg to close',
                  value: fmtCurrency(dailyAvgNeeded) + '/day',
                  valueClass: 'text-signal-amber' as const,
                }] : []),
                {
                  label: `Visits (${visitsCompleted}/${settings.monthlyVisitGoal})`,
                  value: visitOnPace ? 'On pace ✓' : `${visitsRemaining} needed`,
                  valueClass: visitOnPace ? 'text-signal-green' : visitsRemaining > 5 ? 'text-signal-red' : 'text-signal-amber',
                },
                {
                  label: 'Avg Report Card',
                  value: `${avgRcPct}%`,
                  valueClass: avgRcPct >= 80 ? 'text-signal-green' : avgRcPct >= 75 ? 'text-signal-amber' : 'text-signal-red',
                },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-navy-600 last:border-0">
                  <span className="text-xs text-ink-secondary">{row.label}</span>
                  <span className={`text-xs font-bold tabular-nums ${row.valueClass}`}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              <Link to="/visits" className="btn-secondary text-xs flex items-center gap-1.5"><MapPin size={11} /> Plan Visits</Link>
              <Link to="/messages" className="btn-secondary text-xs flex items-center gap-1.5"><MessageSquare size={11} /> Month-End Message</Link>
            </div>
          </div>

          {/* Rest of Month */}
          <div className="card p-5 space-y-4">
            <p className="text-sm font-bold text-ink-primary">Rest of Month</p>

            {/* Upcoming events */}
            {upcomingCalEvents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-accent-blue-light">Upcoming Events</p>
                {upcomingCalEvents.map((e: CalendarEvent) => (
                  <div key={e.id} className="flex items-start gap-2 py-1">
                    <Calendar size={10} className="text-accent-blue-light flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-ink-primary truncate">{e.title}</p>
                      <p className="text-[10px] text-ink-muted">{fmtShortDate(e.start.split('T')[0])}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tasks due */}
            {upcomingTasksDue.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-signal-amber">Open Tasks</p>
                {upcomingTasksDue.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-start gap-2 py-1">
                    <CheckSquare size={10} className="text-signal-amber flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-ink-primary truncate">{t.title}</p>
                      {'dueDate' in t && t.dueDate && (
                        <p className="text-[10px] text-ink-muted">{fmtShortDate(t.dueDate as string)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stores not visited */}
            {storesNotVisitedThisMonth.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-accent-orange-light">Stores Not Visited</p>
                {storesNotVisitedThisMonth.map(ss => (
                  <div key={ss.store.id} className="flex items-center gap-2 py-1">
                    <MapPin size={10} className="text-accent-orange flex-shrink-0" />
                    <p className="text-[11px] text-ink-primary truncate flex-1">{ss.store.name}</p>
                    {ss.isRed && <span className="badge-red !text-[9px] !px-1 !py-0">RED</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Coaching follow-ups */}
            {openCoachFollowUps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-purple-400">Coaching Follow-Ups</p>
                {openCoachFollowUps.map(n => {
                  const rep = reps.find(r => r.id === n.repId);
                  return (
                    <div key={n.id} className="flex items-center gap-2 py-1">
                      <Users size={10} className="text-purple-400 flex-shrink-0" />
                      <p className="text-[11px] text-ink-primary truncate flex-1">{rep?.name.split(',')[0].trim() ?? '—'}</p>
                      <p className="text-[10px] text-ink-muted">{fmtShortDate(n.followUpDue ?? '')}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Month-end risks */}
            {(avgRcPct < 75 || !visitOnPace || repsInRed.length > 0) && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-signal-red">Month-End Risks</p>
                {avgRcPct < 75 && <p className="text-[11px] text-signal-red flex items-center gap-1"><AlertTriangle size={9} /> Report Card {avgRcPct}%</p>}
                {!visitOnPace  && <p className="text-[11px] text-signal-amber flex items-center gap-1"><AlertTriangle size={9} /> Visits behind — {visitsRemaining} needed</p>}
                {repsInRed.length > 0 && <p className="text-[11px] text-signal-red flex items-center gap-1"><AlertTriangle size={9} /> {repsInRed.length} rep{repsInRed.length !== 1 ? 's' : ''} in red zone</p>}
              </div>
            )}

            {upcomingCalEvents.length === 0 && upcomingTasksDue.length === 0 && storesNotVisitedThisMonth.length === 0 && openCoachFollowUps.length === 0 && (
              <div className="flex flex-col items-center py-6 gap-2">
                <CheckCircle size={16} className="text-signal-green" />
                <p className="text-xs text-ink-secondary text-center">All on track for {monthName}!</p>
              </div>
            )}

            <div className="flex gap-2 flex-wrap pt-1">
              <Link to="/tasks" className="btn-secondary text-xs flex items-center gap-1.5"><CheckSquare size={11} /> View Tasks</Link>
              <Link to="/settings" className="btn-secondary text-xs flex items-center gap-1.5"><Calendar size={11} /> Connect Calendar</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 6. RED ZONE COMMAND CENTER ═════════════════════════════════════ */}
      <section id="red-zone">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={14} className="text-signal-red" />
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Red Zone Command Center</p>
          {(repsInRed.length + storesInRed.length) > 0 && (
            <span className="badge-red !text-[10px] !px-1.5 !py-0.5">{repsInRed.length + storesInRed.length} total</span>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Stores in Red */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink-primary">Stores in Red</p>
                {storesInRed.length > 0 && <span className="badge-red">{storesInRed.length}</span>}
              </div>
              <Link to="/stores" className="btn-ghost text-xs flex items-center gap-1">View All <ChevronRight size={12} /></Link>
            </div>
            {storesInRed.length === 0 ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <CheckCircle size={15} className="text-signal-green" />
                <p className="text-sm text-ink-secondary">All stores above threshold</p>
              </div>
            ) : (
              <div className="space-y-3">
                {storesInRed.slice(0, 3).map(ss => (
                  <div key={ss.store.id} className="p-3 bg-signal-red/5 border border-signal-red/20 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-ink-primary truncate mr-2">{ss.store.name}</p>
                      <span className="text-xs font-bold text-signal-red flex-shrink-0">{fmtPct(ss.attachmentPctToGoal)}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
                      <span>RC: {ss.reportCardPct}%</span><span>BP: {ss.bpPct}%</span><span>{ss.mtdBoxes} boxes</span>
                    </div>
                    <PctBar pct={ss.attachmentPctToGoal} signal="red" />
                    <p className="text-[11px] text-ink-secondary">
                      → {ss.bpPct === 0 ? 'No BP. Review offer stack and protection pitch.' :
                         ss.reportCardPct < 60 ? 'RC below minimum — plan visit and review GREAT execution.' :
                         'Below attachment pace — plan sales-focused visit and observe closes.'}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      <Link to={`/stores/${ss.store.id}`} className="btn-ghost text-xs !py-1 !px-2">Profile</Link>
                      <button onClick={() => openPlanVisit({ storeId: ss.store.id })} className="btn-secondary text-xs !py-1 !px-2">Plan Visit</button>
                    </div>
                  </div>
                ))}
                {storesInRed.length > 3 && (
                  <Link to="/stores" className="text-xs text-accent-blue-light hover:underline block text-center pt-1">
                    + {storesInRed.length - 3} more stores in red →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Reps in Red */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink-primary">Reps in Red</p>
                {repsInRed.length > 0 && <span className="badge-red">{repsInRed.length}</span>}
              </div>
              <Link to="/reps" className="btn-ghost text-xs flex items-center gap-1">View All <ChevronRight size={12} /></Link>
            </div>
            {repsInRed.length === 0 ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <CheckCircle size={15} className="text-signal-green" />
                <p className="text-sm text-ink-secondary">All reps above threshold</p>
              </div>
            ) : (
              <div className="space-y-3">
                {repsInRed.slice(0, 3).map(rs => (
                  <div key={rs.rep.id} className="p-3 bg-signal-red/5 border border-signal-red/20 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-ink-primary truncate mr-2">{rs.rep.name}</p>
                      <span className="text-xs font-bold text-signal-red flex-shrink-0">{fmtPct(rs.attachmentPctToGoal)}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
                      <span>BP: {rs.bpPct}%</span><span>ATU: {rs.atuPct}%</span><span>{rs.mtdBoxes} boxes</span>
                    </div>
                    <PctBar pct={rs.attachmentPctToGoal} signal="red" />
                    <p className="text-[11px] text-ink-secondary">
                      → {rs.bpPct === 0 ? 'No BP — coach protection pitch on every box.' :
                         rs.atuPct < 20  ? 'ATU below 20% — coach Auto Top Up offer on eligibles.' :
                         'Coach attach per box and close using GREAT framework.'}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      <Link to={`/reps/${rs.rep.id}`} className="btn-ghost text-xs !py-1 !px-2">Open Scorecard</Link>
                      <Link to={`/reps/${rs.rep.id}`} className="btn-secondary text-xs !py-1 !px-2">Coach Rep</Link>
                    </div>
                  </div>
                ))}
                {repsInRed.length > 3 && (
                  <Link to="/reps" className="text-xs text-accent-blue-light hover:underline block text-center pt-1">
                    + {repsInRed.length - 3} more reps in red →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ 7. RECOGNITION OPPORTUNITIES ══════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Star size={14} className="text-accent-orange" />
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Recognition Opportunities</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Top 5 Reps */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-ink-primary">Top 5 Reps</p>
              <Link to="/reps" className="btn-ghost text-xs flex items-center gap-1">View All <ChevronRight size={12} /></Link>
            </div>
            <div className="space-y-3">
              {top5Reps.map((rs, i) => (
                <div key={rs.rep.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-ink-muted w-4 text-center flex-shrink-0">{i + 1}</span>
                  <SignalDot signal={rs.signal} />
                  <Link to={`/reps/${rs.rep.id}`} className="text-sm font-medium text-ink-primary flex-1 hover:text-white transition-colors truncate min-w-0">
                    {rs.rep.name}
                  </Link>
                  <PctBar pct={rs.attachmentPctToGoal} signal={rs.signal} />
                  <span className={`text-xs font-bold w-14 text-right flex-shrink-0 tabular-nums ${rs.signal === 'green' ? 'text-signal-green' : rs.signal === 'amber' ? 'text-signal-amber' : rs.signal === 'red' ? 'text-signal-red' : 'text-accent-orange'}`}>
                    {fmtPct(rs.attachmentPctToGoal)}
                  </span>
                  {rs.attachmentPctToGoal >= 120 && (
                    <span className="text-[10px] font-semibold text-signal-green border border-signal-green/25 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      Recognize
                    </span>
                  )}
                </div>
              ))}
              {top5Reps.length === 0 && <p className="text-sm text-ink-muted py-4 text-center">No rep data available</p>}
            </div>
          </div>

          {/* Top 5 Stores */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-ink-primary">Top 5 Stores</p>
              <Link to="/stores" className="btn-ghost text-xs flex items-center gap-1">View All <ChevronRight size={12} /></Link>
            </div>
            <div className="space-y-3">
              {top5Stores.map((ss, i) => (
                <div key={ss.store.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-ink-muted w-4 text-center flex-shrink-0">{i + 1}</span>
                  <SignalDot signal={ss.signal} />
                  <Link to={`/stores/${ss.store.id}`} className="text-sm font-medium text-ink-primary flex-1 hover:text-white transition-colors truncate min-w-0">
                    {ss.store.name}
                  </Link>
                  <PctBar pct={ss.attachmentPctToGoal} signal={ss.signal} />
                  <span className={`text-xs font-bold w-14 text-right flex-shrink-0 tabular-nums ${ss.signal === 'green' ? 'text-signal-green' : ss.signal === 'amber' ? 'text-signal-amber' : ss.signal === 'red' ? 'text-signal-red' : 'text-accent-orange'}`}>
                    {fmtPct(ss.attachmentPctToGoal)}
                  </span>
                  {ss.attachmentPctToGoal >= 120 && (
                    <span className="text-[10px] font-semibold text-signal-green border border-signal-green/25 rounded-full px-1.5 py-0.5 flex-shrink-0">
                      Congrats
                    </span>
                  )}
                </div>
              ))}
              {top5Stores.length === 0 && <p className="text-sm text-ink-muted py-4 text-center">No store data available</p>}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 8. FIELD EXECUTION ═════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={14} className="text-accent-blue-light" />
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Field Execution</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Today's Route */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink-primary">Today's Route</p>
                <span className={todayPlanned.length > 0 ? 'badge-blue' : 'badge-neutral'}>{todayPlanned.length} planned</span>
              </div>
              <Link to="/visits" className="btn-ghost text-xs flex items-center gap-1">All Visits <ChevronRight size={12} /></Link>
            </div>
            {todayPlanned.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-ink-secondary">
                  {storesInRed.length > 0
                    ? `Consider visiting ${storesInRed.slice(0, 1).map(s => s.store.name).join(' or ')} today.`
                    : 'No visits planned. Log field time to stay on pace.'
                  }
                </p>
                <p className="text-[11px] text-ink-muted">
                  MTD: {visitsCompleted}/{settings.monthlyVisitGoal} · {visitOnPace ? 'On pace ✓' : `${visitsRemaining} needed`}
                </p>
                <Link to="/visits" className="btn-secondary text-xs flex items-center gap-1.5"><Plus size={11} /> Plan a Visit</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {todayPlanned.map(v => {
                  const ss = storeSummaries.find(s => s.store.id === v.storeId);
                  return (
                    <div key={v.id} className="flex items-start gap-3 p-3 bg-navy-600 rounded-xl border border-navy-500">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${ss?.isRed ? 'bg-signal-red glow-dot-red' : 'bg-accent-blue'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-primary">{ss?.store.name ?? v.storeId}</p>
                        <p className="text-xs text-ink-secondary">{v.visitType}</p>
                        {ss?.isRed && <p className="text-[10px] text-signal-red mt-0.5">Red-zone — observe GREAT and attachment close</p>}
                      </div>
                      {ss?.isRed && <span className="badge-red !text-[10px]">RED</span>}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-1 text-[11px] text-ink-muted">
                  <span>MTD: {visitsCompleted}/{settings.monthlyVisitGoal}</span>
                  <span className={visitOnPace ? 'text-signal-green font-semibold' : 'text-signal-amber font-semibold'}>
                    {visitOnPace ? 'On pace ✓' : `${visitsRemaining} to go`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Schedule Snapshot */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink-primary">Schedule Snapshot</p>
                <span className="badge-neutral">{todayShifts.length} shifts today</span>
              </div>
              <Link to="/schedule" className="btn-ghost text-xs flex items-center gap-1">Full Schedule <ChevronRight size={12} /></Link>
            </div>
            {todayShifts.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-ink-secondary py-4 text-center">No shifts synced for today</p>
                <Link to="/schedule" className="btn-secondary text-xs w-full justify-center">View Schedule</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {storeSummaries
                  .slice()
                  .sort((a, b) => (b.isRed ? 1 : 0) - (a.isRed ? 1 : 0))
                  .map(ss => {
                    const storeShifts = todayShifts.filter(sh => sh.storeId === ss.store.id);
                    if (storeShifts.length === 0) return null;
                    return (
                      <div key={ss.store.id} className={`p-3 rounded-xl border ${ss.isRed ? 'border-signal-red/25 bg-signal-red/5' : 'border-navy-500 bg-navy-700'}`}>
                        <div className="flex items-center gap-1 mb-1 flex-wrap">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ss.isRed ? 'bg-signal-red' : 'bg-signal-green'}`} />
                          <p className="text-[11px] font-bold text-ink-primary truncate">{ss.store.name}</p>
                          {ss.isRed && <span className="badge-red !text-[9px] !px-1 !py-0">RED</span>}
                        </div>
                        <p className="text-[10px] text-ink-muted">{storeShifts.length} rep{storeShifts.length !== 1 ? 's' : ''} scheduled</p>
                        {storeShifts.slice(0, 2).map(sh => {
                          const rep = reps.find(r => r.id === sh.repId);
                          const name = rep?.name ?? sh.repName ?? '—';
                          return (
                            <p key={sh.id} className="text-[10px] text-ink-muted truncate mt-0.5">
                              {name.split(',')[0].trim()} {sh.startTime}–{sh.endTime}
                            </p>
                          );
                        })}
                        {storeShifts.length > 2 && <p className="text-[9px] text-ink-faint">+{storeShifts.length - 2} more</p>}
                      </div>
                    );
                  })
                  .filter(Boolean)
                  .slice(0, 6)}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ 9. MESSAGE ASSISTANT ════════════════════════════════════════════ */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-accent-blue-light" />
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Message Assistant</p>
        </div>
        <div className="card p-5 space-y-4">
          <div className="flex gap-1 bg-navy-800 rounded-xl p-1 w-fit border border-navy-600 flex-wrap">
            {([
              { key: 'morning'   as const, label: 'Morning Rally'    },
              { key: 'powerHour' as const, label: 'Power Hour Push'  },
              { key: 'eod'       as const, label: 'EOD Recap'        },
              { key: 'monthEnd'  as const, label: 'Month-End Push'   },
            ]).map(tab => (
              <button key={tab.key} onClick={() => setMsgTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${msgTab === tab.key ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-navy-600 border border-navy-500 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bot size={13} className="text-accent-blue-light" />
              <p className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                {msgTab === 'morning' ? 'Morning Rally' : msgTab === 'powerHour' ? 'Power Hour Push' : msgTab === 'eod' ? 'EOD Recap' : 'Month-End Push'}
              </p>
            </div>
            <p className="text-sm text-ink-primary leading-relaxed">{currentMsg}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link to="/messages" className="btn-primary text-xs flex items-center gap-1.5"><MessageSquare size={12} /> Open Message Builder</Link>
            <button onClick={copyMessage} className="btn-secondary text-xs flex items-center gap-1.5">
              <Copy size={12} /> {copied ? 'Copied!' : 'Copy Message'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══ AI GLANCE DRAWER ═══════════════════════════════════════════════ */}
      {glanceOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setGlanceOpen(false)} />
          <div className="fixed right-0 top-0 bottom-0 w-96 max-w-full bg-navy-900 border-l border-navy-600 z-50 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-navy-600">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-accent-orange" />
                <p className="text-base font-bold text-ink-primary">At a Glance</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-muted">{todayLabel}</span>
                <button onClick={() => setGlanceOpen(false)} className="btn-ghost p-1"><X size={14} /></button>
              </div>
            </div>
            <div className="p-5 space-y-3 flex-1">
              {[
                {
                  icon: Star, label: 'District Rank',
                  value: settings.districtRank != null
                    ? `#${settings.districtRank}${settings.districtRankOutOf ? ` / ${settings.districtRankOutOf}` : ''}`
                    : 'Not synced',
                  color: settings.districtRank != null ? 'text-signal-green' : 'text-ink-muted',
                },
                {
                  icon: Target, label: 'Attachments',
                  value: `${fmtCurrency(mtdAttachments)} · ${fmtPct(attachmentPctToGoal)} to goal`,
                  color: attachmentPctToGoal >= 90 ? 'text-signal-green' : attachmentPctToGoal >= 70 ? 'text-signal-amber' : 'text-signal-red',
                },
                {
                  icon: CheckCircle, label: 'Boxes MTD',
                  value: String(mtdBoxes),
                  color: 'text-ink-primary',
                },
                {
                  icon: Activity, label: 'BP / ATU',
                  value: `${avgBpPct > 0 ? `${avgBpPct}%` : '—'} / ${avgAtuPct > 0 ? `${avgAtuPct}%` : '—'}`,
                  color: (avgBpPct >= bpGoal && avgAtuPct >= atuGoal) ? 'text-signal-green' : 'text-signal-amber',
                },
                {
                  icon: AlertTriangle, label: 'Needs Attention',
                  value: `${repsInRed.length} rep${repsInRed.length !== 1 ? 's' : ''} · ${storesInRed.length} store${storesInRed.length !== 1 ? 's' : ''} in red`,
                  color: (repsInRed.length + storesInRed.length) > 0 ? 'text-signal-red' : 'text-signal-green',
                },
                {
                  icon: MapPin, label: 'Visits',
                  value: `${visitsCompleted} / ${settings.monthlyVisitGoal} MTD${!visitOnPace ? ` · ${visitsRemaining} needed` : ' ✓'}`,
                  color: visitOnPace ? 'text-signal-green' : 'text-signal-amber',
                },
                {
                  icon: CheckSquare, label: 'Pending Tasks',
                  value: `${openTasks.length} open${urgentTasks.length > 0 ? ` · ${urgentTasks.length} urgent` : ''}`,
                  color: urgentTasks.length > 0 ? 'text-signal-red' : openTasks.length === 0 ? 'text-signal-green' : 'text-ink-primary',
                },
                {
                  icon: Clock, label: "Today's Events",
                  value: calSynced
                    ? `${todayCalEvents.length} event${todayCalEvents.length !== 1 ? 's' : ''}`
                    : todayShifts.length > 0 ? `${todayShifts.length} shifts` : 'Not synced',
                  color: 'text-ink-primary',
                },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-3 p-3 bg-navy-800 rounded-xl border border-navy-600">
                  <Icon size={13} className="text-ink-muted flex-shrink-0" />
                  <span className="text-xs text-ink-muted flex-1">{label}</span>
                  <span className={`text-xs font-bold text-right ${color}`}>{value}</span>
                </div>
              ))}

              <div className="pt-2 border-t border-navy-600">
                <div className="flex items-start gap-2 p-3 bg-navy-800 rounded-xl border border-navy-600">
                  <Bot size={13} className="text-accent-blue-light flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-ink-secondary leading-relaxed">{insight}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
