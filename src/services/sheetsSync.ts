import type { DailyNumbersMapping } from '../types';

export interface ParsedSheetRow {
  date: string;       // YYYY-MM-DD
  repName: string;
  storeName: string;
  boxes: number;
  goal: number;
  attachment: number;
  percentToGoal: number;
}

export interface SheetParseResult {
  rows: ParsedSheetRow[];
  totalFound: number;
  skippedTotals: number;
  skippedBlanks: number;
  errors: string[];
}

// Metadata about the range that was used for a fetch
export interface RangeInfo {
  tabName: string;
  fetchRange: string;    // e.g. "Daily!A2:G700"
  startRow: number;      // effective start row (max of all configured start rows)
  endRow: number | null; // effective end row = MIN of all configured end rows; null = no limit
}

export interface FetchResult {
  rows: string[][];
  rangeInfo: RangeInfo;
  rowsDiscarded: number; // rows that exceeded the configured limit and were dropped
}

// ─── Range parsing helpers ────────────────────────────────────────────────────

// Extract start and end row numbers from a range like "A2:A700", "A2:G700", "A2:A", "A2:G"
function parseRowBounds(range: string): { startRow: number; endRow: number | null } {
  // Match e.g. "A2:A700" → groups: "2", "700"
  const m = range.trim().match(/[A-Za-z]+(\d+):[A-Za-z]+(\d*)/);
  if (!m) return { startRow: 2, endRow: null };
  return {
    startRow: m[1] ? parseInt(m[1], 10) : 2,
    endRow: m[2] ? parseInt(m[2], 10) : null,
  };
}

// Extract leading column letters from a range: "A2:A700" → "A", "BC2:BC700" → "BC"
function parseStartCol(range: string): string {
  const m = range.trim().match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : 'A';
}

// Extract the column letters after the colon: "A2:G700" → "G", "A2:A" → "A"
function parseEndCol(range: string): string {
  const m = range.trim().match(/:([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : parseStartCol(range);
}

// ─── Range info computation ───────────────────────────────────────────────────

export function computeRangeInfo(mapping: DailyNumbersMapping): RangeInfo {
  const tabName = mapping.date.tab || 'Daily';

  // Collect all field ranges (pctToGoal optional but always present in the type)
  const fieldRanges = [
    mapping.date.range,
    mapping.rep.range,
    mapping.store.range,
    mapping.boxes.range,
    mapping.goal.range,
    mapping.attachment.range,
    mapping.pctToGoal.range,
  ].filter(Boolean);

  const bounds = fieldRanges.map(r => parseRowBounds(r));

  // Effective start row = max of all start rows (they're almost always all the same)
  const startRow = bounds.reduce((acc, b) => Math.max(acc, b.startRow), 2);

  // Effective end row = MINIMUM of all non-null end rows (requirement #6)
  const definedEndRows = bounds.map(b => b.endRow).filter((n): n is number => n !== null);
  const endRow = definedEndRows.length > 0 ? Math.min(...definedEndRows) : null;

  // Column span: start of date range → end of pctToGoal range
  const startCol = parseStartCol(mapping.date.range);
  const endCol = parseEndCol(mapping.pctToGoal.range || mapping.attachment.range);

  const fetchRange = endRow !== null
    ? `${tabName}!${startCol}${startRow}:${endCol}${endRow}`
    : `${tabName}!${startCol}${startRow}:${endCol}`;

  return { tabName, fetchRange, startRow, endRow };
}

// ─── Misc utilities ───────────────────────────────────────────────────────────

export function extractSpreadsheetId(urlOrId: string): string {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : urlOrId.trim();
}

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function normalizeDate(raw: string, fallbackYear: number): string {
  const s = raw.trim();
  if (!s) return '';

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // M/D/YYYY or MM/DD/YYYY
  const slashFull = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashFull) {
    const [, m, d, y] = slashFull;
    return `${y}-${pad2(+m)}-${pad2(+d)}`;
  }

  // MM/DD/YY
  const slashShort2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (slashShort2) {
    const [, m, d, y] = slashShort2;
    return `20${y}-${pad2(+m)}-${pad2(+d)}`;
  }

  // M/D or MM/DD
  const slashNoYear = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashNoYear) {
    const [, m, d] = slashNoYear;
    return `${fallbackYear}-${pad2(+m)}-${pad2(+d)}`;
  }

  // "Wed, Apr 1" / "Apr 1" / "Apr 1, 2026"
  const withoutDow = s.replace(/^[A-Za-z]{2,3},?\s+/, '');
  const named = withoutDow.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/);
  if (named) {
    const [, monthStr, dayStr, yearStr] = named;
    const monthNum = MONTH_ABBR[monthStr.toLowerCase().slice(0, 3)];
    if (monthNum) {
      const year = yearStr ? +yearStr : fallbackYear;
      return `${year}-${pad2(monthNum)}-${pad2(+dayStr)}`;
    }
  }

  return '';
}

