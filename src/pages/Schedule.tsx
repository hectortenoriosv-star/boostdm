import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Plus, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { fmt12h } from '../data/calculations';
import type { ScheduleShift } from '../types';

// ─── Types & Helpers ──────────────────────────────────────────────────────────

type ViewMode = 'command' | 'today' | 'weekly-store' | 'rep-hours' | 'coverage';
type CoverageStatus = 'covered' | 'light' | 'gap' | 'needsConfirmation';
type RepHourStatus = 'noHours' | 'light' | 'normal' | 'heavy' | 'overtimeWatch';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = localDateStr(new Date());

function getWeekDates(offset: number): string[] {
  const base = new Date();
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateStr(d);
  });
}

function weekLabel(dates: string[]): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${months[+m - 1]} ${+day}`; };
  return `${fmt(dates[0])} – ${fmt(dates[6])}, ${dates[0].slice(0, 4)}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Retail end times are often stored without AM/PM (e.g. "8:00" for 8 PM).
// If endTime parses to <= startTime, assume it's PM and add 12 hours.
function parseShiftTimes(startTime: string, endTime: string): { startMin: number; endMin: number; endTime24: string } {
  const startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  let endTime24 = endTime;
  if (endMin > 0 && startMin > 0 && endMin <= startMin) {
    endMin += 720;
    const h = Math.floor(endMin / 60);
    const m = endMin % 60;
    endTime24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return { startMin, endMin, endTime24 };
}

function getDayCoverage(dayShifts: ScheduleShift[]): CoverageStatus {
  const active = dayShifts.filter(s => s.status !== 'off' && s.status !== 'borrowed');
  if (active.length === 0) return 'gap';
  if (active.length === 1) return 'light';
  const hasOpener = active.some(s => s.role === 'opener' || (s.startTime && timeToMinutes(s.startTime) <= 630)); // 10:30
  const hasCloser = active.some(s => s.role === 'closer' || (s.startTime && s.endTime && parseShiftTimes(s.startTime, s.endTime).endMin >= 1110)); // 18:30
  if (!hasOpener || !hasCloser) return 'needsConfirmation';
  return 'covered';
}

function getRepHourStatus(hours: number): RepHourStatus {
  if (hours === 0) return 'noHours';
  if (hours < 20) return 'light';
  if (hours < 40) return 'normal';
  if (hours < 50) return 'heavy';
  return 'overtimeWatch';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type BadgeStatus = CoverageStatus | RepHourStatus | 'redZone' | 'urgent' | 'watch' | 'action';

const BADGE_CFG: Record<string, { label: string; cls: string }> = {
  covered:           { label: 'Covered',      cls: 'badge-green'   },
  light:             { label: 'Light',         cls: 'badge-amber'   },
  gap:               { label: 'Gap',           cls: 'badge-red'     },
  needsConfirmation: { label: 'Needs Confirm', cls: 'badge-orange'  },
  noHours:           { label: 'No Hours',      cls: 'badge-neutral' },
  normal:            { label: 'Normal',        cls: 'badge-blue'    },
  heavy:             { label: 'Heavy',         cls: 'badge-amber'   },
  overtimeWatch:     { label: 'Overtime',      cls: 'badge-red'     },
  redZone:           { label: 'RED ZONE',      cls: 'badge-red'     },
  urgent:            { label: 'Urgent',        cls: 'badge-red'     },
  watch:             { label: 'Watch',         cls: 'badge-amber'   },
  action:            { label: 'Action',        cls: 'badge-orange'  },
};

function SBadge({ status, mini }: { status: BadgeStatus; mini?: boolean }) {
  const cfg = BADGE_CFG[status] ?? BADGE_CFG.normal;
  return (
    <span className={`${cfg.cls}${mini ? ' !text-[10px] !px-1.5 !py-0.5' : ''}`}>{cfg.label}</span>
  );
}

function CovDot({ status }: { status: CoverageStatus }) {
  const cls: Record<CoverageStatus, string> = {
    covered: 'bg-signal-green glow-dot-green',
    light: 'bg-signal-amber glow-dot-amber',
    gap: 'bg-signal-red glow-dot-red',
    needsConfirmation: 'bg-accent-orange',
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls[status]}`} />;
}

// ─── Add Shift Modal ──────────────────────────────────────────────────────────

function AddShiftModal({
  onClose, onAdd,
}: {
  onClose: () => void;
  onAdd: (s: Omit<ScheduleShift, 'id' | 'createdAt'>) => void;
}) {
  const { reps, stores } = useData();
  const [form, setForm] = useState({
    date: TODAY, storeId: '', repId: '',
    startTime: '10:00', endTime: '18:00',
    role: 'full' as ScheduleShift['role'], eventNote: '',
  });
  const hours = (() => {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  })();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-ink-primary">Add Shift</p>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Date</label>
            <input className="input-base w-full" type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Role</label>
            <select className="input-base w-full" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as ScheduleShift['role'] }))}>
              <option value="opener">Opener</option>
              <option value="closer">Closer</option>
              <option value="mid">Mid</option>
              <option value="full">Full Day</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Store *</label>
          <select className="input-base w-full" value={form.storeId}
            onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
            <option value="">Select store</option>
            {stores.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-muted block mb-1">Rep *</label>
          <select className="input-base w-full" value={form.repId}
            onChange={e => setForm(f => ({ ...f, repId: e.target.value }))}>
            <option value="">Select rep</option>
            {reps.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Start</label>
            <input className="input-base w-full" type="time" value={form.startTime}
              onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">End</label>
            <input className="input-base w-full" type="time" value={form.endTime}
              onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-ink-muted">Total: {hours.toFixed(1)}h</p>
        <input className="input-base w-full" placeholder="Event note (optional)" value={form.eventNote}
          onChange={e => setForm(f => ({ ...f, eventNote: e.target.value }))} />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => { if (form.storeId && form.repId) { onAdd({ ...form, hours }); onClose(); } }}
            disabled={!form.storeId || !form.repId}
            className="btn-primary flex-1 disabled:opacity-50"
          >Add Shift</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Schedule() {
  const { shifts, reps, stores, storeSummaries, addShift, removeShift, openPlanVisit } = useData();
  const [view, setView] = useState<ViewMode>('command');
  const [showAdd, setShowAdd] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showZeroHour, setShowZeroHour] = useState(false);
  const [repFilter, setRepFilter] = useState<'all' | 'overtime' | 'light' | 'noHours'>('all');
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'gaps' | 'redZone'>('all');

  const WEEK_DATES = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const isCurrentWeek = weekOffset === 0;

  const todayShifts = useMemo(() => shifts.filter(s => s.date === TODAY), [shifts]);
  const weekShifts  = useMemo(() => shifts.filter(s => WEEK_DATES.includes(s.date)), [shifts, WEEK_DATES]);

  const shiftRepName = (s: ScheduleShift) =>
    reps.find(r => r.id === s.repId)?.name ?? s.repName ?? '—';

  // ── Rep weekly hours (shift-driven) ─────────────────────────────────────────
  const repWeeklyHours = useMemo(() => {
    type Group = { repId: string; displayName: string; rep: typeof reps[number] | undefined; shifts: ScheduleShift[] };
    const groups = new Map<string, Group>();

    for (const s of weekShifts) {
      const key = s.repId || `__name__${s.repName ?? ''}`;
      if (!groups.has(key)) {
        const linkedRep = s.repId ? reps.find(r => r.id === s.repId) : undefined;
        groups.set(key, { repId: s.repId, displayName: linkedRep?.name ?? s.repName ?? '(unknown)', rep: linkedRep, shifts: [] });
      }
      groups.get(key)!.shifts.push(s);
    }

    return Array.from(groups.values()).map(({ repId, displayName, rep, shifts: rs }) => {
      const counting = rs.filter(s => s.status !== 'off' && (s.status !== 'event' || (s.hours ?? 0) > 0));
      const totalHours = counting.reduce((sum, s) => sum + (s.hours ?? 0), 0);
      const byStoreName: Record<string, number> = {};
      counting.forEach(s => {
        const name = s.status === 'borrowed' && s.borrowedStoreName
          ? s.borrowedStoreName
          : (stores.find(st => st.id === s.storeId)?.name ?? s.storeId);
        byStoreName[name] = (byStoreName[name] || 0) + (s.hours ?? 0);
      });
      return { repId, displayName, rep, totalHours, byStoreName, shifts: rs };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [reps, weekShifts, stores]);

  // ── Summary stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeStores = stores.filter(s => s.active);
    const storesCoveredToday = activeStores.filter(store =>
      todayShifts.some(s => s.storeId === store.id && s.status !== 'off'),
    ).length;
    const totalWeekHours = Math.round(repWeeklyHours.reduce((sum, r) => sum + r.totalHours, 0));
    const redZone = storeSummaries.filter(ss => ss.isRed);
    const redZoneIssues = redZone.filter(ss => {
      const storeToday = todayShifts.filter(s => s.storeId === ss.store.id && s.status !== 'off');
      return storeToday.length < 2;
    }).length;
    const overtimeCount = repWeeklyHours.filter(r => r.totalHours >= 40).length;
    const storesWithData = new Set(weekShifts.map(s => s.storeId));
    let openGaps = 0;
    for (const storeId of storesWithData) {
      for (const date of WEEK_DATES) {
        if (!weekShifts.some(s => s.storeId === storeId && s.date === date && s.status !== 'off')) openGaps++;
      }
    }
    return { storesCoveredToday, totalStores: activeStores.length, totalWeekHours, redZoneIssues, redZoneTotal: redZone.length, overtimeCount, openGaps };
  }, [stores, todayShifts, repWeeklyHours, storeSummaries, weekShifts, WEEK_DATES]);

  // ── Priorities ───────────────────────────────────────────────────────────────
  const priorities = useMemo(() => {
    type P = { id: string; title: string; severity: 'urgent' | 'watch' | 'action'; issue: string; recommendation: string; cta: string; ctaFn?: () => void };
    const items: P[] = [];

    for (const ss of storeSummaries.filter(x => x.isRed).slice(0, 2)) {
      const today = todayShifts.filter(s => s.storeId === ss.store.id && s.status !== 'off');
      if (today.length < 2) {
        items.push({
          id: `red-${ss.store.id}`, title: ss.store.name, severity: 'urgent',
          issue: today.length === 0 ? 'Red-zone store with no confirmed coverage today.' : 'Red-zone store — only one rep confirmed today.',
          recommendation: 'Confirm coverage and plan a GREAT observation visit.', cta: 'Plan Visit',
        });
      }
    }

    const overReps = repWeeklyHours.filter(r => r.totalHours >= 40);
    if (overReps.length > 0) {
      const names = overReps.slice(0, 2).map(r => r.displayName.split(',')[0].trim()).join(', ');
      items.push({
        id: 'overtime', title: `${overReps.length} Rep${overReps.length > 1 ? 's' : ''}`, severity: 'watch',
        issue: `${names}${overReps.length > 2 ? ' +more' : ''} — 40+ hrs scheduled this week.`,
        recommendation: 'Review hours before payroll cutoff.', cta: 'Review Hours',
        ctaFn: () => setView('rep-hours'),
      });
    }

    const storesWithData = new Set(weekShifts.map(s => s.storeId));
    for (const storeId of storesWithData) {
      if (items.length >= 5) break;
      const store = stores.find(s => s.id === storeId);
      if (!store) continue;
      const gapDays = WEEK_DATES.filter(date =>
        !weekShifts.some(s => s.storeId === storeId && s.date === date && s.status !== 'off'),
      );
      if (gapDays.length > 0) {
        items.push({
          id: `gap-${storeId}`, title: store.name, severity: gapDays.length > 1 ? 'urgent' : 'action',
          issue: `No coverage on ${gapDays.map(d => DAY_LABELS[WEEK_DATES.indexOf(d)]).join(', ')}.`,
          recommendation: 'Add shift or find coverage for missing days.', cta: 'Add Shift',
          ctaFn: () => setShowAdd(true),
        });
      }
    }

    return items.slice(0, 5);
  }, [storeSummaries, todayShifts, repWeeklyHours, weekShifts, stores, WEEK_DATES]);

  const TABS: { key: ViewMode; label: string }[] = [
    { key: 'command',      label: 'Command'    },
    { key: 'today',        label: 'Today'      },
    { key: 'weekly-store', label: 'Store Week' },
    { key: 'rep-hours',    label: 'Rep Hours'  },
    { key: 'coverage',     label: 'Coverage'   },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      {showAdd && <AddShiftModal onClose={() => setShowAdd(false)} onAdd={addShift} />}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Clock size={18} className="text-ink-secondary" />
            <h1 className="text-xl font-bold text-ink-primary">Schedule</h1>
          </div>
          <p className="text-sm text-ink-secondary">Week of {weekLabel(WEEK_DATES)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-navy-700 border border-navy-500 rounded-xl p-1">
            <button onClick={() => setWeekOffset(o => o - 1)} className="btn-ghost !p-1.5" title="Previous week">
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${isCurrentWeek ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'}`}
            >
              This Week
            </button>
            <button onClick={() => setWeekOffset(o => o + 1)} className="btn-ghost !p-1.5" title="Next week">
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs gap-1.5">
            <Plus size={14} /> Add Shift
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Stores Covered */}
        <div className="card p-4 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Stores Covered</p>
          <p className="text-2xl font-bold text-ink-primary tabular-nums">
            {stats.storesCoveredToday}
            <span className="text-sm font-normal text-ink-muted">/{stats.totalStores}</span>
          </p>
          <p className="text-[11px] text-ink-secondary">
            {stats.totalStores - stats.storesCoveredToday > 0
              ? `${stats.totalStores - stats.storesCoveredToday} need${stats.totalStores - stats.storesCoveredToday === 1 ? 's' : ''} attention`
              : 'All stores covered today'}
          </p>
          {stats.totalStores - stats.storesCoveredToday > 0
            ? <span className="badge-amber !text-[10px] !px-1.5 !py-0.5">Watch</span>
            : <span className="badge-green !text-[10px] !px-1.5 !py-0.5">Healthy</span>}
        </div>

        {/* Total Hours */}
        <div className="card p-4 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Scheduled Hours</p>
          <p className="text-2xl font-bold text-ink-primary tabular-nums">{stats.totalWeekHours}h</p>
          <p className="text-[11px] text-ink-secondary">{repWeeklyHours.filter(r => r.totalHours > 0).length} reps this week</p>
          <span className="badge-neutral !text-[10px] !px-1.5 !py-0.5">This Week</span>
        </div>

        {/* Red-Zone Coverage */}
        <div className="card p-4 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Red-Zone Coverage</p>
          <p className="text-2xl font-bold text-ink-primary tabular-nums">{stats.redZoneIssues}</p>
          <p className="text-[11px] text-ink-secondary">
            {stats.redZoneIssues === 0 ? 'All red-zone covered' : `issue${stats.redZoneIssues > 1 ? 's' : ''} of ${stats.redZoneTotal}`}
          </p>
          {stats.redZoneIssues > 0
            ? <span className="badge-red !text-[10px] !px-1.5 !py-0.5">Urgent</span>
            : <span className="badge-green !text-[10px] !px-1.5 !py-0.5">OK</span>}
        </div>

        {/* Overtime */}
        <div className="card p-4 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Overtime Watch</p>
          <p className="text-2xl font-bold text-ink-primary tabular-nums">{stats.overtimeCount}</p>
          <p className="text-[11px] text-ink-secondary">
            {stats.overtimeCount === 0 ? 'No overtime risk' : `rep${stats.overtimeCount > 1 ? 's' : ''} at 40+ hrs`}
          </p>
          {stats.overtimeCount > 0
            ? <span className="badge-amber !text-[10px] !px-1.5 !py-0.5">Watch</span>
            : <span className="badge-neutral !text-[10px] !px-1.5 !py-0.5">Clear</span>}
        </div>

        {/* Open Gaps */}
        <div className="card p-4 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Open Shift Gaps</p>
          <p className="text-2xl font-bold text-ink-primary tabular-nums">{stats.openGaps}</p>
          <p className="text-[11px] text-ink-secondary">
            {stats.openGaps === 0 ? 'No gaps this week' : `day${stats.openGaps > 1 ? 's' : ''} without coverage`}
          </p>
          {stats.openGaps > 2
            ? <span className="badge-red !text-[10px] !px-1.5 !py-0.5">Urgent</span>
            : stats.openGaps > 0
            ? <span className="badge-amber !text-[10px] !px-1.5 !py-0.5">Watch</span>
            : <span className="badge-green !text-[10px] !px-1.5 !py-0.5">Clear</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-navy-700 border border-navy-500 rounded-xl p-1 w-fit overflow-x-auto max-w-full">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              view === key ? 'bg-navy-500 text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          COMMAND TAB
          ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'command' && (
        <div className="space-y-6">

          {/* Schedule Priorities */}
          {priorities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Schedule Priorities</p>
              {priorities.map(p => (
                <div key={p.id} className={`card p-4 flex items-start gap-4 ${
                  p.severity === 'urgent' ? 'border-signal-red/30' :
                  p.severity === 'watch'  ? 'border-signal-amber/30' : 'border-accent-orange/30'
                }`}>
                  <div className={`w-1 self-stretch rounded-full flex-shrink-0 mt-0.5 ${
                    p.severity === 'urgent' ? 'bg-signal-red' :
                    p.severity === 'watch'  ? 'bg-signal-amber' : 'bg-accent-orange'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-bold text-ink-primary">{p.title}</p>
                      <SBadge status={p.severity} mini />
                    </div>
                    <p className="text-xs text-ink-secondary mb-0.5">{p.issue}</p>
                    <p className="text-xs text-ink-muted">→ {p.recommendation}</p>
                  </div>
                  {p.ctaFn ? (
                    <button onClick={p.ctaFn} className="btn-secondary text-xs flex-shrink-0 !py-1.5 !px-3">{p.cta}</button>
                  ) : (
                    <button className="btn-secondary text-xs flex-shrink-0 !py-1.5 !px-3">{p.cta}</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {priorities.length === 0 && weekShifts.length > 0 && (
            <div className="card p-4 flex items-center gap-3 border-signal-green/25">
              <div className="w-8 h-8 rounded-full bg-signal-green/15 flex items-center justify-center flex-shrink-0">
                <span className="text-signal-green text-sm">✓</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-primary">District schedule looks healthy</p>
                <p className="text-xs text-ink-muted">No urgent coverage issues or overtime risks found for this week.</p>
              </div>
            </div>
          )}

          {/* Coverage Risk Grid */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Coverage Risk — {weekLabel(WEEK_DATES)}</p>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-navy-500">
                      <th className="text-left px-4 py-3 font-semibold text-ink-secondary min-w-[160px]">Store</th>
                      {DAY_LABELS.map((d, i) => (
                        <th key={d} className={`text-center px-3 py-3 font-semibold w-12 ${WEEK_DATES[i] === TODAY ? 'text-accent-blue-light' : 'text-ink-secondary'}`}>{d}</th>
                      ))}
                      <th className="text-center px-3 py-3 font-semibold text-ink-secondary w-16">Issues</th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {stores.filter(s => s.active).map((store, si) => {
                      const ss = storeSummaries.find(x => x.store.id === store.id);
                      const dayCoverage = WEEK_DATES.map(date => {
                        const day = weekShifts.filter(s => s.storeId === store.id && s.date === date);
                        return getDayCoverage(day);
                      });
                      const issueCount = dayCoverage.filter(c => c === 'gap' || c === 'needsConfirmation').length;
                      return (
                        <tr key={store.id} className={`border-b border-navy-600 hover:bg-navy-600/40 transition-colors ${si % 2 !== 0 ? 'bg-navy-700/20' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ss?.isRed ? 'bg-signal-red' : 'bg-signal-green'}`} />
                              <span className="font-medium text-ink-primary">{store.name}</span>
                              {ss?.isRed && <span className="badge-red !text-[10px] !px-1.5 !py-0.5">RED</span>}
                            </div>
                          </td>
                          {dayCoverage.map((cov, i) => (
                            <td key={i} className={`text-center px-3 py-3 ${WEEK_DATES[i] === TODAY ? 'bg-accent-blue/5' : ''}`}>
                              <CovDot status={cov} />
                            </td>
                          ))}
                          <td className="text-center px-3 py-3">
                            {issueCount > 0
                              ? <span className="badge-red !text-[10px] !px-1.5 !py-0.5">{issueCount}</span>
                              : <span className="text-signal-green text-xs font-bold">✓</span>}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => setShowAdd(true)} className="btn-ghost text-xs !py-1 !px-2">+ Shift</button>
                          </td>
                        </tr>
                      );
                    })}
                    {stores.filter(s => s.active).length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-ink-muted">No active stores.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 px-4 py-3 border-t border-navy-600 flex-wrap">
                {([
                  { s: 'covered' as CoverageStatus,           l: 'Covered'      },
                  { s: 'light' as CoverageStatus,             l: 'Light'        },
                  { s: 'gap' as CoverageStatus,               l: 'Gap'          },
                  { s: 'needsConfirmation' as CoverageStatus, l: 'Needs Confirm'},
                ]).map(({ s, l }) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <CovDot status={s} />
                    <span className="text-[11px] text-ink-muted">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rep Balance */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Rep Balance</p>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-navy-500">
                      <th className="text-left px-4 py-3 font-semibold text-ink-secondary min-w-[160px]">Rep</th>
                      <th className="text-center px-4 py-3 font-semibold text-ink-secondary">Hours</th>
                      <th className="text-center px-4 py-3 font-semibold text-ink-secondary">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-ink-secondary">Stores</th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {repWeeklyHours.filter(r => r.totalHours > 0).map((r, ri) => {
                      const status = getRepHourStatus(r.totalHours);
                      const storeCount = Object.keys(r.byStoreName).length;
                      return (
                        <tr key={r.repId || r.displayName} className={`border-b border-navy-600 hover:bg-navy-600/40 transition-colors ${ri % 2 !== 0 ? 'bg-navy-700/20' : ''}`}>
                          <td className="px-4 py-3 font-medium text-ink-primary">
                            {r.displayName}
                            {!r.repId && <span className="ml-1 text-[9px] text-signal-amber" title="Name not matched to an app rep">⚠</span>}
                          </td>
                          <td className="text-center px-4 py-3 font-bold">
                            <span className={r.totalHours >= 40 ? 'text-signal-red' : r.totalHours >= 30 ? 'text-signal-amber' : 'text-ink-primary'}>
                              {r.totalHours}h
                            </span>
                          </td>
                          <td className="text-center px-4 py-3"><SBadge status={status} mini /></td>
                          <td className="px-4 py-3 text-ink-secondary">
                            {storeCount <= 1
                              ? <span className="text-[11px]">{Object.keys(r.byStoreName)[0] ?? '—'}</span>
                              : <span className="text-[11px] cursor-default" title={Object.keys(r.byStoreName).join(', ')}>{storeCount} stores</span>}
                          </td>
                          <td className="px-4 py-3">
                            {r.rep && <Link to={`/reps/${r.rep.id}`} className="btn-ghost text-xs !py-1 !px-2">Profile</Link>}
                          </td>
                        </tr>
                      );
                    })}
                    {repWeeklyHours.filter(r => r.totalHours > 0).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-ink-muted">No shifts synced. Run a schedule sync from Settings → Sources.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TODAY TAB
          ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'today' && (
        <div className="space-y-3">
          {/* Sub-header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
              Today · {todayShifts.filter(s => s.status !== 'off').length} active shift{todayShifts.filter(s => s.status !== 'off').length !== 1 ? 's' : ''}
            </p>
            <button onClick={() => setShowAdd(true)} className="btn-ghost text-xs !py-1 !px-2 gap-1">
              <Plus size={11} /> Add Shift
            </button>
          </div>

          {todayShifts.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-secondary mb-1">No shifts synced for today.</p>
              <p className="text-xs text-ink-muted">Run a schedule sync from Settings → Sources, or add shifts manually.</p>
              <button onClick={() => setShowAdd(true)} className="btn-secondary text-xs mt-4 mx-auto"><Plus size={12} /> Add Shift</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {stores.filter(s => s.active).map(store => {
                const storeShifts = todayShifts.filter(s => s.storeId === store.id);
                if (storeShifts.length === 0) return null;
                const ss = storeSummaries.find(x => x.store.id === store.id);
                const active = storeShifts.filter(s => s.status !== 'off');
                const covStatus = getDayCoverage(storeShifts);
                const totalHours = active.reduce((sum, s) => sum + (s.hours ?? 0), 0);
                const hasOpener = active.some(s => s.role === 'opener' || (s.startTime && timeToMinutes(s.startTime) <= 630));
                const hasMid    = active.some(s => s.role === 'mid' || s.role === 'full');
                const hasCloser = active.some(s => s.role === 'closer' || (s.startTime && s.endTime && parseShiftTimes(s.startTime, s.endTime).endMin >= 1110));

                return (
                  <div key={store.id} className={`card p-3 flex flex-col gap-2 ${ss?.isRed ? 'border-signal-red/30' : covStatus === 'needsConfirmation' ? 'border-signal-amber/20' : ''}`}>
                    {/* Store header */}
                    <div className="flex items-start gap-2">
                      <CovDot status={covStatus} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-ink-primary truncate">{store.name}</p>
                        <p className="text-[10px] text-ink-muted">{fmt12h(store.hours.open)}–{fmt12h(store.hours.close)} · {active.length} rep{active.length !== 1 ? 's' : ''} · {totalHours.toFixed(1)}h</p>
                      </div>
                      {ss?.isRed && <SBadge status="redZone" mini />}
                    </div>

                    {/* Coverage badges */}
                    <div className="flex gap-1 flex-wrap">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${hasOpener ? 'bg-signal-green/15 text-signal-green' : 'bg-signal-red/15 text-signal-red'}`}>
                        {hasOpener ? '✓ Opener' : '✗ Opener'}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${hasMid ? 'bg-signal-green/15 text-signal-green' : 'bg-signal-amber/15 text-signal-amber'}`}>
                        {hasMid ? '✓ Mid' : 'No Mid'}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${hasCloser ? 'bg-signal-green/15 text-signal-green' : 'bg-signal-red/15 text-signal-red'}`}>
                        {hasCloser ? '✓ Closer' : '✗ Closer'}
                      </span>
                    </div>

                    {/* Shift rows */}
                    <div className="space-y-1">
                      {storeShifts.map(sh => {
                        const isOff      = sh.status === 'off';
                        const isBorrowed = sh.status === 'borrowed';
                        const { endTime24 } = parseShiftTimes(sh.startTime ?? '', sh.endTime ?? '');
                        return (
                          <div key={sh.id} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${
                            isOff      ? 'opacity-40' :
                            isBorrowed ? 'bg-signal-amber/5 border border-signal-amber/15' :
                                         'bg-navy-700 border border-navy-600'
                          }`}>
                            <span className={`text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0 ${
                              sh.role === 'opener' ? 'bg-accent-blue/20 text-accent-blue-light' :
                              sh.role === 'closer' ? 'bg-accent-orange/20 text-accent-orange-light' :
                              sh.role === 'mid'    ? 'bg-signal-green/15 text-signal-green' :
                              'bg-navy-500 text-ink-muted'
                            }`}>
                              {sh.role === 'opener' ? 'OPN' : sh.role === 'closer' ? 'CLO' : sh.role === 'mid' ? 'MID' : 'FULL'}
                            </span>
                            <p className={`text-[11px] font-medium flex-1 truncate ${isOff ? 'text-ink-muted line-through' : 'text-ink-primary'}`}>
                              {shiftRepName(sh)}
                              {isBorrowed && sh.borrowedStoreName && (
                                <span className="ml-1 text-[9px] text-signal-amber">↗</span>
                              )}
                            </p>
                            <p className="text-[10px] text-ink-secondary flex-shrink-0 tabular-nums">
                              {fmt12h(sh.startTime ?? '')}–{fmt12h(endTime24)}
                            </p>
                            <p className={`text-[10px] flex-shrink-0 tabular-nums ${!sh.hours ? 'text-signal-amber' : 'text-ink-muted'}`}>
                              {sh.hours ? `${sh.hours}h` : '—'}
                            </p>
                            <button onClick={() => removeShift(sh.id)} className="text-ink-faint hover:text-signal-red transition-colors flex-shrink-0">
                              <X size={10} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Event notes */}
                    {store.eventNotes.filter(en => en.date === TODAY).map(en => (
                      <div key={en.id} className="text-[10px] text-accent-orange-light bg-accent-orange/8 px-2 py-1 rounded border border-accent-orange/15">
                        📌 {en.note}
                      </div>
                    ))}

                    {ss?.isRed && (
                      <p className="text-[10px] text-signal-red">⚠ Red-zone — confirm closer and plan a GREAT observation visit.</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1 pt-1 border-t border-navy-600">
                      <button onClick={() => setShowAdd(true)} className="btn-ghost text-[10px] !py-1 !px-2 flex-1">+ Shift</button>
                      <button onClick={() => openPlanVisit({ storeId: store.id, date: TODAY })} className="btn-ghost text-[10px] !py-1 !px-2 flex-1">Plan Visit</button>
                      <Link to={`/stores/${store.id}`} className="btn-ghost text-[10px] !py-1 !px-2 flex-1 text-center">Profile</Link>
                    </div>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          STORE WEEK TAB
          ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'weekly-store' && (
        <div className="space-y-4">
          {stores.filter(s => s.active).map(store => {
            const ss = storeSummaries.find(x => x.store.id === store.id);
            const storeWeek = WEEK_DATES.map(date => ({
              date,
              shifts: weekShifts.filter(s => s.storeId === store.id && s.date === date),
            }));
            if (!storeWeek.some(d => d.shifts.length > 0)) return null;
            const totalHours = Math.round(
              storeWeek.flatMap(d => d.shifts).filter(s => s.status !== 'off').reduce((sum, s) => sum + (s.hours ?? 0), 0)
            );
            const dayCovs = storeWeek.map(({ shifts: ds }) => getDayCoverage(ds));
            const issueCount = dayCovs.filter(c => c === 'gap' || c === 'needsConfirmation').length;
            const weekCov: CoverageStatus = issueCount === 0 ? 'covered' : issueCount > 2 ? 'gap' : 'light';

            return (
              <div key={store.id} className={`card p-5 ${ss?.isRed ? 'border-signal-red/25' : ''}`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-ink-primary">{store.name}</p>
                      {ss?.isRed && <SBadge status="redZone" mini />}
                      <SBadge status={weekCov} mini />
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-ink-muted">
                      <span>{fmt12h(store.hours.open)}–{fmt12h(store.hours.close)}</span>
                      <span className="font-semibold text-ink-secondary">{totalHours}h scheduled</span>
                      {issueCount > 0 && <span className="text-signal-amber">{issueCount} issue{issueCount > 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setShowAdd(true)} className="btn-ghost text-xs !py-1 !px-2">+ Shift</button>
                    <Link to={`/stores/${store.id}`} className="btn-ghost text-xs !py-1 !px-2">Profile</Link>
                  </div>
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {storeWeek.map(({ date, shifts: ds }, i) => {
                    const cov    = getDayCoverage(ds);
                    const isToday = date === TODAY;
                    const visible = ds.filter(s => s.status !== 'off' && s.status !== 'borrowed');
                    return (
                      <div key={date} className={`rounded-xl p-2 border transition-colors group ${
                        isToday       ? 'border-accent-blue/40 bg-accent-blue/10' :
                        cov === 'gap' ? 'border-signal-red/30 bg-signal-red/5' :
                        cov === 'needsConfirmation' ? 'border-accent-orange/30 bg-accent-orange/5' :
                        'border-navy-500 bg-navy-700'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className={`text-[10px] font-bold ${isToday ? 'text-accent-blue-light' : 'text-ink-muted'}`}>
                            {DAY_LABELS[i]}
                          </p>
                          <CovDot status={cov} />
                        </div>
                        {visible.length === 0
                          ? <p className="text-[10px] text-ink-faint text-center py-0.5">—</p>
                          : visible.map(sh => (
                            <div key={sh.id} className="text-center mb-0.5">
                              <p className="text-[10px] font-semibold text-ink-primary truncate">
                                {shiftRepName(sh).split(',')[0].trim()}
                              </p>
                              {sh.status === 'event'
                                ? <p className="text-[9px] text-accent-blue-light truncate">{sh.eventNote || 'Event'}</p>
                                : <p className="text-[9px] text-ink-muted">{fmt12h(sh.startTime ?? '')}–{fmt12h(parseShiftTimes(sh.startTime ?? '', sh.endTime ?? '').endTime24)}</p>
                              }
                            </div>
                          ))
                        }
                        <button
                          onClick={() => openPlanVisit({ storeId: store.id, date })}
                          className="mt-1 w-full text-[9px] text-ink-faint hover:text-accent-orange transition-colors opacity-0 group-hover:opacity-100 text-center"
                          title={`Plan Visit — ${store.name} · ${date}`}
                        >
                          + Visit
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }).filter(Boolean)}

          {weekShifts.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-sm text-ink-secondary mb-1">No shifts synced for this week.</p>
              <p className="text-xs text-ink-muted">Run a schedule sync from Settings → Sources.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          REP HOURS TAB
          ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'rep-hours' && (() => {
        const withHours   = repWeeklyHours.filter(r => r.totalHours > 0);
        const overtimeList = withHours.filter(r => r.totalHours >= 40);
        const lightList    = withHours.filter(r => r.totalHours < 20);
        const noHrsList    = repWeeklyHours.filter(r => r.totalHours === 0);
        const multiList    = withHours.filter(r => Object.keys(r.byStoreName).length > 1);
        const totalHrs     = Math.round(withHours.reduce((sum, r) => sum + r.totalHours, 0));

        const filters: { key: typeof repFilter; label: string }[] = [
          { key: 'all',      label: 'All Reps'              },
          { key: 'overtime', label: `Overtime (${overtimeList.length})` },
          { key: 'light',    label: `Under-Scheduled (${lightList.length})` },
          { key: 'noHours',  label: `No Hours (${noHrsList.length})`  },
        ];

        const visible = (() => {
          let list = showZeroHour ? repWeeklyHours : withHours;
          if (repFilter === 'overtime') list = list.filter(r => r.totalHours >= 40);
          else if (repFilter === 'light')   list = list.filter(r => r.totalHours > 0 && r.totalHours < 20);
          else if (repFilter === 'noHours') list = list.filter(r => r.totalHours === 0);
          return list;
        })();

        return (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'Reps Scheduled', value: withHours.length,      cls: '' },
                { label: 'Total Hours',    value: `${totalHrs}h`,         cls: '' },
                { label: 'Overtime Watch', value: overtimeList.length,    cls: overtimeList.length > 0 ? 'border-signal-red/25' : '' },
                { label: 'Under-Scheduled', value: lightList.length,      cls: lightList.length > 0 ? 'border-signal-amber/25' : '' },
                { label: 'Multi-Store',    value: multiList.length,       cls: '' },
              ].map(c => (
                <div key={c.label} className={`card p-3 space-y-1 ${c.cls}`}>
                  <p className="text-[11px] text-ink-muted font-semibold uppercase tracking-wider">{c.label}</p>
                  <p className="text-xl font-bold text-ink-primary">{c.value}</p>
                </div>
              ))}
            </div>

            {/* Filters + toggle */}
            <div className="flex items-center gap-2 flex-wrap">
              {filters.map(f => (
                <button key={f.key} onClick={() => setRepFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    repFilter === f.key ? 'bg-navy-500 border-navy-400 text-ink-primary' : 'bg-navy-700 border-navy-600 text-ink-muted hover:text-ink-secondary'
                  }`}>
                  {f.label}
                </button>
              ))}
              <label className="flex items-center gap-1.5 cursor-pointer ml-auto select-none">
                <input type="checkbox" checked={showZeroHour} onChange={e => setShowZeroHour(e.target.checked)} className="accent-accent-blue-light w-3 h-3" />
                <span className="text-[11px] text-ink-muted">Show 0-hour reps</span>
              </label>
            </div>

            {/* Table */}
            {visible.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-sm text-ink-muted">No reps match this filter.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-500">
                        <th className="text-left px-4 py-3 font-semibold text-ink-secondary min-w-[150px]">Rep</th>
                        <th className="text-center px-3 py-3 font-semibold text-ink-secondary w-16">Total</th>
                        <th className="text-center px-3 py-3 font-semibold text-ink-secondary w-28">Status</th>
                        {DAY_LABELS.map((d, i) => (
                          <th key={d} className={`text-center px-2 py-3 font-semibold w-10 ${WEEK_DATES[i] === TODAY ? 'text-accent-blue-light' : 'text-ink-secondary'}`}>{d}</th>
                        ))}
                        <th className="text-left px-4 py-3 font-semibold text-ink-secondary min-w-[110px]">Stores</th>
                        <th className="px-4 py-3 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r, ri) => {
                        const status = getRepHourStatus(r.totalHours);
                        const storeCount = Object.keys(r.byStoreName).length;
                        return (
                          <tr key={r.repId || r.displayName} className={`border-b border-navy-600 hover:bg-navy-600/30 transition-colors ${ri % 2 !== 0 ? 'bg-navy-700/20' : ''}`}>
                            <td className="px-4 py-2.5 font-medium text-ink-primary">
                              {r.displayName}
                              {!r.repId && <span className="ml-1 text-[9px] text-signal-amber" title="No matched rep in app">⚠</span>}
                            </td>
                            <td className="text-center px-3 py-2.5 font-bold">
                              <span className={r.totalHours >= 40 ? 'text-signal-red' : r.totalHours >= 30 ? 'text-signal-amber' : 'text-ink-primary'}>
                                {r.totalHours}h
                              </span>
                            </td>
                            <td className="text-center px-3 py-2.5"><SBadge status={status} mini /></td>
                            {WEEK_DATES.map((date, _di) => {
                              const dayCounting = r.shifts.filter(s =>
                                s.date === date && s.status !== 'off' && (s.status !== 'event' || (s.hours ?? 0) > 0),
                              );
                              const h = dayCounting.reduce((sum, s) => sum + (s.hours ?? 0), 0);
                              const isBorrowed = dayCounting.some(s => s.status === 'borrowed');
                              const isOff = r.shifts.some(s => s.date === date && s.status === 'off') && dayCounting.length === 0;
                              return (
                                <td key={date} className={`text-center px-2 py-2.5 ${date === TODAY ? 'bg-accent-blue/5' : ''}`}>
                                  {isOff ? (
                                    <span className="text-ink-faint text-[10px]">Off</span>
                                  ) : h > 0 ? (
                                    <span className={`text-[11px] font-medium ${
                                      isBorrowed  ? 'text-signal-amber' :
                                      h > 10.5    ? 'text-accent-orange-light' :
                                      h < 6       ? 'text-signal-amber' :
                                      date === TODAY ? 'text-accent-blue-light font-semibold' :
                                      'text-ink-secondary'
                                    }`} title={isBorrowed ? 'Borrowed store' : undefined}>
                                      {h}h
                                    </span>
                                  ) : (
                                    <span className="text-ink-faint text-[11px]">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-2.5 text-ink-secondary text-[11px]">
                              {storeCount <= 1
                                ? Object.keys(r.byStoreName)[0] ?? '—'
                                : <span title={Object.keys(r.byStoreName).join(', ')} className="cursor-default">{storeCount} stores</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              {r.rep && <Link to={`/reps/${r.rep.id}`} className="btn-ghost text-xs !py-1 !px-2">Profile</Link>}
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
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════════
          COVERAGE MAP TAB
          ═══════════════════════════════════════════════════════════════════════ */}
      {view === 'coverage' && (
        <div className="space-y-4">
          {/* Filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: 'all' as const,     label: 'All Stores'  },
              { key: 'gaps' as const,    label: 'Gaps Only'   },
              { key: 'redZone' as const, label: 'Red-Zone'    },
            ]).map(f => (
              <button key={f.key} onClick={() => setCoverageFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  coverageFilter === f.key ? 'bg-navy-500 border-navy-400 text-ink-primary' : 'bg-navy-700 border-navy-600 text-ink-muted hover:text-ink-secondary'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Heatmap */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-500">
                    <th className="text-left px-4 py-3 font-semibold text-ink-secondary min-w-[170px]">Store</th>
                    {DAY_LABELS.map((d, i) => (
                      <th key={d} className={`text-center px-3 py-3 font-semibold min-w-[70px] ${WEEK_DATES[i] === TODAY ? 'text-accent-blue-light' : 'text-ink-secondary'}`}>
                        {d}
                        <div className="text-[9px] font-normal text-ink-faint">{WEEK_DATES[i]?.split('-').slice(1).join('/')}</div>
                      </th>
                    ))}
                    <th className="text-center px-3 py-3 font-semibold text-ink-secondary w-16">Issues</th>
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {stores.filter(s => s.active).filter(store => {
                    const ss = storeSummaries.find(x => x.store.id === store.id);
                    if (coverageFilter === 'redZone') return !!ss?.isRed;
                    if (coverageFilter === 'gaps') {
                      return WEEK_DATES.some(date => {
                        const cov = getDayCoverage(weekShifts.filter(s => s.storeId === store.id && s.date === date));
                        return cov === 'gap' || cov === 'needsConfirmation';
                      });
                    }
                    return true;
                  }).map((store, si) => {
                    const ss = storeSummaries.find(x => x.store.id === store.id);
                    const dayCovs = WEEK_DATES.map(date => {
                      const day = weekShifts.filter(s => s.storeId === store.id && s.date === date);
                      return { cov: getDayCoverage(day), count: day.filter(s => s.status !== 'off' && s.status !== 'borrowed').length };
                    });
                    const issueCount = dayCovs.filter(d => d.cov === 'gap' || d.cov === 'needsConfirmation').length;

                    return (
                      <tr key={store.id} className={`border-b border-navy-600 ${si % 2 !== 0 ? 'bg-navy-700/20' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ss?.isRed ? 'bg-signal-red' : 'bg-signal-green'}`} />
                            <div>
                              <p className="font-medium text-ink-primary">{store.name}</p>
                              {ss?.isRed && <span className="badge-red !text-[10px] !px-1.5 !py-0.5">RED</span>}
                            </div>
                          </div>
                        </td>
                        {dayCovs.map(({ cov, count }, i) => {
                          const isToday = WEEK_DATES[i] === TODAY;
                          const cellBg: Record<CoverageStatus, string> = {
                            covered:           'bg-signal-green/10',
                            light:             'bg-signal-amber/10',
                            gap:               'bg-signal-red/15',
                            needsConfirmation: 'bg-accent-orange/10',
                          };
                          return (
                            <td key={i} className={`px-3 py-3 text-center ${cellBg[cov]} ${isToday ? 'ring-1 ring-inset ring-accent-blue/30' : ''}`}>
                              <div className="flex flex-col items-center gap-1">
                                <CovDot status={cov} />
                                <span className="text-[10px] text-ink-muted">{count}r</span>
                              </div>
                            </td>
                          );
                        })}
                        <td className="text-center px-3 py-3">
                          {issueCount > 0
                            ? <span className="badge-red !text-[10px] !px-1.5 !py-0.5">{issueCount}</span>
                            : <span className="text-signal-green text-xs font-bold">✓</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setShowAdd(true)} className="btn-ghost text-xs !py-1 !px-2">+ Shift</button>
                        </td>
                      </tr>
                    );
                  })}
                  {stores.filter(s => s.active).length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-xs text-ink-muted">No active stores.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 px-4 py-3 border-t border-navy-600 flex-wrap">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Legend</p>
              {([
                { s: 'covered'           as CoverageStatus, l: 'Covered'       },
                { s: 'light'             as CoverageStatus, l: 'Light'         },
                { s: 'gap'               as CoverageStatus, l: 'Gap'           },
                { s: 'needsConfirmation' as CoverageStatus, l: 'Needs Confirm' },
              ]).map(({ s, l }) => (
                <div key={s} className="flex items-center gap-1.5">
                  <CovDot status={s} />
                  <span className="text-[11px] text-ink-secondary">{l}</span>
                </div>
              ))}
              <span className="text-[11px] text-ink-muted ml-auto">Cells show rep count (r)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
