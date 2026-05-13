import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type {
  Store, Rep, DailyPerformance, MonthlyRepPerformance,
  MonthlyStorePerformance, Task, Visit, ScheduleShift,
  CoachingNote, EODReport, MessageDraft, DistrictSettings,
  RepSummary, StoreSummary, CalendarEvent, GoogleTask,
  CoachingQueueItem, PlanVisitPrefill,
} from '../types';
import {
  SEED_STORES, SEED_REPS, SEED_DAILY_PERF, SEED_MONTHLY_REP_PERF,
  SEED_MONTHLY_STORE_PERF, SEED_TASKS, SEED_VISITS, SEED_SHIFTS,
  SEED_COACHING_NOTES, SEED_EOD_REPORTS, SEED_MESSAGE_DRAFTS, SEED_DISTRICT_SETTINGS,
} from '../data/seed';
import {
  buildRepSummary, buildStoreSummary, calcDistrictMTD, calcVisitStats,
  CURRENT_MONTH, CURRENT_YEAR,
} from '../data/calculations';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface AppState {
  stores: Store[];
  reps: Rep[];
  dailyPerf: DailyPerformance[];
  monthlyRepPerf: MonthlyRepPerformance[];
  monthlyStorePerf: MonthlyStorePerformance[];
  tasks: Task[];
  visits: Visit[];
  shifts: ScheduleShift[];
  coachingNotes: CoachingNote[];
  coachingQueue: CoachingQueueItem[];
  eodReports: EODReport[];
  messageDrafts: MessageDraft[];
  settings: DistrictSettings;
  calendarEvents: CalendarEvent[];
  googleTasks: GoogleTask[];
}

const STORAGE_KEY = 'dm_dashboard_v1';

function loadState(): AppState {
  const defaults: AppState = {
    stores: SEED_STORES,
    reps: SEED_REPS,
    dailyPerf: SEED_DAILY_PERF,
    monthlyRepPerf: SEED_MONTHLY_REP_PERF,
    monthlyStorePerf: SEED_MONTHLY_STORE_PERF,
    tasks: SEED_TASKS,
    visits: SEED_VISITS,
    shifts: SEED_SHIFTS,
    coachingNotes: SEED_COACHING_NOTES,
    coachingQueue: [],
    eodReports: SEED_EOD_REPORTS,
    messageDrafts: SEED_MESSAGE_DRAFTS,
    settings: SEED_DISTRICT_SETTINGS,
    calendarEvents: [],
    googleTasks: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AppState>;

      // Auto-advance the reporting period if it's behind the current calendar month.
      // This prevents the dashboard getting stuck in a past month after a new month starts.
      if (p.settings) {
        const _n = new Date();
        const calMonth = _n.getMonth() + 1;
        const calYear  = _n.getFullYear();
        const sMonth   = p.settings.currentMonth ?? calMonth;
        const sYear    = p.settings.currentYear  ?? calYear;
        if (sYear < calYear || (sYear === calYear && sMonth < calMonth)) {
          p.settings = { ...p.settings, currentMonth: calMonth, currentYear: calYear };
        }
      }

      // Merge: any field missing from saved data (e.g. newly added fields) falls back to seed defaults.
      return {
        stores:           p.stores           ?? defaults.stores,
        reps:             p.reps             ?? defaults.reps,
        dailyPerf:        p.dailyPerf        ?? defaults.dailyPerf,
        monthlyRepPerf:   p.monthlyRepPerf   ?? defaults.monthlyRepPerf,
        monthlyStorePerf: p.monthlyStorePerf ?? defaults.monthlyStorePerf,
        tasks:            p.tasks            ?? defaults.tasks,
        visits:           p.visits           ?? defaults.visits,
        shifts:           p.shifts           ?? defaults.shifts,
        coachingNotes:    p.coachingNotes    ?? defaults.coachingNotes,
        coachingQueue:    p.coachingQueue    ?? defaults.coachingQueue,
        eodReports:       p.eodReports       ?? defaults.eodReports,
        messageDrafts:    p.messageDrafts    ?? defaults.messageDrafts,
        settings:         p.settings         ?? defaults.settings,
        calendarEvents:   p.calendarEvents   ?? defaults.calendarEvents,
        googleTasks:      p.googleTasks      ?? defaults.googleTasks,
      };
    }
  } catch { /* ignore */ }
  return defaults;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Context Interface ────────────────────────────────────────────────────────

