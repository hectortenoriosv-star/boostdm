import type {
  Rep, Store, MonthlyRepPerformance, MonthlyStorePerformance,
  CoachingNote, DistrictSettings, GoogleSheetSource,
  ScheduleShift, ScheduleStoreBlock,
} from '../types';
import { fetchRangeRaw } from './sheetsSync';

// ─── Column utilities ─────────────────────────────────────────────────────────

export function colToIdx(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function idxToCol(idx: number): string {
  let s = '', n = idx + 1;
  while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function colFromRange(r: string): string {
  const m = r.trim().match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : 'A';
}

function startRowFromRange(r: string): number {
  const m = r.trim().match(/[A-Za-z]+(\d+)/);
  return m ? parseInt(m[1], 10) : 2;
}

function endRowFromRange(r: string): number | null {
  const m = r.trim().match(/:[A-Za-z]+(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Bounding range for column-range fields ───────────────────────────────────

function computeBoundingRange(
  tabName: string,
  mapping: Record<string, string>,
  previewLimit?: number,
): string {
  const ranges = Object.entries(mapping)
    .filter(([k, v]) => !k.startsWith('_') && v)
    .map(([, v]) => v);

  if (ranges.length === 0) return `${tabName}!A2:Z${previewLimit ? 2 + previewLimit - 1 : ''}`;

  const colIndices = ranges.map(r => colToIdx(colFromRange(r)));
  const startRows  = ranges.map(r => startRowFromRange(r));
  const endRows    = ranges.map(r => endRowFromRange(r)).filter((n): n is number => n !== null);

  const minColIdx = Math.min(...colIndices);
  const maxColIdx = Math.max(...colIndices);
  const startRow  = Math.max(...startRows);
  let endRow = endRows.length > 0 ? Math.min(...endRows) : null;

  if (previewLimit !== undefined) {
    const cap = startRow + previewLimit - 1;
    endRow = endRow !== null ? Math.min(endRow, cap) : cap;
  }

  const startCol = idxToCol(minColIdx);
  const endCol   = idxToCol(maxColIdx);

  return endRow !== null
    ? `${tabName}!${startCol}${startRow}:${endCol}${endRow}`
    : `${tabName}!${startCol}${startRow}:${endCol}`;
}

// ─── Fetch and parse column-range rows ───────────────────────────────────────

export async function fetchAndParseColumnRows(
  spreadsheetId: string,
  apiKey: string,
  tabName: string,
  mapping: Record<string, string>,
  previewLimit?: number,
): Promise<Record<string, string>[]> {
  const ranges = Object.entries(mapping)
    .filter(([k, v]) => !k.startsWith('_') && v)
    .map(([, v]) => v);

  if (ranges.length === 0) throw new Error('No ranges configured');

  const fetchRange = computeBoundingRange(tabName, mapping, previewLimit);
  const rawRows    = await fetchRangeRaw(spreadsheetId, apiKey, fetchRange);

  const colIndices = ranges.map(r => colToIdx(colFromRange(r)));
  const baseColIdx = Math.min(...colIndices);

  return rawRows
    .filter(row => row.some(cell => cell?.trim()))
    .map(row => {
      const result: Record<string, string> = {};
      for (const [key, range] of Object.entries(mapping)) {
        if (key.startsWith('_') || !range) continue;
        const idx = colToIdx(colFromRange(range)) - baseColIdx;
        result[key] = idx >= 0 && idx < row.length ? (row[idx] ?? '') : '';
      }
      return result;
    });
}

// ─── Fetch individual cell values ─────────────────────────────────────────────

function parseCellRef(ref: string): { col: string; row: number } | null {
  const m = ref.trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  return { col: m[1].toUpperCase(), row: parseInt(m[2], 10) };
}

export async function fetchCellValues(
  spreadsheetId: string,
  apiKey: string,
  tabName: string,
  cellMapping: Record<string, string>,
): Promise<Record<string, string>> {
  const cells = Object.entries(cellMapping)
    .filter(([k, v]) => !k.startsWith('_') && v)
    .map(([key, val]) => ({ key, ref: parseCellRef(val) }))
    .filter((x): x is { key: string; ref: NonNullable<ReturnType<typeof parseCellRef>> } => x.ref !== null);

  if (cells.length === 0) return {};

  const colIndices = cells.map(c => colToIdx(c.ref.col));
  const rows       = cells.map(c => c.ref.row);
  const minColIdx  = Math.min(...colIndices);
  const maxColIdx  = Math.max(...colIndices);
  const minRow     = Math.min(...rows);
  const maxRow     = Math.max(...rows);

  const range = `${tabName}!${idxToCol(minColIdx)}${minRow}:${idxToCol(maxColIdx)}${maxRow}`;
  const grid  = await fetchRangeRaw(spreadsheetId, apiKey, range);

  const result: Record<string, string> = {};
  for (const { key, ref } of cells) {
    const rowIdx = ref.row - minRow;
    const colIdx = colToIdx(ref.col) - minColIdx;
    result[key]  = (rowIdx >= 0 && colIdx >= 0 && rowIdx < grid.length) ? (grid[rowIdx][colIdx] ?? '') : '';
  }
  return result;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

export function parsePercent(raw: string): number {
  const s = raw?.trim() ?? '';
  if (!s) return 0;
  if (s.endsWith('%')) return Math.round(parseFloat(s) * 10) / 10;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n > 1 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 10;
}

export function parseCurrency(raw: string): number {
  if (!raw?.trim()) return 0;
  const n = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

const MONTH_MAP: Record<string, number> = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
};

export function parseMonthYear(
  raw: string,
  fallbackMonth: number,
  fallbackYear: number,
): { month: number; year: number } {
  if (!raw?.trim()) return { month: fallbackMonth, year: fallbackYear };

  let m = raw.match(/(\d{4})-(\d{2})/);
  if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) };

  m = raw.match(/(\d{2})\/(\d{4})/);
  if (m) return { month: parseInt(m[1]), year: parseInt(m[2]) };

  const mo = raw.toLowerCase().match(/([a-z]{3})/);
  if (mo) {
    const month = MONTH_MAP[mo[1]];
    const yr    = raw.match(/(\d{4})/);
    if (month) return { month, year: yr ? parseInt(yr[1]) : fallbackYear };
  }

  return { month: fallbackMonth, year: fallbackYear };
}

function normalizeDate(raw: string, fallbackYear: number): string {
  const s = raw?.trim() ?? '';
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`;
  const slashShort = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashShort) return `${fallbackYear}-${slashShort[1].padStart(2,'0')}-${slashShort[2].padStart(2,'0')}`;
  const named = s.replace(/^[A-Za-z]{2,3},?\s+/, '').match(/^([A-Za-z]{3})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (named) {
    const month = MONTH_MAP[named[1].toLowerCase()];
    if (month) return `${named[3] || fallbackYear}-${String(month).padStart(2,'0')}-${named[2].padStart(2,'0')}`;
  }
  return s;
}

// ─── Sync result ──────────────────────────────────────────────────────────────

export interface SourceSyncResult {
  rowsProcessed: number;
  rowsImported:  number;
  rowsSkipped:   number;
  errors:        string[];
  syncedAt:      string;
  weekStart?:    string;  // YYYY-MM-DD of Monday; set for schedule syncs
  weekEnd?:      string;  // YYYY-MM-DD of Sunday; set for schedule syncs
}

// ─── Sync context (subset of DataContextValue) ────────────────────────────────

export type SyncCtx = {
  reps:                Rep[];
  stores:              Store[];
  monthlyRepPerf:      MonthlyRepPerformance[];
  monthlyStorePerf:    MonthlyStorePerformance[];
  coachingNotes:       CoachingNote[];
  settings:            DistrictSettings;
  patchMonthlyRepPerf: (repId: string, month: number, year: number, patch: Partial<MonthlyRepPerformance>) => void;
  patchMonthlyStorePerf: (storeId: string, month: number, year: number, patch: Partial<MonthlyStorePerformance>) => void;
  updateSettings:      (patch: Partial<DistrictSettings>) => void;
  addCoachingNote:     (n: Omit<CoachingNote, 'id' | 'createdAt'>) => void;
  replaceWeekShifts:   (weekStart: string, shifts: Omit<ScheduleShift, 'id' | 'createdAt'>[]) => void;
};

// ─── Report Card % ────────────────────────────────────────────────────────────

async function syncReportCard(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const { reps, settings, patchMonthlyRepPerf } = ctx;
  const fallbackMonth = settings.currentMonth ?? (new Date().getMonth() + 1);
  const fallbackYear  = settings.currentYear  ?? new Date().getFullYear();

  const rows = await fetchAndParseColumnRows(source.spreadsheetId, apiKey, source.tabName, source.mapping);

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const repName = row['rep']?.trim();
    if (!repName) { skipped++; continue; }

    const rep = reps.find(r => r.name.toLowerCase().trim() === repName.toLowerCase());
    if (!rep) { errors.push(`Rep not found: ${repName}`); skipped++; continue; }

    const { month, year } = parseMonthYear(row['month'] ?? '', fallbackMonth, fallbackYear);
    patchMonthlyRepPerf(rep.id, month, year, { reportCardPct: parsePercent(row['reportCard'] ?? '') });
    imported++;
  }

  return { rowsProcessed: rows.length, rowsImported: imported, rowsSkipped: skipped, errors, syncedAt: new Date().toISOString() };
}

// ─── BP% / ATU% ───────────────────────────────────────────────────────────────

async function syncBpAtu(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const { reps, stores, settings, patchMonthlyRepPerf, patchMonthlyStorePerf } = ctx;
  const fallbackMonth    = settings.currentMonth ?? (new Date().getMonth() + 1);
  const fallbackYear     = settings.currentYear  ?? new Date().getFullYear();
  const identifierType   = (source.mapping['_identifierType'] ?? 'rep') as 'rep' | 'store';

  const rows = await fetchAndParseColumnRows(source.spreadsheetId, apiKey, source.tabName, source.mapping);

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const name = row['identifier']?.trim();
    if (!name) { skipped++; continue; }

    const { month, year } = parseMonthYear(row['month'] ?? '', fallbackMonth, fallbackYear);
    const bpPct  = parsePercent(row['bp']  ?? '');
    const atuPct = parsePercent(row['atu'] ?? '');

    if (identifierType === 'rep') {
      const rep = reps.find(r => r.name.toLowerCase().trim() === name.toLowerCase());
      if (!rep) { errors.push(`Rep not found: ${name}`); skipped++; continue; }
      patchMonthlyRepPerf(rep.id, month, year, { bpPct, atuPct });
    } else {
      const store = stores.find(s => s.name.toLowerCase().trim() === name.toLowerCase());
      if (!store) { errors.push(`Store not found: ${name}`); skipped++; continue; }
      patchMonthlyStorePerf(store.id, month, year, { bpPct, atuPct });
    }
    imported++;
  }

  return { rowsProcessed: rows.length, rowsImported: imported, rowsSkipped: skipped, errors, syncedAt: new Date().toISOString() };
}

// ─── District Rank ────────────────────────────────────────────────────────────

async function syncDistrictRank(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const values = await fetchCellValues(source.spreadsheetId, apiKey, source.tabName, source.mapping);

  const rank  = values['rank']  ? parseInt(values['rank'],  10) : undefined;
  const total = values['total'] ? parseInt(values['total'], 10) : undefined;

  ctx.updateSettings({ districtRank: rank, districtRankOutOf: total });

  return { rowsProcessed: 1, rowsImported: 1, rowsSkipped: 0, errors: [], syncedAt: new Date().toISOString() };
}

// ─── Rep Goals ────────────────────────────────────────────────────────────────

async function syncRepGoals(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const { reps, settings, patchMonthlyRepPerf } = ctx;
  const fallbackMonth = settings.currentMonth ?? (new Date().getMonth() + 1);
  const fallbackYear  = settings.currentYear  ?? new Date().getFullYear();

  const rows = await fetchAndParseColumnRows(source.spreadsheetId, apiKey, source.tabName, source.mapping);

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const repName = row['rep']?.trim();
    if (!repName) { skipped++; continue; }

    const rep = reps.find(r => r.name.toLowerCase().trim() === repName.toLowerCase());
    if (!rep) { errors.push(`Rep not found: ${repName}`); skipped++; continue; }

    const { month, year } = parseMonthYear(row['month'] ?? '', fallbackMonth, fallbackYear);
    patchMonthlyRepPerf(rep.id, month, year, { attachmentGoal: parseCurrency(row['goal'] ?? '') });
    imported++;
  }

  return { rowsProcessed: rows.length, rowsImported: imported, rowsSkipped: skipped, errors, syncedAt: new Date().toISOString() };
}

// ─── Store Goals ──────────────────────────────────────────────────────────────

async function syncStoreGoals(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const { stores, settings, patchMonthlyStorePerf } = ctx;
  const fallbackMonth = settings.currentMonth ?? (new Date().getMonth() + 1);
  const fallbackYear  = settings.currentYear  ?? new Date().getFullYear();

  const rows = await fetchAndParseColumnRows(source.spreadsheetId, apiKey, source.tabName, source.mapping);

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const storeName = row['store']?.trim();
    if (!storeName) { skipped++; continue; }

    const store = stores.find(s => s.name.toLowerCase().trim() === storeName.toLowerCase());
    if (!store) { errors.push(`Store not found: ${storeName}`); skipped++; continue; }

    const { month, year } = parseMonthYear(row['month'] ?? '', fallbackMonth, fallbackYear);
    patchMonthlyStorePerf(store.id, month, year, { attachmentGoal: parseCurrency(row['goal'] ?? '') });
    imported++;
  }

  return { rowsProcessed: rows.length, rowsImported: imported, rowsSkipped: skipped, errors, syncedAt: new Date().toISOString() };
}

// ─── Commission Data ──────────────────────────────────────────────────────────

async function syncCommission(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const { reps, settings, patchMonthlyRepPerf } = ctx;
  const fallbackMonth = settings.currentMonth ?? (new Date().getMonth() + 1);
  const fallbackYear  = settings.currentYear  ?? new Date().getFullYear();

  const rows = await fetchAndParseColumnRows(source.spreadsheetId, apiKey, source.tabName, source.mapping);

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const repName = row['rep']?.trim();
    if (!repName) { skipped++; continue; }

    const rep = reps.find(r => r.name.toLowerCase().trim() === repName.toLowerCase());
    if (!rep) { errors.push(`Rep not found: ${repName}`); skipped++; continue; }

    const { month, year } = parseMonthYear(row['month'] ?? '', fallbackMonth, fallbackYear);

    const patch: Partial<MonthlyRepPerformance> = {};
    if (row['reportCard']) patch.reportCardPct       = parsePercent(row['reportCard']);
    if (row['attHr'])      patch.attHr               = parseCurrency(row['attHr']);
    if (row['bp'])         patch.bpPct               = parsePercent(row['bp']);
    if (row['atu'])        patch.atuPct              = parsePercent(row['atu']);
    if (row['attTrend'])   patch.syncedAttTrend      = parseCurrency(row['attTrend']);
    if (row['pctToGoal'])  patch.syncedPctToGoal     = parsePercent(row['pctToGoal']);
    if (row['tierBonus'])  patch.syncedTierBonus     = parsePercent(row['tierBonus']);
    if (row['boxTrend'])   patch.syncedBoxTrend      = parseCurrency(row['boxTrend']);
    if (row['attComm'])    patch.syncedAttCommission = parseCurrency(row['attComm']);
    if (row['boxComm'])    patch.syncedBoxCommission = parseCurrency(row['boxComm']);
    if (row['totalEst'])   patch.syncedTotalEstimate = parseCurrency(row['totalEst']);
    if (row['afterComm'])  patch.syncedAfterCommission = parseCurrency(row['afterComm']);

    patchMonthlyRepPerf(rep.id, month, year, patch);
    imported++;
  }

  return { rowsProcessed: rows.length, rowsImported: imported, rowsSkipped: skipped, errors, syncedAt: new Date().toISOString() };
}

// ─── EOD Forms ────────────────────────────────────────────────────────────────

async function syncEodForms(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const { reps, settings, addCoachingNote } = ctx;
  const fallbackYear = settings.currentYear ?? new Date().getFullYear();

  const rows = await fetchAndParseColumnRows(source.spreadsheetId, apiKey, source.tabName, source.mapping);

  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const repName = row['rep']?.trim();
    const rawDate = row['date']?.trim();
    if (!repName || !rawDate) { skipped++; continue; }

    const rep = reps.find(r => r.name.toLowerCase().trim() === repName.toLowerCase());
    if (!rep) { errors.push(`Rep not found: ${repName}`); skipped++; continue; }

    const date = normalizeDate(rawDate, fallbackYear) || rawDate;
    const noteParts = [
      row['coachingFocus'] ? `Coaching Focus: ${row['coachingFocus']}` : '',
      row['issue']         ? `Issue: ${row['issue']}` : '',
      row['actionPlan']    ? `Action Plan: ${row['actionPlan']}` : '',
    ].filter(Boolean);

    addCoachingNote({
      repId:     rep.id,
      date,
      type:      'coaching',
      notes:     noteParts.join('\n') || 'EOD form submitted',
      behaviors: [],
      followUp:  row['actionPlan'] || undefined,
      status:    row['status']?.toLowerCase() === 'closed' ? 'closed' : 'open',
    });
    imported++;
  }

  return { rowsProcessed: rows.length, rowsImported: imported, rowsSkipped: skipped, errors, syncedAt: new Date().toISOString() };
}

// ─── Schedule Sync ────────────────────────────────────────────────────────────

const SCHEDULE_MONTHS: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
};

export function parseWeekRange(tabName: string): { weekStart: string } | null {
  const m = tabName.match(
    /([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)?/i,
  );
  if (!m) return null;
  const month = SCHEDULE_MONTHS[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  if (!month) return null;
  const year = new Date().getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { weekStart: `${year}-${pad(month)}-${pad(day)}` };
}

export type ParsedShift = {
  type: 'scheduled' | 'off' | 'borrowed' | 'event';
  startTime: string;
  endTime: string;
  borrowedStoreName?: string;
  eventNote?: string;
};

export function parseShiftCell(raw: string): ParsedShift | null {
  const s = raw?.trim() ?? '';
  if (!s || s === '—') return null;

  const upper = s.toUpperCase();
  if (upper === 'OFF') return { type: 'off', startTime: '', endTime: '' };

  if (upper.includes('DM VISIT') || upper.includes('DM VISI')) {
    return { type: 'event', startTime: '', endTime: '', eventNote: s };
  }

  // Time range: "8:30-8:00", "8:30 - 20:00", "8:30-20:00"
  const timeMatch = s.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (timeMatch) {
    return { type: 'scheduled', startTime: timeMatch[1], endTime: timeMatch[2] };
  }

  // Anything else is treated as a borrowed-store assignment
  return { type: 'borrowed', startTime: '', endTime: '', borrowedStoreName: s };
}

export function parseShiftHours(raw: string): number {
  const s = raw?.trim() ?? '';
  if (!s || s === '—' || s === '-') return 0;
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

export function getCell(row: string[], colLetter: string, baseColIdx: number): string {
  if (!colLetter) return '';
  const idx = colToIdx(colLetter) - baseColIdx;
  return idx >= 0 && idx < row.length ? (row[idx] ?? '') : '';
}

const BLOCK_DAY_KEYS: [keyof ScheduleStoreBlock, keyof ScheduleStoreBlock][] = [
  ['mondayShiftCol', 'mondayHoursCol'],
  ['tuesdayShiftCol', 'tuesdayHoursCol'],
  ['wednesdayShiftCol', 'wednesdayHoursCol'],
  ['thursdayShiftCol', 'thursdayHoursCol'],
  ['fridayShiftCol', 'fridayHoursCol'],
  ['saturdayShiftCol', 'saturdayHoursCol'],
  ['sundayShiftCol', 'sundayHoursCol'],
];

// Normalize a name for comparison: lowercase, strip punctuation, collapse spaces.
function normName(s: string): string {
  return s.toLowerCase().replace(/[,.\-']/g, ' ').replace(/\s+/g, ' ').trim();
}

// Fuzzy rep lookup: exact normalized → token-subset match (all tokens of the shorter name
// appear in the longer name). Returns the first match or undefined.
function findRepFuzzy(reps: Rep[], raw: string): Rep | undefined {
  const rawNorm = normName(raw);
  const exact = reps.find(r => normName(r.name) === rawNorm);
  if (exact) return exact;
  const rawToks = rawNorm.split(' ').filter(Boolean);
  return reps.find(r => {
    const appToks = normName(r.name).split(' ').filter(Boolean);
    const shorter = rawToks.length <= appToks.length ? rawToks : appToks;
    const longer  = rawToks.length <= appToks.length ? appToks  : rawToks;
    return shorter.length > 0 && shorter.every(t => longer.includes(t));
  });
}

async function syncSchedule(source: GoogleSheetSource, apiKey: string, ctx: SyncCtx): Promise<SourceSyncResult> {
  const { reps, stores, replaceWeekShifts } = ctx;
  const blocks = source.scheduleBlocks ?? [];

  if (blocks.length === 0) {
    throw new Error('No store blocks configured. Add at least one store block before syncing.');
  }

  const weekRange = parseWeekRange(source.tabName);
  if (!weekRange) {
    throw new Error(
      `Cannot parse week dates from tab name "${source.tabName}". ` +
      `Expected format: "Apr 20th - Apr 26th"`,
    );
  }

  const { weekStart } = weekRange;
  const weekDates: string[] = [];
  const cursor = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    weekDates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const allShifts: Omit<ScheduleShift, 'id' | 'createdAt'>[] = [];

  for (const block of blocks) {
    if (!block.mappedStoreId) {
      errors.push(`Block "${block.sourceBlockLabel || '(unnamed)'}" is not mapped to an app store.`);
      skipped++;
      continue;
    }
    const store = stores.find(s => s.id === block.mappedStoreId);
    if (!store) {
      errors.push(`Mapped store not found for block "${block.sourceBlockLabel}"`);
      skipped++;
      continue;
    }

    // Build bounding range covering all columns in this block
    const allColLetters = [
      block.repNameColumn,
      ...BLOCK_DAY_KEYS.flatMap(([sc, hc]) => [block[sc] as string, block[hc] as string]),
    ].filter(Boolean);

    const colIndices = allColLetters.map(c => colToIdx(c));
    const minColIdx = Math.min(...colIndices);
    const maxColIdx = Math.max(...colIndices);
    const fetchRange = `${source.tabName}!${idxToCol(minColIdx)}${block.startRow}:${idxToCol(maxColIdx)}${block.endRow}`;

    let grid: string[][];
    try {
      const { fetchRangeRaw } = await import('./sheetsSync');
      grid = await fetchRangeRaw(source.spreadsheetId, apiKey, fetchRange);
    } catch (e) {
      errors.push(`Block "${block.sourceBlockLabel}": ${e instanceof Error ? e.message : 'fetch failed'}`);
      continue;
    }

    for (const row of grid) {
      const repName = getCell(row, block.repNameColumn, minColIdx).trim();
      if (!repName) continue;

      // Skip structural rows
      const lower = repName.toLowerCase();
      if (
        lower.includes('hours of operation') ||
        lower === 'hours' ||
        lower === 'total hours' ||
        lower === 'weekly hours'
      ) continue;

      // Try exact match first, then fuzzy token-subset match.
      // Never drop the row — shifts are stored with repName even when no app rep matches.
      const activeReps = reps.filter(r => r.active);
      const rep =
        activeReps.find(r => r.name.toLowerCase().trim() === lower) ??
        findRepFuzzy(activeReps, repName);

      if (!rep) {
        errors.push(`No app rep matched "${repName}" (block: ${block.sourceBlockLabel}) — shifts stored by name only`);
      }

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const [shiftKey, hoursKey] = BLOCK_DAY_KEYS[dayIdx];
        const shiftCol = block[shiftKey] as string;
        const hoursCol = block[hoursKey] as string;
        if (!shiftCol) continue;

        const shiftRaw = getCell(row, shiftCol, minColIdx);
        const hoursRaw = hoursCol ? getCell(row, hoursCol, minColIdx) : '';
        const parsed = parseShiftCell(shiftRaw);
        if (!parsed) continue;

        allShifts.push({
          date: weekDates[dayIdx],
          storeId: store.id,
          repId: rep?.id ?? '',
          repName,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          hours: parseShiftHours(hoursRaw),
          role: 'mid',
          status: parsed.type,
          borrowedStoreName: parsed.borrowedStoreName,
          eventNote: parsed.eventNote,
          notes: '',
        });
        imported++;
      }
    }
  }

  replaceWeekShifts(weekStart, allShifts);

  const weekEndDate = new Date(weekStart + 'T00:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, '0')}-${String(weekEndDate.getDate()).padStart(2, '0')}`;

  return {
    rowsProcessed: blocks.length,
    rowsImported: imported,
    rowsSkipped: skipped,
    errors,
    syncedAt: new Date().toISOString(),
    weekStart,
    weekEnd,
  };
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function syncSource(
  source: GoogleSheetSource,
  globalApiKey: string,
  ctx: SyncCtx,
): Promise<SourceSyncResult> {
  const apiKey = source.apiKeyOverride || globalApiKey;
  if (!source.spreadsheetId) throw new Error('No spreadsheet ID configured for this source');
  if (!apiKey)               throw new Error('No API key configured');
  if (!source.tabName)       throw new Error('No tab name configured');

  switch (source.type) {
    case 'report-card':   return syncReportCard(source,   apiKey, ctx);
    case 'bp-atu':        return syncBpAtu(source,        apiKey, ctx);
    case 'district-rank': return syncDistrictRank(source, apiKey, ctx);
    case 'rep-goals':     return syncRepGoals(source,     apiKey, ctx);
    case 'store-goals':   return syncStoreGoals(source,   apiKey, ctx);
    case 'commission':    return syncCommission(source,   apiKey, ctx);
    case 'eod-forms':     return syncEodForms(source,     apiKey, ctx);
    case 'schedule':      return syncSchedule(source,     apiKey, ctx);
    default:              throw new Error(`Unknown source type: ${source.type}`);
  }
}
