// ─── Core Entities ───────────────────────────────────────────────────────────

export interface StoreDayHours {
  open: string;
  close: string;
  closed?: boolean;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  hours: { open: string; close: string };
  dailyHours?: {
    mon?: StoreDayHours; tue?: StoreDayHours; wed?: StoreDayHours; thu?: StoreDayHours;
    fri?: StoreDayHours; sat?: StoreDayHours; sun?: StoreDayHours;
  };
  monthlyAttachmentGoal: number;
  bpGoal: number;
  atuGoal: number;
  active: boolean;
  notes: string;
  eventNotes: StoreEventNote[];
  createdAt: string;
}

export interface StoreEventNote {
  id: string;
  date: string;
  note: string;
}

export interface Rep {
  id: string;
  name: string;
  defaultStoreId: string;
  active: boolean;
  phone: string;
  hireDate: string;
  notes: string;
  strengths: string[];
  gaps: string[];
  createdAt: string;
}

export interface DailyPerformance {
  id: string;
  date: string;         // YYYY-MM-DD
  repId: string;
  storeId: string;
  boxes: number;
  dailyGoal: number;
  attachment: number;
  attachmentPctToDaily: number;
  source: 'manual' | 'upload' | 'sheets';
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyRepPerformance {
  id: string;
  repId: string;
  month: number;        // 1-12
  year: number;
  mtdAttachments: number;
  mtdBoxes: number;
  attachmentGoal: number;
  bpPct: number;
  atuPct: number;
  reportCardPct: number;
  attHr?: number;
  // Synced from Commission Sheet — override calculated values when present
  syncedAttTrend?: number;
  syncedPctToGoal?: number;
  syncedTierBonus?: number;
  syncedBoxTrend?: number;
  syncedAttCommission?: number;
  syncedBoxCommission?: number;
  syncedTotalEstimate?: number;
  syncedAfterCommission?: number;
}

export interface MonthlyStorePerformance {
  id: string;
  storeId: string;
  month: number;
  year: number;
  mtdAttachments: number;
  mtdBoxes: number;
  attachmentGoal: number;
  bpPct: number;
  atuPct: number;
  reportCardPct: number;
}

export type TaskType = 'coaching' | 'visit' | 'eod' | 'schedule' | 'message' | 'commission' | 'admin';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'waiting' | 'completed';
  taskType?: TaskType;
  dueDate: string;
  repId?: string;
  storeId?: string;
  notes: string;
  source?: 'manual' | 'eod-form' | 'visit' | 'sheets' | 'system' | 'seed';
  createdAt: string;
  completedAt?: string;
}

export interface Visit {
  id: string;
  date: string;
  storeId: string;
  visitType: VisitType;
  timeInStore: string;
  startTime?: string;
  endTime?: string;
  notes: string;
  reason?: string;
  focusArea?: string;
  coachingCompleted: boolean;
  redFlagsFound: string[];
  followUpTaskIds: string[];
  status: 'planned' | 'completed' | 'cancelled';
  repsObserved?: string[];
  actionItems?: string[];
  followUpRequired?: boolean;
  followUpDate?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  source?: 'manual' | 'demo' | 'google_calendar' | 'system';
  createdAt: string;
  updatedAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  source: 'google_calendar' | 'manual';
  relatedStoreId?: string;
  relatedRepId?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  syncedAt?: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  dueDate?: string;
  status: 'needsAction' | 'completed';
  source: 'google_tasks' | 'manual';
  relatedStoreId?: string;
  relatedRepId?: string;
  syncedAt?: string;
}

export interface ScheduleShift {
  id: string;
  date: string;
  storeId: string;
  repId: string;       // '' when the sheet name could not be matched to an app rep
  repName?: string;    // raw name from the sheet; used as display fallback when repId is ''
  startTime: string;
  endTime: string;
  hours: number;
  role: 'opener' | 'closer' | 'mid' | 'full';
  status?: 'scheduled' | 'off' | 'borrowed' | 'changed' | 'event';
  borrowedStoreId?: string;
  borrowedStoreName?: string;
  eventNote?: string;
  notes?: string;
  createdAt: string;
}

