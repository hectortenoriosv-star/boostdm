import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare, Plus, Search, CheckCircle, Circle,
  Clock, User, Store as StoreIcon, X, ChevronDown, ChevronRight,
  AlertTriangle, Flag, MoreHorizontal, List, LayoutGrid,
  BookOpen, MapPin, MessageSquare, DollarSign, Settings2,
  FileText, RefreshCw, RotateCcw, ArrowRight, Calendar,
  Lightbulb, Zap,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { isOverdue, priorityOrder, daysSince, fmtPct } from '../data/calculations';
import type { Task, TaskType, RepSummary, StoreSummary, CoachingNote, EODReport, GoogleTask } from '../types';

// ─── Local Types ───────────────────────────────────────────────────────────────

type ExtendedStatus = 'open' | 'in-progress' | 'waiting' | 'completed' | 'overdue';
type ViewMode = 'list' | 'board';
type DueFilter = 'all' | 'today' | 'overdue' | 'this-week' | 'no-date';
type PriorityFilter = 'all' | Task['priority'];
type TypeFilter = 'all' | TaskType;
type StatusFilter = 'all' | Task['status'];

interface SuggestedTask {
  id: string;
  title: string;
  type: TaskType;
  priority: Task['priority'];
  relatedRepId?: string;
  relatedRepName?: string;
  relatedStoreId?: string;
  relatedStoreName?: string;
  reason: string;
  dueDate: string;
  dueLabel: string;
  actionLabel: string;
  actionPath: string;
}

interface TaskForm {
  title: string;
  description: string;
  taskType: TaskType;
  priority: Task['priority'];
  status: Task['status'];
  dueDate: string;
  repId: string;
  storeId: string;
  notes: string;
}

// ─── Date Constants ────────────────────────────────────────────────────────────

const _now = new Date();
const _ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY_STR = _ld(_now);
const _weekStart = new Date(_now);
_weekStart.setDate(_now.getDate() - _now.getDay());
const WEEK_START = _ld(_weekStart);
const _weekEnd = new Date(_now);
_weekEnd.setDate(_now.getDate() + (6 - _now.getDay()));
const WEEK_END = _ld(_weekEnd);

// ─── Config ────────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<TaskType, {
  label: string;
  textCls: string;
  bgCls: string;
  borderCls: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = {
  coaching: {
    label: 'Coaching', textCls: 'text-signal-purple',
    bgCls: 'bg-signal-purple/10', borderCls: 'border-signal-purple/20', icon: BookOpen,
  },
  visit: {
    label: 'Visit', textCls: 'text-accent-orange',
    bgCls: 'bg-accent-orange/10', borderCls: 'border-accent-orange/20', icon: MapPin,
  },
  eod: {
    label: 'EOD', textCls: 'text-signal-amber',
    bgCls: 'bg-signal-amber/10', borderCls: 'border-signal-amber/20', icon: FileText,
  },
  schedule: {
    label: 'Schedule', textCls: 'text-accent-blue-light',
    bgCls: 'bg-accent-blue/10', borderCls: 'border-accent-blue/20', icon: Calendar,
  },
  message: {
    label: 'Message', textCls: 'text-accent-blue-light',
    bgCls: 'bg-accent-blue/10', borderCls: 'border-accent-blue/30', icon: MessageSquare,
  },
  commission: {
    label: 'Commission', textCls: 'text-signal-green',
    bgCls: 'bg-signal-green/10', borderCls: 'border-signal-green/20', icon: DollarSign,
  },
  admin: {
    label: 'Admin', textCls: 'text-ink-muted',
    bgCls: 'bg-navy-600/50', borderCls: 'border-navy-500', icon: Settings2,
  },
};

const PRIORITY_CFG: Record<Task['priority'], {
  label: string;
  leftBorderCls: string;
  badgeCls: string;
  dotCls: string;
}> = {
  urgent: { label: 'Urgent', leftBorderCls: 'border-l-signal-red', badgeCls: 'badge-red', dotCls: 'bg-signal-red' },
  high:   { label: 'High',   leftBorderCls: 'border-l-accent-orange', badgeCls: 'badge-amber', dotCls: 'bg-accent-orange' },
  medium: { label: 'Medium', leftBorderCls: 'border-l-accent-blue', badgeCls: 'badge-blue', dotCls: 'bg-accent-blue' },
  low:    { label: 'Low',    leftBorderCls: 'border-l-navy-400', badgeCls: 'badge-neutral', dotCls: 'bg-navy-400' },
};

const BOARD_COLS: { status: Task['status']; label: string; accent: string }[] = [
  { status: 'open',        label: 'Open',        accent: 'border-t-ink-faint' },
  { status: 'in-progress', label: 'In Progress', accent: 'border-t-accent-blue' },
  { status: 'waiting',     label: 'Waiting',     accent: 'border-t-signal-amber' },
  { status: 'completed',   label: 'Done',        accent: 'border-t-signal-green' },
];

// ─── Helper Functions ──────────────────────────────────────────────────────────

function getExtendedStatus(task: Task): ExtendedStatus {
  if (task.status === 'completed') return 'completed';
  if (task.dueDate && isOverdue(task.dueDate, task.status)) return 'overdue';
  return task.status as ExtendedStatus;
}

function repFirstName(name: string): string {
  const parts = name.split(',');
  if (parts.length > 1) return parts[1].trim().split(' ')[0];
  return name.split(' ')[0];
}

function inferTaskType(task: Task): TaskType {
  if (task.taskType) return task.taskType;
  if (task.source === 'eod-form') return 'eod';
  if (task.source === 'visit') return 'visit';
  const lower = (task.title + ' ' + (task.description ?? '')).toLowerCase();
  if (lower.includes('coach') || lower.includes('bp ') || lower.includes('atu')) return 'coaching';
  if (lower.includes('visit') || lower.includes('drive')) return 'visit';
  if (lower.includes('eod') || lower.includes('report')) return 'eod';
  if (lower.includes('message') || lower.includes('team')) return 'message';
  if (lower.includes('commission')) return 'commission';
  if (lower.includes('schedule') || lower.includes('coverage')) return 'schedule';
  return 'admin';
}

