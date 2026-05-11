import { useState, useCallback } from 'react';
import { fetchDailyTab, parseSheetRows, extractSpreadsheetId, computeRangeInfo } from '../services/sheetsSync';
import { useData } from '../context/DataContext';
import type {
  Rep, Store, DailyPerformance,
  MonthlyRepPerformance, MonthlyStorePerformance, SyncResult, DailyNumbersMapping,
} from '../types';
import type { ParsedSheetRow } from '../services/sheetsSync';

// Same algorithm as DataContext's private genId
function localGenId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Default mapping used when none is saved in settings
const FALLBACK_MAPPING: DailyNumbersMapping = {
  date:       { tab: 'Daily', range: 'A2:A' },
  rep:        { tab: 'Daily', range: 'B2:B' },
  store:      { tab: 'Daily', range: 'C2:C' },
  boxes:      { tab: 'Daily', range: 'D2:D' },
  goal:       { tab: 'Daily', range: 'E2:E' },
  attachment: { tab: 'Daily', range: 'F2:F' },
  pctToGoal:  { tab: 'Daily', range: 'G2:G' },
};

export interface SheetSyncState {
  syncing: boolean;
  syncResult: SyncResult | null;
  syncError: string | null;
  testPreview: ParsedSheetRow[] | null;
  testLoading: boolean;
  testError: string | null;
  doSync: (urlOrId: string, apiKey: string, mapping?: DailyNumbersMapping) => Promise<void>;
  doTest: (urlOrId: string, apiKey: string, mapping?: DailyNumbersMapping) => Promise<void>;
  clearResults: () => void;
}