export interface ScheduleStoreBlock {
  id: string;
  sourceBlockLabel: string;
  mappedStoreId: string;
  mappedStoreName: string;
  startRow: number;
  endRow: number;
  repNameColumn: string;
  mondayShiftCol: string;
  mondayHoursCol: string;
  tuesdayShiftCol: string;
  tuesdayHoursCol: string;
  wednesdayShiftCol: string;
  wednesdayHoursCol: string;
  thursdayShiftCol: string;
  thursdayHoursCol: string;
  fridayShiftCol: string;
  fridayHoursCol: string;
  saturdayShiftCol: string;
  saturdayHoursCol: string;
  sundayShiftCol: string;
  sundayHoursCol: string;
}

export interface CoachingNote {
  id: string;
  repId: string;
  date: string;
  type: 'observation' | 'coaching' | 'recognition' | 'follow-up';
  notes: string;
  behaviors: string[];
  followUp?: string;
  followUpDue?: string;
  status: 'open' | 'closed';
  eodReportId?: string;
  source?: 'manual' | 'seed';
  createdAt: string;
}

export interface EODReport {
  id: string;
  date: string;
  repId: string;
  storeId: string;
  issue: string;
  coachingFocus: string;
  actionPlan: string;
  wins: string;
  status: 'new' | 'reviewed' | 'actioned';
  linkedCoachingNoteId?: string;
  source: 'manual' | 'sheets';
  createdAt: string;
}

export interface MessageDraft {
  id: string;
  date: string;
  reportType: string;
  audience: string;
  mainGoal: string;
  wins: string;
  gaps: string;
  urgency: 'low' | 'medium' | 'high';
  customPrompt: string;
  option1: string;
  option2: string;
  option3: string;
  selectedOption?: 1 | 2 | 3;
  notes: string;
  saved: boolean;
  createdAt: string;
}

// ─── Google Sheets Sync Config ────────────────────────────────────────────────

export interface SheetMetricMapping {
  tab: string;
  range: string;
}

export interface DailyNumbersMapping {
  date: SheetMetricMapping;
  rep: SheetMetricMapping;
  store: SheetMetricMapping;
  boxes: SheetMetricMapping;
  goal: SheetMetricMapping;
  attachment: SheetMetricMapping;
  pctToGoal: SheetMetricMapping;  // optional — if blank, calculate
}

export interface SyncResult {
  rowsFound: number;
  rowsImported: number;
  rowsUpdated: number;
  rowsSkipped: number;
  skippedTotals: number;
  repsCreated: number;
  storesCreated: number;
  archivedRepsFound: number;
  archivedStoresFound: number;
  missingReps: string[];
  missingStores: string[];
  archivedRepNames: string[];
  archivedStoreNames: string[];
  errors: string[];
  syncedAt: string;
  rowRangeStart: number;
  rowRangeEnd: number | null;
  rowsDiscardedByLimit: number;
}

export type GoogleSheetSourceType =
  | 'daily-numbers'
  | 'report-card'
  | 'bp-atu'
  | 'district-rank'
  | 'rep-goals'
  | 'store-goals'
  | 'schedule'
  | 'eod-forms'
  | 'commission';

export interface GoogleSheetSource {
  id: string;
  name: string;
  type: GoogleSheetSourceType;
  enabled: boolean;
  spreadsheetUrl: string;
  spreadsheetId: string;
  apiKeyOverride?: string;
  tabName: string;
  mapping: Record<string, string>;
  scheduleBlocks?: ScheduleStoreBlock[];
  lastSyncedAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'never';
  lastSyncSummary?: Partial<SyncResult>;
}

export interface DistrictSettings {
  districtRank?: number;
  districtRankOutOf?: number;
  monthlyVisitGoal: number;
  currentMonth: number;
  currentYear: number;
  bpGoal: number;
  atuGoal: number;
  reportCardGoal: number;
  sheetsConnected: boolean;
  sheetsUrl?: string;
  sheetsSpreadsheetId?: string;
  sheetsApiKey?: string;
  lastSyncedAt?: string;
  dailyNumbersMapping?: DailyNumbersMapping;
  lastSyncResult?: SyncResult;
  syncAutoCreateReps?: boolean;
  syncAutoCreateStores?: boolean;
  syncReplaceDemoData?: boolean;
  syncAutoReactivateArchivedReps?: boolean;
  syncAutoReactivateArchivedStores?: boolean;
  googleSheetSources?: GoogleSheetSource[];
  googleOAuthClientId?: string;
  googleCalendarConnected?: boolean;
  googleCalendarLastSyncedAt?: string;
  googleTasksConnected?: boolean;
  googleTasksLastSyncedAt?: string;
}

