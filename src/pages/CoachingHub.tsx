import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookOpen, Plus, AlertTriangle, CheckCircle, Clock, Star,
  ChevronDown, ChevronUp, X, Search, MoreVertical,
  User, ExternalLink, RefreshCw, Copy, FileText,
  ShieldAlert, Flag,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import type { CoachingNote, EODReport, CoachingQueueItem } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const _d = new Date();
const TODAY = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;
const MONTH_PREFIX = TODAY.slice(0, 7);

type TabFilter = 'all' | 'overdue' | 'due-today' | 'from-eod' | 'recognition' | 'policy' | 'closed';

const TAB_LABELS: { key: TabFilter; label: string }[] = [
  { key: 'all',         label: 'All Open' },
  { key: 'overdue',     label: 'Overdue' },
  { key: 'due-today',   label: 'Due Today' },
  { key: 'from-eod',    label: 'From EOD' },
  { key: 'recognition', label: 'Recognition' },
  { key: 'policy',      label: 'Policy / Flags' },
  { key: 'closed',      label: 'Closed' },
];

const TYPE_BADGE: Record<CoachingNote['type'], { cls: string; label: string }> = {
  coaching:    { cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',          label: 'Coaching' },
  recognition: { cls: 'bg-signal-green/20 text-signal-green border border-signal-green/30', label: 'Recognition' },
  'follow-up': { cls: 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30', label: 'Follow-Up' },
  observation: { cls: 'bg-purple-400/20 text-purple-300 border border-purple-400/30',    label: 'Observation' },
};

const SEVERITY_BADGE = {
  critical: { cls: 'bg-signal-red/20 text-signal-red border border-signal-red/30',       label: 'Critical' },
  high:     { cls: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',        label: 'High' },
  watch:    { cls: 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30',  label: 'Watch' },
  info:     { cls: 'bg-navy-600/60 text-ink-muted border border-navy-500/50',             label: 'Info' },
};

const TAG_COLORS: Record<string, string> = {
  'Fraud Flag':    'bg-signal-red/20 text-signal-red border border-signal-red/30',
  'Form Required': 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  'Policy Issue':  'bg-orange-400/20 text-orange-200 border border-orange-400/30',
  'No Pitch':      'bg-signal-amber/20 text-signal-amber border border-signal-amber/30',
  'BP':            'bg-blue-400/20 text-blue-300 border border-blue-400/30',
  'ATU':           'bg-blue-400/20 text-blue-300 border border-blue-400/30',
  'Accessories':   'bg-purple-400/20 text-purple-300 border border-purple-400/30',
  'Payment Issue': 'bg-signal-red/20 text-signal-red border border-signal-red/30',
};

const GREAT_COLORS: Record<string, string> = {
  Greet:    'bg-teal-500/20 text-teal-300 border border-teal-500/30',
  Recognize:'bg-signal-green/20 text-signal-green border border-signal-green/30',
  Engage:   'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  Advise:   'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  Transact: 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function isOverdue(note: CoachingNote): boolean {
  return note.status === 'open' && !!note.followUpDue && note.followUpDue < TODAY;
}

function isDueToday(note: CoachingNote): boolean {
  return note.status === 'open' && note.followUpDue === TODAY;
}

interface ParsedNote {
  tags:        string[];
  severity:    'critical' | 'high' | 'watch' | 'info';
  greatFocus:  string[];
  issueSummary: string;
}

function parseNote(note: CoachingNote): ParsedNote {
  const combined = [note.notes, ...note.behaviors].join(' ');
  const lower = combined.toLowerCase();

  const tags: string[] = [];
  if (/fraud|fraud\s+flag/i.test(combined))                       tags.push('Fraud Flag');
  if (/form\s+required|incident\s+form/i.test(combined))          tags.push('Form Required');
  if (/policy\s+issue|policy\s+violation|policy\s+flag/i.test(combined) && !tags.includes('Fraud Flag')) tags.push('Policy Issue');
  if (/no.?pitch|didn.?t\s+pitch|not\s+pitching/i.test(combined)) tags.push('No Pitch');
  if (/\bbp\b|boost\s+protect/i.test(combined))                   tags.push('BP');
  if (/\batu\b|auto\s+top.?up/i.test(combined))                   tags.push('ATU');
  if (/accessories|headset|speaker|phone\s+case/i.test(lower))    tags.push('Accessories');
  if (/customer.*money|payment\s+issue|no\s+collection|didn.?t\s+collect/i.test(lower)) tags.push('Payment Issue');

  let severity: ParsedNote['severity'] = 'info';
  if (tags.some(t => ['Fraud Flag', 'Form Required'].includes(t)))          severity = 'critical';
  else if (tags.some(t => ['Policy Issue', 'Payment Issue'].includes(t)))   severity = 'high';
  else if (tags.some(t => ['No Pitch', 'BP', 'ATU', 'Accessories'].includes(t)) ||
           note.type === 'coaching' || note.type === 'follow-up')            severity = 'watch';

  const greatFocus: string[] = [];
  if (/greet|greeting/i.test(lower))          greatFocus.push('Greet');
  if (/recogni/i.test(lower))                 greatFocus.push('Recognize');
  if (/engag/i.test(lower))                   greatFocus.push('Engage');
  if (/advis|suggest|recommend/i.test(lower)) greatFocus.push('Advise');
  if (/transact|close|sold\b/i.test(lower))   greatFocus.push('Transact');

  const sentences = note.notes.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const issueSummary = sentences[0] ?? note.notes.slice(0, 150);

  return { tags, severity, greatFocus, issueSummary };
}

function getPriorityScore(
  note: CoachingNote,
  parsed: ParsedNote,
  repOpenCount: number,
): number {
  let score = 0;
  if (isOverdue(note)) score += parsed.severity === 'critical' ? 100 : 80;
  if (isDueToday(note)) score += 60;
  if (parsed.severity === 'critical') score += 50;
  if (note.eodReportId && note.status === 'open') score += 40;
  if (repOpenCount >= 3) score += 30;
  if (parsed.severity === 'high') score += 25;
  if (parsed.tags.length > 0) score += 10;
  return score;
}

// ─── Add Coaching Note Modal ──────────────────────────────────────────────────

interface AddNoteModalProps {
  onClose:      () => void;
  onAdd:        (note: Omit<CoachingNote, 'id' | 'createdAt'>) => void;
  reps:         { id: string; name: string }[];
  initialRepId?: string;
  initialType?:  CoachingNote['type'];
}

function AddNoteModal({ onClose, onAdd, reps, initialRepId, initialType }: AddNoteModalProps) {
  const [repId,        setRepId]        = useState(initialRepId ?? '');
  const [date,         setDate]         = useState(TODAY);
  const [type,         setType]         = useState<CoachingNote['type']>(initialType ?? 'coaching');
  const [notes,        setNotes]        = useState('');
  const [behaviorsRaw, setBehaviorsRaw] = useState('');
  const [followUp,     setFollowUp]     = useState('');
  const [followUpDue,  setFollowUpDue]  = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repId || !notes.trim()) return;
    const behaviors = behaviorsRaw.split(',').map(b => b.trim()).filter(Boolean);
    onAdd({
      repId, date, type,
      notes: notes.trim(),
      behaviors,
      followUp:    followUp.trim()  || undefined,
      followUpDue: followUpDue      || undefined,
      status: 'open',
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-navy-800 border border-navy-500 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-navy-500">
          <h2 className="text-base font-bold text-ink-primary">Add Coaching Note</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="metric-label mb-1 block">Rep *</label>
              <select value={repId} onChange={e => setRepId(e.target.value)} className="input-base w-full" required>
                <option value="">Select rep…</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="metric-label mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-base w-full" />
            </div>
          </div>

          <div>
            <label className="metric-label mb-1 block">Type</label>
            <div className="flex gap-2 flex-wrap">
              {(['coaching', 'observation', 'recognition', 'follow-up'] as CoachingNote['type'][]).map(t => (
                <button
                  key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                    type === t ? TYPE_BADGE[t].cls : 'bg-navy-700 text-ink-muted border-navy-500 hover:border-navy-400'
                  }`}
                >
                  {TYPE_BADGE[t].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="metric-label mb-1 block">Notes *</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} className="input-base w-full resize-none"
              placeholder="What was observed or discussed…" required
            />
          </div>

          <div>
            <label className="metric-label mb-1 block">
              Observed Behaviors <span className="text-ink-muted font-normal">(comma-separated)</span>
            </label>
            <input
              type="text" value={behaviorsRaw} onChange={e => setBehaviorsRaw(e.target.value)}
              className="input-base w-full"
              placeholder="e.g. No BP pitch, Skipped financing, Strong greeting"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="metric-label mb-1 block">Follow-Up Action</label>
              <input type="text" value={followUp} onChange={e => setFollowUp(e.target.value)} className="input-base w-full" placeholder="What should happen next…" />
            </div>
            <div>
              <label className="metric-label mb-1 block">Follow-Up Due</label>
              <input type="date" value={followUpDue} onChange={e => setFollowUpDue(e.target.value)} className="input-base w-full" />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" className="btn-primary flex-1">Add Note</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add EOD Report Modal ─────────────────────────────────────────────────────

function AddEODModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd:   (r: Omit<EODReport, 'id' | 'createdAt'>) => void;
}) {
  const { reps, stores } = useData();
  const [form, setForm] = useState({
    date: TODAY, repId: '', storeId: '',
    issue: '', coachingFocus: '', actionPlan: '', wins: '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.repId) return;
    onAdd({ ...form, status: 'new', source: 'manual' });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-500 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-ink-primary">Add EOD Report</p>
            <p className="text-xs text-ink-muted">End of day observation or report</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Date</label>
            <input type="date" className="input-base w-full" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Rep *</label>
            <select className="input-base w-full" value={form.repId} onChange={e => set('repId', e.target.value)}>
              <option value="">Select rep…</option>
              {reps.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Store</label>
          <select className="input-base w-full" value={form.storeId} onChange={e => set('storeId', e.target.value)}>
            <option value="">Select store…</option>
            {stores.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Issue / Gap</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What went wrong or what was missed?" value={form.issue} onChange={e => set('issue', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Coaching Focus</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What specifically needs to be coached?" value={form.coachingFocus} onChange={e => set('coachingFocus', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Action Plan</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What actions were agreed on?" value={form.actionPlan} onChange={e => set('actionPlan', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Wins</label>
          <textarea className="input-base w-full resize-none" rows={2} placeholder="What went well?" value={form.wins} onChange={e => set('wins', e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={submit} disabled={!form.repId} className="btn-primary flex-1 justify-center disabled:opacity-50">
            Save EOD Report
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Coaching Note from EOD Modal ──────────────────────────────────────

function CreateCoachingFromEODModal({
  report, repName, onClose, onConfirm,
}: {
  report:    EODReport;
  repName:   string;
  onClose:   () => void;
  onConfirm: (note: Omit<CoachingNote, 'id' | 'createdAt'>) => void;
}) {
  const threeDaysOut = (() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const [form, setForm] = useState({
    date:         TODAY,
    notes:        report.coachingFocus || report.issue,
    behaviors:    report.issue ? [report.issue.split('.')[0].trim()] : [] as string[],
    followUp:     report.actionPlan,
    followUpDue:  threeDaysOut,
    newBehavior:  '',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const addBehavior = () => {
    if (!form.newBehavior.trim()) return;
    setForm(f => ({ ...f, behaviors: [...f.behaviors, f.newBehavior.trim()], newBehavior: '' }));
  };
  const removeBehavior = (i: number) =>
    setForm(f => ({ ...f, behaviors: f.behaviors.filter((_, idx) => idx !== i) }));

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-500 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-ink-primary">Create Coaching Note</p>
            <p className="text-xs text-ink-muted">From EOD report · {repName}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="bg-navy-700 rounded-xl p-3 space-y-1.5 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">EOD Source</p>
          {report.coachingFocus && <p className="text-ink-secondary"><span className="text-ink-muted">Focus: </span>{report.coachingFocus}</p>}
          {report.actionPlan    && <p className="text-ink-secondary"><span className="text-ink-muted">Plan: </span>{report.actionPlan}</p>}
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Coaching Notes</label>
          <textarea className="input-base w-full resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Observed Behaviors</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.behaviors.map((b, i) => (
              <span key={i} className="flex items-center gap-1 bg-navy-600 border border-navy-500 rounded-lg px-2 py-0.5 text-xs text-ink-secondary">
                {b}
                <button onClick={() => removeBehavior(i)} className="text-ink-muted hover:text-signal-red"><X size={10} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="input-base flex-1 text-xs py-1.5 h-8" placeholder="Add behavior…"
              value={form.newBehavior}
              onChange={e => setForm(f => ({ ...f, newBehavior: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBehavior(); } }}
            />
            <button onClick={addBehavior} className="btn-secondary text-xs py-1.5 h-8 px-3">Add</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Follow-Up Action</label>
            <input className="input-base w-full text-xs" placeholder="Next steps…" value={form.followUp} onChange={e => set('followUp', e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Due Date</label>
            <input type="date" className="input-base w-full" value={form.followUpDue} onChange={e => set('followUpDue', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => onConfirm({
              repId: report.repId, date: form.date, type: 'coaching',
              notes: form.notes, behaviors: form.behaviors,
              followUp: form.followUp || undefined,
              followUpDue: form.followUpDue || undefined,
              status: 'open', eodReportId: report.id,
            })}
            className="btn-primary flex-1 justify-center"
          >
            <BookOpen size={14} /> Create Coaching Note
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Rep Coaching Thread Drawer ───────────────────────────────────────────────

function RepCoachingThreadDrawer({
  repId, onClose, onAddNote,
}: {
  repId:      string;
  onClose:    () => void;
  onAddNote:  (repId: string) => void;
}) {
  const { reps, stores, coachingNotes, repSummaries } = useData();

  const rep        = reps.find(r => r.id === repId);
  const repSummary = repSummaries.find(rs => rs.rep.id === repId);
  const store      = stores.find(s => s.id === rep?.defaultStoreId);

  const repNotes = useMemo(() => {
    const seen = new Set<string>();
    return coachingNotes
      .filter(n => n.repId === repId)
      .filter(n => {
        const key = `${n.id}|${n.date}|${n.notes.slice(0, 80).toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [coachingNotes, repId]);

  const openCount       = repNotes.filter(n => n.status === 'open').length;
  const overdueCount    = repNotes.filter(isOverdue).length;
  const recognitionCount= repNotes.filter(n => n.type === 'recognition').length;
  const lastCoached     = repNotes[0]?.date;

  const attPct = repSummary && repSummary.attachmentGoal > 0
    ? Math.round((repSummary.mtdAttachments / repSummary.attachmentGoal) * 100)
    : null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-navy-800 border-l border-navy-500 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-navy-500">
          <div>
            <p className="text-sm font-bold text-ink-primary">{rep?.name ?? 'Unknown Rep'}</p>
            <p className="text-xs text-ink-muted">{store?.name ?? 'No store assigned'}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-navy-600 border-b border-navy-500">
          {[
            { label: 'Open',        value: openCount,        cls: openCount > 0 ? 'text-blue-300' : 'text-ink-primary' },
            { label: 'Overdue',     value: overdueCount,     cls: overdueCount > 0 ? 'text-signal-red' : 'text-ink-primary' },
            { label: 'Recognition', value: recognitionCount, cls: 'text-signal-green' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="p-3 text-center bg-navy-800">
              <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
              <p className="text-[10px] text-ink-muted mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {repSummary && (
          <div className="px-4 py-3 border-b border-navy-500 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">MTD Performance</p>
            <div className="flex items-center gap-3">
              {attPct !== null && (
                <div>
                  <p className="text-lg font-bold text-ink-primary tabular-nums">{attPct}%</p>
                  <p className="text-[10px] text-ink-muted">Att Goal</p>
                </div>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                repSummary.isRed
                  ? 'bg-signal-red/20 text-signal-red'
                  : 'bg-signal-green/20 text-signal-green'
              }`}>
                {repSummary.isRed ? 'Red Zone' : 'On Track'}
              </span>
            </div>
            {lastCoached && (
              <p className="text-[11px] text-ink-muted">Last coached: {fmtDate(lastCoached)}</p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">
            Coaching History ({repNotes.length})
          </p>
          {repNotes.length === 0 && (
            <p className="text-xs text-ink-muted text-center py-6">No coaching notes yet for this rep.</p>
          )}
          {repNotes.slice(0, 25).map(note => {
            const parsed = parseNote(note);
            const overdue = isOverdue(note);
            return (
              <div
                key={note.id}
                className={`p-3 rounded-xl border space-y-1.5 ${
                  overdue          ? 'border-signal-red/30 bg-signal-red/5' :
                  note.type === 'recognition' ? 'border-signal-green/30 bg-signal-green/5' :
                  'border-navy-500 bg-navy-700'
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TYPE_BADGE[note.type].cls}`}>
                    {TYPE_BADGE[note.type].label}
                  </span>
                  {overdue && (
                    <span className="text-[10px] text-signal-red font-semibold flex items-center gap-0.5">
                      <AlertTriangle size={9} />Overdue
                    </span>
                  )}
                  <span className="text-[10px] text-ink-muted ml-auto">
                    {new Date(note.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className="text-[12px] text-ink-secondary line-clamp-2">{parsed.issueSummary}</p>
                <div className="flex flex-wrap gap-1">
                  {parsed.tags.map(tag => (
                    <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded border ${TAG_COLORS[tag] ?? 'bg-navy-600 text-ink-muted border-navy-500'}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-navy-500 flex gap-2">
          <button onClick={() => onAddNote(repId)} className="btn-primary flex-1 text-xs flex items-center gap-1.5 justify-center">
            <Plus size={12} />Add Note
          </button>
          <Link to={`/reps/${repId}`} className="btn-secondary text-xs px-3 flex items-center gap-1.5">
            <ExternalLink size={12} />View Rep
          </Link>
        </div>
      </div>
    </>
  );
}

// ─── Coaching Note Card ───────────────────────────────────────────────────────

interface NoteCardProps {
  note:            CoachingNote;
  repName:         string;
  storeName:       string;
  parsed:          ParsedNote;
  onClose:         () => void;
  onReopen:        () => void;
  onAddFollowUp:   () => void;
  onViewRepThread: () => void;
}

function CoachingNoteCard({
  note, repName, storeName, parsed,
  onClose, onReopen, onAddFollowUp, onViewRepThread,
}: NoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const overdue  = isOverdue(note);
  const dueToday = isDueToday(note);
  const typeBadge = TYPE_BADGE[note.type];

  const accentCls =
    overdue              ? 'border-l-signal-red' :
    dueToday             ? 'border-l-signal-amber' :
    note.type === 'recognition' ? 'border-l-signal-green' :
    note.eodReportId     ? 'border-l-purple-400' :
    'border-l-navy-400';

  const severityBadge = SEVERITY_BADGE[parsed.severity];
  const showSeverity  = parsed.severity !== 'info' && note.type !== 'recognition';
  const isLong        = note.notes.length > 120;

  function copyNoteText() {
    navigator.clipboard.writeText(note.notes).catch(() => {});
  }

  return (
    <div className={`card p-4 border-l-4 ${accentCls} space-y-3`}>

      {/* Badge row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${typeBadge.cls}`}>
          {typeBadge.label}
        </span>

        {note.status === 'closed' ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-navy-600 text-ink-muted border border-navy-500">
            Closed
          </span>
        ) : overdue ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-signal-red/20 text-signal-red border border-signal-red/30 flex items-center gap-1">
            <AlertTriangle size={9} />Overdue
          </span>
        ) : dueToday ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-signal-amber/20 text-signal-amber border border-signal-amber/30 flex items-center gap-1">
            <Clock size={9} />Due Today
          </span>
        ) : (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Open
          </span>
        )}

        {note.eodReportId && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-purple-400/20 text-purple-300 border border-purple-400/30">
            From EOD
          </span>
        )}

        {showSeverity && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${severityBadge.cls}`}>
            {severityBadge.label}
          </span>
        )}

        {parsed.tags.map(tag => (
          <span
            key={tag}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${TAG_COLORS[tag] ?? 'bg-navy-600 text-ink-muted border border-navy-500'}`}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Identity */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={onViewRepThread}
          className="text-sm font-semibold text-ink-primary hover:text-accent-orange transition-colors"
        >
          {repName}
        </button>
        {storeName && (
          <>
            <span className="text-ink-muted text-xs">·</span>
            <span className="text-xs text-ink-secondary">{storeName}</span>
          </>
        )}
        <span className="text-ink-muted text-xs">·</span>
        <span className="text-xs text-ink-muted">{fmtDate(note.date)}</span>
      </div>

      {/* Note text — summarized by default */}
      <div>
        <p className={`text-[13px] text-ink-secondary leading-relaxed ${!expanded && isLong ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}>
          {expanded ? note.notes : parsed.issueSummary}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-accent-orange hover:underline mt-1 flex items-center gap-0.5"
          >
            {expanded ? <><ChevronUp size={10} />Show less</> : <><ChevronDown size={10} />View full note</>}
          </button>
        )}
      </div>

      {/* Behaviors */}
      {note.behaviors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.behaviors.map((b, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-navy-700 text-ink-secondary border border-navy-500">
              {b}
            </span>
          ))}
        </div>
      )}

      {/* GREAT Focus */}
      {parsed.greatFocus.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[10px] text-ink-muted font-bold uppercase tracking-wider">GREAT:</span>
          {parsed.greatFocus.map(g => (
            <span key={g} className={`text-[11px] px-2 py-0.5 rounded-md border ${GREAT_COLORS[g] ?? 'bg-navy-600 text-ink-muted border-navy-500'}`}>
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Follow-up block */}
      {note.followUp && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
          overdue  ? 'bg-signal-red/10 border border-signal-red/20' :
          dueToday ? 'bg-signal-amber/10 border border-signal-amber/20' :
          'bg-navy-700 border border-navy-500'
        }`}>
          <Clock size={12} className={`mt-0.5 flex-shrink-0 ${overdue ? 'text-signal-red' : dueToday ? 'text-signal-amber' : 'text-ink-muted'}`} />
          <div>
            <p className="text-ink-secondary">{note.followUp}</p>
            {note.followUpDue && (
              <p className={`text-[11px] mt-0.5 font-medium ${overdue ? 'text-signal-red' : dueToday ? 'text-signal-amber' : 'text-ink-muted'}`}>
                Due {fmtDate(note.followUpDue)}{overdue ? ' — OVERDUE' : dueToday ? ' — TODAY' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recognition-specific extra row */}
      {note.type === 'recognition' && (
        <div className="flex items-center gap-2 bg-signal-green/5 border border-signal-green/20 rounded-lg px-3 py-2">
          <Star size={13} className="text-signal-green flex-shrink-0" />
          <p className="text-xs text-signal-green font-medium">Recognition note — share with rep</p>
          <button onClick={copyNoteText} className="ml-auto btn-ghost text-[11px] py-0.5 px-1.5 flex items-center gap-0.5 text-signal-green">
            <Copy size={10} />Copy
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-1 border-t border-navy-600 flex-wrap">
        {note.status === 'open' ? (
          <button onClick={onClose} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 text-signal-green hover:text-signal-green">
            <CheckCircle size={11} />Mark Closed
          </button>
        ) : (
          <button onClick={onReopen} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
            <RefreshCw size={11} />Reopen
          </button>
        )}
        <button onClick={onAddFollowUp} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
          <Plus size={11} />Add Follow-Up
        </button>
        <button onClick={onViewRepThread} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
          <User size={11} />Rep Thread
        </button>
        <Link to={`/reps/${note.repId}`} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 ml-auto">
          <ExternalLink size={11} />View Rep
        </Link>
      </div>
    </div>
  );
}

// ─── EOD Report Card ──────────────────────────────────────────────────────────

interface EODReportCardProps {
  report:               EODReport;
  repName:              string;
  storeName:            string;
  onMarkReviewed:       () => void;
  onCreateCoachingNote: () => void;
}

function EODReportCard({ report, repName, storeName, onMarkReviewed, onCreateCoachingNote }: EODReportCardProps) {
  const [expanded, setExpanded] = useState(false);

  const STATUS_META = {
    new:      { cls: 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30', label: 'New' },
    reviewed: { cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',             label: 'Reviewed' },
    actioned: { cls: 'bg-signal-green/20 text-signal-green border border-signal-green/30', label: 'Coaching Created' },
  };
  const statusMeta = STATUS_META[report.status];
  const hasMore = !!(report.actionPlan || report.wins);

  return (
    <div className="card p-4 border-l-4 border-l-purple-400 space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-purple-400/20 text-purple-300 border border-purple-400/30">
          EOD Report
        </span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${statusMeta.cls}`}>
          {statusMeta.label}
        </span>
        <span className="text-[11px] text-ink-muted ml-auto">
          {report.source === 'sheets' ? 'Synced from Sheets' : 'Manual entry'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Link
          to={`/reps/${report.repId}`}
          className="text-sm font-semibold text-ink-primary hover:text-accent-orange transition-colors"
        >
          {repName}
        </Link>
        {storeName && (
          <>
            <span className="text-ink-muted text-xs">·</span>
            <span className="text-xs text-ink-secondary">{storeName}</span>
          </>
        )}
        <span className="text-ink-muted text-xs">·</span>
        <span className="text-xs text-ink-muted">{fmtDate(report.date)}</span>
      </div>

      <div className="space-y-2">
        {report.issue && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-signal-red mb-0.5">Issue</p>
            <p className="text-[13px] text-ink-secondary leading-relaxed line-clamp-2">{report.issue}</p>
          </div>
        )}
        {report.coachingFocus && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent-orange mb-0.5">Coaching Focus</p>
            <p className="text-[13px] text-ink-secondary leading-relaxed line-clamp-2">{report.coachingFocus}</p>
          </div>
        )}
        {expanded && (
          <>
            {report.actionPlan && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-0.5">Action Plan</p>
                <p className="text-[13px] text-ink-muted leading-relaxed">{report.actionPlan}</p>
              </div>
            )}
            {report.wins && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-signal-green mb-0.5">Wins</p>
                <p className="text-[13px] text-ink-secondary leading-relaxed">{report.wins}</p>
              </div>
            )}
          </>
        )}
        {hasMore && (
          <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-accent-orange hover:underline flex items-center gap-0.5">
            {expanded ? <><ChevronUp size={10} />Less</> : <><ChevronDown size={10} />More details</>}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-navy-600 flex-wrap">
        {report.status === 'new' && (
          <button onClick={onMarkReviewed} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
            <CheckCircle size={11} />Mark Reviewed
          </button>
        )}
        {report.status !== 'actioned' && report.coachingFocus && (
          <button onClick={onCreateCoachingNote} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
            <BookOpen size={11} />Create Coaching Note
          </button>
        )}
        {report.status === 'actioned' && (
          <span className="text-xs text-signal-green flex items-center gap-1.5">
            <CheckCircle size={12} />Coaching note created
          </span>
        )}
        <Link to={`/reps/${report.repId}`} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 ml-auto">
          <ExternalLink size={11} />View Rep
        </Link>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachingHub() {
  const [searchParams] = useSearchParams();

  const {
    coachingNotes, eodReports, reps, stores,
    repSummaries,
    addCoachingNote, updateCoachingNote,
    addEODReport, updateEODReport,
    coachingQueue, updateCoachingQueueItem,
  } = useData();

  const initialTab: TabFilter = (() => {
    const src = searchParams.get('source') ?? searchParams.get('tab');
    if (src === 'eod' || src === 'from-eod') return 'from-eod';
    return 'all';
  })();

  const [tab,             setTab]             = useState<TabFilter>(initialTab);
  const [repFilter,       setRepFilter]       = useState('all');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [addNoteRepId,    setAddNoteRepId]    = useState<string | undefined>();
  const [addNoteType,     setAddNoteType]     = useState<CoachingNote['type'] | undefined>();
  const [showAddEOD,      setShowAddEOD]      = useState(false);
  const [coachingFromEOD, setCoachingFromEOD] = useState<EODReport | null>(null);
  const [selectedRepId,   setSelectedRepId]   = useState<string | null>(null);
  const [moreOpen,        setMoreOpen]        = useState(false);
  const [coachingItemId,  setCoachingItemId]  = useState<string | null>(null);
  const [coachNoteInput,  setCoachNoteInput]  = useState('');
  const moreRef = useRef<HTMLDivElement>(null);

  const activeReps = useMemo(() => reps.filter(r => r.active), [reps]);
  const repMap     = useMemo(() => Object.fromEntries(reps.map(r => [r.id, r])), [reps]);
  const storeMap   = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s])), [stores]);
  const eodMap     = useMemo(() => Object.fromEntries(eodReports.map(e => [e.id, e])), [eodReports]);
  void eodMap;

  // Deduplicated coaching notes — guards against sync adding the same note multiple times
  const deduplicatedNotes = useMemo(() => {
    const seenIds = new Set<string>();
    const seenContent = new Set<string>();
    return (coachingNotes ?? []).filter(n => {
      if (!n || !n.id) return false;
      if (seenIds.has(n.id)) return false;
      seenIds.add(n.id);
      const contentKey = `${n.repId}|${n.date}|${(n.notes ?? '').slice(0, 80).toLowerCase().trim()}`;
      if (seenContent.has(contentKey)) return false;
      seenContent.add(contentKey);
      return true;
    });
  }, [coachingNotes]);

  // Per-rep open note counts for priority scoring
  const repOpenCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of deduplicatedNotes) {
      if (n.status === 'open') counts[n.repId] = (counts[n.repId] ?? 0) + 1;
    }
    return counts;
  }, [deduplicatedNotes]);

  // Cache of parsed note data (tags, severity, GREAT, summary)
  const parsedMap = useMemo(() => {
    const map: Record<string, ParsedNote> = {};
    for (const n of deduplicatedNotes) map[n.id] = parseNote(n);
    return map;
  }, [deduplicatedNotes]);

  // Summary counts
  const counts = useMemo(() => ({
    open:           deduplicatedNotes.filter(n => n.status === 'open').length,
    overdue:        deduplicatedNotes.filter(isOverdue).length,
    dueToday:       deduplicatedNotes.filter(isDueToday).length,
    fromEod:        deduplicatedNotes.filter(n => !!n.eodReportId).length,
    eodNew:         eodReports.filter(r => r.status === 'new').length,
    thisMonth:      deduplicatedNotes.filter(n => n.date.startsWith(MONTH_PREFIX)).length,
    recognition:    deduplicatedNotes.filter(n => n.type === 'recognition').length,
    closedThisMonth: deduplicatedNotes.filter(n => n.status === 'closed' && n.date.startsWith(MONTH_PREFIX)).length,
  }), [deduplicatedNotes, eodReports]);

  // Tab badge counts
  const tabCounts = useMemo<Record<TabFilter, number>>(() => ({
    all:         counts.open,
    overdue:     counts.overdue,
    'due-today': counts.dueToday,
    'from-eod':  counts.fromEod + counts.eodNew,
    recognition: counts.recognition,
    policy:      deduplicatedNotes.filter(n => {
      const p = parsedMap[n.id];
      return p && p.tags.some(t => ['Fraud Flag', 'Form Required', 'Policy Issue'].includes(t));
    }).length,
    closed:      deduplicatedNotes.filter(n => n.status === 'closed').length,
  }), [deduplicatedNotes, counts, parsedMap]);

  // Priority queue — top 5 highest-priority open notes
  const priorityQueue = useMemo(() => {
    return deduplicatedNotes
      .filter(n => n.status === 'open')
      .map(n => ({
        note: n,
        score: getPriorityScore(n, parsedMap[n.id] ?? parseNote(n), repOpenCounts[n.repId] ?? 0),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ note }) => note);
  }, [deduplicatedNotes, parsedMap, repOpenCounts]);

  // Unactioned EOD reports for "From EOD" tab
  const unactionedEODs = useMemo(() => {
    if (tab !== 'from-eod') return [];
    let reports = eodReports.filter(r => r.status !== 'actioned');
    if (repFilter !== 'all')   reports = reports.filter(r => r.repId === repFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      reports = reports.filter(r =>
        repMap[r.repId]?.name.toLowerCase().includes(q) ||
        r.issue.toLowerCase().includes(q) ||
        r.coachingFocus.toLowerCase().includes(q),
      );
    }
    return reports.sort((a, b) => b.date.localeCompare(a.date));
  }, [eodReports, tab, repFilter, searchQuery, repMap]);

  // Filtered and sorted coaching notes for main list
  const filteredNotes = useMemo(() => {
    let notes = [...deduplicatedNotes];

    if      (tab === 'all')         notes = notes.filter(n => n.status === 'open');
    else if (tab === 'overdue')     notes = notes.filter(isOverdue);
    else if (tab === 'due-today')   notes = notes.filter(isDueToday);
    else if (tab === 'from-eod')    notes = notes.filter(n => !!n.eodReportId);
    else if (tab === 'recognition') notes = notes.filter(n => n.type === 'recognition');
    else if (tab === 'closed')      notes = notes.filter(n => n.status === 'closed');
    else if (tab === 'policy')      notes = notes.filter(n => {
      const p = parsedMap[n.id];
      return p && p.tags.some(t => ['Fraud Flag', 'Form Required', 'Policy Issue'].includes(t));
    });

    if (repFilter !== 'all') notes = notes.filter(n => n.repId === repFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      notes = notes.filter(n => {
        const rep   = repMap[n.repId];
        const store = storeMap[rep?.defaultStoreId ?? ''];
        return (
          rep?.name.toLowerCase().includes(q) ||
          store?.name.toLowerCase().includes(q) ||
          n.notes.toLowerCase().includes(q) ||
          n.behaviors.some(b => b.toLowerCase().includes(q))
        );
      });
    }

    // Overdue first → due today → then newest date
    notes.sort((a, b) => {
      const scoreA = isOverdue(a) ? 2 : isDueToday(a) ? 1 : 0;
      const scoreB = isOverdue(b) ? 2 : isDueToday(b) ? 1 : 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.date.localeCompare(a.date);
    });

    return notes;
  }, [deduplicatedNotes, tab, repFilter, searchQuery, parsedMap, repMap, storeMap]);

  // Close More menu on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Handlers
  function handleCloseNote(id: string)  { updateCoachingNote(id, { status: 'closed' }); }
  function handleReopenNote(id: string) { updateCoachingNote(id, { status: 'open'   }); }

  function handleAddFollowUp(repId: string) {
    setAddNoteRepId(repId);
    setAddNoteType('follow-up');
    setShowAddModal(true);
  }

  function handleOpenAddNote(repId?: string) {
    setAddNoteRepId(repId);
    setAddNoteType(undefined);
    setShowAddModal(true);
  }

  function handleCoachingFromEOD(report: EODReport, note: Omit<CoachingNote, 'id' | 'createdAt'>) {
    addCoachingNote({ ...note });
    updateEODReport(report.id, { status: 'actioned' });
    setCoachingFromEOD(null);
  }

  function exportCoachingLog() {
    const rows = coachingNotes.map(n => {
      const rep = repMap[n.repId];
      return [n.date, rep?.name ?? '', n.type, n.status, `"${n.notes.replace(/"/g, '""')}"`].join(',');
    });
    const csv  = ['Date,Rep,Type,Status,Notes', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `coaching-log-${TODAY}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Rep + store name helpers
  function getRepName(repId: string)  { return repMap[repId]?.name ?? 'Unknown Rep'; }
  function getStoreName(repId: string) {
    const rep = repMap[repId];
    return rep ? (storeMap[rep.defaultStoreId]?.name ?? '') : '';
  }
  function getEODStoreName(report: EODReport) {
    return storeMap[report.storeId]?.name
      ?? storeMap[repMap[report.repId]?.defaultStoreId ?? '']?.name
      ?? '';
  }

  // Derived for recognition nudge
  const lowRecognition = counts.recognition <= 1;

  // Coaching queue helpers
  const activeQueueItems = useMemo(() =>
    (coachingQueue ?? [])
      .filter(q => q.status === 'open' || q.status === 'inProgress')
      .sort((a, b) => a.priority - b.priority || a.dueDate.localeCompare(b.dueDate)),
  [coachingQueue]);

  function markCoached(item: CoachingQueueItem) {
    const now = new Date().toISOString();
    updateCoachingQueueItem(item.id, { status: 'coached', completedAt: now, coachingNote: coachNoteInput.trim() || undefined });
    if (coachNoteInput.trim()) {
      addCoachingNote({
        repId: item.repId,
        date: item.dueDate,
        type: 'coaching',
        notes: coachNoteInput.trim(),
        behaviors: [],
        status: 'open',
      });
    }
    setCoachingItemId(null);
    setCoachNoteInput('');
  }

  // Suppress eodMap usage warning — used for linking EOD source dates in future
  void eodMap;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

      {/* ── 0. Coaching Queue ───────────────────────────────────────────── */}
      {activeQueueItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <ShieldAlert size={15} className="text-accent-orange" />
              Coaching Queue
              <span className="text-xs font-normal text-ink-muted">({activeQueueItems.length} open)</span>
            </p>
          </div>
          <div className="space-y-2">
            {activeQueueItems.map(item => {
              const isMarking = coachingItemId === item.id;
              const isOverdueItem = item.dueDate < TODAY;
              return (
                <div key={item.id} className={`card p-3 border-l-4 ${isOverdueItem ? 'border-l-signal-red' : 'border-l-accent-orange'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-sm font-bold text-ink-primary">{item.repName}</p>
                        <span className="text-[10px] text-ink-muted">{item.storeName}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          item.priority <= 2 ? 'bg-signal-red/15 text-signal-red' :
                          item.priority === 3 ? 'bg-signal-amber/15 text-signal-amber' :
                          'bg-navy-500 text-ink-muted'
                        }`}>P{item.priority}</span>
                        {isOverdueItem && <span className="text-[10px] text-signal-red font-semibold">Overdue</span>}
                      </div>
                      <p className="text-xs text-ink-secondary">{item.reason}</p>
                      {item.greatFocus && (
                        <p className="text-[11px] text-ink-muted mt-0.5">GREAT Focus: <span className="text-accent-orange">{item.greatFocus}</span></p>
                      )}
                      {isMarking && (
                        <div className="mt-2 space-y-1.5">
                          <input
                            className="input-base w-full text-xs"
                            placeholder="Optional coaching note..."
                            value={coachNoteInput}
                            onChange={e => setCoachNoteInput(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => markCoached(item)} className="btn-primary text-xs py-1 px-3">Mark Coached</button>
                            <button onClick={() => { setCoachingItemId(null); setCoachNoteInput(''); }} className="btn-secondary text-xs py-1 px-3">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                    {!isMarking && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setCoachingItemId(item.id); setCoachNoteInput(''); }}
                          className="btn-primary text-xs !py-1 !px-2.5"
                        >Coached</button>
                        <button
                          onClick={() => updateCoachingQueueItem(item.id, { status: 'closed' })}
                          className="btn-ghost text-xs !py-1 !px-2"
                        ><X size={11} /></button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 1. Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <BookOpen size={20} className="text-accent-orange" />
            <h1 className="text-2xl font-bold text-ink-primary">Coaching Hub</h1>
            {counts.overdue > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold bg-signal-red text-white rounded-full px-2 py-0.5">
                <AlertTriangle size={10} />{counts.overdue} overdue
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">Coaching notes, EOD observations, follow-ups, and recognition</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setTab('from-eod'); setShowAddEOD(true); }}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <FileText size={13} />Add EOD Report
          </button>
          <button
            onClick={() => handleOpenAddNote()}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <Plus size={14} />Add Note
          </button>

          {/* More menu */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setMoreOpen(o => !o)}
              className="btn-ghost p-2 flex items-center"
            >
              <MoreVertical size={16} />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-52 bg-navy-700 border border-navy-500 rounded-xl shadow-xl py-1 text-sm">
                {[
                  { label: 'View Overdue',    action: () => { setTab('overdue');     setMoreOpen(false); }, icon: <AlertTriangle size={13} className="text-signal-red" /> },
                  { label: 'View Recognition',action: () => { setTab('recognition'); setMoreOpen(false); }, icon: <Star size={13} className="text-signal-green" /> },
                  { label: 'View EOD Notes',  action: () => { setTab('from-eod');    setMoreOpen(false); }, icon: <FileText size={13} className="text-purple-300" /> },
                  { label: 'Policy / Flags',  action: () => { setTab('policy');      setMoreOpen(false); }, icon: <ShieldAlert size={13} className="text-orange-300" /> },
                  { label: 'Export Log',      action: () => { exportCoachingLog();   setMoreOpen(false); }, icon: <Flag size={13} className="text-ink-muted" /> },
                ].map(({ label, action, icon }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink-secondary hover:bg-navy-600 hover:text-ink-primary transition-colors"
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Coaching Command Summary ────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {[
          {
            label: 'Open Notes', value: counts.open,
            sub: 'Needs review or follow-up',
            valCls: 'text-blue-300',
            borderCls: 'border-t-blue-500/60',
            onClick: () => setTab('all'),
          },
          {
            label: 'Overdue', value: counts.overdue,
            sub: 'Handle first',
            valCls: counts.overdue > 0 ? 'text-signal-red' : 'text-ink-primary',
            borderCls: counts.overdue > 0 ? 'border-t-signal-red' : 'border-t-navy-500',
            onClick: () => setTab('overdue'),
          },
          {
            label: 'Due Today', value: counts.dueToday,
            sub: 'Coaching actions due',
            valCls: counts.dueToday > 0 ? 'text-signal-amber' : 'text-ink-primary',
            borderCls: counts.dueToday > 0 ? 'border-t-signal-amber' : 'border-t-navy-500',
            onClick: () => setTab('due-today'),
          },
          {
            label: 'From EOD', value: counts.fromEod,
            sub: 'EOD-derived notes',
            valCls: 'text-purple-300',
            borderCls: 'border-t-purple-400/60',
            onClick: () => setTab('from-eod'),
          },
          {
            label: 'This Month', value: counts.thisMonth,
            sub: 'New coaching activity',
            valCls: 'text-ink-primary',
            borderCls: 'border-t-navy-500',
            onClick: () => {},
          },
          {
            label: 'Recognition', value: counts.recognition,
            sub: 'Positive notes',
            valCls: 'text-signal-green',
            borderCls: 'border-t-signal-green/60',
            onClick: () => setTab('recognition'),
          },
          {
            label: 'Closed / Mo', value: counts.closedThisMonth,
            sub: 'Completed this month',
            valCls: 'text-ink-muted',
            borderCls: 'border-t-navy-500',
            onClick: () => setTab('closed'),
          },
        ].map(({ label, value, sub, valCls, borderCls, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className={`card-sm p-3 text-center border-t-2 ${borderCls} hover:bg-navy-700 transition-colors cursor-pointer`}
          >
            <p className={`text-2xl font-bold tabular-nums ${valCls}`}>{value}</p>
            <p className="metric-label mt-0.5">{label}</p>
            <p className="text-[10px] text-ink-muted mt-0.5 leading-tight hidden lg:block">{sub}</p>
          </button>
        ))}
      </div>

      {/* ── 3. Priority Follow-Up Queue ────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Flag size={14} className="text-signal-red" />
          <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wider">Priority Follow-Up Queue</h2>
          {priorityQueue.length > 0 && (
            <span className="text-[10px] font-bold bg-signal-red/20 text-signal-red border border-signal-red/30 rounded-full px-2 py-0.5">
              {priorityQueue.length} item{priorityQueue.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {priorityQueue.length === 0 ? (
          <div className="card p-5 flex items-center gap-3">
            <CheckCircle size={20} className="text-signal-green flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-signal-green">No high-priority follow-ups</p>
              <p className="text-xs text-ink-muted mt-0.5">
                Review new EOD observations, check recognition opportunities, or add a coaching note.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {priorityQueue.map(note => {
              const parsed  = parsedMap[note.id] ?? parseNote(note);
              const overdue = isOverdue(note);
              const dueToday= isDueToday(note);
              const repSummary = repSummaries.find(rs => rs.rep.id === note.repId);
              return (
                <div
                  key={note.id}
                  className={`card p-4 border-l-4 space-y-2.5 ${
                    parsed.severity === 'critical' ? 'border-l-signal-red' :
                    overdue ? 'border-l-signal-red' :
                    dueToday ? 'border-l-signal-amber' :
                    'border-l-orange-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setSelectedRepId(note.repId)}
                        className="text-sm font-bold text-ink-primary hover:text-accent-orange transition-colors"
                      >
                        {getRepName(note.repId)}
                      </button>
                      <span className="text-xs text-ink-secondary">{getStoreName(note.repId)}</span>
                      {repSummary?.isRed && (
                        <span className="text-[10px] font-bold text-signal-red">Red Zone</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {overdue  && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-signal-red/20 text-signal-red border border-signal-red/30 flex items-center gap-0.5"><AlertTriangle size={9} />Overdue</span>}
                      {dueToday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-signal-amber/20 text-signal-amber border border-signal-amber/30 flex items-center gap-0.5"><Clock size={9} />Due Today</span>}
                      {note.eodReportId && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-400/20 text-purple-300 border border-purple-400/30">From EOD</span>}
                      {parsed.tags.slice(0, 2).map(tag => (
                        <span key={tag} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TAG_COLORS[tag] ?? 'bg-navy-600 text-ink-muted border border-navy-500'}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-[13px] text-ink-secondary leading-relaxed line-clamp-2">
                    {parsed.issueSummary}
                  </p>

                  {note.followUp && (
                    <p className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-signal-red' : 'text-signal-amber'}`}>
                      <Clock size={10} />
                      {note.followUp}
                      {note.followUpDue && ` — Due ${fmtDate(note.followUpDue)}`}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 pt-1 border-t border-navy-600 flex-wrap">
                    <button onClick={() => handleCloseNote(note.id)} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 text-signal-green">
                      <CheckCircle size={11} />Mark Closed
                    </button>
                    <button onClick={() => handleAddFollowUp(note.repId)} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
                      <Plus size={11} />Add Follow-Up
                    </button>
                    <button onClick={() => setSelectedRepId(note.repId)} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
                      <User size={11} />Rep Thread
                    </button>
                    <Link to={`/reps/${note.repId}`} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 ml-auto">
                      <ExternalLink size={11} />View Rep
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. Filters ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {TAB_LABELS.map(({ key, label }) => {
            const count = tabCounts[key];
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  tab === key
                    ? 'bg-accent-orange text-white border-accent-orange'
                    : 'bg-navy-700 text-ink-secondary border-navy-500 hover:border-navy-400 hover:text-ink-primary'
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-px ${
                    tab === key ? 'bg-white/25 text-white' : 'bg-navy-600 text-ink-muted'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes, reps, stores…"
              className="input-base pl-8 pr-3 py-1.5 text-xs w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="relative flex-shrink-0">
            <select
              value={repFilter}
              onChange={e => setRepFilter(e.target.value)}
              className="input-base pl-3 pr-8 py-1.5 text-xs appearance-none cursor-pointer min-w-[150px]"
            >
              <option value="all">All Reps</option>
              {activeReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ── 5. Notes List ──────────────────────────────────────────────── */}

      {/* EOD sub-section: unactioned reports shown first in "From EOD" view */}
      {tab === 'from-eod' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Unreviewed EOD Reports
            </p>
            {unactionedEODs.length > 0 && (
              <span className="text-[10px] font-bold bg-signal-amber/20 text-signal-amber border border-signal-amber/30 rounded-full px-2 py-0.5">
                {unactionedEODs.length} need action
              </span>
            )}
            <button
              onClick={() => setShowAddEOD(true)}
              className="ml-auto btn-secondary text-xs flex items-center gap-1.5"
            >
              <Plus size={12} />Add EOD Report
            </button>
          </div>

          {unactionedEODs.length === 0 ? (
            <div className="card p-4 flex items-center gap-2 text-sm text-ink-muted">
              <CheckCircle size={16} className="text-signal-green" />
              All EOD reports have been reviewed and actioned.
            </div>
          ) : (
            unactionedEODs.map(report => (
              <EODReportCard
                key={report.id}
                report={report}
                repName={getRepName(report.repId)}
                storeName={getEODStoreName(report)}
                onMarkReviewed={() => updateEODReport(report.id, { status: 'reviewed' })}
                onCreateCoachingNote={() => setCoachingFromEOD(report)}
              />
            ))
          )}

          {filteredNotes.length > 0 && (
            <div className="flex items-center gap-3 pt-1">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Coaching Notes from EOD ({filteredNotes.length})
              </p>
              <div className="flex-1 h-px bg-navy-600" />
            </div>
          )}
        </div>
      )}

      {/* Recognition low nudge */}
      {tab === 'recognition' && lowRecognition && counts.recognition === 0 && (
        <div className="card p-4 border border-signal-green/20 bg-signal-green/5 flex items-center gap-3">
          <Star size={18} className="text-signal-green flex-shrink-0" />
          <p className="text-sm text-ink-secondary">
            No recognition notes yet. Consider recognizing top reps from the leaderboard.
          </p>
          <button onClick={() => handleOpenAddNote()} className="btn-secondary text-xs flex-shrink-0">
            <Plus size={12} />Add Recognition
          </button>
        </div>
      )}
      {tab === 'recognition' && lowRecognition && counts.recognition === 1 && (
        <div className="card-sm px-3 py-2 flex items-center gap-2 border-signal-green/20 bg-signal-green/5">
          <Star size={13} className="text-signal-green" />
          <p className="text-xs text-ink-muted">
            Only 1 recognition note this period. Consider recognizing more top performers.
          </p>
        </div>
      )}

      {/* Main notes list */}
      {filteredNotes.length === 0 && !(tab === 'from-eod' && unactionedEODs.length > 0) ? (
        <div className="card p-10 text-center">
          <BookOpen size={32} className="text-ink-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold text-ink-secondary">No coaching notes found</p>
          <p className="text-xs text-ink-muted mt-1 mb-4">
            {tab === 'all'
              ? 'Add a note or create one from an EOD report.'
              : 'Try changing the filter or search above.'}
          </p>
          {tab === 'all' && (
            <button onClick={() => handleOpenAddNote()} className="btn-primary text-sm inline-flex items-center gap-1.5">
              <Plus size={14} />Add First Note
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map(note => {
            const parsed    = parsedMap[note.id] ?? parseNote(note);
            const repName   = getRepName(note.repId);
            const storeName = getStoreName(note.repId);
            return (
              <CoachingNoteCard
                key={note.id}
                note={note}
                repName={repName}
                storeName={storeName}
                parsed={parsed}
                onClose={()         => handleCloseNote(note.id)}
                onReopen={()        => handleReopenNote(note.id)}
                onAddFollowUp={()   => handleAddFollowUp(note.repId)}
                onViewRepThread={()  => setSelectedRepId(note.repId)}
              />
            );
          })}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showAddModal && (
        <AddNoteModal
          onClose={() => { setShowAddModal(false); setAddNoteRepId(undefined); setAddNoteType(undefined); }}
          onAdd={addCoachingNote}
          reps={activeReps}
          initialRepId={addNoteRepId}
          initialType={addNoteType}
        />
      )}

      {showAddEOD && (
        <AddEODModal
          onClose={() => setShowAddEOD(false)}
          onAdd={r => { addEODReport(r); setShowAddEOD(false); }}
        />
      )}

      {coachingFromEOD && (
        <CreateCoachingFromEODModal
          report={coachingFromEOD}
          repName={getRepName(coachingFromEOD.repId)}
          onClose={() => setCoachingFromEOD(null)}
          onConfirm={note => handleCoachingFromEOD(coachingFromEOD, note)}
        />
      )}

      {/* ── Rep Coaching Thread Drawer ─────────────────────────────────── */}
      {selectedRepId && (
        <RepCoachingThreadDrawer
          repId={selectedRepId}
          onClose={() => setSelectedRepId(null)}
          onAddNote={repId => { setSelectedRepId(null); handleOpenAddNote(repId); }}
        />
      )}
    </div>
  );
}
