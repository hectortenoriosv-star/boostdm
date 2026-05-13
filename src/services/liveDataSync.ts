// ─── Live Data Sync Service ───────────────────────────────────────────────────
// Pulls directly from Hector's Google Sheets using the Sheets API v4.
// No Settings UI required — spreadsheet IDs and tab/column mappings are hardcoded.
// Called once on app load (and on manual refresh) to replace seed/demo data.

import type {
  Store, Rep, MonthlyRepPerformance, MonthlyStorePerformance, DailyPerformance,
} from '../types';

// ─── Hardcoded Source Config ──────────────────────────────────────────────────

const TEAM_DASHBOARD_ID  = '1jxmDvcil1L5IKYNL98dQ4M82qYdRwrlxGHa-OdbO7LQ';
const MTD_NUMBERS_ID     = '1REA2SfdTT6g1goiX-rbz9gZzkSjCZB3Iby7ebQ4xSvU';

// Google Sheets API key (read-only, public data) — set via env or injected at build time
// For Vercel: add VITE_SHEETS_API_KEY to environment variables
const API_KEY = import.meta.env.VITE_SHEETS_API_KEY ?? '';

// ─── Hector's District Stores (fixed — matches memory) ───────────────────────

export const HECTOR_STORES: Store[] = [
  { id: 'hs1',  name: 'Fiesta',       address: '8650 S Braeswood Blvd',   city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 5776, bpGoal: 75, atuGoal: 65, active: true, notes: 'Fiesta store — primary coaching target May 2026.', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs2',  name: 'S Gessner 3802', address: '3802 S Gessner Rd Ste 600', city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 3218, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs3',  name: 'S Gessner 6837', address: '6837 S Gessner Rd',         city: 'Houston', state: 'TX', phone: '', hours: { open: '09:00', close: '21:00' }, monthlyAttachmentGoal: 8252, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs4',  name: 'Gulfton',       address: '6120 Gulfton St',           city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 7509, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs5',  name: 'Hillcroft',     address: '6700 Hillcroft St',         city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 11363, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs6',  name: 'Sanford',       address: '7600 Sanford Rd',           city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 8664, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs7',  name: 'Fondren',       address: '11266 Fondren Rd',          city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 3300, bpGoal: 75, atuGoal: 65, active: true, notes: 'Grand Opening May 8.', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs8',  name: 'El Campo',      address: '306 N Mechanic St',         city: 'El Campo', state: 'TX', phone: '', hours: { open: '09:00', close: '21:00' }, monthlyAttachmentGoal: 8252, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs9',  name: 'Bellaire',      address: '5800 Bellaire Blvd',        city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 4951, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'hs10', name: 'Chimney Rock',  address: '5732 Chimney Rock Rd',      city: 'Houston', state: 'TX', phone: '', hours: { open: '10:00', close: '20:00' }, monthlyAttachmentGoal: 4951, bpGoal: 75, atuGoal: 65, active: true, notes: '', eventNotes: [], createdAt: '2026-01-01T00:00:00Z' },
];

// Address → store id lookup
const STORE_ADDR_MAP: Record<string, string> = {
  '8650 s braeswood blvd': 'hs1',
  '9904 s gessner rd': 'hs1', // legacy alias → Fiesta
  '3802 s gessner rd ste 600': 'hs2',
  '6837 s gessner rd': 'hs3',
  '6120 gulfton st': 'hs4',
  '6700 hillcroft st': 'hs5',
  '7600 sanford rd': 'hs6',
  '11266 fondren rd': 'hs7',
  '306 n mechanic st': 'hs8',
  '5800 bellaire blvd': 'hs9',
  '5732 chimney rock rd': 'hs10',
};

function storeIdByAddress(addr: string): string {
  return STORE_ADDR_MAP[addr.toLowerCase().trim()] ?? '';
}