// ─── Union / Enum Types ───────────────────────────────────────────────────────

export type VisitType =
  | 'Sales Focused Visit'
  | 'GREAT Observation'
  | 'Coaching Visit'
  | 'EOD Follow-Up'
  | 'Store Check-In'
  | 'Schedule/Coverage Visit'
  | 'Month-End Push'
  | 'AE Ride-Along'
  | 'Store Follow-Up Visit'
  | 'GREAT Sales Observation Visit'
  | 'Event';

export interface CoachingQueueItem {
  id: string;
  repId: string;
  repName: string;
  storeId: string;
  storeName: string;
  reason: string;
  priority: 1 | 2 | 3 | 4 | 5;
  greatFocus: string;
  sourcePage: string;
  sourceType: string;
  dueDate: string;
  status: 'open' | 'inProgress' | 'coached' | 'closed';
  notes: string;
  coachingNote?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PlanVisitPrefill {
  storeId?: string;
  date?: string;
  reason?: string;
  focusArea?: string;
  repId?: string;
  repIds?: string[];
  relatedTaskId?: string;
  calendarEventId?: string;
  notes?: string;
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'open' | 'in-progress' | 'waiting' | 'completed';
export type SignalType = 'green' | 'amber' | 'red' | 'blue' | 'orange' | 'purple' | 'neutral';

// ─── Chart Data ───────────────────────────────────────────────────────────────

export interface ChartDayData {
  date: string;       // YYYY-MM-DD
  dayLabel: string;   // "Apr 1"
  attachment: number;
  goal: number;
  boxes: number;
  pctToGoal: number;
  isSelected?: boolean;
}

// ─── Commission ───────────────────────────────────────────────────────────────

export interface CommissionBreakdown {
  attachmentTrend: number;
  pctToGoal: number;
  tier: string;
  tierBonus?: number;
  attachmentCommission: number;
  boxTrend: number;
  boxCommission: number;
  commissionBeforeRC: number;
  reportCardPct: number;
  rcMultiplier: number;
  rcLabel: string;
  commissionAfterRC: number;
  amountForNextTier: number;
  nextTierLabel: string;
}

// ─── Computed / Derived ───────────────────────────────────────────────────────

export interface RepSummary {
  rep: Rep;
  mtdAttachments: number;
  mtdBoxes: number;
  attachmentGoal: number;
  attachmentTrend: number;
  attachmentPctToGoal: number;
  bpPct: number;
  atuPct: number;
  reportCardPct: number;
  attHr?: number;
  tierBonus?: number;
  isRed: boolean;
  signal: SignalType;
  lastCoachingDate?: string;
  commission?: CommissionBreakdown;
}

export interface StoreSummary {
  store: Store;
  mtdAttachments: number;
  mtdBoxes: number;
  attachmentGoal: number;
  attachmentTrend: number;
  attachmentPctToGoal: number;
  bpPct: number;
  atuPct: number;
  reportCardPct: number;
  isRed: boolean;
  signal: SignalType;
  lastVisitDate?: string;
  reps: Rep[];
  rank?: number;
}

export interface DailyMovement {
  entityId: string;
  entityName: string;
  type: 'rep' | 'store';
  yesterdayPct: number;
  todayPct: number;
  change: number;
  direction: 'up' | 'down' | 'flat';
}

// ─── UI / Component Types ─────────────────────────────────────────────────────

export interface KpiCardData {
  label: string;
  value?: string | number;
  subValue?: string;
  change?: number;
  changeLabel?: string;
  goal?: number;
  progress?: number;
  signal?: SignalType;
  helperText?: string;
}

export interface SummaryCardData {
  label: string;
  value?: string | number;
  icon?: string;
  signal?: SignalType;
  description?: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
  alert?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
