import { useState, useRef } from 'react';
import { X, MapPin, ChevronDown, Check } from 'lucide-react';
import { useData } from '../context/DataContext';
import type { Visit, VisitType, PlanVisitPrefill } from '../types';

const VISIT_TYPES: VisitType[] = [
  'Sales Focused Visit',
  'GREAT Observation',
  'Coaching Visit',
  'EOD Follow-Up',
  'Store Check-In',
  'Schedule/Coverage Visit',
  'Month-End Push',
  'AE Ride-Along',
  'Event',
];

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function RepMultiSelect({
  reps, selected, onChange,
}: {
  reps: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(r => r !== id) : [...selected, id]);
  const label = selected.length === 0
    ? 'Select reps visited…'
    : selected.map(id => reps.find(r => r.id === id)?.name ?? id).join(', ');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input-base w-full flex items-center justify-between text-left"
      >
        <span className={`truncate text-sm ${selected.length === 0 ? 'text-ink-muted' : 'text-ink-primary'}`}>{label}</span>
        <ChevronDown size={13} className={`text-ink-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-navy-700 border border-navy-500 rounded-xl shadow-xl max-h-48 overflow-y-auto py-1">
            {reps.length === 0 && (
              <p className="px-3 py-2 text-xs text-ink-muted">No active reps</p>
            )}
            {reps.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-navy-600 hover:text-ink-primary transition-colors"
              >
                <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border ${selected.includes(r.id) ? 'bg-accent-orange border-accent-orange' : 'border-navy-400'}`}>
                  {selected.includes(r.id) && <Check size={10} className="text-white" />}
                </span>
                {r.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PlanVisitModal({
  prefill,
  onClose,
}: {
  prefill?: PlanVisitPrefill;
  onClose: () => void;
}) {
  const { stores, reps, addVisit } = useData();
  const submittingRef = useRef(false);
  const activeReps = reps.filter(r => r.active).sort((a, b) => a.name.localeCompare(b.name));

  const [form, setForm] = useState({
    date:        prefill?.date    ?? localToday(),
    storeId:     prefill?.storeId ?? '',
    visitType:   'Sales Focused Visit' as VisitType,
    notes:       prefill?.notes   ?? '',
    status:      'planned' as Visit['status'],
    startTime:   '',
    endTime:     '',
    focusArea:   prefill?.focusArea ?? '',
    repIds:      prefill?.repIds ?? (prefill?.repId ? [prefill.repId] : []) as string[],
  });

  const submit = () => {
    if (!form.storeId || submittingRef.current) return;
    submittingRef.current = true;
    addVisit({
      date:              form.date,
      storeId:           form.storeId,
      visitType:         form.visitType,
      status:            form.status,
      notes:             form.notes,
      startTime:         form.startTime || undefined,
      endTime:           form.endTime || undefined,
      focusArea:         form.focusArea || undefined,
      repsObserved:      form.repIds.length > 0 ? form.repIds : [],
      timeInStore:       '',
      coachingCompleted: false,
      redFlagsFound:     [],
      followUpTaskIds:   [],
      source:            'manual',
    } as Omit<Visit, 'id' | 'createdAt'>);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy-700 rounded-2xl border border-navy-500 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-accent-orange" />
            <p className="text-base font-bold text-ink-primary">Plan Visit</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Date</label>
            <input
              type="date"
              className="input-base w-full"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Status</label>
            <select
              className="input-base w-full"
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as Visit['status'] }))}
            >
              <option value="planned">Planned</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Store *</label>
          <select
            className="input-base w-full"
            value={form.storeId}
            onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}
          >
            <option value="">Select store</option>
            {stores.filter(s => s.active).map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Reps Visited</label>
          <RepMultiSelect
            reps={activeReps}
            selected={form.repIds}
            onChange={ids => setForm(f => ({ ...f, repIds: ids }))}
          />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Visit Type</label>
          <select
            className="input-base w-full"
            value={form.visitType}
            onChange={e => setForm(f => ({ ...f, visitType: e.target.value as VisitType }))}
          >
            {VISIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Start Time</label>
            <input
              type="time"
              className="input-base w-full"
              value={form.startTime}
              onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">End Time</label>
            <input
              type="time"
              className="input-base w-full"
              value={form.endTime}
              onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Focus Area</label>
          <input
            className="input-base w-full"
            placeholder="e.g. BP Pitch, ATU Close, Greet + Engage"
            value={form.focusArea}
            onChange={e => setForm(f => ({ ...f, focusArea: e.target.value }))}
          />
        </div>

        <div>
          <label className="text-xs text-ink-muted block mb-1">Notes</label>
          <textarea
            className="input-base w-full resize-none"
            rows={2}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="What do you plan to observe or coach?"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={submit}
            disabled={!form.storeId}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {form.status === 'planned' ? 'Plan Visit' : 'Log Visit'}
          </button>
        </div>
      </div>
    </div>
  );
}
