import { useState } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle, AlertTriangle,
  RefreshCw, TestTube2, Clock, Save, Eye, Plus, Trash2,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { extractSpreadsheetId, fetchRangeRaw } from '../services/sheetsSync';
import {
  fetchAndParseColumnRows, fetchCellValues,
  syncSource, type SourceSyncResult,
  parseWeekRange, parseShiftCell, colToIdx, getCell,
} from '../services/sourceSyncLogic';
import type { GoogleSheetSource, GoogleSheetSourceType, ScheduleStoreBlock } from '../types';

// ─── Source type definitions ──────────────────────────────────────────────────

interface FieldDef {
  key:         string;
  label:       string;
  required:    boolean;
  placeholder: string;
  isCell?:     boolean;
}

interface PreviewCol {
  key:     string;
  label:   string;
  numeric?: boolean;
}

interface SourceTypeDef {
  type:              GoogleSheetSourceType;
  name:              string;
  description:       string;
  defaultTab:        string;
  fields:            FieldDef[];
  hasIdentifierType?: boolean;
  isCellBased?:      boolean;
  isBlockBased?:     boolean;
  previewColumns:    PreviewCol[];
}

const SOURCE_DEFS: SourceTypeDef[] = [
  {
    type:        'report-card',
    name:        'Report Card %',
    description: 'Pull report card percentages for each rep. Updates Rep profiles, leaderboard, and commission calculations.',
    defaultTab:  'Report Card',
    fields: [
      { key: 'rep',        label: 'Rep Name',             required: true,  placeholder: 'A2:A' },
      { key: 'store',      label: 'Store (optional)',      required: false, placeholder: 'B2:B' },
      { key: 'reportCard', label: 'Report Card %',         required: true,  placeholder: 'C2:C' },
      { key: 'month',      label: 'Month/Date (optional)', required: false, placeholder: 'D2:D' },
    ],
    previewColumns: [
      { key: 'rep',        label: 'Rep' },
      { key: 'store',      label: 'Store' },
      { key: 'reportCard', label: 'Report Card %', numeric: true },
      { key: 'month',      label: 'Month' },
    ],
  },
  {
    type:              'bp-atu',
    name:              'BP% / ATU%',
    description:       'Pull BP% and ATU% for reps or stores. Updates Dashboard, Reps page, Rep/Store profiles.',
    defaultTab:        'BP ATU',
    hasIdentifierType: true,
    fields: [
      { key: 'identifier', label: 'Rep or Store Name',     required: true,  placeholder: 'A2:A' },
      { key: 'bp',         label: 'BP%',                   required: true,  placeholder: 'B2:B' },
      { key: 'atu',        label: 'ATU%',                  required: true,  placeholder: 'C2:C' },
      { key: 'month',      label: 'Month/Date (optional)', required: false, placeholder: 'D2:D' },
    ],
    previewColumns: [
      { key: 'identifier', label: 'Identifier' },
      { key: 'bp',         label: 'BP%',  numeric: true },
      { key: 'atu',        label: 'ATU%', numeric: true },
      { key: 'month',      label: 'Month' },
    ],
  },
  {
    type:        'district-rank',
    name:        'District Rank',
    description: 'Pull district rank from individual cells. Updates sidebar rank and Dashboard.',
    defaultTab:  'District',
    isCellBased: true,
    fields: [
      { key: 'rank',      label: 'District Rank',             required: true,  placeholder: 'B2', isCell: true },
      { key: 'total',     label: 'Total Districts (optional)', required: false, placeholder: 'B3', isCell: true },
      { key: 'pctToGoal', label: '% to Goal (optional)',      required: false, placeholder: 'B4', isCell: true },
      { key: 'month',     label: 'Month/Date (optional)',      required: false, placeholder: 'B5', isCell: true },
    ],
    previewColumns: [
      { key: 'rank',      label: 'Rank',            numeric: true },
      { key: 'total',     label: 'Total Districts', numeric: true },
      { key: 'pctToGoal', label: '% to Goal',       numeric: true },
      { key: 'month',     label: 'Month' },
    ],
  },
  {
    type:        'rep-goals',
    name:        'Rep Goals',
    description: 'Pull monthly attachment goals per rep. Updates Rep profiles, leaderboard, and commission calculations.',
    defaultTab:  'Goals',
    fields: [
      { key: 'rep',   label: 'Rep Name',             required: true,  placeholder: 'A2:A' },
      { key: 'goal',  label: 'Goal ($)',              required: true,  placeholder: 'B2:B' },
      { key: 'month', label: 'Month/Date (optional)', required: false, placeholder: 'C2:C' },
    ],
    previewColumns: [
      { key: 'rep',   label: 'Rep' },
      { key: 'goal',  label: 'Goal', numeric: true },
      { key: 'month', label: 'Month' },
    ],
  },
  {
    type:        'store-goals',
    name:        'Store Goals',
    description: 'Pull monthly attachment goals per store. Updates Store profiles, leaderboard, and % to goal calculations.',
    defaultTab:  'Goals',
    fields: [
      { key: 'store', label: 'Store Name',           required: true,  placeholder: 'A2:A' },
      { key: 'goal',  label: 'Monthly Goal ($)',      required: true,  placeholder: 'B2:B' },
      { key: 'month', label: 'Month/Date (optional)', required: false, placeholder: 'C2:C' },
    ],
    previewColumns: [
      { key: 'store', label: 'Store' },
      { key: 'goal',  label: 'Monthly Goal', numeric: true },
      { key: 'month', label: 'Month' },
    ],
  },
  {
    type:        'commission',
    name:        'Commission Data',
    description: 'Pull pre-computed commission data per rep. Updates ATT/hr, Report Card %, BP%, and ATU% on Rep profiles.',
    defaultTab:  'Commission',
    fields: [
      { key: 'rep',       label: 'Rep Name',         required: true,  placeholder: 'A2:A' },
      { key: 'store',     label: 'Store (optional)', required: false, placeholder: 'B2:B' },
      { key: 'attTrend',  label: 'ATT Trend',        required: false, placeholder: 'C2:C' },
      { key: 'pctToGoal', label: '% to Goal',        required: false, placeholder: 'D2:D' },
      { key: 'tierBonus', label: 'Tier Bonus',        required: false, placeholder: 'E2:E' },
      { key: 'boxTrend',  label: 'Box Trend',         required: false, placeholder: 'F2:F' },
      { key: 'attComm',   label: 'ATT Commission',    required: false, placeholder: 'G2:G' },
      { key: 'boxComm',   label: 'Box Commission',    required: false, placeholder: 'H2:H' },
      { key: 'totalEst',  label: 'Total Estimate',    required: false, placeholder: 'I2:I' },
      { key: 'reportCard',label: 'Report Card %',     required: false, placeholder: 'J2:J' },
      { key: 'afterComm', label: 'After Commission',  required: false, placeholder: 'K2:K' },
      { key: 'attHr',     label: 'ATT/hr',            required: false, placeholder: 'L2:L' },
    ],
    previewColumns: [
      { key: 'rep',        label: 'Rep' },
      { key: 'store',      label: 'Store' },
      { key: 'attTrend',   label: 'ATT Trend',   numeric: true },
      { key: 'pctToGoal',  label: '% to Goal',   numeric: true },
      { key: 'reportCard', label: 'RC%',          numeric: true },
      { key: 'totalEst',   label: 'Total Est',    numeric: true },
      { key: 'afterComm',  label: 'After RC',     numeric: true },
      { key: 'attHr',      label: 'ATT/hr',       numeric: true },
    ],
  },
  {
    type:        'eod-forms',
    name:        'EOD Forms',
    description: 'Pull end-of-day form submissions. Creates coaching notes on Rep profiles and populates Today\'s Agenda.',
    defaultTab:  'eod forms',
    fields: [
      { key: 'date',          label: 'Date',                    required: true,  placeholder: 'A2:A' },
      { key: 'rep',           label: 'Rep Name',                required: true,  placeholder: 'B2:B' },
      { key: 'store',         label: 'Store (optional)',         required: false, placeholder: 'C2:C' },
      { key: 'issue',         label: 'Issue (optional)',         required: false, placeholder: 'D2:D' },
      { key: 'coachingFocus', label: 'Coaching Focus',          required: true,  placeholder: 'E2:E' },
      { key: 'actionPlan',    label: 'Action Plan (optional)',   required: false, placeholder: 'F2:F' },
      { key: 'status',        label: 'Status (optional)',        required: false, placeholder: 'G2:G' },
    ],
    previewColumns: [
      { key: 'date',          label: 'Date' },
      { key: 'rep',           label: 'Rep' },
      { key: 'store',         label: 'Store' },
      { key: 'coachingFocus', label: 'Coaching Focus' },
      { key: 'issue',         label: 'Issue' },
      { key: 'actionPlan',    label: 'Action Plan' },
      { key: 'status',        label: 'Status' },
    ],
  },
  {
    type:         'schedule',
    name:         'Schedule',
    description:  'Sync rep schedules from a block-based sheet. Each tab is a week; each store has a block of rows. Configure store blocks below.',
    defaultTab:   'Apr 27th - May 3rd',
    isBlockBased: true,
    fields:       [],
    previewColumns: [],
  },
];