interface DataContextValue {
  // Raw data
  stores: Store[];
  reps: Rep[];
  dailyPerf: DailyPerformance[];
  monthlyRepPerf: MonthlyRepPerformance[];
  monthlyStorePerf: MonthlyStorePerformance[];
  tasks: Task[];
  visits: Visit[];
  shifts: ScheduleShift[];
  coachingNotes: CoachingNote[];
  eodReports: EODReport[];
  messageDrafts: MessageDraft[];
  settings: DistrictSettings;

  // Computed summaries
  repSummaries: RepSummary[];
  storeSummaries: StoreSummary[];
  districtStats: ReturnType<typeof calcDistrictMTD>;
  visitStats: ReturnType<typeof calcVisitStats>;
  reportingPeriod: {
    month: number;
    year: number;
    monthName: string;
    daysElapsed: number;
    daysInMonth: number;
    isCurrentCalendarMonth: boolean;
  };

  // Reset to seed
  resetToSeed: () => void;

  // Store CRUD
  addStore: (s: Omit<Store, 'id' | 'createdAt'>) => void;
  updateStore: (id: string, patch: Partial<Store>) => void;
  removeStore: (id: string) => void;

  // Rep CRUD
  addRep: (r: Omit<Rep, 'id' | 'createdAt'>) => void;
  updateRep: (id: string, patch: Partial<Rep>) => void;
  removeRep: (id: string) => void;

  // Task CRUD
  addTask: (t: Omit<Task, 'id' | 'createdAt'>) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;

  // Visit CRUD
  addVisit: (v: Omit<Visit, 'id' | 'createdAt'>) => void;
  updateVisit: (id: string, patch: Partial<Visit>) => void;
  removeVisit: (id: string) => void;

  // Shift CRUD
  addShift: (s: Omit<ScheduleShift, 'id' | 'createdAt'>) => void;
  updateShift: (id: string, patch: Partial<ScheduleShift>) => void;
  removeShift: (id: string) => void;
  replaceWeekShifts: (weekStart: string, newShifts: Omit<ScheduleShift, 'id' | 'createdAt'>[]) => void;