function storeIdByName(name: string): string {
  const n = name.toLowerCase().trim();
  const entry = Object.entries(STORE_ADDR_MAP).find(([addr]) => {
    const s = HECTOR_STORES.find(st => st.address.toLowerCase() === addr);
    return s && s.name.toLowerCase().includes(n);
  });
  return entry ? entry[1] : '';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchRange(sheetId: string, range: string): Promise<string[][]> {
  if (!API_KEY) {
    console.warn('[liveSync] No API key — skipping sheet fetch');
    return [];
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('[liveSync] Sheets API error', res.status, await res.text());
    return [];
  }
  const data = await res.json() as { values?: string[][] };
  return data.values ?? [];
}

function parseMoney(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function parsePct(s: string): number {
  if (!s) return 0;
  const clean = s.trim().replace('%', '');
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  return n > 1 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 10;
}

function parseNum(s: string): number {
  if (!s) return 0;
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Rep Name Normalization ───────────────────────────────────────────────────
// Sheet format: "Last, First" → normalize to "First Last"

function normalizeName(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  const comma = s.indexOf(',');
  if (comma > -1) {
    const last = s.slice(0, comma).trim();
    const first = s.slice(comma + 1).trim();
    return `${first} ${last}`;
  }
  return s;
}

// ─── Sync Functions ───────────────────────────────────────────────────────────

// 1. Rep list from MTD Numbers > Rep Level (rows 2-16 = Team Hector)
export async function syncReps(): Promise<Rep[]> {
  const rows = await fetchRange(MTD_NUMBERS_ID, 'Rep Level!A2:K17');
  const reps: Rep[] = [];
  let idCounter = 1;

  for (const row of rows) {
    const dm = (row[0] ?? '').trim();
    const nameRaw = (row[1] ?? '').trim();
    if (!nameRaw || dm.toUpperCase().includes('TOTAL')) continue;
    if (!dm.toLowerCase().includes('tenorio')) continue; // only Hector's team

    const name = normalizeName(nameRaw);
    reps.push({
      id: `live_rep_${idCounter++}`,
      name,
      defaultStoreId: '',
      active: true,
      phone: '',
      hireDate: '2025-01-01T00:00:00Z',
      notes: '',
      strengths: [],
      gaps: [],
      createdAt: '2025-01-01T00:00:00Z',
    });
  }
  return reps;
}

// 2. Monthly Rep Performance from MTD Numbers > Rep Level
export async function syncMonthlyRepPerf(reps: Rep[]): Promise<MonthlyRepPerformance[]> {
  const rows = await fetchRange(MTD_NUMBERS_ID, 'Rep Level!A2:K17');
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const result: MonthlyRepPerformance[] = [];
  let idCounter = 1;

  const repMap: Record<string, string> = {};
  for (const r of reps) {
    // Index by "First Last" (normalized)
    repMap[r.name.toLowerCase()] = r.id;
    // Also index by "Last, First" (raw sheet format)
    const parts = r.name.split(' ');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const first = parts.slice(0, -1).join(' ');
      repMap[`${last}, ${first}`.toLowerCase()] = r.id;
      // Also just last name as fallback
      repMap[last.toLowerCase()] = r.id;
    }
  }

  for (const row of rows) {
    const dm = (row[0] ?? '').trim();
    const nameRaw = (row[1] ?? '').trim();
    if (!nameRaw || dm.toUpperCase().includes('TOTAL')) continue;
    if (!dm.toLowerCase().includes('tenorio')) continue;

    const name = normalizeName(nameRaw);
    const repId = repMap[name.toLowerCase()] ?? `live_rep_${idCounter}`;

    const boxes   = parseNum(row[5] ?? '');     // DEVICES col F
    const attach  = parseMoney(row[7] ?? '');   // ATTACH col H
    const bpPct   = parsePct(row[10] ?? '');    // BP% col K

    // Goal: use pacing col G to back-calculate
    const pacing  = parseNum(row[6] ?? '');
    const now2    = new Date();
    const daysInMonth = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate();
    const elapsed = now2.getDate();
    const goalBoxes = elapsed > 0 ? Math.round((pacing / elapsed) * daysInMonth) : 0;

    result.push({
      id: `live_mrp_${idCounter++}`,
      repId,
      month,
      year,
      mtdAttachments: attach,
      mtdBoxes: boxes,
      attachmentGoal: 0, // will be filled from store goals
      bpPct,
      atuPct: 0,
      reportCardPct: 0,
    });
  }
  return result;
}

// 3. Monthly Store Performance from MTD Numbers > Store Level (rows 2-11 = Hector's stores)
export async function syncMonthlyStorePerf(): Promise<MonthlyStorePerformance[]> {
  const rows = await fetchRange(MTD_NUMBERS_ID, 'Store Level!A2:H12');
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const result: MonthlyStorePerformance[] = [];
  let idCounter = 1;

  for (const row of rows) {
    const dm = (row[0] ?? '').trim();
    if (!dm.toLowerCase().includes('tenorio')) continue;

    const addr    = (row[1] ?? '').trim();
    const storeId = storeIdByAddress(addr);
    const boxes   = parseNum(row[2] ?? '');
    const attach  = parseMoney(row[3] ?? '');
    const goal    = parseMoney(row[5] ?? '');
    const bpPct   = parsePct(row[6] ?? '');
    const atuPct  = parsePct(row[7] ?? '');
    const pctGoal = goal > 0 ? Math.round((attach / goal) * 1000) / 10 : 0;

    result.push({
      id: `live_msp_${idCounter++}`,
      storeId,
      month,
      year,
      mtdAttachments: attach,
      mtdBoxes: boxes,
      attachmentGoal: goal,
      bpPct,
      atuPct,
      reportCardPct: pctGoal,
    });
  }
  return result;
}

// 4. Daily Performance from Team Dashboard > Daily tab
export async function syncDailyPerf(reps: Rep[]): Promise<DailyPerformance[]> {
  const rows = await fetchRange(TEAM_DASHBOARD_ID, 'Daily!A2:G500');
  const result: DailyPerformance[] = [];
  let idCounter = 1;

  const repMap: Record<string, string> = {};
  for (const r of reps) repMap[r.name.toLowerCase()] = r.id;

  for (const row of rows) {
    const dateRaw = (row[0] ?? '').trim();
    const repRaw  = (row[1] ?? '').trim();
    const storeRaw = (row[2] ?? '').trim();
    if (!dateRaw || !repRaw || repRaw.toUpperCase() === 'TOTAL') continue;

    // parse date — supports M/D/YYYY and YYYY-MM-DD
    let date = '';
    const slashMatch = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      date = `${slashMatch[3]}-${slashMatch[1].padStart(2,'0')}-${slashMatch[2].padStart(2,'0')}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      date = dateRaw;
    } else {
      continue;
    }

    const repId   = repMap[repRaw.toLowerCase()] ?? '';
    const storeId = storeIdByAddress(storeRaw) || storeIdByName(storeRaw);
    const boxes   = parseNum(row[3] ?? '');
    const goal    = parseMoney(row[4] ?? '');
    const attach  = parseMoney(row[5] ?? '');
    const pct     = goal > 0 ? Math.round((attach / goal) * 1000) / 10 : 0;

    result.push({
      id: `live_dp_${idCounter++}`,
      date,
      repId,
      storeId,
      boxes,
      dailyGoal: goal,
      attachment: attach,
      attachmentPctToDaily: pct,
      source: 'sheets',
      createdAt: today(),
      updatedAt: today(),
    });
  }
  return result;
}

// ─── Master Sync ──────────────────────────────────────────────────────────────

export interface LiveSyncResult {
  stores: Store[];
  reps: Rep[];
  monthlyRepPerf: MonthlyRepPerformance[];
  monthlyStorePerf: MonthlyStorePerformance[];
  dailyPerf: DailyPerformance[];
  syncedAt: string;
  error?: string;
}

export async function runLiveSync(): Promise<LiveSyncResult | null> {
  if (!API_KEY) {
    console.warn('[liveSync] VITE_SHEETS_API_KEY not set — live sync skipped');
    return null;
  }

  try {
    console.log('[liveSync] Starting live sync...');
    const stores = HECTOR_STORES;
    const reps = await syncReps();
    const [monthlyRepPerf, monthlyStorePerf, dailyPerf] = await Promise.all([
      syncMonthlyRepPerf(reps),
      syncMonthlyStorePerf(),
      syncDailyPerf(reps),
    ]);
    console.log('[liveSync] Done —', { reps: reps.length, monthlyRepPerf: monthlyRepPerf.length, monthlyStorePerf: monthlyStorePerf.length, dailyPerf: dailyPerf.length });
    return { stores, reps, monthlyRepPerf, monthlyStorePerf, dailyPerf, syncedAt: new Date().toISOString() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[liveSync] Error:', error);
    return { stores: HECTOR_STORES, reps: [], monthlyRepPerf: [], monthlyStorePerf: [], dailyPerf: [], syncedAt: new Date().toISOString(), error };
  }
}