export function useSheetSync(): SheetSyncState {
  const {
    reps, stores, dailyPerf,
    monthlyRepPerf, monthlyStorePerf,
    settings, batchApply, updateSettings,
  } = useData();

  const fallbackYear = settings.currentYear ?? new Date().getFullYear();

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [testPreview, setTestPreview] = useState<ParsedSheetRow[] | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const clearResults = useCallback(() => {
    setSyncResult(null);
    setSyncError(null);
    setTestPreview(null);
    setTestError(null);
  }, []);

  const resolveMapping = useCallback((passedMapping?: DailyNumbersMapping): DailyNumbersMapping => {
    return passedMapping ?? settings.dailyNumbersMapping ?? FALLBACK_MAPPING;
  }, [settings.dailyNumbersMapping]);

  const doTest = useCallback(async (urlOrId: string, apiKey: string, passedMapping?: DailyNumbersMapping) => {
    setTestLoading(true);
    setTestError(null);
    setTestPreview(null);
    try {
      const id = extractSpreadsheetId(urlOrId);
      if (!id) throw new Error('Could not extract spreadsheet ID');
      const mapping = resolveMapping(passedMapping);
      const rangeInfo = computeRangeInfo(mapping);

      console.log('[useSheetSync] doTest', {
        dateRange:   mapping.date.range,
        repRange:    mapping.rep.range,
        storeRange:  mapping.store.range,
        effectiveRowLimit: rangeInfo.endRow ?? '(no limit)',
        fetchRange:  rangeInfo.fetchRange,
      });

      const { rows: rawRows, rowsDiscarded } = await fetchDailyTab(id, apiKey, mapping);
      const { rows } = parseSheetRows(rawRows, fallbackYear);

      console.log('[useSheetSync] doTest result', {
        rowsFetched:         rawRows.length,
        rowsDiscardedByLimit: rowsDiscarded,
        validRowsParsed:     rows.length,
      });

      setTestPreview(rows.slice(0, 10));
    } catch (e) {
      setTestError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTestLoading(false);
    }
  }, [fallbackYear, resolveMapping]);

  const doSync = useCallback(async (urlOrId: string, apiKey: string, passedMapping?: DailyNumbersMapping) => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const id = extractSpreadsheetId(urlOrId);
      if (!id) throw new Error('Could not extract spreadsheet ID');
      const mapping = resolveMapping(passedMapping);
      const rangeInfo = computeRangeInfo(mapping);

      // ── Fetch and parse ───────────────────────────────────────────────────
      const { rows: rawRows, rowsDiscarded } = await fetchDailyTab(id, apiKey, mapping);
      const { rows, totalFound, skippedTotals, errors } = parseSheetRows(rawRows, fallbackYear);

      console.log('[useSheetSync] doSync', {
        dateRange:            mapping.date.range,
        repRange:             mapping.rep.range,
        storeRange:           mapping.store.range,
        effectiveRowLimit:    rangeInfo.endRow ?? '(no limit)',
        rowsFetched:          rawRows.length,
        rowsAfterRangeLimit:  rawRows.length,
        rowsDiscardedByLimit: rowsDiscarded,
        rowsParsedTotal:      rows.length,
        skippedTotals,
        parseErrors:          errors.length,
      });

      // ── Sync config toggles ────────────────────────────────────────────────
      const autoCreateReps        = settings.syncAutoCreateReps        !== false;
      const autoCreateStores      = settings.syncAutoCreateStores      !== false;
      const replaceDemoData       = settings.syncReplaceDemoData       !== false;
      const autoReactivateReps    = settings.syncAutoReactivateArchivedReps    === true;
      const autoReactivateStores  = settings.syncAutoReactivateArchivedStores  === true;

      const isFirstSheetSync = !dailyPerf.some(dp => dp.source === 'sheets');

      // ── Build working copies ─────────────────────────────────────────────
      let workingReps: Rep[];
      let workingStores: Store[];
      let workingPerf: DailyPerformance[];

      if (replaceDemoData && isFirstSheetSync) {
        workingReps   = reps.map(r => ({ ...r, active: false }));
        workingStores = stores.map(s => ({ ...s, active: false }));
        workingPerf   = [];
      } else {
        workingReps   = [...reps];
        workingStores = [...stores];
        workingPerf   = [...dailyPerf];
      }

      // For every date present in the incoming sheet data, remove all existing
      // sheets-sourced records for that date. This prevents stale records from
      // a previous sync (wrong store, old attachment values, removed reps) from
      // accumulating alongside fresh data.
      if (rows.length > 0) {
        const incomingDates = new Set(rows.map(r => r.date));
        workingPerf = workingPerf.filter(
          dp => !incomingDates.has(dp.date) || dp.source !== 'sheets',
        );
      }

      const repsByName   = new Map<string, Rep>(workingReps.map(r   => [r.name.toLowerCase().trim(), r]));
      const storesByName = new Map<string, Store>(workingStores.map(s => [s.name.toLowerCase().trim(), s]));

      let repsCreated        = 0;
      let storesCreated      = 0;
      let rowsImported       = 0;
      let rowsUpdated        = 0;
      let rowsSkipped        = 0;
      let archivedRepsFound    = 0;
      let archivedStoresFound  = 0;
      const missingReps:      string[] = [];
      const missingStores:    string[] = [];
      const archivedRepNames:   string[] = [];
      const archivedStoreNames: string[] = [];
      const now = new Date().toISOString();

      for (const row of rows) {
        const normRep   = row.repName.toLowerCase().trim();
        const normStore = row.storeName.toLowerCase().trim();

        // ── Find or create Rep ──────────────────────────────────────────────
        let rep = repsByName.get(normRep);

        if (rep && !rep.active) {
          if (autoReactivateReps) {
            const idx = workingReps.findIndex(r => r.id === rep!.id);
            rep = { ...rep, active: true };
            if (idx !== -1) workingReps[idx] = rep;
            repsByName.set(normRep, rep);
          } else {
            if (!archivedRepNames.includes(row.repName)) {
              archivedRepNames.push(row.repName);
              archivedRepsFound++;
            }
            rowsSkipped++;
            continue;
          }
        }

        if (!rep) {
          if (!autoCreateReps) {
            if (!missingReps.includes(row.repName)) missingReps.push(row.repName);
            rowsSkipped++;
            continue;
          }
          rep = {
            id: localGenId(),
            name: row.repName.trim(),
            defaultStoreId: '',
            active: true,
            phone: '',
            hireDate: row.date,
            notes: 'Auto-created from Google Sheets sync',
            strengths: [],
            gaps: [],
            createdAt: now,
          };
          workingReps.push(rep);
          repsByName.set(normRep, rep);
          repsCreated++;
        }

        // ── Find or create Store ────────────────────────────────────────────
        let store = storesByName.get(normStore);

        if (store && !store.active) {
          if (autoReactivateStores) {
            const idx = workingStores.findIndex(s => s.id === store!.id);
            store = { ...store, active: true };
            if (idx !== -1) workingStores[idx] = store;
            storesByName.set(normStore, store);
          } else {
            if (!archivedStoreNames.includes(row.storeName)) {
              archivedStoreNames.push(row.storeName);
              archivedStoresFound++;
            }
            rowsSkipped++;
            continue;
          }
        }

        if (!store) {
          if (!autoCreateStores) {
            if (!missingStores.includes(row.storeName)) missingStores.push(row.storeName);
            rowsSkipped++;
            continue;
          }
          store = {
            id: localGenId(),
            name: row.storeName.trim(),
            address: row.storeName.trim(),
            city: '',
            state: '',
            phone: '',
            hours: { open: '09:00', close: '21:00' },
            monthlyAttachmentGoal: 0,
            bpGoal: 75,
            atuGoal: 65,
            active: true,
            notes: 'Auto-created from Google Sheets sync',
            eventNotes: [],
            createdAt: now,
          };
          workingStores.push(store);
          storesByName.set(normStore, store);
          storesCreated++;
        }

        // Link rep to store if no default yet
        const repIdx = workingReps.findIndex(r => r.id === rep!.id);
        if (repIdx !== -1 && !workingReps[repIdx].defaultStoreId) {
          workingReps[repIdx] = { ...workingReps[repIdx], defaultStoreId: store.id };
          repsByName.set(normRep, workingReps[repIdx]);
          rep = workingReps[repIdx];
        }

        // ── Upsert DailyPerformance ─────────────────────────────────────────
        const existingIdx = workingPerf.findIndex(
          dp => dp.date === row.date && dp.repId === rep!.id && dp.storeId === store!.id,
        );

        if (existingIdx !== -1) {
          workingPerf[existingIdx] = {
            ...workingPerf[existingIdx],
            boxes: row.boxes,
            dailyGoal: row.goal,
            attachment: row.attachment,
            attachmentPctToDaily: row.percentToGoal,
            source: 'sheets',
            updatedAt: now,
          };
          rowsUpdated++;
        } else {
          workingPerf.push({
            id: localGenId(),
            date: row.date,
            repId: rep.id,
            storeId: store.id,
            boxes: row.boxes,
            dailyGoal: row.goal,
            attachment: row.attachment,
            attachmentPctToDaily: row.percentToGoal,
            source: 'sheets',
            createdAt: now,
            updatedAt: now,
          });
          rowsImported++;
        }
      }

      // ── Compute MTD rollups ──────────────────────────────────────────────
      const currentMonth = settings.currentMonth ?? 4;
      const currentYear  = settings.currentYear  ?? fallbackYear;

      const repMTD   = new Map<string, { att: number; boxes: number; goalSum: number }>();
      const storeMTD = new Map<string, { att: number; boxes: number; goalSum: number }>();

      for (const dp of workingPerf) {
        const [y, m] = dp.date.split('-').map(Number);
        if (y !== currentYear || m !== currentMonth) continue;
        const rc = repMTD.get(dp.repId)    ?? { att: 0, boxes: 0, goalSum: 0 };
        const sc = storeMTD.get(dp.storeId) ?? { att: 0, boxes: 0, goalSum: 0 };
        repMTD.set(dp.repId,    { att: rc.att + dp.attachment, boxes: rc.boxes + dp.boxes, goalSum: rc.goalSum + dp.dailyGoal });
        storeMTD.set(dp.storeId, { att: sc.att + dp.attachment, boxes: sc.boxes + dp.boxes, goalSum: sc.goalSum + dp.dailyGoal });
      }

      const workingMonthlyRepPerf: MonthlyRepPerformance[] = [...monthlyRepPerf];
      repMTD.forEach((data, repId) => {
        const idx  = workingMonthlyRepPerf.findIndex(p => p.repId === repId && p.month === currentMonth && p.year === currentYear);
        const base = idx !== -1 ? workingMonthlyRepPerf[idx] : null;
        const updated: MonthlyRepPerformance = {
          ...(base ?? {}),
          id:             base?.id ?? localGenId(),
          repId,
          month:          currentMonth,
          year:           currentYear,
          mtdAttachments: data.att,
          mtdBoxes:       data.boxes,
          attachmentGoal: base?.attachmentGoal ?? data.goalSum,
          bpPct:          base?.bpPct  ?? 0,
          atuPct:         base?.atuPct ?? 0,
          reportCardPct:  base?.reportCardPct ?? 0,
        };
        if (idx !== -1) workingMonthlyRepPerf[idx] = updated;
        else workingMonthlyRepPerf.push(updated);
      });

      const workingMonthlyStorePerf: MonthlyStorePerformance[] = [...monthlyStorePerf];
      storeMTD.forEach((data, storeId) => {
        const idx  = workingMonthlyStorePerf.findIndex(p => p.storeId === storeId && p.month === currentMonth && p.year === currentYear);
        const base = idx !== -1 ? workingMonthlyStorePerf[idx] : null;
        const updated: MonthlyStorePerformance = {
          id:             base?.id ?? localGenId(),
          storeId,
          month:          currentMonth,
          year:           currentYear,
          mtdAttachments: data.att,
          mtdBoxes:       data.boxes,
          attachmentGoal: base?.attachmentGoal ?? data.goalSum,
          bpPct:          base?.bpPct  ?? 0,
          atuPct:         base?.atuPct ?? 0,
          reportCardPct:  base?.reportCardPct ?? 0,
        };
        if (idx !== -1) workingMonthlyStorePerf[idx] = updated;
        else workingMonthlyStorePerf.push(updated);
      });

      // ── Commit atomically ─────────────────────────────────────────────────
      batchApply({
        reps:             workingReps,
        stores:           workingStores,
        dailyPerf:        workingPerf,
        monthlyRepPerf:   workingMonthlyRepPerf,
        monthlyStorePerf: workingMonthlyStorePerf,
      });

      const syncedAt = new Date().toISOString();
      const result: SyncResult = {
        rowsFound:     totalFound,
        rowsImported,
        rowsUpdated,
        rowsSkipped,
        skippedTotals,
        repsCreated,
        storesCreated,
        archivedRepsFound,
        archivedStoresFound,
        missingReps,
        missingStores,
        archivedRepNames,
        archivedStoreNames,
        errors,
        syncedAt,
        rowRangeStart:       rangeInfo.startRow,
        rowRangeEnd:         rangeInfo.endRow,
        rowsDiscardedByLimit: rowsDiscarded,
      };

      console.log('[useSheetSync] doSync complete', {
        rowsFound: totalFound,
        rowsImported,
        rowsUpdated,
        rowsSkipped,
        rowsDiscardedByLimit: rowsDiscarded,
        repsCreated,
        storesCreated,
      });

      updateSettings({ sheetsConnected: true, lastSyncedAt: syncedAt, lastSyncResult: result });
      setSyncResult(result);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [
    reps, stores, dailyPerf, monthlyRepPerf, monthlyStorePerf,
    settings, fallbackYear, batchApply, updateSettings, resolveMapping,
  ]);

  return { syncing, syncResult, syncError, testPreview, testLoading, testError, doSync, doTest, clearResults };
}
