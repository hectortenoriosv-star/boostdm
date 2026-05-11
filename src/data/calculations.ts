import type {
  Rep, Store, MonthlyRepPerformance, MonthlyStorePerformance,
  DailyPerformance, Visit,
  RepSummary, StoreSummary, SignalType, DailyMovement,
  CommissionBreakdown, ChartDayData,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const _now = new Date();
export const TODAY = _now;
export const CURRENT_MONTH = _now.getMonth() + 1;
export const CURRENT_YEAR = _now.getFullYear();
export const DAYS_IN_MONTH = new Date(CURRENT_YEAR, CURRENT_MONTH, 0).getDate();
export const DAYS_ELAPSED: number = Math.max(1, _now.getDate() - 1);

const _todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
const _yesterday = new Date(_now);
_yesterday.setDate(_now.getDate() - 1);
const _yesterdayStr = `${_yesterday.getFullYear()}-${String(_yesterday.getMonth() + 1).padStart(2, '0')}-${String(_yesterday.getDate()).padStart(2, '0')}`;
export const TODAY_STR = _todayStr;

// ─── Core Calculations ────────────────────────────────────────────────────────

/** Projects MTD attachments to end of month.
 *  Pass daysElapsed/daysInMonth to use a reporting period other than the current calendar month. */
export function calcAttachmentTrend(
  mtdAttachments: number,
  daysElapsed?: number,
  daysInMonth?: number,
): number {
  const de = daysElapsed ?? DAYS_ELAPSED;
  const dm = daysInMonth ?? DAYS_IN_MONTH;
  if (de === 0) return 0;
  return Math.round((mtdAttachments / de) * dm);
}

/** Attachment % to Goal using trend (not raw MTD) */
export function calcAttachmentPctToGoal(
  mtdAttachments: number,
  goal: number,
  daysElapsed?: number,
  daysInMonth?: number,
): number {
  if (goal === 0) return 0;
  const trend = calcAttachmentTrend(mtdAttachments, daysElapsed, daysInMonth);
  return Math.round((trend / goal) * 100 * 10) / 10;
}

/** Visit trend: projects MTD visits to end of month */
export function calcVisitTrend(visitsCompleted: number): number {
  if (DAYS_ELAPSED === 0) return 0;
  return Math.round((visitsCompleted / DAYS_ELAPSED) * DAYS_IN_MONTH);
}

/** Red status: < 60% att pct OR report card < 75% (only when RC data is present) */
export function isRed(attachmentPctToGoal: number, reportCardPct: number): boolean {
  return attachmentPctToGoal < 60 || (reportCardPct > 0 && reportCardPct < 75);
}

/** Signal color based on attachment % to goal */
export function pctToSignal(pct: number): SignalType {
  if (pct >= 90) return 'green';
  if (pct >= 70) return 'amber';
  if (pct >= 60) return 'orange';
  return 'red';
}

/** Signal color considering both att% and report card */
export function repSignal(attPct: number, rcPct: number): SignalType {
  if (isRed(attPct, rcPct)) return 'red';
  return pctToSignal(attPct);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function buildRepSummary(
  rep: Rep,
  monthlyPerf: MonthlyRepPerformance | undefined,
  coachingNotes: { repId: string; date: string }[],
  period?: { daysElapsed: number; daysInMonth: number },
): RepSummary {
  const mtd = monthlyPerf?.mtdAttachments ?? 0;
  const goal = monthlyPerf?.attachmentGoal ?? 7200;
  const rc = monthlyPerf?.reportCardPct ?? 0;
  const boxes = monthlyPerf?.mtdBoxes ?? 0;

  // Use each synced field independently — don't require afterComm to unlock the rest.
  const mp = monthlyPerf;
  const trend = mp?.syncedAttTrend ?? calcAttachmentTrend(mtd, period?.daysElapsed, period?.daysInMonth);
  const pct   = mp?.syncedPctToGoal ?? calcAttachmentPctToGoal(mtd, goal, period?.daysElapsed, period?.daysInMonth);

  let commission: CommissionBreakdown;
  const hasAnyCommSync = mp && (
    mp.syncedAttTrend !== undefined ||
    mp.syncedPctToGoal !== undefined ||
    mp.syncedAttCommission !== undefined ||
    mp.syncedAfterCommission !== undefined
  );

  if (hasAnyCommSync && mp) {
    const boxTrend  = mp.syncedBoxTrend ?? calcVisitTrend(boxes);
    const tierBonus = mp.syncedTierBonus;
    const attComm   = mp.syncedAttCommission ?? 0;
    const boxComm   = mp.syncedBoxCommission ?? 0;
    const beforeRC  = mp.syncedTotalEstimate ?? (attComm + boxComm);
    const afterRC   = mp.syncedAfterCommission ?? Math.round(beforeRC * (() => {
      if (rc >= 100) return 1.10;
      if (rc >= 95)  return 1.08;
      if (rc >= 90)  return 1.00;
      if (rc >= 75)  return 0.90;
      return 0.80;
    })());

    let tier: string;
    if (pct >= 130) tier = '130%+ (Top)';
    else if (pct >= 106) tier = '106%–129%';
    else if (pct >= 90) tier = '90%–105%';
    else if (pct >= 61) tier = '61%–89%';
    else tier = 'Under 60%';

    let rcLabel = 'No change';
    if (rc >= 100) rcLabel = '+10%';
    else if (rc >= 95) rcLabel = '+8%';
    else if (rc >= 90) rcLabel = 'No change';
    else if (rc >= 75) rcLabel = '-10%';
    else if (rc > 0) rcLabel = '-20%';

    const rcMultiplier = beforeRC > 0 ? Math.round((afterRC / beforeRC) * 100) / 100 : 1;

    const nextTiers = [{ pct: 61, label: '61%' }, { pct: 90, label: '90%' }, { pct: 106, label: '106%' }, { pct: 130, label: '130%' }];
    const nextTierEntry = nextTiers.find(t => pct < t.pct);
    let amountForNextTier = 0;
    let nextTierLabel = 'At max tier';
    if (nextTierEntry) {
      const neededTrend = Math.ceil((nextTierEntry.pct / 100) * goal);
      amountForNextTier = Math.max(0, neededTrend - trend);
      nextTierLabel = nextTierEntry.label;
    }

    commission = {
      attachmentTrend: trend,
      pctToGoal: pct,
      tier,
      tierBonus,
      attachmentCommission: attComm,
      boxTrend,
      boxCommission: boxComm,
      commissionBeforeRC: beforeRC,
      reportCardPct: rc,
      rcMultiplier,
      rcLabel,
      commissionAfterRC: afterRC,
      amountForNextTier,
      nextTierLabel,
    };
  } else {
    commission = calcCommission(mtd, goal, boxes, rc, period?.daysElapsed, period?.daysInMonth);
  }

  const red = isRed(pct, rc);
  const sig = repSignal(pct, rc);

  const repNotes = coachingNotes
    .filter(n => n.repId === rep.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    rep,
    mtdAttachments: mtd,
    mtdBoxes: boxes,
    attachmentGoal: goal,
    attachmentTrend: trend,
    attachmentPctToGoal: pct,
    bpPct: monthlyPerf?.bpPct ?? 0,
    atuPct: monthlyPerf?.atuPct ?? 0,
    reportCardPct: rc,
    attHr: monthlyPerf?.attHr,
    tierBonus: monthlyPerf?.syncedTierBonus,
    isRed: red,
    signal: sig,
    lastCoachingDate: repNotes[0]?.date,
    commission,
  };
}

export function buildStoreSummary(
  store: Store,
  monthlyPerf: MonthlyStorePerformance | undefined,
  reps: Rep[],
  visits: Visit[],
  period?: { daysElapsed: number; daysInMonth: number },
): StoreSummary {
  const mtd = monthlyPerf?.mtdAttachments ?? 0;
  const goal = monthlyPerf?.attachmentGoal ?? store.monthlyAttachmentGoal;
  const trend = calcAttachmentTrend(mtd, period?.daysElapsed, period?.daysInMonth);
  const pct = calcAttachmentPctToGoal(mtd, goal, period?.daysElapsed, period?.daysInMonth);
  const rc = monthlyPerf?.reportCardPct ?? 0;
  const red = isRed(pct, rc);
  const sig = repSignal(pct, rc);

  const storeVisits = visits
    .filter(v => v.storeId === store.id && v.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    store,
    mtdAttachments: mtd,
    mtdBoxes: monthlyPerf?.mtdBoxes ?? 0,
    attachmentGoal: goal,
    attachmentTrend: trend,
    attachmentPctToGoal: pct,
    bpPct: monthlyPerf?.bpPct ?? 0,
    atuPct: monthlyPerf?.atuPct ?? 0,
    reportCardPct: rc,
    isRed: red,
    signal: sig,
    lastVisitDate: storeVisits[0]?.date,
    reps: reps.filter(r => r.defaultStoreId === store.id && r.active),
  };
}

// ─── District Aggregates ──────────────────────────────────────────────────────

export function calcDistrictMTD(
  monthlyStorePerf: MonthlyStorePerformance[],
  month?: number,
  year?: number,
  daysElapsed?: number,
  daysInMonth?: number,
): {
  mtdAttachments: number;
  mtdBoxes: number;
  totalGoal: number;
  attachmentTrend: number;
  attachmentPctToGoal: number;
  avgBpPct: number;
  avgAtuPct: number;
  avgRcPct: number;
} {
  const filterMonth = month ?? CURRENT_MONTH;
  const filterYear  = year  ?? CURRENT_YEAR;
  const current = monthlyStorePerf.filter(
    p => p.month === filterMonth && p.year === filterYear
  );

  if (current.length === 0) {
    return { mtdAttachments: 0, mtdBoxes: 0, totalGoal: 0, attachmentTrend: 0, attachmentPctToGoal: 0, avgBpPct: 0, avgAtuPct: 0, avgRcPct: 0 };
  }

  const mtdAttachments = current.reduce((s, p) => s + p.mtdAttachments, 0);
  const mtdBoxes = current.reduce((s, p) => s + p.mtdBoxes, 0);
  const totalGoal = current.reduce((s, p) => s + p.attachmentGoal, 0);
  const attachmentTrend = calcAttachmentTrend(mtdAttachments, daysElapsed, daysInMonth);
  const attachmentPctToGoal = totalGoal > 0 ? Math.round((attachmentTrend / totalGoal) * 100 * 10) / 10 : 0;
  const avgBpPct = Math.round(current.reduce((s, p) => s + (p.bpPct ?? 0), 0) / current.length);
  const avgAtuPct = Math.round(current.reduce((s, p) => s + (p.atuPct ?? 0), 0) / current.length);
  const avgRcPct = Math.round(current.reduce((s, p) => s + (p.reportCardPct ?? 0), 0) / current.length);

  return { mtdAttachments, mtdBoxes, totalGoal, attachmentTrend, attachmentPctToGoal, avgBpPct, avgAtuPct, avgRcPct };
}

// ─── Visit Calculations ───────────────────────────────────────────────────────

export function calcVisitStats(visits: Visit[], monthlyGoal: number) {
  const completed = visits.filter(v => v.status === 'completed').length;
  const trend = calcVisitTrend(completed);
  const remaining = Math.max(0, monthlyGoal - completed);
  const onPace = trend >= monthlyGoal;
  const planned = visits.filter(v => v.status === 'planned').length;

  let paceMessage = '';
  if (trend >= monthlyGoal) {
    paceMessage = `You are on pace for ${trend} visits this month`;
  } else {
    paceMessage = `You are trending ${trend} visits — ${monthlyGoal - trend} below goal`;
  }

  return { completed, trend, remaining, onPace, planned, paceMessage };
}

/** Last visit date per store */
export function lastVisitByStore(visits: Visit[]): Record<string, string> {
  const result: Record<string, string> = {};
  visits
    .filter(v => v.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(v => {
      if (!result[v.storeId]) result[v.storeId] = v.date;
    });
  return result;
}

/** Stores overdue for a visit (last visit > 5 days ago or never) */
export function storesOverdueForVisit(stores: Store[], visits: Visit[]): Store[] {
  const lastVisit = lastVisitByStore(visits);
  const cutoff = new Date(TODAY);
  cutoff.setDate(cutoff.getDate() - 5);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

  return stores.filter(s => {
    const lv = lastVisit[s.id];
    return !lv || lv < cutoffStr;
  });
}

// ─── Daily Movement ───────────────────────────────────────────────────────────

export function calcDailyMovement(
  dailyPerf: DailyPerformance[],
  reps: Rep[],
  _monthlyRepPerf: MonthlyRepPerformance[],
): DailyMovement[] {
  const today = _todayStr;
  const yesterday = _yesterdayStr;

  const movements: DailyMovement[] = [];

  // Group daily perf by rep and date
  const perfByRepDate = new Map<string, DailyPerformance>();
  dailyPerf.forEach(dp => {
    perfByRepDate.set(`${dp.repId}-${dp.date}`, dp);
  });

  reps.forEach(rep => {
    const todayPerf = perfByRepDate.get(`${rep.id}-${today}`);
    const yestPerf = perfByRepDate.get(`${rep.id}-${yesterday}`);

    if (todayPerf && yestPerf) {
      const todayPct = todayPerf.attachmentPctToDaily;
      const yestPct = yestPerf.attachmentPctToDaily;
      const change = Math.round(todayPct - yestPct);

      if (Math.abs(change) >= 5) {
        movements.push({
          entityId: rep.id,
          entityName: rep.name,
          type: 'rep',
          yesterdayPct: yestPct,
          todayPct,
          change,
          direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
        });
      }
    }
  });

  // Sort by abs change descending
  return movements.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

export function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US');
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%';
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Converts "HH:MM" 24-hour string to "H:MM AM/PM" 12-hour display */
export function fmt12h(time: string): string {
  if (!time || !time.includes(':')) return time;
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  if (isNaN(h)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

export function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const diff = TODAY.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function isToday(dateStr: string): boolean {
  return dateStr === _todayStr;
}

export function isTodayOrFuture(dateStr: string): boolean {
  return dateStr >= _todayStr;
}

export function isPast(dateStr: string): boolean {
  return dateStr < _todayStr;
}

export function isOverdue(dueDate: string, status: string): boolean {
  return status !== 'completed' && dueDate < _todayStr;
}

export function priorityOrder(p: string): number {
  return { urgent: 0, high: 1, medium: 2, low: 3 }[p] ?? 4;
}

// ─── EOD Flagging Logic ───────────────────────────────────────────────────────

export function isFlaggedEOD(dp: Pick<DailyPerformance, 'boxes' | 'attachmentPctToDaily'>): boolean {
  return dp.boxes === 0 || dp.attachmentPctToDaily < 60;
}

// ─── Store visit red streak ───────────────────────────────────────────────────

/** Returns stores that have been red on attachment for 2+ consecutive daily entries */
export function storesWithRedStreak(
  _dailyPerf: DailyPerformance[],
  stores: Store[],
  monthlyStorePerf: MonthlyStorePerformance[],
): Store[] {
  // Use monthly perf for simplicity — flag stores that are red MTD
  const redStoreIds = new Set<string>();

  monthlyStorePerf
    .filter(sp => sp.month === CURRENT_MONTH && sp.year === CURRENT_YEAR)
    .forEach(sp => {
      const pct = calcAttachmentPctToGoal(sp.mtdAttachments, sp.attachmentGoal);
      const rc = sp.reportCardPct;
      if (isRed(pct, rc)) redStoreIds.add(sp.storeId);
    });

  return stores.filter(s => redStoreIds.has(s.id));
}

// ─── Commission Calculation ───────────────────────────────────────────────────

export function calcCommission(
  mtdAttachments: number,
  attachmentGoal: number,
  mtdBoxes: number,
  reportCardPct: number,
  daysElapsed?: number,
  daysInMonth?: number,
): CommissionBreakdown {
  const trend = calcAttachmentTrend(mtdAttachments, daysElapsed, daysInMonth);
  const pct = calcAttachmentPctToGoal(mtdAttachments, attachmentGoal, daysElapsed, daysInMonth);
  const boxTrend = calcVisitTrend(mtdBoxes); // reuse same projection logic

  // Attachment commission rate
  let tier = '';
  let attRate = 0;
  if (pct >= 130) { tier = '130%+ (Top)'; attRate = 0.15; }
  else if (pct >= 106) { tier = '106%–129%'; attRate = 0.12; }
  else if (pct >= 90) { tier = '90%–105%'; attRate = 0.10; }
  else if (pct >= 61) { tier = '61%–89%'; attRate = 0.07; }
  else { tier = 'Under 60%'; attRate = 0.05; }

  const attachmentCommission = Math.round(trend * attRate);

  // Box commission
  let boxRate = 3;
  if (boxTrend >= 100) boxRate = 5;
  else if (boxTrend >= 70) boxRate = 4;
  const boxCommission = boxTrend * boxRate;

  const commissionBeforeRC = attachmentCommission + boxCommission;

  // Report card multiplier
  let rcMultiplier = 1;
  let rcLabel = 'No change';
  if (reportCardPct >= 100) { rcMultiplier = 1.10; rcLabel = '+10%'; }
  else if (reportCardPct >= 95) { rcMultiplier = 1.08; rcLabel = '+8%'; }
  else if (reportCardPct >= 90) { rcMultiplier = 1.00; rcLabel = 'No change'; }
  else if (reportCardPct >= 75) { rcMultiplier = 0.90; rcLabel = '-10%'; }
  else { rcMultiplier = 0.80; rcLabel = '-20%'; }

  const commissionAfterRC = Math.round(commissionBeforeRC * rcMultiplier);

  // Next tier gap
  const nextTiers = [{ pct: 61, label: '61%' }, { pct: 90, label: '90%' }, { pct: 106, label: '106%' }, { pct: 130, label: '130%' }];
  const nextTier = nextTiers.find(t => pct < t.pct);
  let amountForNextTier = 0;
  let nextTierLabel = 'At max tier';
  if (nextTier) {
    const neededTrend = Math.ceil((nextTier.pct / 100) * attachmentGoal);
    amountForNextTier = Math.max(0, neededTrend - trend);
    nextTierLabel = nextTier.label;
  }

  return {
    attachmentTrend: trend,
    pctToGoal: pct,
    tier,
    attachmentCommission,
    boxTrend,
    boxCommission,
    commissionBeforeRC,
    reportCardPct,
    rcMultiplier,
    rcLabel,
    commissionAfterRC,
    amountForNextTier,
    nextTierLabel,
  };
}

// ─── Chart Data Builder ───────────────────────────────────────────────────────

/** Build daily chart data for a full month from DailyPerformance entries.
 *  Each entry's attachment/boxes/goal is aggregated by date. */
export function buildChartData(
  dailyPerf: DailyPerformance[],
  repId?: string,
  storeId?: string,
  selectedDate?: string,
): ChartDayData[] {
  const filtered = dailyPerf.filter(dp => {
    if (repId && dp.repId !== repId) return false;
    if (storeId && dp.storeId !== storeId) return false;
    return true;
  });

  // Group by date
  const byDate = new Map<string, { attachment: number; boxes: number; goal: number }>();
  filtered.forEach(dp => {
    const existing = byDate.get(dp.date) ?? { attachment: 0, boxes: 0, goal: 0 };
    byDate.set(dp.date, {
      attachment: existing.attachment + dp.attachment,
      boxes: existing.boxes + dp.boxes,
      goal: existing.goal + dp.dailyGoal,
    });
  });

  // Sort dates
  const dates = Array.from(byDate.keys()).sort();

  return dates.map(date => {
    const d = byDate.get(date)!;
    const pct = d.goal > 0 ? Math.round((d.attachment / d.goal) * 100) : 0;
    const [, , day] = date.split('-');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthIdx = parseInt(date.split('-')[1]) - 1;
    return {
      date,
      dayLabel: `${monthNames[monthIdx]} ${parseInt(day)}`,
      attachment: d.attachment,
      goal: d.goal,
      boxes: d.boxes,
      pctToGoal: pct,
      isSelected: date === selectedDate,
    };
  });
}

/** Bar fill color based on % to goal */
export function chartBarColor(pct: number, isSelected: boolean): string {
  if (isSelected) return '#a78bfa'; // purple
  if (pct >= 100) return '#22c55e'; // green
  if (pct >= 75) return '#f59e0b';  // amber
  return '#ef4444';                  // red
}