  // Daily performance
  addDailyPerf: (dp: Omit<DailyPerformance, 'id' | 'createdAt' | 'updatedAt'>) => 'added' | 'duplicate';
  replaceDailyPerf: (dp: Omit<DailyPerformance, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateDailyPerf: (id: string, patch: Partial<DailyPerformance>) => void;

  // Monthly perf
  upsertMonthlyRepPerf: (p: Omit<MonthlyRepPerformance, 'id'>) => void;
  upsertMonthlyStorePerf: (p: Omit<MonthlyStorePerformance, 'id'>) => void;
  patchMonthlyRepPerf: (repId: string, month: number, year: number, patch: Partial<MonthlyRepPerformance>) => void;
  patchMonthlyStorePerf: (storeId: string, month: number, year: number, patch: Partial<MonthlyStorePerformance>) => void;

  // Coaching notes
  addCoachingNote: (n: Omit<CoachingNote, 'id' | 'createdAt'>) => void;
  updateCoachingNote: (id: string, patch: Partial<CoachingNote>) => void;

  // Coaching queue
  coachingQueue: CoachingQueueItem[];
  addToCoachingQueue: (item: Omit<CoachingQueueItem, 'id' | 'createdAt'>) => 'added' | 'duplicate';
  updateCoachingQueueItem: (id: string, patch: Partial<CoachingQueueItem>) => void;

  // EOD Reports
  addEODReport: (r: Omit<EODReport, 'id' | 'createdAt'>) => void;
  updateEODReport: (id: string, patch: Partial<EODReport>) => void;
  removeEODReport: (id: string) => void;
  cleanDuplicateEODReports: () => number;

  // Message drafts
  addMessageDraft: (m: Omit<MessageDraft, 'id' | 'createdAt'>) => void;
  updateMessageDraft: (id: string, patch: Partial<MessageDraft>) => void;
  removeMessageDraft: (id: string) => void;

  // Settings
  updateSettings: (patch: Partial<DistrictSettings>) => void;

  // Merge & permanent-delete (safe destructive ops)
  mergeReps: (primaryId: string, dupId: string) => void;
  mergeStores: (primaryId: string, dupId: string) => void;
  permanentDeleteRep: (id: string) => { success: boolean; reason?: string };
  permanentDeleteStore: (id: string) => { success: boolean; reason?: string };

  // Visit bulk operations
  clearDemoVisits: () => void;
  clearMonthVisits: (month: number, year: number) => void;

  // Demo seed clearing
  clearDemoSeedTasks: () => void;
  clearDemoSeedCoachingNotes: () => void;

  // Google Calendar & Tasks sync results
  setCalendarEvents: (events: CalendarEvent[]) => void;
  setGoogleTasks: (tasks: GoogleTask[]) => void;

  // Global Plan Visit modal
  planVisitPrefill: PlanVisitPrefill | null;
  openPlanVisit: (prefill?: PlanVisitPrefill) => void;
  closePlanVisit: () => void;

  // Atomic batch update for sync operations
  batchApply: (patch: {
    reps: Rep[];
    stores: Store[];
    dailyPerf: DailyPerformance[];
    monthlyRepPerf: MonthlyRepPerformance[];
    monthlyStorePerf: MonthlyStorePerformance[];
  }) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [planVisitPrefill, setPlanVisitPrefill] = useState<PlanVisitPrefill | null>(null);

  // Persist to localStorage on every state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state]);

  const patch = useCallback(<K extends keyof AppState>(key: K, updater: (prev: AppState[K]) => AppState[K]) => {
    setState(s => ({ ...s, [key]: updater(s[key]) }));
  }, []);

  const openPlanVisit  = useCallback((prefill?: PlanVisitPrefill) => setPlanVisitPrefill(prefill ?? {}), []);
  const closePlanVisit = useCallback(() => setPlanVisitPrefill(null), []);

  // ── Reporting period from settings (authoritative source for which month to display) ──
  const _rMonth = state.settings.currentMonth;
  const _rYear  = state.settings.currentYear;
  const _calNow = new Date();
  const _rDaysInMonth = new Date(_rYear, _rMonth, 0).getDate();
  const _rIsCurrentCalMonth = _rMonth === _calNow.getMonth() + 1 && _rYear === _calNow.getFullYear();
  // For completed past months use all days; for current month use days elapsed up through yesterday
  const _rDaysElapsed = _rIsCurrentCalMonth
    ? Math.max(1, _calNow.getDate() - 1)
    : _rDaysInMonth;
  const _rPeriod = { daysElapsed: _rDaysElapsed, daysInMonth: _rDaysInMonth };

  const MONTH_NAMES = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];
  const reportingPeriod = {
    month:                _rMonth,
    year:                 _rYear,
    monthName:            MONTH_NAMES[_rMonth] ?? String(_rMonth),
    daysElapsed:          _rDaysElapsed,
    daysInMonth:          _rDaysInMonth,
    isCurrentCalendarMonth: _rIsCurrentCalMonth,
  };