// ─── Schedule block constants ─────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAY_KEYS: [keyof ScheduleStoreBlock, keyof ScheduleStoreBlock][] = [
  ['mondayShiftCol',    'mondayHoursCol'],
  ['tuesdayShiftCol',   'tuesdayHoursCol'],
  ['wednesdayShiftCol', 'wednesdayHoursCol'],
  ['thursdayShiftCol',  'thursdayHoursCol'],
  ['fridayShiftCol',    'fridayHoursCol'],
  ['saturdayShiftCol',  'saturdayHoursCol'],
  ['sundayShiftCol',    'sundayHoursCol'],
];

function emptyBlock(): ScheduleStoreBlock {
  return {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    sourceBlockLabel: '',
    mappedStoreId: '',
    mappedStoreName: '',
    startRow: 2,
    endRow: 10,
    repNameColumn: 'A',
    mondayShiftCol: '', mondayHoursCol: '',
    tuesdayShiftCol: '', tuesdayHoursCol: '',
    wednesdayShiftCol: '', wednesdayHoursCol: '',
    thursdayShiftCol: '', thursdayHoursCol: '',
    fridayShiftCol: '', fridayHoursCol: '',
    saturdayShiftCol: '', saturdayHoursCol: '',
    sundayShiftCol: '', sundayHoursCol: '',
  };
}