function fmtDueDate(dateStr: string, status: Task['status']): { label: string; cls: string } {
  if (!dateStr) return { label: 'No due date', cls: 'text-ink-muted' };
  if (status === 'completed') return { label: dateStr, cls: 'text-ink-muted' };
  if (dateStr === TODAY_STR) return { label: 'Due today', cls: 'text-signal-amber font-semibold' };
  if (isOverdue(dateStr, status)) return { label: `Overdue · ${dateStr}`, cls: 'text-signal-red font-semibold' };
  return { label: dateStr, cls: 'text-ink-secondary' };
}

function buildSuggestedTasks(
  repSummaries: RepSummary[],
  storeSummaries: StoreSummary[],
  coachingNotes: CoachingNote[],
  eodReports: EODReport[],
  dismissedIds: Set<string>,
): SuggestedTask[] {
  const results: SuggestedTask[] = [];
  const push = (s: SuggestedTask) => { if (!dismissedIds.has(s.id)) results.push(s); };

  // 1. Red reps with BP = 0 → coach on BP
  repSummaries
    .filter(r => r.isRed && r.bpPct === 0 && r.attachmentGoal > 0)
    .slice(0, 2)
    .forEach(rs => push({
      id: `sg-bp-${rs.rep.id}`,
      title: `Coach ${repFirstName(rs.rep.name)} on BP pitch`,
      type: 'coaching', priority: 'urgent',
      relatedRepId: rs.rep.id, relatedRepName: rs.rep.name,
      reason: `BP 0% · ${fmtPct(rs.attachmentPctToGoal)} to goal`,
      dueDate: TODAY_STR, dueLabel: 'Today',
      actionLabel: 'Open Rep', actionPath: '/reps',
    }));

  // 2. Red reps with ATU = 0 (but BP > 0) → coach on ATU
  repSummaries
    .filter(r => r.isRed && r.atuPct === 0 && r.bpPct > 0 && r.attachmentGoal > 0)
    .slice(0, 1)
    .forEach(rs => push({
      id: `sg-atu-${rs.rep.id}`,
      title: `Coach ${repFirstName(rs.rep.name)} on ATU close`,
      type: 'coaching', priority: 'high',
      relatedRepId: rs.rep.id, relatedRepName: rs.rep.name,
      reason: `ATU 0% · ${fmtPct(rs.attachmentPctToGoal)} to goal`,
      dueDate: TODAY_STR, dueLabel: 'Today',
      actionLabel: 'Open Rep', actionPath: '/reps',
    }));

  // 3. Red reps with no boxes → coach on sales fundamentals
  repSummaries
    .filter(r => r.isRed && r.mtdBoxes === 0 && r.attachmentGoal > 0)
    .slice(0, 1)
    .forEach(rs => push({
      id: `sg-boxes-${rs.rep.id}`,
      title: `Coach ${repFirstName(rs.rep.name)} on box strategy`,
      type: 'coaching', priority: 'urgent',
      relatedRepId: rs.rep.id, relatedRepName: rs.rep.name,
      reason: `0 boxes sold this month`,
      dueDate: TODAY_STR, dueLabel: 'Today',
      actionLabel: 'Open Rep', actionPath: '/reps',
    }));

  // 4. Red stores needing visit (no visit in 5+ days)
  storeSummaries
    .filter(ss => {
      if (!ss.isRed) return false;
      const d = ss.lastVisitDate ? daysSince(ss.lastVisitDate) : 999;
      return d > 5;
    })
    .slice(0, 2)
    .forEach(ss => {
      const d = ss.lastVisitDate ? daysSince(ss.lastVisitDate) : undefined;
      push({
        id: `sg-visit-${ss.store.id}`,
        title: `Plan visit to ${ss.store.name}`,
        type: 'visit', priority: 'high',
        relatedStoreId: ss.store.id, relatedStoreName: ss.store.name,
        reason: `Store in red zone · ${d !== undefined ? `${d}d since last visit` : 'No recent visit'}`,
        dueDate: TODAY_STR, dueLabel: 'Today',
        actionLabel: 'Plan Visit', actionPath: '/visits',
      });
    });

  // 5. Overdue coaching follow-ups
  coachingNotes
    .filter(n => n.status === 'open' && n.followUpDue && n.followUpDue < TODAY_STR)
    .slice(0, 2)
    .forEach(note => push({
      id: `sg-coachfu-${note.id}`,
      title: `Follow up on coaching note`,
      type: 'coaching', priority: 'high',
      relatedRepId: note.repId,
      reason: `Follow-up was due ${note.followUpDue}`,
      dueDate: TODAY_STR, dueLabel: 'Overdue',
      actionLabel: 'Open Coaching', actionPath: '/coaching',
    }));

  // 6. Unreviewed EOD reports
  const unreviewed = eodReports.filter(e => e.status === 'new');
  if (unreviewed.length > 0) {
    push({
      id: `sg-eod-review`,
      title: `Review ${unreviewed.length} unread EOD report${unreviewed.length > 1 ? 's' : ''}`,
      type: 'eod', priority: 'high',
      reason: `${unreviewed.length} report${unreviewed.length > 1 ? 's' : ''} awaiting review`,
      dueDate: TODAY_STR, dueLabel: 'Before close',
      actionLabel: 'Open EOD Reports', actionPath: '/eod-reports',
    });
  }

  // 7. ATU team message if district avg ATU < 50%
  if (repSummaries.length > 0) {
    const avgAtu = repSummaries.reduce((s, r) => s + r.atuPct, 0) / repSummaries.length;
    if (avgAtu < 50) {
      push({
        id: `sg-atu-msg`,
        title: 'Send ATU Power Hour message to team',
        type: 'message', priority: 'medium',
        reason: `District ATU averaging ${Math.round(avgAtu)}% — below goal`,
        dueDate: TODAY_STR, dueLabel: '2 PM today',
        actionLabel: 'Daily Numbers', actionPath: '/daily-numbers',
      });
    }
  }

  // 8. Stores with no visit ever
  storeSummaries
    .filter(ss => !ss.lastVisitDate && ss.attachmentGoal > 0)
    .slice(0, 1)
    .forEach(ss => push({
      id: `sg-novisit-${ss.store.id}`,
      title: `Schedule first visit to ${ss.store.name}`,
      type: 'visit', priority: 'medium',
      relatedStoreId: ss.store.id, relatedStoreName: ss.store.name,
      reason: `No visit on record for this store`,
      dueDate: TODAY_STR, dueLabel: 'This week',
      actionLabel: 'Plan Visit', actionPath: '/visits',
    }));

  return results.slice(0, 8);
}

