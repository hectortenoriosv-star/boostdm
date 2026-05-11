import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, MapPin, CheckSquare, Clock, AlertTriangle,
  ChevronRight, Plus, CheckCircle, Circle, Users, BookOpen,
  MessageSquare, Activity, TrendingDown, FileText, Zap,
  Eye, ChevronDown, Star, Shield, MoreHorizontal,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { fmtPct, fmtCurrency, isOverdue, priorityOrder, daysSince, fmt12h } from '../data/calculations';
import type { Task, RepSummary, StoreSummary } from '../types';

// ─── Calendar event helpers ───────────────────────────────────────────────────

function localDateFromISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function timeFromISO(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function durationLabel(startISO: string, endISO: string): string {
  const mins = Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type CalEventType = 'calendar' | 'task';
const CAL_EVENT_CFG: Record<CalEventType, { cls: string; label: string }> = {
  calendar: { cls: 'bg-accent-blue/15 text-accent-blue-light border-accent-blue/30', label: 'Event'    },
  task:     { cls: 'bg-signal-green/15 text-signal-green border-signal-green/30',    label: 'Task'     },
};

// ─── Action Types & Config ────────────────────────────────────────────────────

type ActionType  = 'coaching' | 'visit' | 'eod' | 'reporting' | 'message' | 'task' | 'recognition';
type ActionGroup = 'do-now' | 'do-today' | 'watch';

interface AgendaAction {
  id: string;
  group: ActionGroup;
  type: ActionType;
  title: string;
  reason: string;
  extra?: string;
  actionLabel: string;
  primaryTo: string;
  secondaryLabel?: string;
  secondaryTo?: string;
}

const ACTION_TYPE_CFG: Record<ActionType, { label: string; cls: string; borderCls: string }> = {
  coaching:    { label: 'Coaching',  cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30',           borderCls: 'border-l-purple-400'        },
  visit:       { label: 'Visit',     cls: 'bg-accent-orange/15 text-accent-orange border-accent-orange/30',  borderCls: 'border-l-accent-orange'     },
  eod:         { label: 'EOD',       cls: 'bg-signal-amber/15 text-signal-amber border-signal-amber/30',     borderCls: 'border-l-signal-amber'      },
  reporting:   { label: 'Reporting', cls: 'bg-signal-amber/15 text-signal-amber border-signal-amber/30',     borderCls: 'border-l-signal-amber'      },
  message:     { label: 'Message',   cls: 'bg-accent-blue/15 text-accent-blue-light border-accent-blue/30',  borderCls: 'border-l-accent-blue-light' },
  task:        { label: 'Task',      cls: 'bg-navy-500/40 text-ink-muted border-navy-500',                   borderCls: 'border-l-navy-400'          },
  recognition: { label: 'Recognize', cls: 'bg-signal-green/15 text-signal-green border-signal-green/30',     borderCls: 'border-l-signal-green'      },
};

const ACTION_GROUP_CFG: Record<ActionGroup, { label: string; cls: string; dotCls: string }> = {
  'do-now':   { label: 'Do Now',   cls: 'text-signal-red',    dotCls: 'bg-signal-red'    },
  'do-today': { label: 'Do Today', cls: 'text-accent-orange', dotCls: 'bg-accent-orange' },
  'watch':    { label: 'Watch',    cls: 'text-signal-amber',  dotCls: 'bg-signal-amber'  },
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

function getGreatFocus(rs: RepSummary): string {
  if (rs.mtdBoxes === 0) return 'Greet + Engage';
  if (rs.bpPct === 0)    return 'Advise (BP Pitch)';
  if (rs.atuPct === 0)   return 'Transact (ATU Close)';
  return 'Advise + Transact';
}

function getCoachReason(rs: RepSummary): string {
  if (rs.mtdBoxes === 0)  return '0 boxes reported — no sales activity this month';
  if (rs.bpPct === 0)     return 'No Boost Protect activity this month';
  if (rs.atuPct === 0)    return 'No ATU conversions this month';
  const pct = rs.attachmentPctToGoal;
  if (rs.mtdBoxes >= 5 && pct < 60) return `${rs.mtdBoxes} boxes sold but only ${pct.toFixed(1)}% attachment`;
  return `${pct.toFixed(1)}% to goal — below threshold`;
}

function getCoachPriority(rs: RepSummary): number {
  if (rs.mtdBoxes === 0)                      return 1;
  if (rs.bpPct === 0)                         return 2;
  if (rs.atuPct === 0)                        return 3;
  if (rs.attachmentPctToGoal < 60)            return 4;
  return 5;
}

function buildPriorityActions(
  repSummaries: RepSummary[],
  storeSummaries: StoreSummary[],
  tasks: Task[],
  todayVisitStoreIds: Set<string>,
  eodWatchlistCount: number,
): AgendaAction[] {
  const actions: AgendaAction[] = [];

  // 1. Data quality check — if >50% of reps show zero activity
  const noActivity = repSummaries.filter(rs =>
    rs.mtdAttachments === 0 && rs.mtdBoxes === 0 && rs.bpPct === 0 && rs.atuPct === 0
  );
  const dataIsSuspect = repSummaries.length > 0 && noActivity.length / repSummaries.length > 0.5;

  if (dataIsSuspect) {
    actions.push({
      id: 'data-quality',
      group: 'do-now',
      type: 'reporting',
      title: 'Verify Performance Data',
      reason: `${noActivity.length} of ${repSummaries.length} reps show 0% to goal with no activity. Confirm if today's numbers were uploaded before coaching or flagging reps as red.`,
      actionLabel: 'Upload Numbers',
      primaryTo: '/daily-numbers',
      secondaryLabel: 'Request EOD',
      secondaryTo: '/eod-reports',
    });
  }

  // 2. Top store needing visit — red + no visit scheduled today
  const topVisitStore = [...storeSummaries]
    .filter(ss => ss.isRed && !todayVisitStoreIds.has(ss.store.id))
    .sort((a, b) => {
      const aScore = (!a.lastVisitDate ? 200 : Math.min(200, daysSince(a.lastVisitDate) * 5)) +
        (a.attachmentPctToGoal < 60 ? 50 : 0);
      const bScore = (!b.lastVisitDate ? 200 : Math.min(200, daysSince(b.lastVisitDate) * 5)) +
        (b.attachmentPctToGoal < 60 ? 50 : 0);
      return bScore - aScore;
    })[0];

  if (topVisitStore) {
    const noVisit = !topVisitStore.lastVisitDate;
    actions.push({
      id: `visit-${topVisitStore.store.id}`,
      group: 'do-now',
      type: 'visit',
      title: `Plan Visit — ${topVisitStore.store.name}`,
      reason: `Store is in red zone (${topVisitStore.attachmentPctToGoal.toFixed(1)}% to goal)${noVisit ? ' with no visits recorded' : ` — last visit ${daysSince(topVisitStore.lastVisitDate!)}d ago`}. No visit is scheduled today.`,
      extra: 'Visit focus: Observe GREAT · Attachment close · ATU ask',
      actionLabel: 'Plan Visit',
      primaryTo: '/visits',
      secondaryLabel: 'Open Store',
      secondaryTo: `/stores/${topVisitStore.store.id}`,
    });
  }

  // 3. Top coaching priority rep
  const repsInRed = repSummaries.filter(r => r.isRed);
  const topCoachRep = [...repsInRed].sort((a, b) => getCoachPriority(a) - getCoachPriority(b))[0];
  if (topCoachRep) {
    actions.push({
      id: `coach-${topCoachRep.rep.id}`,
      group: dataIsSuspect ? 'do-today' : 'do-now',
      type: 'coaching',
      title: `Coach ${topCoachRep.rep.name}`,
      reason: dataIsSuspect
        ? `After confirming EOD data — ${getCoachReason(topCoachRep)}`
        : getCoachReason(topCoachRep),
      extra: `GREAT Focus: ${getGreatFocus(topCoachRep)}`,
      actionLabel: 'Coach Rep',
      primaryTo: `/reps/${topCoachRep.rep.id}`,
      secondaryLabel: 'Scorecard',
      secondaryTo: `/reps/${topCoachRep.rep.id}`,
    });
  }

  // 4. Team message — if multiple reps below goal
  if (repsInRed.length >= 3) {
    actions.push({
      id: 'team-message',
      group: 'do-today',
      type: 'message',
      title: 'Send Power Hour Message',
      reason: `${repsInRed.length} reps and ${storeSummaries.filter(ss => ss.isRed).length} stores are below goal. Push boxes, attachments, BP, ATU, and EOD accountability.`,
      actionLabel: 'Build Message',
      primaryTo: '/',
    });
  }

  // 5. EOD watchlist follow-up
  if (eodWatchlistCount >= 2) {
    actions.push({
      id: 'eod-review',
      group: 'do-today',
      type: 'eod',
      title: 'Review EOD Watchlist',
      reason: `${eodWatchlistCount} reps were below 75% in the last 2 days. Create follow-up coaching tasks before the day ends.`,
      actionLabel: 'View Watchlist',
      primaryTo: '/daily-numbers',
    });
  }

  // 6. Overdue urgent tasks (max 2)
  const overdueTasks = tasks.filter(t => isOverdue(t.dueDate, t.status) && t.priority === 'urgent');
  for (const task of overdueTasks.slice(0, 2)) {
    actions.push({
      id: `task-${task.id}`,
      group: 'do-now',
      type: 'task',
      title: task.title,
      reason: `Overdue urgent task — was due ${task.dueDate}`,
      actionLabel: 'View Task',
      primaryTo: '/tasks',
    });
  }

  // 7. Recognition opportunity
  const winningReps = repSummaries.filter(r => r.attachmentPctToGoal >= 100);
  if (winningReps.length > 0) {
    actions.push({
      id: 'recognition',
      group: 'watch',
      type: 'recognition',
      title: winningReps.length === 1
        ? `Recognize ${winningReps[0].rep.name}`
        : `Recognize ${winningReps.length} Winning Reps`,
      reason: `${winningReps.length === 1 ? `${winningReps[0].rep.name} is` : `${winningReps.length} reps are`} at or above 100% to goal. Reinforce winning behavior.`,
      actionLabel: 'View Reps',
      primaryTo: '/reps',
    });
  }

  return actions.slice(0, 7);
}

// ─── Preserved: Task Row ──────────────────────────────────────────────────────

function TaskRow({ task, onStatusChange }: { task: Task; onStatusChange: (id: string, s: Task['status']) => void }) {
  const { reps, stores } = useData();
  const rep = reps.find(r => r.id === task.repId);
  const store = stores.find(s => s.id === task.storeId);
  const overdue = isOverdue(task.dueDate, task.status);
  const nextStatus: Record<Task['status'], Task['status']> = {
    open: 'in-progress', 'in-progress': 'completed', waiting: 'in-progress', completed: 'open',
  };
  return (
    <div className={`p-4 rounded-xl border transition-colors ${task.status === 'completed' ? 'border-navy-500 bg-navy-800 opacity-60' : 'border-navy-500 bg-navy-700 hover:border-navy-400'}`}>
      <div className="flex items-start gap-3">
        <button onClick={() => onStatusChange(task.id, nextStatus[task.status])} className="mt-0.5 flex-shrink-0 hover:scale-110 transition-transform">
          {task.status === 'completed'
            ? <CheckCircle size={18} className="text-signal-green" />
            : <Circle size={18} className="text-ink-muted hover:text-accent-blue-light" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className={`text-sm font-semibold ${task.status === 'completed' ? 'line-through text-ink-muted' : 'text-ink-primary'}`}>{task.title}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`badge-${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'amber' : task.priority === 'medium' ? 'blue' : 'neutral'}`}>{task.priority}</span>
            </div>
          </div>
          {task.description && <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{task.description}</p>}
          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-ink-muted">
            {rep && <span>{rep.name}</span>}
            {store && <span>{store.name}</span>}
            <span className={overdue ? 'text-signal-red font-medium' : ''}>{overdue ? '⚠ Overdue · ' : 'Due '}{task.dueDate}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Atom: Summary Card ───────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, valueCls = 'text-ink-primary', action }: {
  label: string; value: string | number; sub?: string; valueCls?: string;
  action?: { label: string; to: string };
}) {
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

// ─── Section: Priority Action Item ───────────────────────────────────────────

function PriorityActionItem({ action, rank }: { action: AgendaAction; rank: number }) {
  const typeCfg = ACTION_TYPE_CFG[action.type];
  return (
    <div className={`card border-l-4 ${typeCfg.borderCls} p-4 space-y-2.5`}>
      <div className="flex items-start gap-3">
        <span className="text-xs font-bold text-ink-muted bg-navy-600 rounded-lg px-2 py-1 flex-shrink-0 mt-0.5">
          #{rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${typeCfg.cls}`}>{typeCfg.label}</span>
          </div>
          <p className="text-sm font-bold text-ink-primary">{action.title}</p>
          <p className="text-xs text-ink-secondary leading-relaxed mt-0.5">{action.reason}</p>
          {action.extra && (
            <p className="text-[11px] text-accent-orange mt-1 font-medium">{action.extra}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap pl-9">
        <Link to={action.primaryTo} className="btn-primary text-xs py-1.5 px-3">{action.actionLabel}</Link>
        {action.secondaryLabel && action.secondaryTo && (
          <Link to={action.secondaryTo} className="btn-secondary text-xs py-1.5 px-3">{action.secondaryLabel}</Link>
        )}
      </div>
    </div>
  );
}

// ─── Section: Coaching Queue Item ─────────────────────────────────────────────

function CoachingQueueItem({ rs, storeName, onMarkCoached }: { rs: RepSummary; storeName: string; onMarkCoached?: (rs: RepSummary) => void }) {
  return (
    <div className="card border-l-4 border-l-purple-400 p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${rs.attachmentPctToGoal < 60 ? 'bg-signal-red/20 text-signal-red border-signal-red/30' : 'bg-signal-amber/20 text-signal-amber border-signal-amber/30'}`}>
              {rs.isRed ? 'Red Zone' : 'Watch'}
            </span>
            <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-accent-orange/15 text-accent-orange border border-accent-orange/25 whitespace-nowrap">
              GREAT: {getGreatFocus(rs)}
            </span>
          </div>
          <Link to={`/reps/${rs.rep.id}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors block mt-1">
            {rs.rep.name}
          </Link>
          {storeName && <p className="text-xs text-ink-muted">{storeName}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xl font-bold leading-none ${rs.attachmentPctToGoal < 60 ? 'text-signal-red' : 'text-signal-amber'}`}>
            {fmtPct(rs.attachmentPctToGoal)}
          </p>
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
        {rs.lastCoachingDate && (
          <span className="text-ink-muted">Last coached {daysSince(rs.lastCoachingDate)}d ago</span>
        )}
      </div>

      <p className="text-[11px] text-ink-secondary leading-relaxed">{getCoachReason(rs)}</p>

      <div className="flex gap-2 pt-1 border-t border-navy-600">
        <button
          onClick={() => onMarkCoached?.(rs)}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1"
        >
          <CheckCircle size={12} /> Mark Coached
        </button>
        <Link to={`/reps/${rs.rep.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <Activity size={12} /> Scorecard
        </Link>
      </div>
    </div>
  );
}

// ─── Section: Alert Group (expandable) ───────────────────────────────────────

function AlertGroup({
  title, icon, count, dotCls, children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  count: number;
  dotCls: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Icon = icon;
  if (count === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left py-2 hover:text-ink-primary transition-colors"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} />
        <Icon size={13} className="text-ink-muted" />
        <span className="text-sm font-semibold text-ink-secondary">{title}</span>
        <span className="text-xs text-ink-muted ml-1">({count})</span>
        <ChevronDown size={13} className={`ml-auto text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-1 ml-4 space-y-1 pb-2 border-l border-navy-600 pl-3">{children}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Agenda() {
  const {
    tasks, visits, shifts, repSummaries, storeSummaries,
    reps, stores, settings, updateTask, updateVisit, dailyPerf,
    calendarEvents, googleTasks, openPlanVisit, addToCoachingQueue,
    coachingQueue: persistedCoachingQueue, updateCoachingQueueItem,
  } = useData();

  const [showCompleted, setShowCompleted]     = useState(false);
  const [backlogExpanded, setBacklogExpanded] = useState(false);

  // ── Date strings ────────────────────────────────────────────────────────────
  const _now       = new Date();
  const _localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const TODAY      = _localDate(_now);
  const _yday      = new Date(_now); _yday.setDate(_now.getDate() - 1);
  const YESTERDAY  = _localDate(_yday);
  const _dbefore   = new Date(_now); _dbefore.setDate(_now.getDate() - 2);
  const DAY_BEFORE = _localDate(_dbefore);
  const dateHeader = _now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ── Store / rep maps ────────────────────────────────────────────────────────
  const storeMap = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s.name])), [stores]);

  // ── Visit data ──────────────────────────────────────────────────────────────
  const todayVisits    = visits.filter(v => v.date === TODAY);
  const plannedVisits  = todayVisits.filter(v => v.status === 'planned');
  const todayVisitStoreIds = useMemo(() => new Set(todayVisits.map(v => v.storeId)), [todayVisits]);
  const completedVisits = visits.filter(v => v.status === 'completed');

  // ── Schedule data ───────────────────────────────────────────────────────────
  const todayShifts = shifts.filter(s => s.date === TODAY);

  // ── Calendar / Google Tasks ─────────────────────────────────────────────────
  const todayCalEvents = useMemo(() =>
    calendarEvents
      .filter(e => e.status !== 'cancelled' && localDateFromISO(e.start) === TODAY)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
  [calendarEvents, TODAY]);

  const todayGoogleTasks = useMemo(() =>
    googleTasks.filter(t => t.status !== 'completed' && (!t.dueDate || t.dueDate === TODAY)),
  [googleTasks, TODAY]);

  const timeBlockCount = todayCalEvents.length + todayGoogleTasks.length;

  // ── Task data ───────────────────────────────────────────────────────────────
  const openTasks      = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const overdueTasks   = openTasks.filter(t => isOverdue(t.dueDate, t.status));
  const sortedTasks    = [...openTasks].sort((a, b) => {
    if (isOverdue(a.dueDate, a.status) !== isOverdue(b.dueDate, b.status))
      return isOverdue(a.dueDate, a.status) ? -1 : 1;
    return priorityOrder(a.priority) - priorityOrder(b.priority);
  });

  // ── Rep / store summaries ───────────────────────────────────────────────────
  const repsInRed   = repSummaries.filter(r => r.isRed);
  const storesInRed = storeSummaries.filter(s => s.isRed);
  const needsVisitStores = storeSummaries.filter(ss => !ss.lastVisitDate || daysSince(ss.lastVisitDate) >= 7);

  // ── Coaching queue ─────────────────────────────────────────────────────────
  const coachedTodayIds = useMemo(() =>
    new Set(persistedCoachingQueue
      .filter(q => q.status === 'coached' && q.dueDate === TODAY)
      .map(q => q.repId)),
  [persistedCoachingQueue, TODAY]);

  const activeQueueItems = useMemo(() =>
    persistedCoachingQueue
      .filter(q => q.status === 'open' || q.status === 'inProgress')
      .sort((a, b) => a.priority - b.priority),
  [persistedCoachingQueue]);

  const activeQueueRepIds = useMemo(() =>
    new Set(activeQueueItems.map(q => q.repId)),
  [activeQueueItems]);

  const coachingQueue = useMemo(() => {
    return [...repsInRed]
      .filter(rs => !coachedTodayIds.has(rs.rep.id) && !activeQueueRepIds.has(rs.rep.id))
      .sort((a, b) => getCoachPriority(a) - getCoachPriority(b))
      .slice(0, 5);
  }, [repsInRed, coachedTodayIds, activeQueueRepIds]);

  const handleMarkCoached = (rs: RepSummary) => {
    addToCoachingQueue({
      repId:       rs.rep.id,
      repName:     rs.rep.name,
      storeId:     rs.rep.defaultStoreId,
      storeName:   storeMap[rs.rep.defaultStoreId] ?? '',
      reason:      getCoachReason(rs),
      priority:    getCoachPriority(rs) as 1 | 2 | 3 | 4 | 5,
      greatFocus:  getGreatFocus(rs),
      sourcePage:  'agenda',
      sourceType:  rs.isRed ? 'red-zone' : 'watch',
      dueDate:     TODAY,
      status:      'coached',
      notes:       '',
      completedAt: new Date().toISOString(),
    });
  };

  const handleAddEodToQueue = (dp: typeof eodWatchlist[0]) => {
    if (!dp.rep) return;
    addToCoachingQueue({
      repId:      dp.rep.id,
      repName:    dp.rep.name,
      storeId:    dp.storeId,
      storeName:  dp.storeName,
      reason:     `${fmtPct(dp.attachmentPctToDaily)} daily attachment on ${dp.date} (${fmtCurrency(dp.attachment)} / ${fmtCurrency(dp.dailyGoal)})`,
      priority:   dp.attachmentPctToDaily < 50 ? 2 : 3,
      greatFocus: dp.bpPct === 0 ? 'Advise (BP Pitch)' : dp.atuPct === 0 ? 'Transact (ATU Close)' : 'Advise + Transact',
      sourcePage: 'agenda',
      sourceType: 'eod-watchlist',
      dueDate:    TODAY,
      status:     'open',
      notes:      '',
    });
  };

  // ── EOD Watchlist ──────────────────────────────────────────────────────────
  const eodWatchlist = useMemo(() => {
    return [YESTERDAY, DAY_BEFORE].flatMap(date =>
      dailyPerf
        .filter(dp => dp.date === date && dp.attachmentPctToDaily < 75)
        .map(dp => ({
          ...dp,
          rep: reps.find(r => r.id === dp.repId),
          storeName: storeMap[dp.storeId] ?? '',
          date,
        }))
        .filter(dp => dp.rep)
    ).slice(0, 8);
  }, [dailyPerf, YESTERDAY, DAY_BEFORE, reps, storeMap]);

  // ── Priority actions ───────────────────────────────────────────────────────
  const priorityActions = useMemo(() => buildPriorityActions(
    repSummaries, storeSummaries, tasks, todayVisitStoreIds, eodWatchlist.length,
  ), [repSummaries, storeSummaries, tasks, todayVisitStoreIds, eodWatchlist.length]);

  // ── Command summary counts ─────────────────────────────────────────────────
  const doNowCount    = priorityActions.filter(a => a.group === 'do-now').length;
  const noData        = repSummaries.filter(rs => rs.mtdAttachments === 0 && rs.mtdBoxes === 0 && rs.bpPct === 0 && rs.atuPct === 0);
  const dataIsSuspect = repSummaries.length > 0 && noData.length / repSummaries.length > 0.5;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleStatusChange = (id: string, status: Task['status']) => {
    updateTask(id, { status, completedAt: status === 'completed' ? new Date().toISOString() : undefined });
  };

  // ── Top recommended visit ───────────────────────────────────────────────────
  const recommendedVisit = useMemo(() => {
    if (plannedVisits.length > 0) return null;
    return [...storeSummaries]
      .filter(ss => ss.isRed || needsVisitStores.some(n => n.store.id === ss.store.id))
      .sort((a, b) => {
        const score = (ss: StoreSummary) =>
          (!ss.lastVisitDate ? 200 : Math.min(200, daysSince(ss.lastVisitDate) * 5)) +
          (ss.isRed ? 80 : 0);
        return score(b) - score(a);
      })[0] ?? null;
  }, [storeSummaries, plannedVisits, needsVisitStores]);

  // ── Action groups ──────────────────────────────────────────────────────────
  const doNowActions   = priorityActions.filter(a => a.group === 'do-now');
  const doTodayActions = priorityActions.filter(a => a.group === 'do-today');
  const watchActions   = priorityActions.filter(a => a.group === 'watch');
  let globalRank = 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-screen-xl">

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays size={20} className="text-accent-orange" />
            <h1 className="text-xl font-bold text-ink-primary">Today's Agenda</h1>
            {doNowCount > 0 && (
              <span className="text-xs font-bold bg-signal-red/20 text-signal-red border border-signal-red/30 rounded-full px-2 py-0.5">
                {doNowCount} urgent
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">{dateHeader} · Daily action plan</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/coaching" className="btn-ghost text-xs flex items-center gap-1.5"><BookOpen size={13} /> Coaching Hub</Link>
          <Link to="/tasks" className="btn-secondary text-xs flex items-center gap-1.5"><CheckSquare size={13} /> All Tasks</Link>
          <button onClick={() => openPlanVisit()} className="btn-primary text-xs flex items-center gap-1.5"><Plus size={14} /> Log Visit</button>
        </div>
      </div>

      {/* ── Data Quality Banner ────────────────────────────────────────────── */}
      {dataIsSuspect && (
        <div className="rounded-2xl border border-signal-amber/30 bg-signal-amber/5 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-signal-amber flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-signal-amber">Performance data may be incomplete</p>
            <p className="text-xs text-ink-secondary mt-0.5">
              {noData.length} of {repSummaries.length} reps show 0% to goal with no activity. Confirm EOD uploads before coaching or flagging as red.
            </p>
            <div className="flex gap-2 mt-2">
              <Link to="/daily-numbers" className="text-xs font-semibold text-accent-orange hover:underline">Upload Numbers</Link>
              <span className="text-ink-muted text-xs">·</span>
              <Link to="/eod-reports" className="text-xs font-semibold text-accent-orange hover:underline">Request EOD</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Today's Command Summary ─────────────────────────────────────── */}
      <div>
        <p className="metric-label mb-3 flex items-center gap-2">
          <Activity size={13} className="text-ink-muted" /> Today's Command Summary
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <SummaryCard label="Critical Actions" value={doNowCount}              sub="Top priority items"       valueCls={doNowCount > 0 ? 'text-signal-red' : 'text-ink-primary'} />
          <SummaryCard label="Coaching Needed"  value={repsInRed.length}        sub="Prioritize top 5"        valueCls={repsInRed.length > 0 ? 'text-accent-orange' : 'text-ink-primary'}
            action={repsInRed.length > 0 ? { label: 'View reps', to: '/reps' } : undefined} />
          <SummaryCard label="Stores Need Visit" value={needsVisitStores.length} sub="7+ days or never"       valueCls={needsVisitStores.length > 0 ? 'text-accent-orange' : 'text-ink-primary'}
            action={needsVisitStores.length > 0 ? { label: 'Plan visits', to: '/visits' } : undefined} />
          <SummaryCard label="EOD Watchlist"    value={eodWatchlist.length}     sub="Below 75% · last 2 days" valueCls={eodWatchlist.length > 0 ? 'text-signal-amber' : 'text-ink-primary'} />
          <SummaryCard label="Scheduled Events" value={timeBlockCount}          sub="Calendar + tasks today"  valueCls={timeBlockCount > 0 ? 'text-accent-blue-light' : 'text-ink-primary'} />
          <SummaryCard label="Open Tasks"       value={openTasks.length}        sub={overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : 'All current'} valueCls={overdueTasks.length > 0 ? 'text-signal-red' : openTasks.length === 0 ? 'text-signal-green' : 'text-ink-primary'}
            action={openTasks.length > 0 ? { label: 'View tasks', to: '/tasks' } : undefined} />
        </div>
      </div>

      {/* ── 3. Priority Action Plan ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
            <Zap size={15} className="text-accent-orange" /> Priority Action Plan
          </p>
          <span className="text-[11px] text-ink-muted">{priorityActions.length} actions ranked by urgency</span>
        </div>
        {priorityActions.length === 0 ? (
          <div className="card p-8 text-center">
            <CheckCircle size={24} className="text-signal-green mx-auto mb-2" />
            <p className="text-sm font-semibold text-signal-green">All clear — no priority actions today</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(['do-now', 'do-today', 'watch'] as ActionGroup[]).map(group => {
              const groupActions = group === 'do-now' ? doNowActions : group === 'do-today' ? doTodayActions : watchActions;
              if (groupActions.length === 0) return null;
              const cfg = ACTION_GROUP_CFG[group];
              return (
                <div key={group}>
                  <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2 ${cfg.cls}`}>
                    <span className={`w-2 h-2 rounded-full ${cfg.dotCls}`} />
                    {cfg.label}
                  </p>
                  <div className="space-y-2">
                    {groupActions.map(action => (
                      <PriorityActionItem key={action.id} action={action} rank={++globalRank} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4 + 5. Time Block Agenda | Visit Plan ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Time Block Agenda */}
        <div className="space-y-3 order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <Clock size={15} className="text-accent-blue-light" /> Today's Time Blocks
              {timeBlockCount > 0 && <span className="badge-blue">{timeBlockCount}</span>}
            </p>
            <Link to="/schedule" className="text-xs text-ink-muted hover:text-ink-secondary transition-colors flex items-center gap-1">
              Full Schedule <ChevronRight size={11} />
            </Link>
          </div>

          {timeBlockCount === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-sm text-ink-secondary mb-1">No calendar events or tasks due today.</p>
              <p className="text-xs text-ink-muted">Sync Google Calendar or Google Tasks from Settings → Sources.</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="divide-y divide-navy-700">
                {todayCalEvents.map(event => {
                  const cfg = CAL_EVENT_CFG['calendar'];
                  const timeStr = fmt12h(timeFromISO(event.start));
                  const dur     = durationLabel(event.start, event.end);
                  return (
                    <div key={event.id} className="flex items-start gap-3 p-4">
                      <div className="flex-shrink-0 text-center w-16 pt-0.5">
                        <p className="text-xs font-bold text-ink-primary tabular-nums">{timeStr}</p>
                        {dur && <p className="text-[10px] text-ink-muted">{dur}</p>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>
                          {event.source === 'google_calendar' && (
                            <span className="text-[10px] text-ink-faint">Google</span>
                          )}
                          {event.status === 'tentative' && (
                            <span className="text-[10px] text-signal-amber">Tentative</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-ink-primary leading-tight">{event.title}</p>
                        {event.location && <p className="text-[11px] text-ink-muted mt-0.5">{event.location}</p>}
                        {event.description && <p className="text-[11px] text-ink-secondary leading-relaxed mt-0.5 line-clamp-2">{event.description}</p>}
                      </div>
                    </div>
                  );
                })}

                {todayGoogleTasks.length > 0 && (
                  <div className="px-4 py-3 bg-navy-800/40">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-signal-green mb-2 flex items-center gap-1.5">
                      <CheckSquare size={11} /> Google Tasks Due Today ({todayGoogleTasks.length})
                    </p>
                    <div className="space-y-1.5">
                      {todayGoogleTasks.map(t => (
                        <div key={t.id} className="flex items-start gap-2">
                          <Circle size={13} className="text-signal-green mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-ink-primary leading-tight">{t.title}</p>
                            {t.notes && <p className="text-[10px] text-ink-muted leading-tight mt-0.5 line-clamp-1">{t.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Visit Plan */}
        <div className="space-y-3 order-1 lg:order-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <MapPin size={15} className="text-accent-orange" /> Visit Plan
              {plannedVisits.length > 0 && <span className="badge-blue">{plannedVisits.length} scheduled</span>}
            </p>
            <div className="flex items-center gap-2">
              <Link to="/visits" className="btn-ghost text-xs flex items-center gap-1">
                <Plus size={11} /> Log Visit
              </Link>
            </div>
          </div>

          {plannedVisits.length > 0 ? (
            <div className="space-y-3">
              {plannedVisits.map(v => {
                const ss = storeSummaries.find(s => s.store.id === v.storeId);
                return (
                  <div key={v.id} className={`card p-4 border ${ss?.isRed ? 'border-signal-red/20 bg-signal-red/5' : 'border-navy-500'} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-ink-primary">{ss?.store.name ?? 'Unknown Store'}</p>
                        <p className="text-xs text-ink-muted">{v.visitType}</p>
                      </div>
                      {ss?.isRed && <span className="badge-red text-[10px]">Red Zone</span>}
                    </div>
                    {ss && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: 'Att%', value: fmtPct(ss.attachmentPctToGoal), cls: ss.attachmentPctToGoal >= 90 ? 'text-signal-green' : ss.attachmentPctToGoal >= 75 ? 'text-signal-amber' : 'text-signal-red' },
                          { label: 'Boxes', value: ss.mtdBoxes, cls: 'text-ink-primary' },
                          { label: 'BP%', value: `${ss.bpPct}%`, cls: ss.bpPct === 0 ? 'text-signal-red' : 'text-signal-amber' },
                        ].map(kpi => (
                          <div key={kpi.label} className="bg-navy-800 rounded-lg p-1.5 text-center">
                            <p className="text-[9px] text-ink-muted">{kpi.label}</p>
                            <p className={`text-xs font-bold ${kpi.cls}`}>{kpi.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => updateVisit(v.id, { status: 'completed' })}
                        className="btn-primary text-[11px] py-1.5 px-2.5 flex items-center gap-1">
                        <CheckCircle size={11} /> Mark Complete
                      </button>
                      <Link to={`/stores/${v.storeId}`} className="btn-secondary text-[11px] py-1.5 px-2.5 flex items-center gap-1">
                        Store Scorecard <ChevronRight size={11} />
                      </Link>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between text-xs text-ink-muted px-1">
                <span>MTD: {completedVisits.length}/{settings.monthlyVisitGoal} visits completed</span>
                <Link to="/visits" className="text-accent-blue-light hover:underline">View all visits</Link>
              </div>
            </div>
          ) : (
            <div className="card p-4 space-y-3">
              <div className="flex items-center gap-2 text-signal-amber">
                <MapPin size={14} />
                <p className="text-sm font-semibold">No visits scheduled today</p>
              </div>
              {recommendedVisit ? (
                <>
                  <p className="text-xs text-ink-secondary">Based on visit priority, consider visiting:</p>
                  <div className={`rounded-xl border p-3 space-y-2 ${recommendedVisit.isRed ? 'border-signal-red/20 bg-signal-red/5' : 'border-navy-500 bg-navy-700'}`}>
                    <div className="flex items-center justify-between">
                      <Link to={`/stores/${recommendedVisit.store.id}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors">
                        {recommendedVisit.store.name}
                      </Link>
                      {recommendedVisit.isRed && <span className="badge-red text-[10px]">Red Zone</span>}
                    </div>
                    <p className="text-[11px] text-ink-secondary">
                      {!recommendedVisit.lastVisitDate ? 'No visits recorded' : `Last visit ${daysSince(recommendedVisit.lastVisitDate)}d ago`}
                      {recommendedVisit.isRed ? ` · ${fmtPct(recommendedVisit.attachmentPctToGoal)} to goal` : ''}
                    </p>
                    <p className="text-[11px] text-accent-orange">Visit focus: Observe GREAT · Attachment close · ATU ask</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openPlanVisit({ storeId: recommendedVisit.store.id })}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                      >
                        <MapPin size={11} /> Plan Visit
                      </button>
                      <Link to={`/stores/${recommendedVisit.store.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                        <Activity size={11} /> Scorecard
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-muted px-1">
                    <span>MTD: {completedVisits.length}/{settings.monthlyVisitGoal} visits</span>
                    <Link to="/visits" className="text-accent-blue-light hover:underline">All visits</Link>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <CheckCircle size={20} className="text-signal-green mx-auto mb-1.5" />
                  <p className="text-xs text-ink-secondary">All stores visited recently</p>
                  <button onClick={() => openPlanVisit()} className="btn-primary text-xs mt-2">Plan a Visit</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 6 + 7. Coaching Queue | EOD Watchlist ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Coaching Queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <BookOpen size={15} className="text-accent-orange" /> Coaching Queue
              {(coachingQueue.length + activeQueueItems.length) > 0 && (
                <span className="badge-orange !text-[10px] !px-1.5 !py-0.5">{coachingQueue.length + activeQueueItems.length}</span>
              )}
            </p>
            <Link to="/coaching" className="text-xs text-accent-blue-light hover:underline flex items-center gap-1">
              Hub <ChevronRight size={11} />
            </Link>
          </div>

          {dataIsSuspect && repsInRed.length > 0 && (
            <div className="text-xs text-signal-amber bg-signal-amber/10 border border-signal-amber/20 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={12} className="flex-shrink-0" />
              Some reps may be red due to missing EOD data. Verify before coaching.
            </div>
          )}

          {coachingQueue.length === 0 && activeQueueItems.length === 0 ? (
            <div className="card p-6 text-center">
              <CheckCircle size={20} className="text-signal-green mx-auto mb-2" />
              <p className="text-sm font-semibold text-signal-green">No coaching alerts today</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Persisted queue items added from EOD watchlist */}
              {activeQueueItems.map(item => (
                <div key={item.id} className="card border-l-4 border-l-purple-400 p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-signal-amber/20 text-signal-amber border-signal-amber/30">
                        EOD Watch
                      </span>
                      <Link to={`/reps/${item.repId}`} className="text-sm font-bold text-ink-primary hover:text-white transition-colors block mt-1">
                        {item.repName}
                      </Link>
                      {item.storeName && <p className="text-xs text-ink-muted">{item.storeName}</p>}
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      item.priority <= 2 ? 'bg-signal-red/20 text-signal-red border-signal-red/30' :
                      'bg-signal-amber/20 text-signal-amber border-signal-amber/30'
                    }`}>P{item.priority}</span>
                  </div>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">{item.reason}</p>
                  <div className="flex gap-2 pt-1 border-t border-navy-600">
                    <button
                      onClick={() => updateCoachingQueueItem(item.id, { status: 'coached', completedAt: new Date().toISOString() })}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1"
                    >
                      <CheckCircle size={12} /> Mark Coached
                    </button>
                    <Link to={`/reps/${item.repId}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                      <Activity size={12} /> Scorecard
                    </Link>
                  </div>
                </div>
              ))}

              {/* Computed red-zone / watch cards */}
              {coachingQueue.map(rs => (
                <CoachingQueueItem key={rs.rep.id} rs={rs} storeName={storeMap[rs.rep.defaultStoreId] ?? ''} onMarkCoached={handleMarkCoached} />
              ))}

              {repsInRed.length > 5 && (
                <Link to="/reps" className="flex items-center justify-center gap-1.5 text-xs text-accent-orange hover:text-white transition-colors py-2 border border-navy-600 rounded-xl hover:border-accent-orange/30">
                  View all {repsInRed.length} reps needing coaching <ChevronRight size={12} />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* EOD Watchlist */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <TrendingDown size={15} className="text-signal-amber" /> EOD Watchlist
              <span className="text-[11px] text-ink-muted font-normal">Last 2 days · below 75%</span>
            </p>
            <Link to="/daily-numbers" className="text-xs text-accent-blue-light hover:underline flex items-center gap-1">
              Daily Numbers <ChevronRight size={11} />
            </Link>
          </div>

          {eodWatchlist.length === 0 ? (
            <div className="card p-6 text-center">
              <Eye size={20} className="text-signal-green mx-auto mb-2" />
              <p className="text-sm font-semibold text-signal-green">No reps below 75% in the last 2 days</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="divide-y divide-navy-700">
                {eodWatchlist.map((dp, i) => (
                  <div key={`${dp.repId}-${dp.date}-${i}`} className="flex items-center gap-3 p-3 hover:bg-navy-700/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-ink-primary">{dp.rep?.name}</p>
                        <span className="text-[10px] text-ink-muted">·</span>
                        <p className="text-[10px] text-ink-muted truncate">{dp.storeName}</p>
                      </div>
                      <p className="text-[10px] text-ink-muted mt-0.5">{dp.date}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${dp.attachmentPctToDaily < 60 ? 'text-signal-red' : 'text-signal-amber'}`}>
                        {fmtPct(dp.attachmentPctToDaily)}
                      </p>
                      <p className="text-[10px] text-ink-muted">{fmtCurrency(dp.attachment)} / {fmtCurrency(dp.dailyGoal)}</p>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {dp.rep && (
                        <button
                          onClick={() => handleAddEodToQueue(dp)}
                          className="text-[10px] font-semibold text-accent-orange hover:underline whitespace-nowrap text-right"
                        >
                          {activeQueueRepIds.has(dp.rep.id) ? '✓ In Queue' : 'Add to Queue'}
                        </button>
                      )}
                      <Link to="/tasks" className="text-[10px] text-ink-muted hover:text-ink-secondary whitespace-nowrap">
                        Create Task
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Store Schedule ─────────────────────────────────────────────────── */}
      {todayShifts.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-ink-secondary" />
              <p className="text-sm font-bold text-ink-primary">Today's Store Schedule</p>
              <span className="badge-neutral">{todayShifts.length} shifts</span>
            </div>
            <Link to="/schedule" className="btn-ghost text-xs">Full Schedule <ChevronRight size={12} /></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {stores.filter(s => s.active).map(store => {
              const storeShifts = todayShifts.filter(sh => sh.storeId === store.id);
              if (storeShifts.length === 0) return null;
              const ss = storeSummaries.find(s => s.store.id === store.id);
              return (
                <div key={store.id} className={`p-3 rounded-xl border ${ss?.isRed ? 'border-signal-red/25 bg-signal-red/5' : 'border-navy-500 bg-navy-700'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Link to={`/stores/${store.id}`} className="text-xs font-bold text-ink-primary truncate hover:text-white transition-colors">{store.name}</Link>
                    {ss?.isRed && <span className="w-2 h-2 rounded-full bg-signal-red flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-ink-muted mb-1.5">{fmt12h(store.hours.open)}–{fmt12h(store.hours.close)}</p>
                  {storeShifts.map(sh => {
                    const rep = reps.find(r => r.id === sh.repId);
                    return (
                      <div key={sh.id} className="flex items-center justify-between">
                        {rep
                          ? <Link to={`/reps/${rep.id}`} className="text-[11px] text-ink-secondary truncate hover:text-ink-primary hover:underline">{rep.name}</Link>
                          : <span className="text-[11px] text-ink-muted">{sh.repName ?? '—'}</span>}
                        <p className="text-[10px] text-ink-muted flex-shrink-0 ml-1">{fmt12h(sh.startTime ?? '')}–{fmt12h(sh.endTime ?? '')}</p>
                      </div>
                    );
                  })}
                </div>
              );
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {/* ── Tasks ──────────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare size={15} className="text-ink-secondary" />
            <p className="text-sm font-bold text-ink-primary">Tasks</p>
            {overdueTasks.length > 0 && <span className="badge-red">{overdueTasks.length} overdue</span>}
            <span className="badge-neutral">{openTasks.length} open</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCompleted(c => !c)} className="btn-ghost text-xs">
              {showCompleted ? 'Hide' : 'Show'} completed
            </button>
            <Link to="/tasks" className="btn-primary text-xs flex items-center gap-1"><Plus size={12} /> New Task</Link>
          </div>
        </div>
        {sortedTasks.length === 0 ? (
          <div className="py-6 text-center">
            <CheckCircle size={20} className="text-signal-green mx-auto mb-2" />
            <p className="text-sm text-ink-secondary">All tasks done!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTasks.map(task => (
              <TaskRow key={task.id} task={task} onStatusChange={handleStatusChange} />
            ))}
            {showCompleted && completedTasks.length > 0 && (
              <>
                <div className="border-t border-navy-600 my-3" />
                <p className="text-xs text-ink-muted font-semibold uppercase tracking-wider mb-2">Completed</p>
                {completedTasks.map(task => (
                  <TaskRow key={task.id} task={task} onStatusChange={handleStatusChange} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 8. Alert Backlog ───────────────────────────────────────────────── */}
      <div className="card p-5">
        <button
          onClick={() => setBacklogExpanded(v => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Shield size={15} className="text-ink-muted" />
          <p className="text-sm font-bold text-ink-primary">All Alerts</p>
          <span className="badge-neutral">{repsInRed.length + storesInRed.length + needsVisitStores.length} total</span>
          <span className="text-xs text-ink-muted ml-1">Grouped · collapsed by default</span>
          <ChevronDown size={14} className={`ml-auto text-ink-muted transition-transform ${backlogExpanded ? 'rotate-180' : ''}`} />
        </button>

        {backlogExpanded && (
          <div className="mt-4 space-y-0.5 border-t border-navy-600 pt-4">
            <AlertGroup title="Reps in Red" icon={Users} count={repsInRed.length} dotCls="bg-signal-red">
              {repsInRed.map(rs => (
                <div key={rs.rep.id} className="flex items-center justify-between py-1 text-xs">
                  <Link to={`/reps/${rs.rep.id}`} className="text-ink-secondary hover:text-ink-primary transition-colors truncate">
                    {rs.rep.name} — {fmtPct(rs.attachmentPctToGoal)}
                  </Link>
                  <Link to={`/reps/${rs.rep.id}`} className="text-[10px] text-accent-orange hover:underline flex-shrink-0 ml-2">Coach</Link>
                </div>
              ))}
            </AlertGroup>

            <AlertGroup title="Stores in Red" icon={Activity} count={storesInRed.length} dotCls="bg-signal-red">
              {storesInRed.map(ss => (
                <div key={ss.store.id} className="flex items-center justify-between py-1 text-xs">
                  <Link to={`/stores/${ss.store.id}`} className="text-ink-secondary hover:text-ink-primary transition-colors truncate">
                    {ss.store.name} — {fmtPct(ss.attachmentPctToGoal)}
                  </Link>
                  <Link to="/visits" className="text-[10px] text-accent-orange hover:underline flex-shrink-0 ml-2">Plan Visit</Link>
                </div>
              ))}
            </AlertGroup>

            <AlertGroup title="Needs Visit" icon={MapPin} count={needsVisitStores.length} dotCls="bg-accent-orange">
              {needsVisitStores.map(ss => (
                <div key={ss.store.id} className="flex items-center justify-between py-1 text-xs">
                  <Link to={`/stores/${ss.store.id}`} className="text-ink-secondary hover:text-ink-primary transition-colors truncate">
                    {ss.store.name} — {!ss.lastVisitDate ? 'Never visited' : `${daysSince(ss.lastVisitDate)}d since last visit`}
                  </Link>
                  <Link to="/visits" className="text-[10px] text-accent-orange hover:underline flex-shrink-0 ml-2">Plan</Link>
                </div>
              ))}
            </AlertGroup>

            <AlertGroup title="Open Tasks" icon={CheckSquare} count={openTasks.length} dotCls="bg-navy-400">
              {openTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between py-1 text-xs">
                  <span className={`text-ink-secondary truncate ${isOverdue(task.dueDate, task.status) ? 'text-signal-red' : ''}`}>
                    {isOverdue(task.dueDate, task.status) ? '⚠ ' : ''}{task.title} — due {task.dueDate}
                  </span>
                  <Link to="/tasks" className="text-[10px] text-ink-muted hover:text-ink-secondary flex-shrink-0 ml-2">View</Link>
                </div>
              ))}
            </AlertGroup>
          </div>
        )}
      </div>
    </div>
  );
}
