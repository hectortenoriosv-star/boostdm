import { useState, useMemo, useEffect } from 'react';
import {
  Settings, RefreshCw, AlertTriangle, CheckCircle,
  Database, RotateCcw, Clock, ChevronDown, ChevronRight,
  Calendar, TestTube2, Eye, ExternalLink, Zap,
  Shield, Activity, BarChart3, Users, Store as StoreIcon,
  FileText, X, Info, BookOpen, Key, Link2, Link2Off, CheckSquare,
} from 'lucide-react';
import {
  loadGISScript, requestToken, disconnect as disconnectOAuth,
  isTokenValid, loadToken,
} from '../services/googleOAuth';
import type { OAuthToken } from '../services/googleOAuth';
import { fetchCalendarEvents } from '../services/googleCalendarSync';
import { fetchGoogleTasks } from '../services/googleTasksSync';
import { useData } from '../context/DataContext';
import { useSheetSync } from '../hooks/useSheetSync';
import { extractSpreadsheetId, computeRangeInfo } from '../services/sheetsSync';
import { syncSource } from '../services/sourceSyncLogic';
import { SourceConfigPanel } from '../components/SourceConfigPanel';
import { fmtCurrency, CURRENT_MONTH, CURRENT_YEAR } from '../data/calculations';
import type { DailyNumbersMapping, SheetMetricMapping, GoogleSheetSourceType } from '../types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAPPING: DailyNumbersMapping = {
  date:       { tab: 'Daily', range: 'A2:A' },
  rep:        { tab: 'Daily', range: 'B2:B' },
  store:      { tab: 'Daily', range: 'C2:C' },
  boxes:      { tab: 'Daily', range: 'D2:D' },
  goal:       { tab: 'Daily', range: 'E2:E' },
  attachment: { tab: 'Daily', range: 'F2:F' },
  pctToGoal:  { tab: 'Daily', range: 'G2:G' },
};

const METRIC_ROWS: { key: keyof DailyNumbersMapping; label: string; required: boolean }[] = [
  { key: 'date',       label: 'Date',           required: true },
  { key: 'rep',        label: 'Rep',            required: true },
  { key: 'store',      label: 'Store',          required: true },
  { key: 'boxes',      label: 'Boxes',          required: true },
  { key: 'goal',       label: 'Goal ($)',        required: true },
  { key: 'attachment', label: 'Attachment ($)',  required: true },
  { key: 'pctToGoal',  label: '% to Goal',      required: false },
];

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Page → Source mapping ──────────────────────────────────────────────────────

interface PageSourceEntry {
  pageName: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  desc: string;
  hasDailyNumbers: boolean;
  sources: GoogleSheetSourceType[];
}

const PAGE_SOURCE_MAP: PageSourceEntry[] = [
  {
    pageName: 'Dashboard',
    icon: BarChart3,
    desc: 'District KPIs, attachment trend, leaderboard, district rank, report card %',
    hasDailyNumbers: true,
    sources: ['report-card', 'bp-atu', 'district-rank'],
  },
  {
    pageName: 'Daily Numbers',
    icon: Activity,
    desc: 'Daily performance log — boxes, attachment, and goals per rep per store',
    hasDailyNumbers: true,
    sources: [],
  },
  {
    pageName: 'Reps',
    icon: Users,
    desc: 'Rep scorecards, attachment goals, commission estimate, leaderboard',
    hasDailyNumbers: true,
    sources: ['report-card', 'bp-atu', 'rep-goals', 'commission'],
  },
  {
    pageName: 'Stores',
    icon: StoreIcon,
    desc: 'Store scorecards, monthly goal, store leaderboard',
    hasDailyNumbers: true,
    sources: ['report-card', 'bp-atu', 'store-goals'],
  },
  {
    pageName: "Today's Agenda",
    icon: Calendar,
    desc: 'Upcoming shifts, EOD follow-ups, schedule summary',
    hasDailyNumbers: false,
    sources: ['schedule', 'eod-forms'],
  },
  {
    pageName: 'Schedule',
    icon: Clock,
    desc: 'Weekly rep shift schedule, hours, store assignments',
    hasDailyNumbers: false,
    sources: ['schedule'],
  },
  {
    pageName: 'EOD Reports',
    icon: FileText,
    desc: 'End-of-day form submissions, coaching triggers',
    hasDailyNumbers: false,
    sources: ['eod-forms'],
  },
  {
    pageName: 'Coaching Hub',
    icon: BookOpen,
    desc: 'Coaching notes, follow-ups, EOD-sourced observations',
    hasDailyNumbers: false,
    sources: ['eod-forms'],
  },
];

const SOURCE_LABELS: Record<GoogleSheetSourceType, string> = {
  'daily-numbers': 'Daily Numbers',
  'report-card':   'Report Card %',
  'bp-atu':        'BP% / ATU%',
  'district-rank': 'District Rank',
  'rep-goals':     'Rep Goals',
  'store-goals':   'Store Goals',
  'commission':    'Commission',
  'eod-forms':     'EOD Forms',
  'schedule':      'Schedule',
};

// ─── Data Health Helpers ────────────────────────────────────────────────────────