// ─── Badge Components ──────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: TaskType }) {
  const cfg = TYPE_CFG[type];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${cfg.textCls} ${cfg.bgCls} ${cfg.borderCls}`}>
      <Icon size={9} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const cfg = PRIORITY_CFG[priority];
  return <span className={`${cfg.badgeCls} text-[10px]`}>{cfg.label}</span>;
}

function ExtStatusBadge({ status }: { status: ExtendedStatus }) {
  const cfgs: Record<ExtendedStatus, string> = {
    open: 'text-ink-muted',
    'in-progress': 'text-accent-blue-light',
    waiting: 'text-signal-amber',
    completed: 'text-signal-green',
    overdue: 'text-signal-red',
  };
  const labels: Record<ExtendedStatus, string> = {
    open: 'Open', 'in-progress': 'In Progress', waiting: 'Waiting',
    completed: 'Completed', overdue: 'Overdue',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfgs[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Add Task Modal ────────────────────────────────────────────────────────────

function AddTaskModal({
  onClose, onAdd, reps, stores, initialValues,
}: {
  onClose: () => void;
  onAdd: (t: Omit<Task, 'id' | 'createdAt'>) => void;
  reps: import('../types').Rep[];
  stores: import('../types').Store[];
  initialValues?: Partial<TaskForm>;
}) {
  const [form, setForm] = useState<TaskForm>({
    title: '',
    description: '',
    taskType: 'admin',
    priority: 'medium',
    status: 'open',
    dueDate: TODAY_STR,
    repId: '',
    storeId: '',
    notes: '',
    ...initialValues,
  });

  const set = <K extends keyof TaskForm>(k: K, v: TaskForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.title.trim()) return;
    onAdd({
      title: form.title.trim(),
      description: form.description,
      taskType: form.taskType,
      priority: form.priority,
      status: form.status,
      dueDate: form.dueDate,
      repId: form.repId || undefined,
      storeId: form.storeId || undefined,
      notes: form.notes,
      source: 'manual',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-500">
          <p className="text-sm font-bold text-ink-primary">New Task</p>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <input
            className="input-base w-full text-sm"
            placeholder="Task title *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            autoFocus
          />

          {/* Type chips */}
          <div>
            <p className="text-[11px] text-ink-muted mb-2 font-medium uppercase tracking-wide">Type</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TYPE_CFG) as TaskType[]).map(t => {
                const cfg = TYPE_CFG[t];
                const Icon = cfg.icon;
                const active = form.taskType === t;
                return (
                  <button
                    key={t}
                    onClick={() => set('taskType', t)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
                      active
                        ? `${cfg.textCls} ${cfg.bgCls} ${cfg.borderCls}`
                        : 'text-ink-muted bg-navy-800 border-navy-600 hover:border-navy-400'
                    }`}
                  >
                    <Icon size={10} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5 font-medium uppercase tracking-wide">Priority</label>
              <select className="input-base w-full text-sm" value={form.priority} onChange={e => set('priority', e.target.value as Task['priority'])}>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5 font-medium uppercase tracking-wide">Status</label>
              <select className="input-base w-full text-sm" value={form.status} onChange={e => set('status', e.target.value as Task['status'])}>
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="waiting">Waiting</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-ink-muted block mb-1.5 font-medium uppercase tracking-wide">Due Date</label>
            <input className="input-base w-full text-sm" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5 font-medium uppercase tracking-wide">Related Rep</label>
              <select className="input-base w-full text-sm" value={form.repId} onChange={e => set('repId', e.target.value)}>
                <option value="">None</option>
                {reps.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5 font-medium uppercase tracking-wide">Related Store</label>
              <select className="input-base w-full text-sm" value={form.storeId} onChange={e => set('storeId', e.target.value)}>
                <option value="">None</option>
                {stores.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <textarea
            className="input-base w-full resize-none text-sm"
            rows={2}
            placeholder="Description / reason"
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
          <textarea
            className="input-base w-full resize-none text-sm"
            rows={2}
            placeholder="Notes"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-navy-500">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button onClick={submit} disabled={!form.title.trim()} className="btn-primary flex-1 text-sm disabled:opacity-50">
            Add Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Drawer ───────────────────────────────────────────────────────────────

function TaskDrawer({
  task, onClose, onUpdate, onDelete, reps, stores,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, changes: Partial<Task>) => void;
  onDelete: (id: string) => void;
  reps: import('../types').Rep[];
  stores: import('../types').Store[];
}) {
  const rep = reps.find(r => r.id === task.repId);
  const store = stores.find(s => s.id === task.storeId);
  const exStatus = getExtendedStatus(task);
  const taskType = inferTaskType(task);
  const TypeIcon = TYPE_CFG[taskType].icon;

  const markStatus = (s: Task['status']) =>
    onUpdate(task.id, { status: s, completedAt: s === 'completed' ? new Date().toISOString() : undefined });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-navy-800 border-l border-navy-500 flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-navy-500 sticky top-0 bg-navy-800 z-10">
          <div className="flex-1 min-w-0 pr-3 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <TypeBadge type={taskType} />
              <PriorityBadge priority={task.priority} />
              {exStatus === 'overdue' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-signal-red">
                  <AlertTriangle size={9} /> Overdue
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-ink-primary leading-snug">{task.title}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 flex-shrink-0"><X size={15} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status picker */}
          <div>
            <p className="text-[11px] font-semibold text-ink-muted mb-2 uppercase tracking-wide">Status</p>
            <div className="grid grid-cols-4 gap-1.5">
              {(['open', 'in-progress', 'waiting', 'completed'] as Task['status'][]).map(s => {
                const active = task.status === s;
                const cls = active
                  ? s === 'completed'   ? 'bg-signal-green/20 text-signal-green border-signal-green/40'
                    : s === 'in-progress' ? 'bg-accent-blue/20 text-accent-blue-light border-accent-blue/40'
                    : s === 'waiting'     ? 'bg-signal-amber/20 text-signal-amber border-signal-amber/40'
                    : 'bg-navy-500 text-ink-primary border-navy-400'
                  : 'bg-navy-700 text-ink-muted border-navy-600 hover:border-navy-400';
                return (
                  <button
                    key={s}
                    onClick={() => markStatus(s)}
                    className={`py-1.5 px-1 rounded-lg text-[10px] font-semibold text-center border transition-all ${cls}`}
                  >
                    {s === 'in-progress' ? 'In Prog' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-navy-700 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">Due Date</p>
              <p className={`text-xs font-semibold ${exStatus === 'overdue' ? 'text-signal-red' : exStatus === 'open' && task.dueDate === TODAY_STR ? 'text-signal-amber' : 'text-ink-primary'}`}>
                {task.dueDate || '—'}
              </p>
            </div>
            <div className="bg-navy-700 rounded-xl p-3">
              <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">Type</p>
              <div className="flex items-center gap-1">
                <TypeIcon size={11} className={TYPE_CFG[taskType].textCls} />
                <p className={`text-xs font-semibold ${TYPE_CFG[taskType].textCls}`}>{TYPE_CFG[taskType].label}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <p className="text-[11px] font-semibold text-ink-muted mb-2 uppercase tracking-wide">Description</p>
              <p className="text-sm text-ink-primary leading-relaxed bg-navy-700 rounded-xl p-3">{task.description}</p>
            </div>
          )}

          {/* Notes */}
          {task.notes && (
            <div>
              <p className="text-[11px] font-semibold text-ink-muted mb-2 uppercase tracking-wide">Notes</p>
              <p className="text-sm text-ink-secondary leading-relaxed bg-navy-700 rounded-xl p-3">{task.notes}</p>
            </div>
          )}

          {/* Linked entities */}
          {(rep || store) && (
            <div className="space-y-2">
              {rep && (
                <div className="flex items-center gap-2 p-3 bg-navy-700 rounded-xl">
                  <User size={12} className="text-ink-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-ink-muted">Rep</p>
                    <p className="text-xs font-semibold text-ink-primary truncate">{rep.name}</p>
                  </div>
                </div>
              )}
              {store && (
                <div className="flex items-center gap-2 p-3 bg-navy-700 rounded-xl">
                  <StoreIcon size={12} className="text-ink-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-ink-muted">Store</p>
                    <p className="text-xs font-semibold text-ink-primary truncate">{store.name}</p>
                    {store.address && <p className="text-[10px] text-ink-muted truncate">{store.address}</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source */}
          {task.source && task.source !== 'manual' && (
            <div className="flex items-center gap-2 p-3 bg-navy-700/50 rounded-xl border border-navy-600">
              <Flag size={11} className="text-ink-muted" />
              <p className="text-[11px] text-ink-muted">Source: <span className="text-ink-secondary capitalize">{task.source}</span></p>
            </div>
          )}

          {task.completedAt && (
            <p className="text-[11px] text-ink-muted text-center">
              Completed {new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}

          {/* Quick actions */}
          <div className="space-y-2">
            {task.status !== 'completed' && (
              <button
                onClick={() => markStatus('completed')}
                className="w-full py-2 text-xs font-semibold text-signal-green border border-signal-green/20 rounded-xl hover:bg-signal-green/10 transition-colors"
              >
                Mark Complete
              </button>
            )}
            {task.status === 'completed' && (
              <button
                onClick={() => markStatus('open')}
                className="w-full py-2 text-xs font-semibold text-ink-secondary border border-navy-500 rounded-xl hover:bg-navy-700 transition-colors"
              >
                Reopen Task
              </button>
            )}
            <button
              onClick={() => { onDelete(task.id); onClose(); }}
              className="w-full py-2 text-xs font-semibold text-signal-red border border-signal-red/20 rounded-xl hover:bg-signal-red/10 transition-colors"
            >
              Delete Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Suggested Task Card ───────────────────────────────────────────────────────

function SuggestedTaskCard({
  s, onAdd, onDismiss,
}: {
  s: SuggestedTask;
  onAdd: (s: SuggestedTask) => void;
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  const cfg = TYPE_CFG[s.type];
  const pcfg = PRIORITY_CFG[s.priority];

  return (
    <div className={`relative bg-navy-700 rounded-xl border border-navy-500 p-4 border-l-2 ${pcfg.leftBorderCls} hover:border-navy-400 transition-colors`}>
      <button
        onClick={() => onDismiss(s.id)}
        className="absolute top-3 right-3 p-0.5 text-ink-muted hover:text-ink-secondary transition-colors"
        title="Dismiss"
      >
        <X size={12} />
      </button>

      <div className="flex items-center gap-1.5 mb-2 flex-wrap pr-6">
        <TypeBadge type={s.type} />
        <PriorityBadge priority={s.priority} />
        <span className="text-[10px] text-signal-amber font-medium">{s.dueLabel}</span>
      </div>

      <p className="text-sm font-semibold text-ink-primary leading-snug mb-1">{s.title}</p>

      {(s.relatedRepName || s.relatedStoreName) && (
        <div className="flex items-center gap-1 mb-1">
          {s.relatedRepName && (
            <span className="flex items-center gap-1 text-[11px] text-ink-secondary">
              <User size={9} /> {s.relatedRepName}
            </span>
          )}
          {s.relatedRepName && s.relatedStoreName && <span className="text-ink-faint text-[10px]">·</span>}
          {s.relatedStoreName && (
            <span className="flex items-center gap-1 text-[11px] text-ink-secondary">
              <StoreIcon size={9} /> {s.relatedStoreName}
            </span>
          )}
        </div>
      )}

      <p className="text-[11px] text-ink-muted mb-3 leading-relaxed">{s.reason}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onAdd(s)}
          className="flex items-center gap-1 text-[11px] font-semibold text-signal-green bg-signal-green/10 border border-signal-green/20 px-2.5 py-1 rounded-lg hover:bg-signal-green/20 transition-colors"
        >
          <Plus size={10} /> Add Task
        </button>
        <button
          onClick={() => navigate(s.actionPath)}
          className={`flex items-center gap-1 text-[11px] font-semibold ${cfg.textCls} ${cfg.bgCls} border ${cfg.borderCls} px-2.5 py-1 rounded-lg hover:opacity-80 transition-opacity`}
        >
          {s.actionLabel} <ArrowRight size={9} />
        </button>
      </div>
    </div>
  );
}

// ─── Task List Row ─────────────────────────────────────────────────────────────

function TaskListRow({
  task, reps, stores, onClick, onStatusChange,
}: {
  task: Task;
  reps: import('../types').Rep[];
  stores: import('../types').Store[];
  onClick: () => void;
  onStatusChange: (id: string, s: Task['status']) => void;
}) {
  const exStatus = getExtendedStatus(task);
  const taskType = inferTaskType(task);
  const rep = reps.find(r => r.id === task.repId);
  const store = stores.find(s => s.id === task.storeId);
  const dueInfo = fmtDueDate(task.dueDate, task.status);
  const pcfg = PRIORITY_CFG[task.priority];

  return (
    <div
      className={`group relative flex items-start gap-3 p-3.5 rounded-xl border border-l-2 ${pcfg.leftBorderCls} transition-all cursor-pointer ${
        exStatus === 'overdue'
          ? 'border-signal-red/20 bg-signal-red/5 hover:bg-signal-red/10'
          : task.status === 'completed'
          ? 'border-navy-600 bg-navy-800/50 opacity-60 hover:opacity-80'
          : 'border-navy-500 bg-navy-700 hover:bg-navy-600/60'
      }`}
      onClick={onClick}
    >
      {/* Status toggle */}
      <button
        onClick={e => {
          e.stopPropagation();
          onStatusChange(task.id, task.status === 'completed' ? 'open' : 'completed');
        }}
        className="flex-shrink-0 mt-0.5"
        title={task.status === 'completed' ? 'Reopen' : 'Mark complete'}
      >
        {task.status === 'completed'
          ? <CheckCircle size={16} className="text-signal-green" />
          : <Circle size={16} className="text-ink-muted hover:text-signal-green transition-colors" />
        }
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <TypeBadge type={taskType} />
              <PriorityBadge priority={task.priority} />
              {exStatus === 'overdue' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-signal-red">
                  <AlertTriangle size={9} /> Overdue
                </span>
              )}
            </div>
            <p className={`text-sm font-semibold leading-snug ${task.status === 'completed' ? 'line-through text-ink-muted' : 'text-ink-primary'}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-ink-muted mt-0.5 truncate max-w-sm">{task.description}</p>
            )}
          </div>

          {/* Due date — desktop right column */}
          <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-[11px] ${dueInfo.cls}`}>{dueInfo.label}</span>
            <ExtStatusBadge status={exStatus} />
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {rep && (
            <span className="flex items-center gap-1 text-[11px] text-ink-muted">
              <User size={10} /> {rep.name}
            </span>
          )}
          {store && (
            <span className="flex items-center gap-1 text-[11px] text-ink-muted">
              <StoreIcon size={10} /> {store.name}
            </span>
          )}
          {/* Due date — mobile */}
          <span className={`sm:hidden text-[11px] ${dueInfo.cls}`}>{dueInfo.label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Board Card ────────────────────────────────────────────────────────────────

function BoardCard({
  task, reps, stores, onClick,
}: {
  task: Task;
  reps: import('../types').Rep[];
  stores: import('../types').Store[];
  onClick: () => void;
}) {
  const exStatus = getExtendedStatus(task);
  const taskType = inferTaskType(task);
  const rep = reps.find(r => r.id === task.repId);
  const store = stores.find(s => s.id === task.storeId);
  const dueInfo = fmtDueDate(task.dueDate, task.status);
  const pcfg = PRIORITY_CFG[task.priority];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border border-l-2 ${pcfg.leftBorderCls} transition-all ${
        exStatus === 'overdue'
          ? 'border-signal-red/20 bg-signal-red/5 hover:bg-signal-red/10'
          : task.status === 'completed'
          ? 'border-navy-600 bg-navy-800 opacity-60'
          : 'border-navy-500 bg-navy-700 hover:bg-navy-600'
      }`}
    >
      <div className="flex items-center gap-1 mb-1.5 flex-wrap">
        <TypeBadge type={taskType} />
        <PriorityBadge priority={task.priority} />
      </div>
      <p className={`text-xs font-semibold leading-snug mb-2 ${task.status === 'completed' ? 'line-through text-ink-muted' : 'text-ink-primary'}`}>
        {task.title}
      </p>
      <div className="flex items-center justify-between gap-1 text-[10px] text-ink-muted">
        <span>{rep ? rep.name.split(',')[0] : store ? store.name.replace('Boost Mobile', '').trim() : '—'}</span>
        <span className={dueInfo.cls}>{task.dueDate || '—'}</span>
      </div>
      {exStatus === 'overdue' && (
        <div className="flex items-center gap-0.5 mt-1.5 text-[10px] font-semibold text-signal-red">
          <AlertTriangle size={9} /> Overdue
        </div>
      )}
    </button>
  );
}

// ─── Board Column ──────────────────────────────────────────────────────────────

function BoardColumn({
  colCfg, tasks, reps, stores, onOpen,
}: {
  colCfg: typeof BOARD_COLS[number];
  tasks: Task[];
  reps: import('../types').Rep[];
  stores: import('../types').Store[];
  onOpen: (t: Task) => void;
}) {
  const emptyLabels: Record<string, string> = {
    open: 'Nothing open',
    'in-progress': 'Nothing in progress',
    waiting: 'No blockers',
    completed: 'Nothing done yet',
  };

  return (
    <div className={`card border-t-2 ${colCfg.accent} flex flex-col min-w-0`}>
      <div className="px-3 py-3 border-b border-navy-500 flex items-center justify-between">
        <p className="text-xs font-bold text-ink-primary">{colCfg.label}</p>
        <span className="badge-neutral text-[10px]">{tasks.length}</span>
      </div>
      <div className="p-2.5 flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[480px]">
        {tasks.length === 0 ? (
          <p className="text-[11px] text-ink-muted text-center pt-6">{emptyLabels[colCfg.status]}</p>
        ) : tasks.map(t => (
          <BoardCard key={t.id} task={t} reps={reps} stores={stores} onClick={() => onOpen(t)} />
        ))}
      </div>
    </div>
  );
}

// ─── Completed Row ─────────────────────────────────────────────────────────────

function CompletedRow({
  task, reps, stores, onClick, onReopen,
}: {
  task: Task;
  reps: import('../types').Rep[];
  stores: import('../types').Store[];
  onClick: () => void;
  onReopen: (id: string) => void;
}) {
  const rep = reps.find(r => r.id === task.repId);
  const store = stores.find(s => s.id === task.storeId);
  const taskType = inferTaskType(task);
  const completedDate = task.completedAt
    ? new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : task.dueDate || '—';

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-navy-600 bg-navy-800/50 hover:bg-navy-800 transition-colors cursor-pointer group" onClick={onClick}>
      <CheckCircle size={14} className="text-signal-green flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <TypeBadge type={taskType} />
          <PriorityBadge priority={task.priority} />
        </div>
        <p className="text-xs font-semibold text-ink-muted line-through truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {rep && <span className="text-[10px] text-ink-muted">{rep.name}</span>}
          {store && <span className="text-[10px] text-ink-muted">{store.name}</span>}
          <span className="text-[10px] text-ink-muted">Done {completedDate}</span>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onReopen(task.id); }}
        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-ink-muted hover:text-ink-secondary border border-navy-500 px-2 py-1 rounded-lg transition-all flex-shrink-0"
      >
        <RotateCcw size={9} /> Reopen
      </button>
    </div>
  );
}

// ─── Main Tasks Component ──────────────────────────────────────────────────────

export default function Tasks() {
  const {
    tasks, addTask, updateTask, removeTask,
    reps, stores, repSummaries, storeSummaries,
    coachingNotes, eodReports,
    googleTasks, setGoogleTasks,
  } = useData();

  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<PriorityFilter>('all');
  const [filterType, setFilterType] = useState<TypeFilter>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [filterDue, setFilterDue] = useState<DueFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showAdd, setShowAdd] = useState(false);
  const [addDefaults, setAddDefaults] = useState<Partial<TaskForm> | undefined>();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [gTasksExpanded, setGTasksExpanded] = useState(true);

  // ── Derived data ────────────────────────────────────────────────────────────

  const dismissedSet = useMemo(() => new Set(dismissedIds), [dismissedIds]);

  const suggested = useMemo(() =>
    buildSuggestedTasks(
      repSummaries, storeSummaries,
      coachingNotes ?? [], eodReports ?? [],
      dismissedSet,
    ),
    [repSummaries, storeSummaries, coachingNotes, eodReports, dismissedSet],
  );

  const summary = useMemo(() => {
    const active = tasks.filter(t => t.status !== 'completed');
    return {
      open:              active.length,
      dueToday:          active.filter(t => t.dueDate === TODAY_STR).length,
      overdue:           active.filter(t => isOverdue(t.dueDate, t.status)).length,
      waiting:           active.filter(t => t.status === 'waiting').length,
      completedThisWeek: tasks.filter(t =>
        t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) >= WEEK_START,
      ).length,
      suggested: suggested.length,
    };
  }, [tasks, suggested]);

  const activeTasks = useMemo(() => {
    let r = tasks.filter(t => t.status !== 'completed');

    if (search) {
      const q = search.toLowerCase();
      r = r.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false),
      );
    }
    if (filterPriority !== 'all') r = r.filter(t => t.priority === filterPriority);
    if (filterType !== 'all')     r = r.filter(t => inferTaskType(t) === filterType);
    if (filterStatus !== 'all')   r = r.filter(t => t.status === filterStatus);
    if (filterDue === 'today')     r = r.filter(t => t.dueDate === TODAY_STR);
    else if (filterDue === 'overdue')   r = r.filter(t => isOverdue(t.dueDate, t.status));
    else if (filterDue === 'this-week') r = r.filter(t => t.dueDate >= TODAY_STR && t.dueDate <= WEEK_END);
    else if (filterDue === 'no-date')   r = r.filter(t => !t.dueDate);

    return r.sort((a, b) => {
      const oA = isOverdue(a.dueDate, a.status);
      const oB = isOverdue(b.dueDate, b.status);
      if (oA !== oB) return oA ? -1 : 1;
      return priorityOrder(a.priority) - priorityOrder(b.priority);
    });
  }, [tasks, search, filterPriority, filterType, filterStatus, filterDue]);

  const completedTasks = useMemo(() =>
    tasks
      .filter(t => t.status === 'completed')
      .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)),
    [tasks],
  );

  // Google Tasks — deduplicated against local tasks by title
  const openGoogleTasks = useMemo(() => {
    const localTitles = new Set(tasks.map(t => t.title.toLowerCase().trim()));
    return (googleTasks ?? []).filter(t =>
      t.status === 'needsAction' && !localTitles.has(t.title.toLowerCase().trim()),
    );
  }, [googleTasks, tasks]);

  const colTasks = (status: Task['status']) => activeTasks.filter(t => t.status === status);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleStatusChange = (id: string, s: Task['status']) =>
    updateTask(id, { status: s, completedAt: s === 'completed' ? new Date().toISOString() : undefined });

  const handleAddFromSuggested = (s: SuggestedTask) => {
    addTask({
      title: s.title,
      description: s.reason,
      taskType: s.type,
      priority: s.priority,
      status: 'open',
      dueDate: s.dueDate,
      repId: s.relatedRepId,
      storeId: s.relatedStoreId,
      notes: '',
      source: 'system',
    });
    setDismissedIds(prev => [...prev, s.id]);
  };

  const handleGenerateAll = () => {
    suggested.forEach(s => handleAddFromSuggested(s));
  };

  const openAddModal = (defaults?: Partial<TaskForm>) => {
    setAddDefaults(defaults);
    setShowAdd(true);
  };

  const markGoogleTaskDone = (id: string) => {
    setGoogleTasks((googleTasks ?? []).map((t: GoogleTask) =>
      t.id === id ? { ...t, status: 'completed' as const } : t,
    ));
  };

  const hasActiveFilters = search || filterPriority !== 'all' || filterType !== 'all' ||
    filterStatus !== 'all' || filterDue !== 'all';

  // ── Summary card helper ──────────────────────────────────────────────────────

  function SummaryCard({
    label, value, sub, signal, onClick,
  }: {
    label: string; value: number; sub: string;
    signal?: 'green' | 'amber' | 'red' | 'neutral';
    onClick?: () => void;
  }) {
    const valCls = signal === 'red' ? 'text-signal-red'
      : signal === 'amber' ? 'text-signal-amber'
      : signal === 'green' ? 'text-signal-green'
      : 'text-ink-primary';
    return (
      <button
        onClick={onClick}
        className={`card text-left p-4 hover:border-navy-400 transition-colors ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-2">{label}</p>
        <p className={`text-2xl font-bold leading-none mb-1 ${valCls}`}>{value}</p>
        <p className="text-[11px] text-ink-muted leading-snug">{sub}</p>
      </button>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 lg:p-6 space-y-6 max-w-screen-xl">

      {/* Modals */}
      {showAdd && (
        <AddTaskModal
          onClose={() => { setShowAdd(false); setAddDefaults(undefined); }}
          onAdd={addTask}
          reps={reps}
          stores={stores}
          initialValues={addDefaults}
        />
      )}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={(id, changes) => {
            updateTask(id, changes);
            setSelectedTask(prev => prev ? { ...prev, ...changes } : null);
          }}
          onDelete={removeTask}
          reps={reps}
          stores={stores}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <CheckSquare size={18} className="text-ink-secondary" />
            <h1 className="text-xl font-bold text-ink-primary">Tasks</h1>
            {summary.overdue > 0 && <span className="badge-red">{summary.overdue} overdue</span>}
            {summary.overdue === 0 && summary.dueToday > 0 && (
              <span className="badge-amber">{summary.dueToday} due today</span>
            )}
          </div>
          <p className="text-sm text-ink-secondary">District execution, follow-ups, and accountability</p>
          <p className="text-xs text-ink-muted mt-0.5">
            {summary.open} open · {completedTasks.length} completed · {suggested.length} suggested
            {openGoogleTasks.length > 0 && ` · ${openGoogleTasks.length} Google Tasks`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateAll}
            disabled={suggested.length === 0}
            className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-40"
            title="Add all suggested tasks"
          >
            <Zap size={13} /> Generate Tasks
          </button>
          <button
            onClick={() => openAddModal()}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <Plus size={14} /> New Task
          </button>

          {/* More actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="btn-ghost p-2"
              title="More actions"
            >
              <MoreHorizontal size={15} />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-9 z-20 bg-navy-700 border border-navy-500 rounded-xl shadow-card-hover py-1 min-w-44">
                  {[
                    { label: 'Create Coaching Tasks', type: 'coaching' as TaskType },
                    { label: 'Create Visit Tasks', type: 'visit' as TaskType },
                    { label: 'Create EOD Tasks', type: 'eod' as TaskType },
                    { label: 'Create Message Tasks', type: 'message' as TaskType },
                  ].map(item => (
                    <button
                      key={item.type}
                      onClick={() => {
                        openAddModal({ taskType: item.type });
                        setMoreOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-ink-secondary hover:text-ink-primary hover:bg-navy-600 transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Execution Summary ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          label="Open Tasks" value={summary.open}
          sub={summary.open === 0 ? 'All clear' : `${summary.open} need action`}
          signal={summary.open === 0 ? 'green' : undefined}
          onClick={() => setFilterStatus('open')}
        />
        <SummaryCard
          label="Due Today" value={summary.dueToday}
          sub={summary.dueToday === 0 ? 'No due items' : 'Need attention today'}
          signal={summary.dueToday > 0 ? 'amber' : undefined}
          onClick={() => setFilterDue('today')}
        />
        <SummaryCard
          label="Overdue" value={summary.overdue}
          sub={summary.overdue === 0 ? 'Nothing late' : 'Past due date'}
          signal={summary.overdue > 0 ? 'red' : undefined}
          onClick={() => setFilterDue('overdue')}
        />
        <SummaryCard
          label="Waiting" value={summary.waiting}
          sub={summary.waiting === 0 ? 'No blockers' : 'Blocked or pending'}
          signal={undefined}
          onClick={() => setFilterStatus('waiting')}
        />
        <SummaryCard
          label="Done This Week" value={summary.completedThisWeek}
          sub={summary.completedThisWeek === 0 ? 'Nothing yet' : 'Good follow-through'}
          signal={summary.completedThisWeek > 0 ? 'green' : undefined}
          onClick={() => setCompletedExpanded(true)}
        />
        <SummaryCard
          label="Suggested" value={summary.suggested}
          sub={summary.suggested === 0 ? 'District data clean' : 'From district data'}
          signal={summary.suggested > 0 ? 'amber' : 'green'}
          onClick={() => setSuggestionsExpanded(true)}
        />
      </div>

      {/* Zero open tasks + has suggestions callout */}
      {summary.open === 0 && summary.suggested > 0 && (
        <div className="flex items-center gap-3 p-4 bg-signal-amber/5 border border-signal-amber/20 rounded-xl">
          <Lightbulb size={16} className="text-signal-amber flex-shrink-0" />
          <p className="text-sm text-ink-secondary">
            No open manual tasks, but district data suggests <span className="font-semibold text-signal-amber">{summary.suggested} follow-up{summary.suggested > 1 ? 's' : ''}</span> below.
          </p>
        </div>
      )}

      {/* ── Suggested Tasks ──────────────────────────────────────────────────── */}
      {suggested.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSuggestionsExpanded(e => !e)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Lightbulb size={14} className="text-signal-amber" />
              <p className="text-sm font-bold text-ink-primary">
                Suggested Tasks
              </p>
              <span className="badge-amber text-[10px]">{suggested.length} from district data</span>
              {suggestionsExpanded ? <ChevronDown size={14} className="text-ink-muted" /> : <ChevronRight size={14} className="text-ink-muted" />}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDismissedIds(prev => [...prev, ...suggested.map(s => s.id)])}
                className="text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
              >
                Dismiss all
              </button>
              <button
                onClick={handleGenerateAll}
                className="flex items-center gap-1 text-[11px] font-semibold text-signal-green bg-signal-green/10 border border-signal-green/20 px-2.5 py-1 rounded-lg hover:bg-signal-green/20 transition-colors"
              >
                <Plus size={10} /> Add all
              </button>
            </div>
          </div>

          {suggestionsExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {suggested.map(s => (
                <SuggestedTaskCard
                  key={s.id}
                  s={s}
                  onAdd={handleAddFromSuggested}
                  onDismiss={id => setDismissedIds(prev => [...prev, id])}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Google Tasks ─────────────────────────────────────────────────────── */}
      {openGoogleTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setGTasksExpanded(e => !e)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <CheckSquare size={14} className="text-signal-green" />
              <p className="text-sm font-bold text-ink-primary">Google Tasks</p>
              <span className="badge-green text-[10px]">{openGoogleTasks.length} synced</span>
              {gTasksExpanded ? <ChevronDown size={14} className="text-ink-muted" /> : <ChevronRight size={14} className="text-ink-muted" />}
            </button>
          </div>

          {gTasksExpanded && (
            <div className="space-y-1.5">
              {openGoogleTasks.map(gt => (
                <div key={gt.id} className="flex items-start gap-3 p-3 rounded-xl border border-signal-green/15 bg-signal-green/5 hover:bg-signal-green/10 transition-colors">
                  <button
                    onClick={() => markGoogleTaskDone(gt.id)}
                    className="flex-shrink-0 mt-0.5"
                    title="Mark complete"
                  >
                    <Circle size={15} className="text-signal-green hover:text-signal-green transition-colors" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-signal-green/15 text-signal-green border-signal-green/30">
                        Google Tasks
                      </span>
                      {gt.dueDate && (
                        <span className={`text-[10px] font-medium ${gt.dueDate < TODAY_STR ? 'text-signal-red' : gt.dueDate === TODAY_STR ? 'text-signal-amber' : 'text-ink-muted'}`}>
                          Due {gt.dueDate}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-ink-primary leading-snug">{gt.title}</p>
                    {gt.notes && <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{gt.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No suggestions empty state */}
      {suggested.length === 0 && dismissedIds.length === 0 && (
        <div className="flex items-center gap-3 p-4 bg-signal-green/5 border border-signal-green/20 rounded-xl">
          <CheckCircle size={15} className="text-signal-green flex-shrink-0" />
          <p className="text-sm text-ink-secondary">
            No suggested tasks — district data looks clean.
          </p>
          <button
            onClick={() => setDismissedIds([])}
            className="ml-auto flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
          >
            <RefreshCw size={10} /> Refresh
          </button>
        </div>
      )}

      {/* ── Task Controls ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-40">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input-base w-full pl-8 text-sm"
              placeholder="Search tasks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* View toggle */}
          <div className="flex gap-0.5 bg-navy-700 rounded-xl p-1 border border-navy-500">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'}`}
              title="List view"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'board' ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'}`}
              title="Board view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {/* Priority */}
          <div className="flex gap-0.5 bg-navy-700 rounded-xl p-0.5 border border-navy-500">
            {(['all', 'urgent', 'high', 'medium', 'low'] as PriorityFilter[]).map(p => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-all ${
                  filterPriority === p ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {p === 'all' ? 'All Priority' : p}
              </button>
            ))}
          </div>

          {/* Type */}
          <div className="flex gap-0.5 bg-navy-700 rounded-xl p-0.5 border border-navy-500">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${filterType === 'all' ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'}`}
            >
              All Types
            </button>
            {(Object.keys(TYPE_CFG) as TaskType[]).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(filterType === t ? 'all' : t)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-all ${
                  filterType === t
                    ? `${TYPE_CFG[t].bgCls} ${TYPE_CFG[t].textCls}`
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {TYPE_CFG[t].label}
              </button>
            ))}
          </div>

          {/* Due filter */}
          <div className="flex gap-0.5 bg-navy-700 rounded-xl p-0.5 border border-navy-500">
            {([
              { v: 'all', l: 'All' },
              { v: 'today', l: 'Due Today' },
              { v: 'overdue', l: 'Overdue' },
              { v: 'this-week', l: 'This Week' },
              { v: 'no-date', l: 'No Date' },
            ] as { v: DueFilter; l: string }[]).map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setFilterDue(v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  filterDue === v ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(''); setFilterPriority('all'); setFilterType('all'); setFilterStatus('all'); setFilterDue('all'); }}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-signal-red border border-signal-red/20 rounded-xl hover:bg-signal-red/10 transition-colors"
            >
              <X size={9} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Active Tasks ─────────────────────────────────────────────────────── */}
      {viewMode === 'list' ? (
        activeTasks.length === 0 ? (
          /* Empty state */
          <div className="card p-8 text-center space-y-3">
            {hasActiveFilters ? (
              <>
                <p className="text-sm font-semibold text-ink-primary">No tasks match your filters</p>
                <p className="text-xs text-ink-muted">Try adjusting your search or filter criteria.</p>
                <button
                  onClick={() => { setSearch(''); setFilterPriority('all'); setFilterType('all'); setFilterStatus('all'); setFilterDue('all'); }}
                  className="btn-secondary text-xs mx-auto"
                >
                  Clear Filters
                </button>
              </>
            ) : (
              <>
                <CheckCircle size={28} className="text-signal-green mx-auto opacity-50" />
                <p className="text-sm font-semibold text-ink-primary">No open manual tasks</p>
                {suggested.length > 0 ? (
                  <>
                    <p className="text-xs text-ink-muted">District data suggests {suggested.length} follow-up{suggested.length > 1 ? 's' : ''} above.</p>
                    <button
                      onClick={() => setSuggestionsExpanded(true)}
                      className="btn-secondary text-xs mx-auto"
                    >
                      Review Suggested Tasks
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-ink-muted">You're all caught up. Use "New Task" to add follow-ups.</p>
                )}
                <button onClick={() => openAddModal()} className="btn-primary text-xs mx-auto flex items-center gap-1.5">
                  <Plus size={13} /> New Task
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold text-ink-muted">{activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''}</p>
              {summary.overdue > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-signal-red">
                  <AlertTriangle size={10} /> {summary.overdue} overdue
                </span>
              )}
            </div>
            {activeTasks.map(task => (
              <TaskListRow
                key={task.id}
                task={task}
                reps={reps}
                stores={stores}
                onClick={() => setSelectedTask(task)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )
      ) : (
        /* Board View */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto">
          {BOARD_COLS.map(col => (
            <BoardColumn
              key={col.status}
              colCfg={col}
              tasks={col.status === 'completed'
                ? completedTasks.slice(0, 10)
                : activeTasks.filter(t => t.status === col.status)}
              reps={reps}
              stores={stores}
              onOpen={setSelectedTask}
            />
          ))}
        </div>
      )}

      {/* ── Completed Tasks ──────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setCompletedExpanded(e => !e)}
          className="w-full flex items-center justify-between p-4 hover:bg-navy-700/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-signal-green" />
            <p className="text-sm font-bold text-ink-primary">Completed</p>
            <span className="badge-green text-[10px]">{completedTasks.length} total</span>
            {summary.completedThisWeek > 0 && (
              <span className="text-[10px] text-signal-green font-medium">{summary.completedThisWeek} this week</span>
            )}
          </div>
          {completedExpanded ? <ChevronDown size={14} className="text-ink-muted" /> : <ChevronRight size={14} className="text-ink-muted" />}
        </button>

        {completedExpanded && (
          <div className="border-t border-navy-500 px-4 pb-4">
            {completedTasks.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-8">No completed tasks yet</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                {completedTasks.map(task => (
                  <CompletedRow
                    key={task.id}
                    task={task}
                    reps={reps}
                    stores={stores}
                    onClick={() => setSelectedTask(task)}
                    onReopen={id => handleStatusChange(id, 'open')}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