  // ── Computed values ────────────────────────────────────────────────────────
  const repSummaries: RepSummary[] = state.reps
    .filter(r => r.active)
    .map(rep => {
      const perf = state.monthlyRepPerf.find(p => p.repId === rep.id && p.month === _rMonth && p.year === _rYear);
      return buildRepSummary(rep, perf, state.coachingNotes, _rPeriod);
    });

  const storeSummaries: StoreSummary[] = state.stores
    .filter(s => s.active)
    .map(store => {
      const perf = state.monthlyStorePerf.find(p => p.storeId === store.id && p.month === _rMonth && p.year === _rYear);
      return buildStoreSummary(store, perf, state.reps, state.visits, _rPeriod);
    });

  // Compute district stats from storeSummaries (same source as Stores leaderboard totals row).
  // Only include stores that have actual activity data.
  const _activeDataStores = storeSummaries.filter(ss =>
    ss.mtdAttachments > 0 || ss.mtdBoxes > 0 || ss.bpPct > 0 || ss.atuPct > 0 || ss.reportCardPct > 0
  );
  const _dTotalTrend = _activeDataStores.reduce((s, ss) => s + ss.attachmentTrend, 0);
  const _dTotalGoal  = _activeDataStores.reduce((s, ss) => s + ss.attachmentGoal, 0);
  const districtStats = {
    mtdAttachments:      _activeDataStores.reduce((s, ss) => s + ss.mtdAttachments, 0),
    mtdBoxes:            _activeDataStores.reduce((s, ss) => s + ss.mtdBoxes, 0),
    totalGoal:           _dTotalGoal,
    attachmentTrend:     _dTotalTrend,
    attachmentPctToGoal: _dTotalGoal > 0 ? Math.round((_dTotalTrend / _dTotalGoal) * 1000) / 10 : 0,
    avgBpPct:  _activeDataStores.length > 0 ? Math.round(_activeDataStores.reduce((s, ss) => s + ss.bpPct,         0) / _activeDataStores.length) : 0,
    avgAtuPct: _activeDataStores.length > 0 ? Math.round(_activeDataStores.reduce((s, ss) => s + ss.atuPct,        0) / _activeDataStores.length) : 0,
    avgRcPct:  _activeDataStores.length > 0 ? Math.round(_activeDataStores.reduce((s, ss) => s + ss.reportCardPct, 0) / _activeDataStores.length) : 0,
  };

  // Visit stats filtered to current reporting month only, real/manual visits only (not demo).
  const _monthVisits = state.visits.filter(v => {
    const [y, m] = v.date.split('-').map(Number);
    return y === _rYear && m === _rMonth && v.source !== 'demo';
  });
  const visitStats = calcVisitStats(_monthVisits, state.settings.monthlyVisitGoal);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetToSeed = useCallback(() => {
    const fresh: AppState = {
      stores: SEED_STORES,
      reps: SEED_REPS,
      dailyPerf: SEED_DAILY_PERF,
      monthlyRepPerf: SEED_MONTHLY_REP_PERF,
      monthlyStorePerf: SEED_MONTHLY_STORE_PERF,
      tasks: SEED_TASKS,
      visits: SEED_VISITS,
      shifts: SEED_SHIFTS,
      coachingNotes: SEED_COACHING_NOTES,
      coachingQueue: [],
      eodReports: SEED_EOD_REPORTS,
      messageDrafts: SEED_MESSAGE_DRAFTS,
      settings: SEED_DISTRICT_SETTINGS,
      calendarEvents: [],
      googleTasks: [],
    };
    setState(fresh);
  }, []);