function getDataHealth(
  reportingMonth: number,
  reportingYear: number,
  monthlyRepPerf: ReturnType<typeof import('../context/DataContext').useData>['monthlyRepPerf'],
  monthlyStorePerf: ReturnType<typeof import('../context/DataContext').useData>['monthlyStorePerf'],
  dailyPerf: ReturnType<typeof import('../context/DataContext').useData>['dailyPerf'],
  reps: ReturnType<typeof import('../context/DataContext').useData>['reps'],
  stores: ReturnType<typeof import('../context/DataContext').useData>['stores'],
) {
  const monthRepRecords   = monthlyRepPerf.filter(p => p.month === reportingMonth && p.year === reportingYear);
  const monthStoreRecords = monthlyStorePerf.filter(p => p.month === reportingMonth && p.year === reportingYear);
  const monthDailyEntries = dailyPerf.filter(d => d.date.startsWith(`${reportingYear}-${String(reportingMonth).padStart(2, '0')}`));

  const activeReps   = reps.filter(r => r.active).length;
  const activeStores = stores.filter(s => s.active).length;

  const warnings: string[] = [];
  const errors: string[] = [];

  if (monthRepRecords.length === 0 && activeReps > 0) {
    errors.push(`No rep performance records found for ${MONTH_NAMES[reportingMonth]} ${reportingYear}.`);
  }
  if (monthStoreRecords.length === 0 && activeStores > 0) {
    errors.push(`No store performance records found for ${MONTH_NAMES[reportingMonth]} ${reportingYear}.`);
  }
  if (monthDailyEntries.length === 0 && dailyPerf.length > 0) {
    const firstDate = dailyPerf[0]?.date ?? '';
    const wrongMonthYear = firstDate.slice(0, 7);
    warnings.push(
      `Daily entries exist (${dailyPerf.length} rows) but none match ${MONTH_NAMES[reportingMonth]} ${reportingYear}. ` +
      `Oldest entry is ${wrongMonthYear}. Update the Reporting Month or sync ${MONTH_NAMES[reportingMonth]} data.`,
    );
  }

  const isCalendarMismatch = reportingMonth !== CURRENT_MONTH || reportingYear !== CURRENT_YEAR;
  if (isCalendarMismatch) {
    warnings.push(
      `Reporting month is ${MONTH_NAMES[reportingMonth]} ${reportingYear}, but today is in ${MONTH_NAMES[CURRENT_MONTH]} ${CURRENT_YEAR}. ` +
      `Update the reporting month if you want to see current-month data.`,
    );
  }

  const overall: 'healthy' | 'warning' | 'failed' =
    errors.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'healthy';

  return {
    overall, warnings, errors,
    monthRepRecords: monthRepRecords.length,
    monthStoreRecords: monthStoreRecords.length,
    monthDailyEntries: monthDailyEntries.length,
    isCalendarMismatch,
  };
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const {
    settings, updateSettings, resetToSeed,
    stores, reps, dailyPerf, visits, tasks,
    monthlyRepPerf, monthlyStorePerf, coachingNotes, eodReports,
    patchMonthlyRepPerf, patchMonthlyStorePerf, addCoachingNote,
    cleanDuplicateEODReports, clearDemoSeedTasks, clearDemoSeedCoachingNotes,
    reportingPeriod,
    calendarEvents, googleTasks, setCalendarEvents, setGoogleTasks,
    replaceWeekShifts,
  } = useData();

  const {
    syncing, syncResult, syncError,
    testPreview, testLoading, testError,
    doSync, doTest,
  } = useSheetSync();

  const [confirmReset, setConfirmReset]     = useState(false);
  const [confirmText, setConfirmText]       = useState('');
  const [saved, setSaved]                   = useState(false);
  const [expandedPage, setExpandedPage]     = useState<string | null>(null);
  const [eodCleanResult, setEodCleanResult] = useState<number | null>(null);

  // ── Google OAuth state ─────────────────────────────────────────────────────
  const [gisReady,        setGisReady]        = useState(false);
  const [oauthClientIdField, setOauthClientIdField] = useState(settings.googleOAuthClientId ?? '');
  const [oauthIdSaved,    setOauthIdSaved]    = useState(false);

  const [calConnected,    setCalConnected]    = useState(() => isTokenValid('calendar'));
  const [calConnecting,   setCalConnecting]   = useState(false);
  const [calSyncing,      setCalSyncing]      = useState(false);
  const [calError,        setCalError]        = useState<string | null>(null);

  const [tasksConnected,  setTasksConnected]  = useState(() => isTokenValid('tasks'));
  const [tasksConnecting, setTasksConnecting] = useState(false);
  const [tasksSyncing,    setTasksSyncing]    = useState(false);
  const [tasksError,      setTasksError]      = useState<string | null>(null);

  // Load GIS script when this component mounts so Connect buttons work immediately
  useEffect(() => {
    loadGISScript()
      .then(() => setGisReady(true))
      .catch(() => { /* non-fatal — error shown on connect attempt */ });
  }, []);

  // ── Save OAuth Client ID ───────────────────────────────────────────────────
  const saveOAuthClientId = () => {
    updateSettings({ googleOAuthClientId: oauthClientIdField.trim() || undefined });
    setOauthIdSaved(true);
    setTimeout(() => setOauthIdSaved(false), 2000);
  };

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const doCalendarSync = async (token: OAuthToken) => {
    setCalSyncing(true);
    setCalError(null);
    try {
      const events = await fetchCalendarEvents(token.access_token);
      setCalendarEvents(events);
      updateSettings({
        googleCalendarConnected: true,
        googleCalendarLastSyncedAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      setCalError(msg);
      if (msg.includes('expired')) { disconnectOAuth('calendar'); setCalConnected(false); }
    } finally {
      setCalSyncing(false);
    }
  };

  const connectCalendar = async () => {
    const clientId = settings.googleOAuthClientId;
    if (!clientId) return;
    setCalConnecting(true);
    setCalError(null);
    try {
      const token = await requestToken(clientId, 'calendar');
      setCalConnected(true);
      await doCalendarSync(token);
    } catch (e) {
      setCalError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setCalConnecting(false);
    }
  };

  const syncCalendar = async () => {
    const token = loadToken('calendar');
    if (!token) { setCalError('Token expired — please reconnect.'); setCalConnected(false); return; }
    await doCalendarSync(token);
  };

  const disconnectCalendar = () => {
    disconnectOAuth('calendar');
    setCalConnected(false);
    setCalendarEvents([]);
    updateSettings({ googleCalendarConnected: false, googleCalendarLastSyncedAt: undefined });
  };

  // ── Tasks helpers ──────────────────────────────────────────────────────────
  const doTasksSync = async (token: OAuthToken) => {
    setTasksSyncing(true);
    setTasksError(null);
    try {
      const tasks = await fetchGoogleTasks(token.access_token);
      setGoogleTasks(tasks);
      updateSettings({
        googleTasksConnected: true,
        googleTasksLastSyncedAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      setTasksError(msg);
      if (msg.includes('expired')) { disconnectOAuth('tasks'); setTasksConnected(false); }
    } finally {
      setTasksSyncing(false);
    }
  };

  const connectTasks = async () => {
    const clientId = settings.googleOAuthClientId;
    if (!clientId) return;
    setTasksConnecting(true);
    setTasksError(null);
    try {
      const token = await requestToken(clientId, 'tasks');
      setTasksConnected(true);
      await doTasksSync(token);
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setTasksConnecting(false);
    }
  };

  const syncTasks = async () => {
    const token = loadToken('tasks');
    if (!token) { setTasksError('Token expired — please reconnect.'); setTasksConnected(false); return; }
    await doTasksSync(token);
  };

  const disconnectTasks = () => {
    disconnectOAuth('tasks');
    setTasksConnected(false);
    setGoogleTasks([]);
    updateSettings({ googleTasksConnected: false, googleTasksLastSyncedAt: undefined });
  };

  const [form, setForm] = useState({
    districtRank:      settings.districtRank      ?? '',
    districtRankOutOf: settings.districtRankOutOf ?? '',
    monthlyVisitGoal:  settings.monthlyVisitGoal,
    bpGoal:            settings.bpGoal,
    atuGoal:           settings.atuGoal,
    reportCardGoal:    settings.reportCardGoal,
    sheetsUrl:         settings.sheetsUrl         ?? '',
    sheetsSpreadsheetId: settings.sheetsSpreadsheetId ?? '',
    sheetsApiKey:      settings.sheetsApiKey       ?? '',
  });

  const [mapping, setMapping] = useState<DailyNumbersMapping>(
    settings.dailyNumbersMapping ?? DEFAULT_MAPPING,
  );

  const [rpMonth, setRpMonth] = useState(settings.currentMonth);
  const [rpYear,  setRpYear]  = useState(settings.currentYear);

  const updateMappingField = (key: keyof DailyNumbersMapping, field: keyof SheetMetricMapping, value: string) =>
    setMapping(m => ({ ...m, [key]: { ...m[key], [field]: value } }));

  const saveSettings = () => {
    const id = form.sheetsSpreadsheetId.trim() || extractSpreadsheetId(form.sheetsUrl);
    updateSettings({
      districtRank:        form.districtRank      ? Number(form.districtRank)      : undefined,
      districtRankOutOf:   form.districtRankOutOf ? Number(form.districtRankOutOf) : undefined,
      monthlyVisitGoal:    form.monthlyVisitGoal,
      bpGoal:              form.bpGoal,
      atuGoal:             form.atuGoal,
      reportCardGoal:      form.reportCardGoal,
      sheetsUrl:           form.sheetsUrl      || undefined,
      sheetsSpreadsheetId: id                  || undefined,
      sheetsApiKey:        form.sheetsApiKey   || undefined,
      dailyNumbersMapping: mapping,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const applyReportingPeriod = () => {
    updateSettings({ currentMonth: rpMonth, currentYear: rpYear });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetToCurrentMonth = () => {
    setRpMonth(CURRENT_MONTH);
    setRpYear(CURRENT_YEAR);
    updateSettings({ currentMonth: CURRENT_MONTH, currentYear: CURRENT_YEAR });
  };

  const doReset = () => {
    if (confirmText === 'RESET') {
      resetToSeed();
      setConfirmReset(false);
      setConfirmText('');
    }
  };

  const spreadsheetId = form.sheetsSpreadsheetId.trim() || extractSpreadsheetId(form.sheetsUrl);
  const canSync       = Boolean(spreadsheetId && form.sheetsApiKey.trim());
  const handleTest    = () => doTest(spreadsheetId, form.sheetsApiKey, mapping);
  const handleSync    = () => doSync(spreadsheetId, form.sheetsApiKey, mapping);

  // ── Sync All ────────────────────────────────────────────────────────────────
  const [syncAllState, setSyncAllState] = useState<{
    running: boolean; done: number; total: number;
    errors: string[]; finished: boolean;
    syncedSources: Array<{ name: string; ok: boolean; rows?: number }>;
  }>({ running: false, done: 0, total: 0, errors: [], finished: false, syncedSources: [] });

  // Sync order: district-rank → store-goals → rep-goals → daily-numbers → bp-atu →
  //             report-card → commission → eod-forms → schedule → Google Calendar → Google Tasks
  const SOURCE_ORDER: Record<string, number> = {
    'district-rank': 1, 'store-goals': 2, 'rep-goals': 3,
    'bp-atu': 5, 'report-card': 6, 'commission': 7, 'eod-forms': 8, 'schedule': 9,
  };

  const handleSyncAll = async () => {
    const enabledSources = (settings.googleSheetSources ?? [])
      .filter(s => s.enabled)
      .sort((a, b) => (SOURCE_ORDER[a.type] ?? 4) - (SOURCE_ORDER[b.type] ?? 4));

    const total =
      enabledSources.length +
      (canSync ? 1 : 0) +
      (calConnected ? 1 : 0) +
      (tasksConnected ? 1 : 0);

    if (total === 0) return;

    setSyncAllState({ running: true, done: 0, total, errors: [], finished: false, syncedSources: [] });

    const ctx = {
      reps, stores, monthlyRepPerf, monthlyStorePerf, coachingNotes,
      settings, patchMonthlyRepPerf, patchMonthlyStorePerf,
      updateSettings, addCoachingNote, replaceWeekShifts,
    };

    const allErrors: string[] = [];
    const syncedSources: Array<{ name: string; ok: boolean; rows?: number }> = [];
    let done = 0;

    for (const source of enabledSources) {
      const displayName = source.name || SOURCE_LABELS[source.type] || source.type;
      try {
        const result = await syncSource(source, form.sheetsApiKey, ctx);
        syncedSources.push({ name: displayName, ok: true, rows: result.rowsImported });
      } catch (e) {
        allErrors.push(`${displayName}: ${e instanceof Error ? e.message : 'Failed'}`);
        syncedSources.push({ name: displayName, ok: false });
      }
      done++;
      setSyncAllState(s => ({ ...s, done, syncedSources: [...syncedSources] }));
    }

    if (canSync) {
      try {
        await doSync(spreadsheetId, form.sheetsApiKey, mapping);
        syncedSources.push({ name: 'Daily Numbers', ok: true });
      } catch (e) {
        allErrors.push(`Daily Numbers: ${e instanceof Error ? e.message : 'Failed'}`);
        syncedSources.push({ name: 'Daily Numbers', ok: false });
      }
      done++;
      setSyncAllState(s => ({ ...s, done, syncedSources: [...syncedSources] }));
    }

    if (calConnected) {
      try {
        await syncCalendar();
        syncedSources.push({ name: 'Google Calendar', ok: true });
      } catch (e) {
        allErrors.push(`Google Calendar: ${e instanceof Error ? e.message : 'Failed'}`);
        syncedSources.push({ name: 'Google Calendar', ok: false });
      }
      done++;
      setSyncAllState(s => ({ ...s, done, syncedSources: [...syncedSources] }));
    }

    if (tasksConnected) {
      try {
        await syncTasks();
        syncedSources.push({ name: 'Google Tasks', ok: true });
      } catch (e) {
        allErrors.push(`Google Tasks: ${e instanceof Error ? e.message : 'Failed'}`);
        syncedSources.push({ name: 'Google Tasks', ok: false });
      }
      done++;
      setSyncAllState(s => ({ ...s, done, syncedSources: [...syncedSources] }));
    }

    setSyncAllState({ running: false, done, total, errors: allErrors, finished: true, syncedSources });
  };

  const enabledSourceCount = (settings.googleSheetSources ?? []).filter(s => s.enabled).length;
  const totalSyncSources   = enabledSourceCount + (canSync ? 1 : 0) + (calConnected ? 1 : 0) + (tasksConnected ? 1 : 0);

  // ── Data health ─────────────────────────────────────────────────────────────
  const health = useMemo(() =>
    getDataHealth(
      reportingPeriod.month, reportingPeriod.year,
      monthlyRepPerf, monthlyStorePerf, dailyPerf, reps, stores,
    ),
    [reportingPeriod, monthlyRepPerf, monthlyStorePerf, dailyPerf, reps, stores],
  );

  const signalPct = (pct: number) =>
    pct >= 100 ? 'text-signal-green' : pct >= 75 ? 'text-signal-amber' : 'text-signal-red';

  // ── Page dependency health ─────────────────────────────────────────────────
  const pageHealth = useMemo(() => {
    const hasMonthlyData = health.monthRepRecords > 0 || health.monthStoreRecords > 0;
    const hasDailyData   = health.monthDailyEntries > 0;
    const pages = [
      {
        name: 'Dashboard',
        icon: BarChart3,
        status: hasMonthlyData ? 'ok' : 'warn',
        note: hasMonthlyData ? undefined : 'No monthly records for reporting month',
      },
      {
        name: 'Reps',
        icon: Users,
        status: health.monthRepRecords > 0 ? 'ok' : 'fail',
        note: health.monthRepRecords > 0 ? undefined : 'No rep performance records',
      },
      {
        name: 'Stores',
        icon: StoreIcon,
        status: health.monthStoreRecords > 0 ? 'ok' : 'fail',
        note: health.monthStoreRecords > 0 ? undefined : 'No store performance records',
      },
      {
        name: 'Daily Numbers',
        icon: Activity,
        status: hasDailyData ? 'ok' : 'warn',
        note: hasDailyData ? undefined : 'No daily entries for reporting month',
      },
      {
        name: 'Today\'s Agenda',
        icon: Calendar,
        status: hasMonthlyData ? 'ok' : 'warn',
        note: hasMonthlyData ? undefined : 'Suggestions limited without monthly data',
      },
      {
        name: 'Coaching Hub',
        icon: FileText,
        status: coachingNotes.length > 0 ? 'ok' : 'warn',
        note: coachingNotes.length > 0 ? undefined : 'No coaching notes found',
      },
    ] as { name: string; icon: React.ComponentType<{ size?: number; className?: string }>; status: 'ok' | 'warn' | 'fail'; note?: string }[];
    return pages;
  }, [health, coachingNotes]);

  // ── Source configured-count per page ───────────────────────────────────────
  const getPageConfigStatus = (entry: PageSourceEntry) => {
    const saved = settings.googleSheetSources ?? [];
    const totalTypes = (entry.hasDailyNumbers ? 1 : 0) + entry.sources.length;
    if (totalTypes === 0) return { configured: 0, total: 0 };
    const configured = [
      ...(entry.hasDailyNumbers ? ['daily-numbers' as GoogleSheetSourceType] : []),
      ...entry.sources,
    ].filter(type =>
      type === 'daily-numbers'
        ? Boolean(spreadsheetId)
        : saved.some(s => s.type === type && Boolean(s.spreadsheetId || s.spreadsheetUrl || spreadsheetId)),
    ).length;
    return { configured, total: totalTypes };
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 lg:p-6 space-y-6 max-w-screen-lg">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Shield size={18} className="text-ink-secondary" />
            <h1 className="text-xl font-bold text-ink-primary">Settings & Data Management</h1>
          </div>
          <p className="text-sm text-ink-secondary">Configure district settings, sync sources, and reporting month</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`flex items-center gap-1 text-xs font-semibold ${
              health.overall === 'healthy' ? 'text-signal-green'
              : health.overall === 'warning' ? 'text-signal-amber'
              : 'text-signal-red'
            }`}>
              {health.overall === 'healthy'
                ? <><CheckCircle size={11} /> Data Healthy</>
                : health.overall === 'warning'
                ? <><AlertTriangle size={11} /> Data Warning</>
                : <><AlertTriangle size={11} /> Data Issue</>
              }
            </span>
            <span className="text-xs text-ink-muted">
              Reporting: <span className="font-semibold text-ink-secondary">
                {reportingPeriod.monthName} {reportingPeriod.year}
              </span>
            </span>
            {settings.lastSyncedAt && (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                <Clock size={10} /> Synced {new Date(settings.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {totalSyncSources > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={syncAllState.running || syncing}
              className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={13} className={syncAllState.running ? 'animate-spin' : ''} />
              {syncAllState.running ? `Syncing ${syncAllState.done}/${syncAllState.total}…` : `Sync All (${totalSyncSources})`}
            </button>
          )}
          <button
            onClick={saveSettings}
            className={`btn-secondary text-xs flex items-center gap-1.5 ${saved ? 'text-signal-green' : ''}`}
          >
            {saved ? <><CheckCircle size={12} /> Saved!</> : <><Settings size={12} /> Save Settings</>}
          </button>
        </div>
      </div>

      {/* ── Sync All result ────────────────────────────────────────────────── */}
      {syncAllState.finished && (
        <div className={`p-3 rounded-xl border ${
          syncAllState.errors.length === 0
            ? 'bg-signal-green/5 border-signal-green/20'
            : 'bg-signal-amber/5 border-signal-amber/20'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            {syncAllState.errors.length === 0
              ? <CheckCircle size={14} className="text-signal-green flex-shrink-0" />
              : <AlertTriangle size={14} className="text-signal-amber flex-shrink-0" />
            }
            <p className={`text-xs font-semibold flex-1 ${syncAllState.errors.length === 0 ? 'text-signal-green' : 'text-signal-amber'}`}>
              {syncAllState.errors.length === 0
                ? `All ${syncAllState.syncedSources.length} sources synced successfully`
                : `${syncAllState.errors.length} source(s) failed — ${syncAllState.syncedSources.filter(s => s.ok).length} succeeded`}
            </p>
            <button onClick={() => setSyncAllState(s => ({ ...s, finished: false }))} className="btn-ghost p-1 flex-shrink-0">
              <X size={12} />
            </button>
          </div>
          {syncAllState.syncedSources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {syncAllState.syncedSources.map((src, i) => (
                <span key={i} className={`text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1 ${
                  src.ok
                    ? 'bg-signal-green/15 text-signal-green'
                    : 'bg-signal-red/15 text-signal-red'
                }`}>
                  {src.ok ? '✓' : '✗'} {src.name}{src.rows !== undefined ? ` (${src.rows}r)` : ''}
                </span>
              ))}
            </div>
          )}
          {syncAllState.errors.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {syncAllState.errors.map((e, i) => (
                <p key={i} className="text-[11px] text-signal-red">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Data Quality Warnings ──────────────────────────────────────────── */}
      {(health.errors.length > 0 || health.warnings.length > 0) && (
        <div className="space-y-2">
          {health.errors.map((e, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 bg-signal-red/5 border border-signal-red/20 rounded-xl">
              <AlertTriangle size={14} className="text-signal-red flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ink-primary leading-relaxed">{e}</p>
            </div>
          ))}
          {health.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 bg-signal-amber/5 border border-signal-amber/20 rounded-xl">
              <Info size={14} className="text-signal-amber flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ink-primary leading-relaxed">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Data Health Summary ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Active Stores',
            value: stores.filter(s => s.active).length,
            icon: StoreIcon,
            sub: `${health.monthStoreRecords} w/ ${reportingPeriod.monthName} data`,
            ok: health.monthStoreRecords > 0,
          },
          {
            label: 'Active Reps',
            value: reps.filter(r => r.active).length,
            icon: Users,
            sub: `${health.monthRepRecords} w/ ${reportingPeriod.monthName} data`,
            ok: health.monthRepRecords > 0,
          },
          {
            label: 'Daily Entries',
            value: dailyPerf.length,
            icon: Activity,
            sub: `${health.monthDailyEntries} in ${reportingPeriod.monthName}`,
            ok: health.monthDailyEntries > 0,
          },
          {
            label: 'EOD Reports',
            value: (eodReports ?? []).length,
            icon: FileText,
            sub: `${(eodReports ?? []).filter(e => e.status === 'new').length} unreviewed`,
            ok: true,
          },
          {
            label: 'Visits Logged',
            value: visits.length,
            icon: Calendar,
            sub: `${visits.filter(v => v.status === 'planned').length} planned`,
            ok: true,
          },
          {
            label: 'Coaching Notes',
            value: coachingNotes.length,
            icon: BarChart3,
            sub: `${coachingNotes.filter(n => n.status === 'open').length} open`,
            ok: true,
          },
        ].map(({ label, value, icon: Icon, sub, ok }) => (
          <div key={label} className={`card p-4 border ${ok ? 'border-navy-500' : 'border-signal-amber/30 bg-signal-amber/5'}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <Icon size={11} className={ok ? 'text-ink-muted' : 'text-signal-amber'} />
              <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest truncate">{label}</p>
            </div>
            <p className="text-2xl font-bold text-ink-primary leading-none mb-1">{value}</p>
            <p className={`text-[10px] leading-snug ${ok ? 'text-ink-muted' : 'text-signal-amber'}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Reporting Period ───────────────────────────────────────────────── */}
      <div className="card p-6 space-y-5 border border-accent-blue/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-accent-blue-light" />
            <p className="text-base font-bold text-ink-primary">Reporting Period</p>
            <span className="badge-blue text-[10px]">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            {reportingPeriod.isCurrentCalendarMonth ? (
              <span className="flex items-center gap-1 text-[11px] text-signal-green font-semibold">
                <CheckCircle size={11} /> Showing current month
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-signal-amber font-semibold">
                <AlertTriangle size={11} /> Not current calendar month
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-ink-secondary leading-relaxed">
          All dashboard metrics, charts, rep scorecards, store scorecards, leaderboards, and suggested tasks
          use this reporting month. Changing this instantly updates all pages without requiring a resync.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-navy-700 rounded-xl p-4 border border-navy-500">
            <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1 font-semibold">Active Reporting Month</p>
            <p className="text-lg font-bold text-ink-primary">{reportingPeriod.monthName} {reportingPeriod.year}</p>
            <p className="text-[11px] text-ink-muted mt-1">
              {reportingPeriod.isCurrentCalendarMonth
                ? `Current month · ${reportingPeriod.daysElapsed} of ${reportingPeriod.daysInMonth} days elapsed`
                : `Past month · All ${reportingPeriod.daysInMonth} days included`}
            </p>
          </div>
          <div className="bg-navy-700 rounded-xl p-4 border border-navy-500">
            <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1 font-semibold">MTD Range</p>
            <p className="text-sm font-bold text-ink-primary">
              {reportingPeriod.monthName} 1 – {reportingPeriod.isCurrentCalendarMonth
                ? `${reportingPeriod.monthName} ${new Date().getDate()}`
                : `${reportingPeriod.monthName} ${reportingPeriod.daysInMonth}`}
            </p>
            <p className="text-[11px] text-ink-muted mt-1">
              {reportingPeriod.daysElapsed} days · {reportingPeriod.daysInMonth - reportingPeriod.daysElapsed} remaining
            </p>
          </div>
          <div className={`rounded-xl p-4 border ${
            health.monthRepRecords > 0
              ? 'bg-signal-green/5 border-signal-green/20'
              : 'bg-signal-amber/5 border-signal-amber/20'
          }`}>
            <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1 font-semibold">Data Available</p>
            <p className={`text-sm font-bold ${health.monthRepRecords > 0 ? 'text-signal-green' : 'text-signal-amber'}`}>
              {health.monthRepRecords > 0 ? 'Data found' : 'No data found'}
            </p>
            <p className="text-[11px] text-ink-muted mt-1">
              {health.monthRepRecords} rep records · {health.monthStoreRecords} store records
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-[11px] text-ink-muted block mb-1.5 font-medium uppercase tracking-wide">Month</label>
            <select
              className="input-base w-full text-sm"
              value={rpMonth}
              onChange={e => setRpMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-ink-muted block mb-1.5 font-medium uppercase tracking-wide">Year</label>
            <select
              className="input-base w-full text-sm"
              value={rpYear}
              onChange={e => setRpYear(Number(e.target.value))}
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button
            onClick={applyReportingPeriod}
            className="btn-primary text-xs h-9 flex items-center justify-center gap-1.5"
          >
            <CheckCircle size={12} /> Apply Period
          </button>
          <button
            onClick={resetToCurrentMonth}
            className="btn-secondary text-xs h-9 flex items-center justify-center gap-1.5"
            title={`Reset to ${MONTH_NAMES[CURRENT_MONTH]} ${CURRENT_YEAR}`}
          >
            <RotateCcw size={12} /> Use Current Month
          </button>
        </div>

        {rpMonth !== reportingPeriod.month || rpYear !== reportingPeriod.year ? (
          <p className="text-[11px] text-signal-amber font-medium">
            Unsaved change: {MONTH_NAMES[rpMonth]} {rpYear} — click Apply Period to update all pages.
          </p>
        ) : null}
      </div>

      {/* ── Page Data Health ───────────────────────────────────────────────── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink-primary">Page Data Health</p>
          <span className="text-[11px] text-ink-muted">Reporting: {reportingPeriod.monthName} {reportingPeriod.year}</span>
        </div>
        <div className="space-y-1.5">
          {pageHealth.map(({ name, icon: Icon, status, note }) => (
            <div key={name} className="flex items-center gap-3 py-1.5">
              <Icon size={13} className="text-ink-muted flex-shrink-0" />
              <p className="text-xs font-medium text-ink-primary w-28 flex-shrink-0">{name}</p>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {status === 'ok'
                  ? <span className="flex items-center gap-1 text-[10px] text-signal-green font-semibold"><CheckCircle size={10} /> Data ready</span>
                  : status === 'warn'
                  ? <span className="flex items-center gap-1 text-[10px] text-signal-amber font-semibold"><AlertTriangle size={10} /> Warning</span>
                  : <span className="flex items-center gap-1 text-[10px] text-signal-red font-semibold"><AlertTriangle size={10} /> No data</span>
                }
                {note && <span className="text-[10px] text-ink-muted truncate">— {note}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Sync Actions ─────────────────────────────────────────────── */}
      {(canSync || enabledSourceCount > 0) && (
        <div className="card p-4 flex items-center gap-3 flex-wrap">
          <Zap size={14} className="text-accent-blue-light flex-shrink-0" />
          <p className="text-xs font-semibold text-ink-primary">Quick Sync</p>
          <button
            onClick={handleSync}
            disabled={!canSync || syncing}
            className="btn-secondary text-xs disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync Daily Numbers'}
          </button>
          {enabledSourceCount > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={syncAllState.running || syncing}
              className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={syncAllState.running ? 'animate-spin' : ''} />
              {syncAllState.running
                ? `Syncing ${syncAllState.done}/${syncAllState.total}…`
                : `Sync All Sources (${totalSyncSources})`}
            </button>
          )}
          {syncAllState.finished && (
            <span className={`flex items-center gap-1 text-xs font-semibold ${syncAllState.errors.length === 0 ? 'text-signal-green' : 'text-signal-amber'}`}>
              {syncAllState.errors.length === 0
                ? <><CheckCircle size={11} /> All synced</>
                : <><AlertTriangle size={11} /> {syncAllState.errors.length} failed</>}
            </span>
          )}
        </div>
      )}

      {/* ── District Configuration ─────────────────────────────────────────── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-base font-bold text-ink-primary">District Configuration</p>
          <button
            onClick={saveSettings}
            className={`btn-primary text-xs flex items-center gap-1.5 ${saved ? 'bg-signal-green hover:bg-signal-green' : ''}`}
          >
            {saved ? <><CheckCircle size={13} /> Saved!</> : 'Save Settings'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'districtRank',      label: 'District Rank',             placeholder: 'e.g. 3' },
            { key: 'districtRankOutOf', label: 'Total Districts in Region', placeholder: 'e.g. 14' },
            { key: 'monthlyVisitGoal',  label: 'Monthly Visit Goal',        placeholder: '' },
            { key: 'bpGoal',            label: 'BP% Goal',                  placeholder: '' },
            { key: 'atuGoal',           label: 'ATU% Goal',                 placeholder: '' },
            { key: 'reportCardGoal',    label: 'Report Card Goal (%)',       placeholder: '' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-[11px] text-ink-muted block mb-1.5 uppercase tracking-wide font-medium">{label}</label>
              <input
                className="input-base w-full text-sm"
                type="number"
                placeholder={placeholder}
                value={(form as Record<string, string | number>)[key] as string | number}
                onChange={e => setForm(f => ({
                  ...f,
                  [key]: key === 'districtRank' || key === 'districtRankOutOf'
                    ? e.target.value
                    : Number(e.target.value),
                }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Google Sheets — Data Sources by Page ──────────────────────────── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-ink-secondary" />
          <p className="text-base font-bold text-ink-primary">Google Sheets — Data Sources</p>
          {settings.sheetsConnected
            ? <span className="badge-green text-[10px]">Connected</span>
            : <span className="badge-neutral text-[10px]">Not Connected</span>}
        </div>

        <p className="text-xs text-ink-secondary leading-relaxed">
          Configure what each page pulls from Google Sheets. Expand any page to set the exact
          spreadsheet, tab name, and cell range for each metric. Each source can point to a different
          spreadsheet than the global connection.
        </p>

        {/* ── Global Connection ─────────────────────────────────────────── */}
        <div className="border border-navy-500 rounded-xl p-5 space-y-4 bg-navy-700/30">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-bold text-ink-primary">Global Connection</p>
            <span className="text-[10px] text-ink-muted">Shared by all sources unless overridden per-page</span>
          </div>

          <p className="text-[11px] text-ink-secondary">
            Sheet must be shared as <strong className="text-ink-primary">Anyone with link can view</strong>.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5 uppercase tracking-wide font-medium">Google Sheets URL</label>
              <input
                className="input-base w-full text-sm"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={form.sheetsUrl}
                onChange={e => setForm(f => ({ ...f, sheetsUrl: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5 uppercase tracking-wide font-medium">Spreadsheet ID</label>
              <input
                className="input-base w-full font-mono text-sm"
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                value={form.sheetsSpreadsheetId || extractSpreadsheetId(form.sheetsUrl)}
                onChange={e => setForm(f => ({ ...f, sheetsSpreadsheetId: e.target.value }))}
              />
              <p className="text-[10px] text-ink-muted mt-1">Auto-extracted from URL: /spreadsheets/d/<strong>[ID]</strong>/edit</p>
            </div>
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5 uppercase tracking-wide font-medium">
                Google API Key
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank" rel="noopener noreferrer"
                  className="ml-2 text-accent-blue-light hover:underline inline-flex items-center gap-0.5 normal-case"
                >
                  Get API Key <ExternalLink size={9} />
                </a>
              </label>
              <input
                className="input-base w-full font-mono text-sm"
                type="password"
                placeholder="AIza…"
                value={form.sheetsApiKey}
                onChange={e => setForm(f => ({ ...f, sheetsApiKey: e.target.value }))}
              />
              <p className="text-[10px] text-ink-muted mt-1">
                Enable "Google Sheets API" in Google Cloud Console. Restrict key to Sheets API for security.
              </p>
            </div>
            <button
              onClick={saveSettings}
              className={`btn-secondary text-xs flex items-center gap-1.5 ${saved ? 'text-signal-green' : ''}`}
            >
              {saved ? <><CheckCircle size={12} /> Saved!</> : 'Save Connection'}
            </button>
          </div>

          {/* Sync behavior */}
          <div className="pt-2 border-t border-navy-600 space-y-3">
            <p className="text-xs font-bold text-ink-primary">Sync Behavior</p>
            {([
              {
                key: 'syncAutoCreateReps' as const,
                label: 'Auto-create missing reps from Google Sheets',
                desc: 'If a rep name in column B has no profile, create one automatically.',
              },
              {
                key: 'syncAutoCreateStores' as const,
                label: 'Auto-create missing stores from Google Sheets',
                desc: 'If a store name in column C has no profile, create one automatically.',
              },
              {
                key: 'syncReplaceDemoData' as const,
                label: 'Replace demo data on first sync',
                desc: 'Archive all demo reps/stores on the first successful Google Sheets sync.',
              },
            ] as const).map(({ key, label, desc }) => {
              const isOn = settings[key] !== false;
              return (
                <label key={key} className="flex items-start gap-3 cursor-pointer group">
                  <div className="mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={e => updateSettings({ [key]: e.target.checked })}
                      className="accent-accent-blue-light w-3.5 h-3.5"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink-primary group-hover:text-accent-blue-light transition-colors">{label}</p>
                    <p className="text-[10px] text-ink-muted mt-0.5">{desc}</p>
                  </div>
                  <span className={`ml-auto flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${isOn ? 'bg-signal-green/10 text-signal-green' : 'bg-navy-600 text-ink-muted'}`}>
                    {isOn ? 'ON' : 'OFF'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {settings.lastSyncedAt && (
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock size={11} />
            <span>Last Daily Numbers sync: {new Date(settings.lastSyncedAt).toLocaleString()}</span>
          </div>
        )}

        {/* ── Data Sources by Page ───────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">Data Sources by Page</p>
            <p className="text-[10px] text-ink-muted">Expand a page to configure its spreadsheet, tab, and column ranges</p>
          </div>

          {PAGE_SOURCE_MAP.map(pageEntry => {
            const isOpen = expandedPage === pageEntry.pageName;
            const { configured, total } = getPageConfigStatus(pageEntry);
            const allConfigured = total > 0 && configured === total;
            const noneConfigured = total > 0 && configured === 0;

            return (
              <div key={pageEntry.pageName} className="border border-navy-600 rounded-xl overflow-hidden">
                {/* Page header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-navy-700/50 select-none"
                  onClick={() => setExpandedPage(isOpen ? null : pageEntry.pageName)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <pageEntry.icon size={13} className="text-ink-muted flex-shrink-0" />
                    <p className="text-sm font-semibold text-ink-primary flex-shrink-0">{pageEntry.pageName}</p>
                    {/* Source type chips */}
                    <div className="hidden sm:flex items-center gap-1 flex-wrap min-w-0">
                      {pageEntry.hasDailyNumbers && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent-blue/10 text-accent-blue-light whitespace-nowrap">
                          Daily Numbers
                        </span>
                      )}
                      {pageEntry.sources.map(type => (
                        <span key={type} className="text-[10px] px-1.5 py-0.5 rounded-md bg-navy-600 text-ink-muted whitespace-nowrap">
                          {SOURCE_LABELS[type]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {total > 0 && (
                      <span className={`text-[10px] font-semibold ${
                        allConfigured ? 'text-signal-green'
                        : noneConfigured ? 'text-ink-muted'
                        : 'text-signal-amber'
                      }`}>
                        {allConfigured
                          ? <span className="flex items-center gap-0.5"><CheckCircle size={10} /> Ready</span>
                          : `${configured}/${total} set`}
                      </span>
                    )}
                    {isOpen
                      ? <ChevronDown size={13} className="text-ink-muted" />
                      : <ChevronRight size={13} className="text-ink-muted" />}
                  </div>
                </div>

                {/* Page expanded content */}
                {isOpen && (
                  <div className="px-4 pb-5 pt-3 border-t border-navy-600 space-y-4">
                    <p className="text-xs text-ink-muted">{pageEntry.desc}</p>

                    {/* Daily Numbers — full config or reference card */}
                    {pageEntry.hasDailyNumbers && pageEntry.pageName === 'Daily Numbers' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Database size={13} className="text-accent-blue-light" />
                          <p className="text-xs font-bold text-ink-primary">Daily Numbers</p>
                          <span className="badge-blue text-[10px]">Core source</span>
                          {settings.sheetsConnected && <span className="badge-green text-[10px]">Connected</span>}
                          <span className="text-[10px] text-ink-muted">
                            {dailyPerf.length} rows · {health.monthDailyEntries} in {reportingPeriod.monthName}
                          </span>
                        </div>

                        <p className="text-xs text-ink-muted">
                          Configure which tab and column range corresponds to each metric.
                          Rows are unique by: <strong className="text-ink-secondary">Date + Rep + Store</strong>.
                          Uses the Global Connection spreadsheet and API key above.
                        </p>

                        {/* Mapping table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-ink-muted border-b border-navy-500">
                                <th className="text-left py-2 pr-4 font-semibold w-32">Metric</th>
                                <th className="text-left py-2 pr-3 font-semibold">Tab / Sheet Name</th>
                                <th className="text-left py-2 pr-3 font-semibold">Range / Column</th>
                                <th className="text-left py-2 font-semibold w-20">Required</th>
                              </tr>
                            </thead>
                            <tbody>
                              {METRIC_ROWS.map(({ key, label, required }) => (
                                <tr key={key} className="border-b border-navy-600">
                                  <td className="py-2 pr-4 font-semibold text-ink-primary">{label}</td>
                                  <td className="py-2 pr-3">
                                    <input
                                      className="input-base w-full text-xs"
                                      placeholder="Daily"
                                      value={mapping[key].tab}
                                      onChange={e => updateMappingField(key, 'tab', e.target.value)}
                                    />
                                  </td>
                                  <td className="py-2 pr-3">
                                    <input
                                      className="input-base w-full text-xs font-mono"
                                      placeholder="A2:A"
                                      value={mapping[key].range}
                                      onChange={e => updateMappingField(key, 'range', e.target.value)}
                                    />
                                  </td>
                                  <td className="py-2">
                                    <span className={required ? 'badge-red text-[10px]' : 'badge-neutral text-[10px]'}>
                                      {required ? 'Required' : 'Optional'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <p className="text-[10px] text-ink-muted">
                          If % to Goal is blank, the app calculates it as Attachment ÷ Goal. Rows where Rep = "TOTAL" are always skipped.
                        </p>

                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={() => setMapping(DEFAULT_MAPPING)} className="btn-ghost text-xs flex items-center gap-1">
                            <RotateCcw size={12} /> Reset to Default Mapping
                          </button>
                          <button onClick={saveSettings} className={`btn-secondary text-xs flex items-center gap-1 ${saved ? 'text-signal-green' : ''}`}>
                            {saved ? <><CheckCircle size={12} /> Saved!</> : 'Save Mapping'}
                          </button>
                        </div>

                        {/* Test Mapping */}
                        <div className="border border-navy-500 rounded-xl p-4 space-y-3 bg-navy-700/50">
                          <div className="flex items-center gap-2">
                            <Eye size={13} className="text-accent-blue-light" />
                            <p className="text-xs font-bold text-ink-primary">Test Mapping</p>
                          </div>
                          {(() => {
                            const ri = computeRangeInfo(mapping);
                            return (
                              <p className="text-xs text-ink-muted">
                                Will fetch <code className="font-mono text-ink-secondary">{ri.fetchRange}</code>
                                {ri.endRow !== null
                                  ? <> (rows {ri.startRow}–{ri.endRow})</>
                                  : <> (rows {ri.startRow}–end)</>
                                }
                              </p>
                            );
                          })()}

                          {!canSync && <p className="text-[10px] text-signal-amber">Enter Spreadsheet URL/ID and API Key in the Global Connection above first.</p>}

                          <button
                            onClick={handleTest}
                            disabled={!canSync || testLoading}
                            className="btn-secondary text-xs disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <TestTube2 size={12} />
                            {testLoading ? 'Fetching…' : 'Test Daily Numbers Mapping'}
                          </button>

                          {testError && (
                            <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
                              <AlertTriangle size={13} className="text-signal-red mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-signal-red">{testError}</p>
                            </div>
                          )}

                          {testPreview && testPreview.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs text-signal-green flex items-center gap-1.5">
                                <CheckCircle size={11} /> {testPreview.length} valid rows — mapping looks correct
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="text-ink-muted border-b border-navy-500">
                                      {['Date','Rep','Store','Boxes','Goal','Attachment','% Goal'].map(h => (
                                        <th key={h} className="text-left py-1.5 pr-3 font-semibold">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {testPreview.map((row, i) => (
                                      <tr key={i} className="border-b border-navy-600">
                                        <td className="py-1.5 pr-3 text-ink-secondary">{row.date}</td>
                                        <td className="py-1.5 pr-3 text-ink-primary font-medium">{row.repName}</td>
                                        <td className="py-1.5 pr-3 text-ink-secondary">{row.storeName}</td>
                                        <td className="py-1.5 pr-3 text-right">{row.boxes}</td>
                                        <td className="py-1.5 pr-3 text-right text-ink-muted">{fmtCurrency(row.goal)}</td>
                                        <td className="py-1.5 pr-3 text-right text-ink-primary">{fmtCurrency(row.attachment)}</td>
                                        <td className={`py-1.5 text-right font-bold ${signalPct(row.percentToGoal)}`}>
                                          {row.percentToGoal}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {testPreview && testPreview.length === 0 && (
                            <p className="text-xs text-signal-amber">No valid rows found. Check tab name and sheet sharing settings.</p>
                          )}
                        </div>

                        {/* Sync */}
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center gap-4 flex-wrap">
                            <button
                              onClick={handleSync}
                              disabled={!canSync || syncing}
                              className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                              {syncing ? 'Syncing…' : 'Sync Daily Numbers'}
                            </button>
                            {!canSync && <p className="text-xs text-ink-muted">Configure Global Connection above first</p>}
                          </div>

                          {syncError && (
                            <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
                              <AlertTriangle size={13} className="text-signal-red mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-signal-red">{syncError}</p>
                            </div>
                          )}

                          {syncResult && (
                            <div className="border border-signal-green/20 bg-signal-green/5 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <CheckCircle size={14} className="text-signal-green" />
                                <p className="text-sm font-bold text-ink-primary">Sync Complete</p>
                                <span className="text-[10px] text-ink-muted">
                                  {new Date(syncResult.syncedAt).toLocaleTimeString()}
                                </span>
                              </div>
                              <div className="bg-navy-700 rounded-lg px-3 py-2 text-[11px]">
                                <span className="font-semibold text-ink-secondary">Range: </span>
                                <code className="font-mono text-ink-primary">{computeRangeInfo(mapping).fetchRange}</code>
                                <span className="text-ink-muted"> rows {syncResult.rowRangeStart}–{syncResult.rowRangeEnd ?? 'end'}</span>
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                                {[
                                  { label: 'Found',      value: syncResult.rowsFound,     cls: 'text-ink-primary' },
                                  { label: 'Imported',   value: syncResult.rowsImported,  cls: 'text-signal-green' },
                                  { label: 'Updated',    value: syncResult.rowsUpdated,   cls: 'text-accent-blue-light' },
                                  { label: 'Skipped',    value: syncResult.rowsSkipped,   cls: 'text-ink-muted' },
                                  { label: 'New Reps',   value: syncResult.repsCreated,   cls: syncResult.repsCreated   > 0 ? 'text-signal-green' : 'text-ink-muted' },
                                  { label: 'New Stores', value: syncResult.storesCreated, cls: syncResult.storesCreated > 0 ? 'text-signal-green' : 'text-ink-muted' },
                                ].map(({ label, value, cls }) => (
                                  <div key={label} className="bg-navy-700 rounded-lg p-2 text-center">
                                    <p className="text-ink-muted text-[10px] mb-0.5">{label}</p>
                                    <p className={`text-lg font-bold ${cls}`}>{value}</p>
                                  </div>
                                ))}
                              </div>
                              {syncResult.missingReps.length > 0 && (
                                <div className="bg-signal-amber/10 border border-signal-amber/20 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-signal-amber mb-2">
                                    {syncResult.missingReps.length} Unmatched Rep{syncResult.missingReps.length > 1 ? 's' : ''} — rows skipped
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {syncResult.missingReps.map(name => (
                                      <span key={name} className="badge-neutral text-[10px]">{name}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {syncResult.missingStores.length > 0 && (
                                <div className="bg-signal-amber/10 border border-signal-amber/20 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-signal-amber mb-2">
                                    {syncResult.missingStores.length} Unmatched Store{syncResult.missingStores.length > 1 ? 's' : ''} — rows skipped
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {syncResult.missingStores.map(name => (
                                      <span key={name} className="badge-neutral text-[10px]">{name}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {syncResult.errors.length > 0 && (
                                <div className="bg-signal-red/10 border border-signal-red/20 rounded-lg p-3">
                                  <p className="text-xs font-semibold text-signal-red mb-1">
                                    {syncResult.errors.length} Row Error{syncResult.errors.length > 1 ? 's' : ''}
                                  </p>
                                  <ul className="text-[10px] text-ink-muted space-y-0.5">
                                    {syncResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                                    {syncResult.errors.length > 5 && <li>• …and {syncResult.errors.length - 5} more</li>}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="bg-navy-700 rounded-xl p-3 text-xs text-ink-muted">
                            <span className="font-semibold text-ink-secondary">Duplicate handling: </span>
                            Rows unique by Date + Rep + Store — matching rows are updated, not duplicated.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Daily Numbers reference card (other pages) */}
                    {pageEntry.hasDailyNumbers && pageEntry.pageName !== 'Daily Numbers' && (
                      <div className="flex items-center gap-3 p-3 bg-navy-700 rounded-xl border border-navy-500">
                        <Database size={13} className="text-accent-blue-light flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-ink-primary">Daily Numbers</p>
                          <p className="text-[10px] text-ink-muted mt-0.5">
                            Shared source — {dailyPerf.length} entries · {health.monthDailyEntries} in {reportingPeriod.monthName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {settings.sheetsConnected
                            ? <span className="badge-green text-[10px]">Connected</span>
                            : <span className="badge-neutral text-[10px]">Not configured</span>}
                          <button
                            onClick={() => setExpandedPage('Daily Numbers')}
                            className="text-[10px] text-accent-blue-light hover:underline whitespace-nowrap"
                          >
                            Configure →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Per-source config panels */}
                    {pageEntry.sources.length > 0 && (
                      <div className="space-y-2">
                        {pageEntry.sources.map(sourceType => (
                          <SourceConfigPanel
                            key={sourceType}
                            sourceType={sourceType}
                            globalApiKey={form.sheetsApiKey}
                            globalSpreadsheetId={spreadsheetId}
                          />
                        ))}
                      </div>
                    )}

                    {/* No sources placeholder */}
                    {!pageEntry.hasDailyNumbers && pageEntry.sources.length === 0 && (
                      <p className="text-xs text-ink-muted italic">This page uses manually entered data only — no Google Sheets sync required.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Google OAuth — Calendar & Tasks ────────────────────────────────── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2 flex-wrap">
          <Key size={16} className="text-ink-secondary" />
          <p className="text-base font-bold text-ink-primary">Google Calendar & Tasks</p>
          {calConnected  && <span className="badge-green text-[10px]">Calendar Connected</span>}
          {tasksConnected && <span className="badge-green text-[10px]">Tasks Connected</span>}
          {!calConnected && !tasksConnected && <span className="badge-neutral text-[10px]">Not Connected</span>}
        </div>

        <p className="text-xs text-ink-secondary leading-relaxed">
          Google Calendar and Tasks use OAuth because they access private user data.
          Google Sheets works with a read-only API key, but Calendar and Tasks require your explicit consent.
        </p>

        {/* Setup instructions */}
        <details className="border border-navy-500 rounded-xl overflow-hidden text-xs">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-ink-secondary hover:bg-navy-700/50 flex items-center gap-2 select-none">
            <Info size={12} className="flex-shrink-0" /> Setup Instructions — Google Cloud Console
          </summary>
          <ol className="px-5 py-4 space-y-2 text-ink-secondary list-decimal leading-relaxed">
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-accent-blue-light hover:underline inline-flex items-center gap-0.5">console.cloud.google.com <ExternalLink size={9} /></a></li>
            <li>Enable the <strong className="text-ink-primary">Google Calendar API</strong></li>
            <li>Enable the <strong className="text-ink-primary">Google Tasks API</strong></li>
            <li>Go to <strong className="text-ink-primary">Credentials → Create Credentials → OAuth 2.0 Client ID</strong></li>
            <li>Application type: <strong className="text-ink-primary">Web application</strong></li>
            <li>Under <strong className="text-ink-primary">Authorized JavaScript origins</strong>, add: <code className="font-mono bg-navy-600 px-1 rounded text-ink-primary">http://localhost:5173</code></li>
            <li className="text-ink-muted">No Authorized redirect URIs are needed for this app</li>
            <li>Copy the <strong className="text-ink-primary">Client ID</strong> (ends in <code className="font-mono">.apps.googleusercontent.com</code>) and paste it below</li>
          </ol>
        </details>

        {/* OAuth Client ID field */}
        <div className="border border-navy-500 rounded-xl p-5 space-y-3 bg-navy-700/30">
          <div className="flex items-center gap-2">
            <Key size={13} className="text-accent-blue-light" />
            <p className="text-xs font-bold text-ink-primary">OAuth Client ID</p>
          </div>
          <div>
            <label className="text-[11px] text-ink-muted block mb-1.5 uppercase tracking-wide font-medium">
              Client ID
            </label>
            <input
              className="input-base w-full font-mono text-sm"
              placeholder="123456789-abc.apps.googleusercontent.com"
              value={oauthClientIdField}
              onChange={e => setOauthClientIdField(e.target.value)}
            />
            <p className="text-[10px] text-ink-muted mt-1">
              Authorized JavaScript origin: <code className="font-mono">http://localhost:5173</code> · No redirect URI needed
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={saveOAuthClientId}
              className={`btn-secondary text-xs flex items-center gap-1.5 ${oauthIdSaved ? 'text-signal-green' : ''}`}
            >
              {oauthIdSaved ? <><CheckCircle size={12} /> Saved!</> : <><Key size={12} /> Save Client ID</>}
            </button>
            {!gisReady && settings.googleOAuthClientId && (
              <span className="text-[10px] text-ink-muted flex items-center gap-1">
                <RefreshCw size={10} className="animate-spin" /> Loading Google Identity Services…
              </span>
            )}
          </div>
        </div>

        {/* ── Google Calendar subsection ──────────────────────────────────────── */}
        <div className="border border-navy-500 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar size={14} className="text-ink-secondary" />
            <p className="text-sm font-bold text-ink-primary">Google Calendar</p>
            {calConnected
              ? <><span className="badge-green text-[10px]">Connected</span><Link2 size={11} className="text-signal-green" /></>
              : <span className="badge-neutral text-[10px]">Not Connected</span>
            }
          </div>

          {!settings.googleOAuthClientId ? (
            <p className="text-xs text-signal-amber flex items-center gap-1.5">
              <AlertTriangle size={12} /> Enter and save your OAuth Client ID above first.
            </p>
          ) : calConnected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-navy-700 rounded-xl border border-navy-500">
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1 font-semibold">Events Synced</p>
                  <p className="text-xl font-bold text-ink-primary">
                    {calendarEvents.filter(e => e.source === 'google_calendar').length}
                  </p>
                  <p className="text-[10px] text-ink-muted mt-0.5">Next 30 days</p>
                </div>
                <div className="p-3 bg-navy-700 rounded-xl border border-navy-500">
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1 font-semibold">Last Sync</p>
                  <p className="text-xs font-semibold text-ink-primary">
                    {settings.googleCalendarLastSyncedAt
                      ? new Date(settings.googleCalendarLastSyncedAt).toLocaleString()
                      : 'Never'
                    }
                  </p>
                </div>
              </div>
              {calError && (
                <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
                  <AlertTriangle size={12} className="text-signal-red flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-signal-red">{calError}</p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={syncCalendar}
                  disabled={calSyncing}
                  className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw size={12} className={calSyncing ? 'animate-spin' : ''} />
                  {calSyncing ? 'Syncing…' : 'Sync Calendar'}
                </button>
                <button
                  onClick={disconnectCalendar}
                  className="btn-ghost text-xs text-signal-red hover:text-red-400 flex items-center gap-1.5"
                >
                  <Link2Off size={12} /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-secondary">
                Scope: <code className="font-mono text-[11px] bg-navy-600 px-1 rounded">calendar.readonly</code> — read-only access to your calendar events.
              </p>
              {calError && (
                <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
                  <AlertTriangle size={12} className="text-signal-red flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-signal-red">{calError}</p>
                </div>
              )}
              <button
                onClick={connectCalendar}
                disabled={calConnecting || !gisReady}
                className="btn-secondary text-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Calendar size={12} className={calConnecting ? 'animate-spin' : ''} />
                {calConnecting ? 'Connecting…' : !gisReady ? 'Loading…' : 'Connect Google Calendar'}
              </button>
              {!gisReady && (
                <p className="text-[10px] text-ink-muted">Google Identity Services is loading…</p>
              )}
            </div>
          )}
        </div>

        {/* ── Google Tasks subsection ─────────────────────────────────────────── */}
        <div className="border border-navy-500 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <CheckSquare size={14} className="text-ink-secondary" />
            <p className="text-sm font-bold text-ink-primary">Google Tasks</p>
            {tasksConnected
              ? <><span className="badge-green text-[10px]">Connected</span><Link2 size={11} className="text-signal-green" /></>
              : <span className="badge-neutral text-[10px]">Not Connected</span>
            }
          </div>

          {!settings.googleOAuthClientId ? (
            <p className="text-xs text-signal-amber flex items-center gap-1.5">
              <AlertTriangle size={12} /> Enter and save your OAuth Client ID above first.
            </p>
          ) : tasksConnected ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-navy-700 rounded-xl border border-navy-500">
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1 font-semibold">Tasks Synced</p>
                  <p className="text-xl font-bold text-ink-primary">
                    {googleTasks.filter(t => t.source === 'google_tasks').length}
                  </p>
                  <p className="text-[10px] text-ink-muted mt-0.5">Incomplete tasks</p>
                </div>
                <div className="p-3 bg-navy-700 rounded-xl border border-navy-500">
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1 font-semibold">Last Sync</p>
                  <p className="text-xs font-semibold text-ink-primary">
                    {settings.googleTasksLastSyncedAt
                      ? new Date(settings.googleTasksLastSyncedAt).toLocaleString()
                      : 'Never'
                    }
                  </p>
                </div>
              </div>
              {tasksError && (
                <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
                  <AlertTriangle size={12} className="text-signal-red flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-signal-red">{tasksError}</p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={syncTasks}
                  disabled={tasksSyncing}
                  className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw size={12} className={tasksSyncing ? 'animate-spin' : ''} />
                  {tasksSyncing ? 'Syncing…' : 'Sync Tasks'}
                </button>
                <button
                  onClick={disconnectTasks}
                  className="btn-ghost text-xs text-signal-red hover:text-red-400 flex items-center gap-1.5"
                >
                  <Link2Off size={12} /> Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-secondary">
                Scope: <code className="font-mono text-[11px] bg-navy-600 px-1 rounded">tasks.readonly</code> — read-only access to your Google Task lists.
              </p>
              {tasksError && (
                <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
                  <AlertTriangle size={12} className="text-signal-red flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-signal-red">{tasksError}</p>
                </div>
              )}
              <button
                onClick={connectTasks}
                disabled={tasksConnecting || !gisReady}
                className="btn-secondary text-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckSquare size={12} className={tasksConnecting ? 'animate-spin' : ''} />
                {tasksConnecting ? 'Connecting…' : !gisReady ? 'Loading…' : 'Connect Google Tasks'}
              </button>
              {!gisReady && (
                <p className="text-[10px] text-ink-muted">Google Identity Services is loading…</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Data Management ────────────────────────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-ink-secondary" />
          <p className="text-base font-bold text-ink-primary">Data Management</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 bg-navy-700 rounded-xl border border-navy-500">
            <p className="text-sm font-semibold text-ink-primary mb-1">Export JSON Backup</p>
            <p className="text-xs text-ink-secondary mb-3">Download all app data as JSON for backup and recovery.</p>
            <button
              onClick={() => {
                const data = JSON.parse(localStorage.getItem('dm_dashboard_v1') || '{}');
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `dm_dashboard_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Database size={13} /> Export JSON
            </button>
          </div>

          <div className="p-4 bg-navy-700 rounded-xl border border-navy-500">
            <p className="text-sm font-semibold text-ink-primary mb-1">Clean Duplicate EOD Reports</p>
            <p className="text-xs text-ink-secondary mb-3">
              Removes duplicate EOD entries with the same date, rep, store, and coaching focus. Keeps the newest version.
            </p>
            {eodCleanResult !== null ? (
              <p className="text-xs text-signal-green font-semibold">Removed {eodCleanResult} duplicate{eodCleanResult !== 1 ? 's' : ''}.</p>
            ) : (
              <button
                onClick={() => { const n = cleanDuplicateEODReports(); setEodCleanResult(n); setTimeout(() => setEodCleanResult(null), 4000); }}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                <RotateCcw size={13} /> Clean Duplicate EOD Reports
              </button>
            )}
          </div>

          {(tasks.some(t => t.source === 'seed') || coachingNotes.some(n => n.source === 'seed')) && (
            <div className="p-4 bg-navy-700 rounded-xl border border-signal-amber/20 sm:col-span-2">
              <p className="text-sm font-semibold text-signal-amber mb-1">Clear Demo Seeds</p>
              <p className="text-xs text-ink-secondary mb-3">
                Remove demo seed records without affecting your real data. Only clears items explicitly marked as demo seeds.
              </p>
              <div className="flex flex-wrap gap-2">
                {tasks.some(t => t.source === 'seed') && (
                  <button
                    onClick={clearDemoSeedTasks}
                    className="btn-ghost text-xs text-signal-amber hover:text-amber-300 flex items-center gap-1.5 border border-signal-amber/30"
                  >
                    Clear {tasks.filter(t => t.source === 'seed').length} Demo Task{tasks.filter(t => t.source === 'seed').length !== 1 ? 's' : ''}
                  </button>
                )}
                {coachingNotes.some(n => n.source === 'seed') && (
                  <button
                    onClick={clearDemoSeedCoachingNotes}
                    className="btn-ghost text-xs text-signal-amber hover:text-amber-300 flex items-center gap-1.5 border border-signal-amber/30"
                  >
                    Clear {coachingNotes.filter(n => n.source === 'seed').length} Demo Note{coachingNotes.filter(n => n.source === 'seed').length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="p-4 bg-navy-700 rounded-xl border border-signal-red/20">
            <p className="text-sm font-semibold text-signal-red mb-1">Reset to Seed Data</p>
            <p className="text-xs text-ink-secondary mb-3">
              Restores all data to the original demo state. This cannot be undone.
              All synced data, settings, tasks, coaching notes, and visits will be lost.
            </p>
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="btn-ghost text-xs text-signal-red hover:text-red-400 flex items-center gap-1.5"
              >
                <AlertTriangle size={13} /> Reset to Seed Data
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-signal-red font-semibold">
                  Type <strong>RESET</strong> to confirm. All data will be permanently lost.
                </p>
                <input
                  className="input-base w-full text-sm"
                  placeholder="Type RESET to confirm"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setConfirmReset(false); setConfirmText(''); }}
                    className="btn-secondary text-xs flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doReset}
                    disabled={confirmText !== 'RESET'}
                    className="text-xs px-3 py-1.5 rounded-xl bg-signal-red text-white font-semibold hover:bg-red-600 disabled:opacity-40 transition-colors flex-1"
                  >
                    Confirm Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── App Info ───────────────────────────────────────────────────────── */}
      <div className="card p-5 text-center">
        <p className="text-sm font-bold text-ink-primary mb-1">Hector's DM Dashboard</p>
        <p className="text-xs text-ink-muted">Built for Boost Mobile / Beep Depot District Management · Version 1.0</p>
        <p className="text-xs text-ink-muted mt-1">Data stored locally in browser · No external servers</p>
      </div>
    </div>
  );
}