function normalizeCurrency(raw: string): number {
  if (!raw?.trim()) return 0;
  const n = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function normalizePercent(raw: string): number {
  const s = raw?.trim() ?? '';
  if (!s) return 0;
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    return isNaN(n) ? 0 : Math.round(n * 10) / 10;
  }
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return n > 1 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 10;
}

function normalizeBoxes(raw: string): number {
  if (!raw?.trim()) return 0;
  const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── Row parser ───────────────────────────────────────────────────────────────

export function parseSheetRows(rawRows: string[][], fallbackYear = new Date().getFullYear()): SheetParseResult {
  const rows: ParsedSheetRow[] = [];
  let skippedTotals = 0;
  let skippedBlanks = 0;
  const errors: string[] = [];

  rawRows.forEach((row, idx) => {
    const dateRaw       = row[0] ?? '';
    const repRaw        = row[1] ?? '';
    const storeRaw      = row[2] ?? '';
    const boxesRaw      = row[3] ?? '';
    const goalRaw       = row[4] ?? '';
    const attachmentRaw = row[5] ?? '';
    const pctRaw        = row[6] ?? '';

    if (!dateRaw.trim() && !repRaw.trim()) { skippedBlanks++; return; }
    if (repRaw.trim().toUpperCase() === 'TOTAL') { skippedTotals++; return; }

    const date = normalizeDate(dateRaw, fallbackYear);
    if (!date) { errors.push(`Row ${idx + 2}: invalid date "${dateRaw}"`); return; }

    const repName = repRaw.trim();
    const storeName = storeRaw.trim();
    if (!repName) { errors.push(`Row ${idx + 2}: missing rep name`); return; }

    const boxes = normalizeBoxes(boxesRaw);
    const goal = normalizeCurrency(goalRaw);
    const attachment = normalizeCurrency(attachmentRaw);
    const percentToGoal = pctRaw.trim()
      ? normalizePercent(pctRaw)
      : goal > 0 ? Math.round((attachment / goal) * 1000) / 10 : 0;

    rows.push({ date, repName, storeName, boxes, goal, attachment, percentToGoal });
  });

  return { rows, totalFound: rawRows.length, skippedTotals, skippedBlanks, errors };
}

// ─── Generic range fetch (used by other sync sources) ────────────────────────

export async function fetchRangeRaw(
  spreadsheetId: string,
  apiKey: string,
  range: string,
): Promise<string[][]> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
    `${encodeURIComponent(range)}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `HTTP ${res.status}: failed to read sheet`);
  }
  const data = await res.json() as { values?: string[][] };
  return data.values ?? [];
}

// ─── API fetch ────────────────────────────────────────────────────────────────

export async function fetchDailyTab(
  spreadsheetId: string,
  apiKey: string,
  mapping: DailyNumbersMapping,
): Promise<FetchResult> {
  const rangeInfo = computeRangeInfo(mapping);

  console.log('[sheetsSync] fetchDailyTab', {
    dateRange:   mapping.date.range,
    repRange:    mapping.rep.range,
    storeRange:  mapping.store.range,
    boxesRange:  mapping.boxes.range,
    goalRange:   mapping.goal.range,
    attRange:    mapping.attachment.range,
    pctRange:    mapping.pctToGoal.range,
    fetchRange:  rangeInfo.fetchRange,
    startRow:    rangeInfo.startRow,
    endRow:      rangeInfo.endRow ?? '(no limit)',
  });

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/` +
    `${encodeURIComponent(rangeInfo.fetchRange)}?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? `HTTP ${res.status}: failed to read sheet`);
  }

  const data = await res.json() as { values?: string[][] };
  let rows = data.values ?? [];
  const fetchedCount = rows.length;

  // Safety enforcement: trim any rows the API may have returned beyond the limit
  let rowsDiscarded = 0;
  if (rangeInfo.endRow !== null) {
    const maxRows = rangeInfo.endRow - rangeInfo.startRow + 1;
    if (rows.length > maxRows) {
      rowsDiscarded = rows.length - maxRows;
      rows = rows.slice(0, maxRows);
      console.warn(
        `[sheetsSync] Discarded ${rowsDiscarded} rows beyond row limit ${rangeInfo.endRow} ` +
        `(fetched ${fetchedCount}, kept ${rows.length})`,
      );
    }
  }

  console.log('[sheetsSync] fetchDailyTab result', {
    rowsFetched:          fetchedCount,
    rowsAfterRangeLimit:  rows.length,
    rowsDiscarded,
  });

  return { rows, rangeInfo, rowsDiscarded };
}