// ─── Schedule block editor ────────────────────────────────────────────────────

interface BlockTestRow {
  rep: string;
  day: string;
  date: string;
  shiftRaw: string;
  hours: string;
  status: string;
  borrowedStore: string;
}

interface BlockTestState {
  loading: boolean;
  repNames: string[] | null;
  shiftRows: BlockTestRow[] | null;
  error: string | null;
}

interface BlockEditorProps {
  block: ScheduleStoreBlock;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (b: ScheduleStoreBlock) => void;
  onRemove: () => void;
  testState: BlockTestState | undefined;
  onTest: () => void;
  canTest: boolean;
  activeStores: { id: string; name: string }[];
}

function ScheduleBlockEditor({
  block, index, expanded, onToggle, onChange, onRemove, testState, onTest, canTest, activeStores,
}: BlockEditorProps) {
  const set = (key: keyof ScheduleStoreBlock, value: string | number) =>
    onChange({ ...block, [key]: value });

  const headerLabel = block.sourceBlockLabel
    ? (block.mappedStoreName ? `${block.sourceBlockLabel} → ${block.mappedStoreName}` : block.sourceBlockLabel)
    : `Block ${index + 1}`;

  return (
    <div className="border border-navy-500 rounded-xl overflow-hidden">
      {/* Block header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-navy-700/50 select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={11} className="text-ink-muted" /> : <ChevronRight size={11} className="text-ink-muted" />}
          <span className="text-xs font-semibold text-ink-primary">{headerLabel}</span>
          {block.sourceBlockLabel && (
            <span className="text-[10px] text-ink-muted">rows {block.startRow}–{block.endRow}</span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded hover:bg-signal-red/20 text-ink-muted hover:text-signal-red transition-colors"
          title="Remove block"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-navy-600">
          {/* Source label + store mapping + row range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-ink-muted block mb-1">Source Block Label</label>
              <input
                className="input-base w-full text-xs"
                placeholder="GESSNER 1"
                value={block.sourceBlockLabel}
                onChange={e => set('sourceBlockLabel', e.target.value)}
              />
              <p className="text-[10px] text-ink-muted mt-0.5">Label from the schedule sheet</p>
            </div>
            <div>
              <label className="text-[10px] text-ink-muted block mb-1">Map to App Store</label>
              <select
                className="input-base w-full text-xs"
                value={block.mappedStoreId}
                onChange={e => {
                  const selected = activeStores.find(s => s.id === e.target.value);
                  onChange({
                    ...block,
                    mappedStoreId: e.target.value,
                    mappedStoreName: selected?.name ?? '',
                  });
                }}
              >
                <option value="">— Select store —</option>
                {activeStores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-64">
            <div>
              <label className="text-[10px] text-ink-muted block mb-1">Start Row</label>
              <input
                className="input-base w-full text-xs font-mono"
                type="number"
                min={1}
                value={block.startRow}
                onChange={e => set('startRow', parseInt(e.target.value, 10) || 2)}
              />
            </div>
            <div>
              <label className="text-[10px] text-ink-muted block mb-1">End Row</label>
              <input
                className="input-base w-full text-xs font-mono"
                type="number"
                min={1}
                value={block.endRow}
                onChange={e => set('endRow', parseInt(e.target.value, 10) || 10)}
              />
            </div>
          </div>

          {/* Rep name column */}
          <div className="sm:w-36">
            <label className="text-[10px] text-ink-muted block mb-1">Rep Name Column</label>
            <input
              className="input-base w-full text-xs font-mono uppercase"
              placeholder="A"
              value={block.repNameColumn}
              onChange={e => set('repNameColumn', e.target.value.toUpperCase())}
            />
          </div>

          {/* Day columns */}
          <div>
            <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide mb-2">
              Day Columns — Shift &amp; Hours
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {DAYS.map((day, i) => {
                const [shiftKey, hoursKey] = DAY_KEYS[i];
                return (
                  <div key={day} className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-[11px] text-ink-secondary font-medium">{day}</span>
                    <div>
                      <input
                        className="input-base w-full text-xs font-mono uppercase"
                        placeholder="B"
                        value={block[shiftKey] as string}
                        onChange={e => set(shiftKey, e.target.value.toUpperCase())}
                        title="Shift column"
                      />
                    </div>
                    <div>
                      <input
                        className="input-base w-full text-xs font-mono uppercase"
                        placeholder="C (hrs)"
                        value={block[hoursKey] as string}
                        onChange={e => set(hoursKey, e.target.value.toUpperCase())}
                        title="Hours column"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test block button */}
          <div className="flex items-center gap-2">
            <button
              onClick={onTest}
              disabled={!canTest || testState?.loading}
              className="btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TestTube2 size={11} />
              {testState?.loading ? 'Testing…' : 'Test This Block'}
            </button>
          </div>

          {testState?.error && (
            <div className="flex items-start gap-2 p-2 bg-signal-red/10 border border-signal-red/20 rounded-lg">
              <AlertTriangle size={11} className="text-signal-red mt-0.5 shrink-0" />
              <p className="text-[11px] text-signal-red">{testState.error}</p>
            </div>
          )}

          {testState?.repNames && testState.repNames.length > 0 && !testState.shiftRows && (
            <div className="space-y-1">
              <p className="text-[10px] text-signal-green flex items-center gap-1">
                <Eye size={10} /> {testState.repNames.length} rep row{testState.repNames.length !== 1 ? 's' : ''} found
              </p>
              <div className="bg-navy-700 rounded-lg p-2 space-y-0.5 max-h-32 overflow-y-auto">
                {testState.repNames.map((name, i) => (
                  <p key={i} className="text-[11px] text-ink-secondary">• {name}</p>
                ))}
              </div>
            </div>
          )}

          {testState?.shiftRows && testState.shiftRows.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-signal-green flex items-center gap-1">
                <Eye size={10} /> {testState.shiftRows.length} shift row{testState.shiftRows.length !== 1 ? 's' : ''} parsed
              </p>
              <div className="bg-navy-700 rounded-lg overflow-auto max-h-48">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-navy-600 text-ink-muted">
                      <th className="px-2 py-1 text-left font-medium">Rep</th>
                      <th className="px-2 py-1 text-left font-medium">Day</th>
                      <th className="px-2 py-1 text-left font-medium">Date</th>
                      <th className="px-2 py-1 text-left font-medium">Shift</th>
                      <th className="px-2 py-1 text-left font-medium">Hrs</th>
                      <th className="px-2 py-1 text-left font-medium">Status</th>
                      <th className="px-2 py-1 text-left font-medium">Borrowed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testState.shiftRows.map((r, i) => (
                      <tr key={i} className="border-b border-navy-600/50 hover:bg-navy-600/30">
                        <td className="px-2 py-0.5 text-ink-secondary">{r.rep}</td>
                        <td className="px-2 py-0.5 text-ink-muted">{r.day}</td>
                        <td className="px-2 py-0.5 text-ink-muted font-mono">{r.date}</td>
                        <td className="px-2 py-0.5 text-ink-muted font-mono">{r.shiftRaw || '—'}</td>
                        <td className="px-2 py-0.5 text-ink-muted">{r.hours || '—'}</td>
                        <td className="px-2 py-0.5">
                          <span className={
                            r.status === 'scheduled' ? 'text-signal-green' :
                            r.status === 'off'       ? 'text-ink-muted' :
                            r.status === 'borrowed'  ? 'text-signal-amber' :
                            r.status === 'event'     ? 'text-signal-blue' : 'text-ink-muted'
                          }>{r.status}</span>
                        </td>
                        <td className="px-2 py-0.5 text-ink-muted">{r.borrowedStore || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localGenId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Migrate blocks saved in the old format (had storeName: string, lacked mappedStoreId).
function migrateBlocks(
  raw: unknown[],
  activeStores: { id: string; name: string }[],
): ScheduleStoreBlock[] {
  return raw.map(b => {
    const block = b as ScheduleStoreBlock & { storeName?: string };
    if (block.mappedStoreId !== undefined && block.mappedStoreId !== null) return block as ScheduleStoreBlock;
    const legacyName = (block.storeName ?? '') as string;
    const match = activeStores.find(s => s.name.toLowerCase().trim() === legacyName.toLowerCase().trim());
    return {
      ...block,
      sourceBlockLabel: block.sourceBlockLabel ?? legacyName,
      mappedStoreId: match?.id ?? '',
      mappedStoreName: match?.name ?? legacyName,
    } as ScheduleStoreBlock;
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  sourceType:          GoogleSheetSourceType;
  globalApiKey:        string;
  globalSpreadsheetId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SourceConfigPanel({ sourceType, globalApiKey, globalSpreadsheetId }: Props) {
  const def = SOURCE_DEFS.find(d => d.type === sourceType)!;

  const {
    settings, updateSettings,
    reps, stores, monthlyRepPerf, monthlyStorePerf, coachingNotes,
    patchMonthlyRepPerf, patchMonthlyStorePerf, addCoachingNote, replaceWeekShifts,
  } = useData();

  const savedSource = settings.googleSheetSources?.find(s => s.type === sourceType);

  const [expanded, setExpanded] = useState(false);
  const [saved,    setSaved]    = useState(false);

  const [form, setForm] = useState(() => ({
    spreadsheetUrl:  savedSource?.spreadsheetUrl  ?? '',
    spreadsheetId:   savedSource?.spreadsheetId   ?? '',
    apiKeyOverride:  savedSource?.apiKeyOverride   ?? '',
    tabName:         savedSource?.tabName          ?? def.defaultTab,
    enabled:         savedSource?.enabled          ?? true,
    mapping:         savedSource?.mapping          ?? {} as Record<string, string>,
    identifierType: (savedSource?.mapping?.['_identifierType'] ?? 'rep') as 'rep' | 'store',
  }));

  // Schedule block state (only used when isBlockBased)
  const activeStoreList = stores.filter(s => s.active).map(s => ({ id: s.id, name: s.name }));
  const [blocks, setBlocks] = useState<ScheduleStoreBlock[]>(() =>
    migrateBlocks(savedSource?.scheduleBlocks ?? [], activeStoreList),
  );
  const [blockExpanded, setBlockExpanded] = useState<Record<string, boolean>>({});
  const [blockTestStates, setBlockTestStates] = useState<Record<string, BlockTestState>>({});

  const effectiveSpreadsheetId = extractSpreadsheetId(form.spreadsheetUrl) || form.spreadsheetId || globalSpreadsheetId;
  const effectiveApiKey        = form.apiKeyOverride || globalApiKey;
  const canTest = Boolean(effectiveSpreadsheetId && effectiveApiKey && form.tabName);

  const updateField = (key: string, value: string) =>
    setForm(f => ({ ...f, mapping: { ...f.mapping, [key]: value } }));

  const buildFullMapping = (): Record<string, string> =>
    def.hasIdentifierType
      ? { ...form.mapping, _identifierType: form.identifierType }
      : form.mapping;

  const saveConfig = () => {
    const sources = settings.googleSheetSources ?? [];
    const idx     = sources.findIndex(s => s.type === sourceType);
    const updated: GoogleSheetSource = {
      id:             savedSource?.id ?? localGenId(),
      name:           def.name,
      type:           sourceType,
      enabled:        form.enabled,
      spreadsheetUrl: form.spreadsheetUrl,
      spreadsheetId:  extractSpreadsheetId(form.spreadsheetUrl) || form.spreadsheetId,
      apiKeyOverride: form.apiKeyOverride || undefined,
      tabName:        form.tabName,
      mapping:        buildFullMapping(),
      scheduleBlocks: def.isBlockBased ? blocks : undefined,
      lastSyncedAt:   savedSource?.lastSyncedAt,
      lastSyncStatus: savedSource?.lastSyncStatus ?? 'never',
      lastSyncSummary: savedSource?.lastSyncSummary,
    };
    const newSources = idx >= 0
      ? sources.map((s, i) => i === idx ? updated : s)
      : [...sources, updated];
    updateSettings({ googleSheetSources: newSources });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── Block management ──────────────────────────────────────────────────────
  const addBlock = () => {
    const b = emptyBlock();
    setBlocks(prev => [...prev, b]);
    setBlockExpanded(prev => ({ ...prev, [b.id]: true }));
  };

  const updateBlock = (idx: number, b: ScheduleStoreBlock) =>
    setBlocks(prev => prev.map((x, i) => i === idx ? b : x));

  const removeBlock = (idx: number) =>
    setBlocks(prev => prev.filter((_, i) => i !== idx));

  const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const testBlock = async (block: ScheduleStoreBlock) => {
    if (!canTest || !block.repNameColumn) return;

    setBlockTestStates(prev => ({ ...prev, [block.id]: { loading: true, repNames: null, shiftRows: null, error: null } }));
    try {
      // Build bounding column range
      const allCols = [
        block.repNameColumn,
        ...DAY_KEYS.flatMap(([sc, hc]) => [block[sc] as string, block[hc] as string]),
      ].filter(Boolean);

      const colIndices = allCols.map(c => colToIdx(c));
      const minColIdx = Math.min(...colIndices);
      const maxColIdx = Math.max(...colIndices);

      const minCol = String.fromCharCode(65 + minColIdx); // single-letter shortcut — fine for A-Z
      const maxCol = (() => {
        let s = '', n = maxColIdx + 1;
        while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26); }
        return s;
      })();

      const fetchRange = `${form.tabName}!${minCol}${block.startRow}:${maxCol}${block.endRow}`;
      const grid = await fetchRangeRaw(effectiveSpreadsheetId, effectiveApiKey, fetchRange);

      const skipWords = ['hours of operation', 'hours', 'total hours', 'weekly hours'];

      // Parse week dates from tab name for date column
      const weekRange = parseWeekRange(form.tabName);
      const weekDates: string[] = weekRange
        ? Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekRange.weekStart + 'T00:00:00');
            d.setDate(d.getDate() + i);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          })
        : Array.from({ length: 7 }, () => '');

      const repNames: string[] = [];
      const shiftRows: BlockTestRow[] = [];

      for (const row of grid) {
        const repName = getCell(row, block.repNameColumn, minColIdx).trim();
        if (!repName || skipWords.includes(repName.toLowerCase())) continue;
        repNames.push(repName);

        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          const [shiftKey, hoursKey] = DAY_KEYS[dayIdx];
          const shiftCol = block[shiftKey] as string;
          const hoursCol = block[hoursKey] as string;
          if (!shiftCol) continue;

          const shiftRaw = getCell(row, shiftCol, minColIdx);
          const hoursRaw = hoursCol ? getCell(row, hoursCol, minColIdx) : '';
          const parsed = parseShiftCell(shiftRaw);
          if (!parsed) continue;

          shiftRows.push({
            rep: repName,
            day: DAY_LABELS_SHORT[dayIdx],
            date: weekDates[dayIdx],
            shiftRaw: shiftRaw.trim(),
            hours: hoursRaw.trim(),
            status: parsed.type,
            borrowedStore: parsed.borrowedStoreName ?? '',
          });
        }
      }

      if (shiftRows.length > 0) {
        setBlockTestStates(prev => ({ ...prev, [block.id]: { loading: false, repNames, shiftRows, error: null } }));
      } else {
        setBlockTestStates(prev => ({ ...prev, [block.id]: { loading: false, repNames, shiftRows: null, error: null } }));
      }
    } catch (e) {
      setBlockTestStates(prev => ({
        ...prev,
        [block.id]: { loading: false, repNames: null, shiftRows: null, error: e instanceof Error ? e.message : 'Test failed' },
      }));
    }
  };

  // ── Test state ────────────────────────────────────────────────────────────
  const [testState, setTestState] = useState<{
    loading: boolean;
    rows:    Record<string, string>[] | null;
    error:   string | null;
  }>({ loading: false, rows: null, error: null });

  // ── Sync state ────────────────────────────────────────────────────────────
  const [syncState, setSyncState] = useState<{
    loading: boolean;
    result:  SourceSyncResult | null;
    error:   string | null;
  }>({ loading: false, result: null, error: null });

  const handleTest = async () => {
    if (!canTest || def.isBlockBased) return;
    setTestState({ loading: true, rows: null, error: null });
    try {
      const mapping = buildFullMapping();
      let rows: Record<string, string>[];
      if (def.isCellBased) {
        const vals = await fetchCellValues(effectiveSpreadsheetId, effectiveApiKey, form.tabName, mapping);
        rows = [vals];
      } else {
        rows = await fetchAndParseColumnRows(effectiveSpreadsheetId, effectiveApiKey, form.tabName, mapping, 10);
      }
      setTestState({ loading: false, rows: rows.slice(0, 10), error: null });
    } catch (e) {
      setTestState({ loading: false, rows: null, error: e instanceof Error ? e.message : 'Test failed' });
    }
  };

  const handleSync = async () => {
    if (!canTest) return;
    setSyncState({ loading: true, result: null, error: null });
    try {
      const source: GoogleSheetSource = {
        id:             savedSource?.id ?? localGenId(),
        name:           def.name,
        type:           sourceType,
        enabled:        form.enabled,
        spreadsheetUrl: form.spreadsheetUrl,
        spreadsheetId:  effectiveSpreadsheetId,
        apiKeyOverride: form.apiKeyOverride || undefined,
        tabName:        form.tabName,
        mapping:        buildFullMapping(),
        scheduleBlocks: def.isBlockBased ? blocks : undefined,
      };

      const ctx = {
        reps, stores, monthlyRepPerf, monthlyStorePerf, coachingNotes,
        settings, patchMonthlyRepPerf, patchMonthlyStorePerf,
        updateSettings, addCoachingNote, replaceWeekShifts,
      };

      const result = await syncSource(source, effectiveApiKey, ctx);

      const sources    = settings.googleSheetSources ?? [];
      const idx        = sources.findIndex(s => s.type === sourceType);
      const synced: GoogleSheetSource = {
        ...source,
        lastSyncedAt:   result.syncedAt,
        lastSyncStatus: 'success',
        scheduleBlocks: def.isBlockBased ? blocks : undefined,
      };
      const newSources = idx >= 0 ? sources.map((s, i) => i === idx ? synced : s) : [...sources, synced];
      updateSettings({ googleSheetSources: newSources });

      setSyncState({ loading: false, result, error: null });
    } catch (e) {
      setSyncState({ loading: false, result: null, error: e instanceof Error ? e.message : 'Sync failed' });
    }
  };

  // ── Status badge ──────────────────────────────────────────────────────────
  const status       = savedSource?.lastSyncStatus ?? (savedSource ? 'never' : null);
  const isConfigured = Boolean(savedSource?.spreadsheetId || savedSource?.spreadsheetUrl || globalSpreadsheetId);

  return (
    <div className="border border-navy-600 rounded-xl overflow-hidden">
      {/* Collapsed header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-navy-700/50"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-ink-secondary">{def.name}</p>
          {form.enabled
            ? <span className="badge-green text-[10px]">Enabled</span>
            : <span className="badge-neutral text-[10px]">Disabled</span>}
          {def.isBlockBased && blocks.length > 0 && (
            <span className="text-[10px] text-ink-muted">{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'success' && savedSource?.lastSyncedAt && (
            <span className="text-[10px] text-signal-green flex items-center gap-1">
              <CheckCircle size={9} /> {new Date(savedSource.lastSyncedAt).toLocaleDateString()}
            </span>
          )}
          {status === 'error' && (
            <span className="text-[10px] text-signal-red">Error</span>
          )}
          {(!status || status === 'never') && (
            <span className="badge-neutral text-[10px]">
              {isConfigured ? 'Not synced' : 'Not configured'}
            </span>
          )}
          {expanded
            ? <ChevronDown  size={12} className="text-ink-muted" />
            : <ChevronRight size={12} className="text-ink-muted" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-5 pt-2 space-y-4 border-t border-navy-600">
          <p className="text-xs text-ink-muted">{def.description}</p>

          {/* Enable toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
              className="accent-accent-blue-light w-3.5 h-3.5"
            />
            <span className="text-xs text-ink-secondary">Enable this sync source</span>
          </label>

          {/* Spreadsheet override */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink-primary">
              Spreadsheet Connection
              <span className="ml-1.5 font-normal text-ink-muted">(leave blank to use global connection)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-muted block mb-1">Spreadsheet URL (optional override)</label>
                <input
                  className="input-base w-full text-xs"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={form.spreadsheetUrl}
                  onChange={e => setForm(f => ({ ...f, spreadsheetUrl: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted block mb-1">API Key Override (optional)</label>
                <input
                  className="input-base w-full text-xs font-mono"
                  type="password"
                  placeholder="Uses global key if blank"
                  value={form.apiKeyOverride}
                  onChange={e => setForm(f => ({ ...f, apiKeyOverride: e.target.value }))}
                />
              </div>
            </div>
            {effectiveSpreadsheetId && (
              <p className="text-[10px] text-ink-muted">
                Using sheet: <span className="font-mono text-ink-secondary">{effectiveSpreadsheetId.slice(0, 24)}…</span>
              </p>
            )}
          </div>

          {/* Tab name */}
          <div>
            <label className="text-xs text-ink-muted block mb-1">
              {def.isBlockBased ? 'Week Tab Name (e.g. "Apr 27th - May 3rd")' : 'Tab / Sheet Name'}
            </label>
            <input
              className="input-base text-xs sm:w-72"
              placeholder={def.defaultTab}
              value={form.tabName}
              onChange={e => setForm(f => ({ ...f, tabName: e.target.value }))}
            />
            {def.isBlockBased && (
              <p className="text-[10px] text-ink-muted mt-1">
                Must match the tab name exactly. Dates are extracted to calculate actual shift dates.
              </p>
            )}
          </div>

          {/* Identifier type (BP%/ATU% only) */}
          {def.hasIdentifierType && (
            <div>
              <label className="text-xs text-ink-muted block mb-1">Identifier Type</label>
              <select
                className="input-base text-xs sm:w-40"
                value={form.identifierType}
                onChange={e => setForm(f => ({ ...f, identifierType: e.target.value as 'rep' | 'store' }))}
              >
                <option value="rep">Rep</option>
                <option value="store">Store</option>
              </select>
            </div>
          )}

          {/* Generic field mapping table (non-schedule sources) */}
          {!def.isBlockBased && def.fields.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-muted border-b border-navy-500">
                    <th className="text-left py-2 pr-4 font-semibold w-44">Field</th>
                    <th className="text-left py-2 pr-3 font-semibold">{def.isCellBased ? 'Cell (e.g. B2)' : 'Range (e.g. A2:A)'}</th>
                    <th className="text-left py-2 font-semibold w-20">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {def.fields.map(field => (
                    <tr key={field.key} className="border-b border-navy-600">
                      <td className="py-2 pr-4 font-semibold text-ink-primary">{field.label}</td>
                      <td className="py-2 pr-3">
                        <input
                          className="input-base w-full text-xs font-mono"
                          placeholder={field.placeholder}
                          value={form.mapping[field.key] ?? ''}
                          onChange={e => updateField(field.key, e.target.value)}
                        />
                      </td>
                      <td className="py-2">
                        <span className={field.required ? 'badge-red text-[10px]' : 'badge-neutral text-[10px]'}>
                          {field.required ? 'Required' : 'Optional'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Schedule block manager ── */}
          {def.isBlockBased && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-ink-primary">Store Blocks</p>
                  <p className="text-[10px] text-ink-muted mt-0.5">
                    Each block maps one store's rows. Configure columns for rep names and each day's shift + hours.
                  </p>
                </div>
                <button onClick={addBlock} className="btn-secondary text-xs flex items-center gap-1.5 shrink-0">
                  <Plus size={12} /> Add Store Block
                </button>
              </div>

              {blocks.length === 0 ? (
                <div className="px-4 py-6 text-center border border-dashed border-navy-500 rounded-xl">
                  <p className="text-xs text-ink-muted">No store blocks yet.</p>
                  <p className="text-[10px] text-ink-muted mt-1">Click "Add Store Block" to configure your first store.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block, idx) => (
                    <ScheduleBlockEditor
                      key={block.id}
                      block={block}
                      index={idx}
                      expanded={blockExpanded[block.id] ?? false}
                      onToggle={() => setBlockExpanded(prev => ({ ...prev, [block.id]: !prev[block.id] }))}
                      onChange={b => updateBlock(idx, b)}
                      onRemove={() => removeBlock(idx)}
                      testState={blockTestStates[block.id]}
                      onTest={() => testBlock(block)}
                      canTest={canTest}
                      activeStores={stores.filter(s => s.active).map(s => ({ id: s.id, name: s.name }))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              onClick={saveConfig}
              className={`btn-secondary text-xs ${saved ? 'text-signal-green' : ''}`}
            >
              {saved
                ? <><CheckCircle size={12} /> Saved!</>
                : <><Save size={12} /> Save Configuration</>}
            </button>
            {!def.isBlockBased && (
              <button
                onClick={handleTest}
                disabled={!canTest || testState.loading}
                className="btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <TestTube2 size={12} />
                {testState.loading ? 'Testing…' : 'Test Mapping'}
              </button>
            )}
            <button
              onClick={handleSync}
              disabled={!canTest || syncState.loading}
              className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={syncState.loading ? 'animate-spin' : ''} />
              {syncState.loading ? 'Syncing…' : 'Sync This Source'}
            </button>
          </div>

          {!canTest && (
            <p className="text-[10px] text-signal-amber">
              {!effectiveSpreadsheetId
                ? 'Enter a Spreadsheet URL above or configure the global connection'
                : 'Enter an API Key above or configure the global API key'}
            </p>
          )}

          {/* Test error */}
          {testState.error && (
            <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
              <AlertTriangle size={13} className="text-signal-red mt-0.5 shrink-0" />
              <p className="text-xs text-signal-red">{testState.error}</p>
            </div>
          )}

          {/* Test preview */}
          {testState.rows && testState.rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-signal-green flex items-center gap-1.5">
                <Eye size={11} />
                {def.isCellBased
                  ? 'Cell values fetched successfully'
                  : `${testState.rows.length} row${testState.rows.length !== 1 ? 's' : ''} found — mapping looks correct`}
              </p>
              {def.isCellBased ? (
                <div className="bg-navy-700 rounded-xl p-3 space-y-1.5">
                  {def.previewColumns.map(col => (
                    <div key={col.key} className="flex items-center justify-between text-xs">
                      <span className="text-ink-muted font-medium">{col.label}</span>
                      <span className="text-ink-primary font-bold font-mono">
                        {testState.rows![0][col.key] || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-ink-muted border-b border-navy-500">
                        {def.previewColumns.map(col => (
                          <th key={col.key} className={`py-1.5 pr-3 font-semibold ${col.numeric ? 'text-right' : 'text-left'}`}>
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {testState.rows.map((row, i) => (
                        <tr key={i} className="border-b border-navy-600">
                          {def.previewColumns.map(col => (
                            <td key={col.key} className={`py-1.5 pr-3 text-ink-secondary ${col.numeric ? 'text-right font-mono' : ''}`}>
                              {row[col.key] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {testState.rows && testState.rows.length === 0 && !testState.error && (
            <p className="text-xs text-signal-amber">No rows found. Check tab name and range configuration.</p>
          )}

          {/* Sync error */}
          {syncState.error && (
            <div className="flex items-start gap-2 p-3 bg-signal-red/10 border border-signal-red/20 rounded-xl">
              <AlertTriangle size={13} className="text-signal-red mt-0.5 shrink-0" />
              <p className="text-xs text-signal-red">{syncState.error}</p>
            </div>
          )}

          {/* Sync result */}
          {syncState.result && (() => {
            const res = syncState.result;
            const noShifts = def.isBlockBased && res.rowsImported === 0;
            const weekLabel = res.weekStart && res.weekEnd
              ? (() => {
                  const fmt = (d: string) => {
                    const [, m, day] = d.split('-');
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return `${months[parseInt(m)-1]} ${parseInt(day)}`;
                  };
                  return `${fmt(res.weekStart)} – ${fmt(res.weekEnd)}`;
                })()
              : null;
            return (
              <div className={`border rounded-xl p-4 space-y-3 ${noShifts ? 'border-signal-amber/30 bg-signal-amber/5' : 'border-signal-green/20 bg-signal-green/5'}`}>
                <div className="flex items-center gap-2">
                  {noShifts
                    ? <AlertTriangle size={14} className="text-signal-amber" />
                    : <CheckCircle size={14} className="text-signal-green" />}
                  <p className="text-sm font-bold text-ink-primary">Sync {noShifts ? 'Complete — No Shifts Imported' : 'Complete'}</p>
                  <span className="text-[10px] text-ink-muted">
                    {new Date(res.syncedAt).toLocaleTimeString()}
                  </span>
                </div>
                {weekLabel && (
                  <p className="text-xs text-ink-secondary">
                    Week synced: <span className="font-semibold text-ink-primary">{weekLabel}</span>
                    {res.weekStart && ` (${res.weekStart})`}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { label: def.isBlockBased ? 'Blocks' : 'Processed', value: res.rowsProcessed, cls: 'text-ink-primary'  },
                    { label: 'Shifts',  value: res.rowsImported, cls: noShifts ? 'text-signal-amber' : 'text-signal-green' },
                    { label: 'Skipped', value: res.rowsSkipped,  cls: 'text-ink-muted'    },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="bg-navy-700 rounded-lg p-2 text-center">
                      <p className="text-ink-muted text-[10px] mb-0.5">{label}</p>
                      <p className={`text-lg font-bold ${cls}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {noShifts && (
                  <div className="bg-signal-amber/10 border border-signal-amber/20 rounded-lg p-3 text-[11px] text-signal-amber space-y-1">
                    <p className="font-semibold">No shifts were written. Common causes:</p>
                    <ul className="space-y-0.5 list-disc list-inside text-ink-muted">
                      <li>A block's "Map to App Store" dropdown is empty — open the block and select the store, then re-sync.</li>
                      <li>Rep names in the sheet don't match names in the app (check Warnings below).</li>
                      <li>Day shift columns (Mon–Sun) are not configured in a block.</li>
                    </ul>
                  </div>
                )}
                {res.errors.length > 0 && (
                  <div className="bg-signal-amber/10 border border-signal-amber/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-signal-amber mb-1">
                      {res.errors.length} Warning{res.errors.length !== 1 ? 's' : ''}
                    </p>
                    <ul className="text-[10px] text-ink-muted space-y-0.5">
                      {res.errors.slice(0, 8).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {res.errors.length > 8 && (
                        <li>• …and {res.errors.length - 8} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Last sync footer */}
          {savedSource?.lastSyncedAt && (
            <div className="flex items-center gap-1.5 text-[10px] text-ink-muted pt-1">
              <Clock size={10} />
              <span>Last synced: {new Date(savedSource.lastSyncedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