  // ── Store CRUD ─────────────────────────────────────────────────────────────
  const addStore = useCallback((s: Omit<Store, 'id' | 'createdAt'>) => {
    patch('stores', prev => [...prev, { ...s, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateStore = useCallback((id: string, p: Partial<Store>) => {
    patch('stores', prev => prev.map(s => s.id === id ? { ...s, ...p } : s));
  }, [patch]);
  const removeStore = useCallback((id: string) => {
    patch('stores', prev => prev.map(s => s.id === id ? { ...s, active: false } : s));
  }, [patch]);

  // ── Rep CRUD ───────────────────────────────────────────────────────────────
  const addRep = useCallback((r: Omit<Rep, 'id' | 'createdAt'>) => {
    patch('reps', prev => [...prev, { ...r, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateRep = useCallback((id: string, p: Partial<Rep>) => {
    patch('reps', prev => prev.map(r => r.id === id ? { ...r, ...p } : r));
  }, [patch]);
  const removeRep = useCallback((id: string) => {
    patch('reps', prev => prev.map(r => r.id === id ? { ...r, active: false } : r));
  }, [patch]);

  // ── Task CRUD ──────────────────────────────────────────────────────────────
  const addTask = useCallback((t: Omit<Task, 'id' | 'createdAt'>) => {
    patch('tasks', prev => [...prev, { ...t, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateTask = useCallback((id: string, p: Partial<Task>) => {
    patch('tasks', prev => prev.map(t => t.id === id ? { ...t, ...p } : t));
  }, [patch]);
  const removeTask = useCallback((id: string) => {
    patch('tasks', prev => prev.filter(t => t.id !== id));
  }, [patch]);

  // ── Visit CRUD ─────────────────────────────────────────────────────────────
  const addVisit = useCallback((v: Omit<Visit, 'id' | 'createdAt'>) => {
    patch('visits', prev => [...prev, { ...v, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateVisit = useCallback((id: string, p: Partial<Visit>) => {
    patch('visits', prev => prev.map(v => v.id === id ? { ...v, ...p, updatedAt: new Date().toISOString() } : v));
  }, [patch]);
  const removeVisit = useCallback((id: string) => {
    patch('visits', prev => prev.filter(v => v.id !== id));
  }, [patch]);
  const clearDemoVisits = useCallback(() => {
    patch('visits', prev => prev.filter(v => v.source === 'manual' || v.source === 'google_calendar'));
  }, [patch]);
  const clearMonthVisits = useCallback((month: number, year: number) => {
    patch('visits', prev => prev.filter(v => {
      const [y, m] = v.date.split('-').map(Number);
      return !(y === year && m === month);
    }));
  }, [patch]);

  const clearDemoSeedTasks = useCallback(() => {
    patch('tasks', prev => prev.filter(t => t.source !== 'seed'));
  }, [patch]);
  const clearDemoSeedCoachingNotes = useCallback(() => {
    patch('coachingNotes', prev => prev.filter(n => n.source !== 'seed'));
  }, [patch]);

  const setCalendarEvents = useCallback((events: CalendarEvent[]) => {
    patch('calendarEvents', () => events);
  }, [patch]);

  const setGoogleTasks = useCallback((tasks: GoogleTask[]) => {
    patch('googleTasks', () => tasks);
  }, [patch]);

  // ── Shift CRUD ─────────────────────────────────────────────────────────────
  const addShift = useCallback((s: Omit<ScheduleShift, 'id' | 'createdAt'>) => {
    patch('shifts', prev => [...prev, { ...s, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateShift = useCallback((id: string, p: Partial<ScheduleShift>) => {
    patch('shifts', prev => prev.map(s => s.id === id ? { ...s, ...p } : s));
  }, [patch]);
  const removeShift = useCallback((id: string) => {
    patch('shifts', prev => prev.filter(s => s.id !== id));
  }, [patch]);
  const replaceWeekShifts = useCallback((weekStart: string, newShifts: Omit<ScheduleShift, 'id' | 'createdAt'>[]) => {
    patch('shifts', prev => {
      const end = new Date(weekStart + 'T00:00:00');
      end.setDate(end.getDate() + 6);
      const weekEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
      const now = new Date().toISOString();
      const kept = prev.filter(s => s.date < weekStart || s.date > weekEnd);
      const added = newShifts.map(s => ({ ...s, id: genId(), createdAt: now }));
      return [...kept, ...added];
    });
  }, [patch]);

  // ── Daily Performance ──────────────────────────────────────────────────────
  const addDailyPerf = useCallback((dp: Omit<DailyPerformance, 'id' | 'createdAt' | 'updatedAt'>): 'added' | 'duplicate' => {
    let result: 'added' | 'duplicate' = 'added';
    patch('dailyPerf', prev => {
      const existing = prev.find(p => p.date === dp.date && p.repId === dp.repId && p.storeId === dp.storeId);
      if (existing) { result = 'duplicate'; return prev; }
      const now = new Date().toISOString();
      return [...prev, { ...dp, id: genId(), createdAt: now, updatedAt: now }];
    });
    return result;
  }, [patch]);
  const replaceDailyPerf = useCallback((dp: Omit<DailyPerformance, 'id' | 'createdAt' | 'updatedAt'>) => {
    patch('dailyPerf', prev => {
      const now = new Date().toISOString();
      const filtered = prev.filter(p => !(p.date === dp.date && p.repId === dp.repId && p.storeId === dp.storeId));
      return [...filtered, { ...dp, id: genId(), createdAt: now, updatedAt: now }];
    });
  }, [patch]);
  const updateDailyPerf = useCallback((id: string, p: Partial<DailyPerformance>) => {
    patch('dailyPerf', prev => prev.map(dp => dp.id === id ? { ...dp, ...p, updatedAt: new Date().toISOString() } : dp));
  }, [patch]);

  // ── Monthly Perf ───────────────────────────────────────────────────────────
  const upsertMonthlyRepPerf = useCallback((p: Omit<MonthlyRepPerformance, 'id'>) => {
    patch('monthlyRepPerf', prev => {
      const existing = prev.find(x => x.repId === p.repId && x.month === p.month && x.year === p.year);
      if (existing) return prev.map(x => x.id === existing.id ? { ...x, ...p } : x);
      return [...prev, { ...p, id: genId() }];
    });
  }, [patch]);
  const upsertMonthlyStorePerf = useCallback((p: Omit<MonthlyStorePerformance, 'id'>) => {
    patch('monthlyStorePerf', prev => {
      const existing = prev.find(x => x.storeId === p.storeId && x.month === p.month && x.year === p.year);
      if (existing) return prev.map(x => x.id === existing.id ? { ...x, ...p } : x);
      return [...prev, { ...p, id: genId() }];
    });
  }, [patch]);
  const patchMonthlyRepPerf = useCallback((repId: string, month: number, year: number, p: Partial<MonthlyRepPerformance>) => {
    patch('monthlyRepPerf', prev => {
      const existing = prev.find(x => x.repId === repId && x.month === month && x.year === year);
      if (existing) return prev.map(x => x.id === existing.id ? { ...x, ...p } : x);
      return [...prev, { id: genId(), repId, month, year, mtdAttachments: 0, mtdBoxes: 0, attachmentGoal: 0, bpPct: 0, atuPct: 0, reportCardPct: 0, ...p }];
    });
  }, [patch]);
  const patchMonthlyStorePerf = useCallback((storeId: string, month: number, year: number, p: Partial<MonthlyStorePerformance>) => {
    patch('monthlyStorePerf', prev => {
      const existing = prev.find(x => x.storeId === storeId && x.month === month && x.year === year);
      if (existing) return prev.map(x => x.id === existing.id ? { ...x, ...p } : x);
      return [...prev, { id: genId(), storeId, month, year, mtdAttachments: 0, mtdBoxes: 0, attachmentGoal: 0, bpPct: 0, atuPct: 0, reportCardPct: 0, ...p }];
    });
  }, [patch]);

  // ── Coaching Notes ─────────────────────────────────────────────────────────
  const addCoachingNote = useCallback((n: Omit<CoachingNote, 'id' | 'createdAt'>) => {
    patch('coachingNotes', prev => [...prev, { ...n, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateCoachingNote = useCallback((id: string, p: Partial<CoachingNote>) => {
    patch('coachingNotes', prev => prev.map(n => n.id === id ? { ...n, ...p } : n));
  }, [patch]);

  // ── Coaching Queue ─────────────────────────────────────────────────────────
  const addToCoachingQueue = useCallback((item: Omit<CoachingQueueItem, 'id' | 'createdAt'>): 'added' | 'duplicate' => {
    let result: 'added' | 'duplicate' = 'added';
    patch('coachingQueue', prev => {
      const dup = prev.find(q =>
        q.repId === item.repId &&
        q.reason === item.reason &&
        q.dueDate === item.dueDate &&
        (q.status === 'open' || q.status === 'inProgress')
      );
      if (dup) { result = 'duplicate'; return prev; }
      return [...prev, { ...item, id: genId(), createdAt: new Date().toISOString() }];
    });
    return result;
  }, [patch]);
  const updateCoachingQueueItem = useCallback((id: string, p: Partial<CoachingQueueItem>) => {
    patch('coachingQueue', prev => prev.map(q => q.id === id ? { ...q, ...p } : q));
  }, [patch]);

  // ── EOD Reports ────────────────────────────────────────────────────────────
  const addEODReport = useCallback((r: Omit<EODReport, 'id' | 'createdAt'>) => {
    patch('eodReports', prev => [...prev, { ...r, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateEODReport = useCallback((id: string, p: Partial<EODReport>) => {
    patch('eodReports', prev => prev.map(r => r.id === id ? { ...r, ...p } : r));
  }, [patch]);
  const removeEODReport = useCallback((id: string) => {
    patch('eodReports', prev => prev.filter(r => r.id !== id));
  }, [patch]);
  const cleanDuplicateEODReports = useCallback((): number => {
    let removed = 0;
    patch('eodReports', prev => {
      const seen = new Map<string, EODReport>();
      for (const r of [...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
        const key = `${r.date}|${r.repId}|${r.storeId}|${r.coachingFocus.toLowerCase().trim()}`;
        if (!seen.has(key)) seen.set(key, r);
        else removed++;
      }
      return [...seen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    return removed;
  }, [patch]);

  // ── Message Drafts ─────────────────────────────────────────────────────────
  const addMessageDraft = useCallback((m: Omit<MessageDraft, 'id' | 'createdAt'>) => {
    patch('messageDrafts', prev => [...prev, { ...m, id: genId(), createdAt: new Date().toISOString() }]);
  }, [patch]);
  const updateMessageDraft = useCallback((id: string, p: Partial<MessageDraft>) => {
    patch('messageDrafts', prev => prev.map(m => m.id === id ? { ...m, ...p } : m));
  }, [patch]);
  const removeMessageDraft = useCallback((id: string) => {
    patch('messageDrafts', prev => prev.filter(m => m.id !== id));
  }, [patch]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const updateSettings = useCallback((p: Partial<DistrictSettings>) => {
    setState(s => ({ ...s, settings: { ...s.settings, ...p } }));
  }, []);

  // ── Merge reps: move all history from dupId → primaryId, archive dup ───────
  const mergeReps = useCallback((primaryId: string, dupId: string) => {
    setState(s => {
      const now = new Date().toISOString();
      return {
        ...s,
        reps: s.reps.map(r => r.id === dupId ? { ...r, active: false } : r),
        dailyPerf: s.dailyPerf.map(dp => dp.repId === dupId ? { ...dp, repId: primaryId, updatedAt: now } : dp),
        tasks: s.tasks.map(t => t.repId === dupId ? { ...t, repId: primaryId } : t),
        coachingNotes: s.coachingNotes.map(n => n.repId === dupId ? { ...n, repId: primaryId } : n),
        monthlyRepPerf: s.monthlyRepPerf.filter(p2 => p2.repId !== dupId),
      };
    });
  }, []);

  // ── Merge stores: move all history from dupId → primaryId, archive dup ─────
  const mergeStores = useCallback((primaryId: string, dupId: string) => {
    setState(s => {
      const now = new Date().toISOString();
      return {
        ...s,
        stores: s.stores.map(st => st.id === dupId ? { ...st, active: false } : st),
        reps: s.reps.map(r => r.defaultStoreId === dupId ? { ...r, defaultStoreId: primaryId } : r),
        dailyPerf: s.dailyPerf.map(dp => dp.storeId === dupId ? { ...dp, storeId: primaryId, updatedAt: now } : dp),
        tasks: s.tasks.map(t => t.storeId === dupId ? { ...t, storeId: primaryId } : t),
        visits: s.visits.map(v => v.storeId === dupId ? { ...v, storeId: primaryId } : v),
        shifts: s.shifts.map(sh => sh.storeId === dupId ? { ...sh, storeId: primaryId } : sh),
        monthlyStorePerf: s.monthlyStorePerf.filter(p2 => p2.storeId !== dupId),
      };
    });
  }, []);

  // ── Permanent delete — only allowed when no history exists ─────────────────
  // Not wrapped in useCallback intentionally: needs live state access on each call.
  const permanentDeleteRep = (id: string): { success: boolean; reason?: string } => {
    if (state.dailyPerf.some(dp => dp.repId === id) ||
        state.tasks.some(t => t.repId === id) ||
        state.coachingNotes.some(n => n.repId === id)) {
      return { success: false, reason: 'This rep has historical data. Use Archive instead to preserve records.' };
    }
    patch('reps', prev => prev.filter(r => r.id !== id));
    return { success: true };
  };

  const permanentDeleteStore = (id: string): { success: boolean; reason?: string } => {
    if (state.dailyPerf.some(dp => dp.storeId === id) ||
        state.tasks.some(t => t.storeId === id) ||
        state.visits.some(v => v.storeId === id) ||
        state.shifts.some(sh => sh.storeId === id)) {
      return { success: false, reason: 'This store has historical data. Use Archive instead to preserve records.' };
    }
    patch('stores', prev => prev.filter(st => st.id !== id));
    return { success: true };
  };

  // ── Atomic batch for sheet sync (replaces multiple arrays in one setState) ─
  const batchApply = useCallback((p: {
    reps: Rep[];
    stores: Store[];
    dailyPerf: DailyPerformance[];
    monthlyRepPerf: MonthlyRepPerformance[];
    monthlyStorePerf: MonthlyStorePerformance[];
  }) => {
    setState(s => ({ ...s, ...p }));
  }, []);

  const value: DataContextValue = {
    ...state,
    repSummaries,
    storeSummaries,
    districtStats,
    visitStats,
    reportingPeriod,
    resetToSeed,
    addStore, updateStore, removeStore,
    addRep, updateRep, removeRep,
    addTask, updateTask, removeTask,
    addVisit, updateVisit, removeVisit,
    addShift, updateShift, removeShift, replaceWeekShifts,
    addDailyPerf, replaceDailyPerf, updateDailyPerf,
    upsertMonthlyRepPerf, upsertMonthlyStorePerf, patchMonthlyRepPerf, patchMonthlyStorePerf,
    addCoachingNote, updateCoachingNote,
    addToCoachingQueue, updateCoachingQueueItem,
    addEODReport, updateEODReport, removeEODReport, cleanDuplicateEODReports,
    addMessageDraft, updateMessageDraft, removeMessageDraft,
    updateSettings, batchApply,
    mergeReps, mergeStores, permanentDeleteRep, permanentDeleteStore,
    clearDemoVisits, clearMonthVisits, clearDemoSeedTasks, clearDemoSeedCoachingNotes,
    setCalendarEvents, setGoogleTasks,
    planVisitPrefill, openPlanVisit, closePlanVisit,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
