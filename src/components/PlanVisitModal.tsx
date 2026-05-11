import { useState, useRef } from 'react';
import { X, MapPin } from 'lucide-react';
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

export function PlanVisitModal({
  prefill,
  onClose,
}: {
  prefill?: PlanVisitPrefill;
  onClose: () => void;
}) {
  const { stores, addVisit } = useData();
  const submittingRef = useRef(false);

  const [form, setForm] = useState({
    date:      prefill?.date    ?? localToday(),
    storeId:   prefill?.storeId ?? '',
    visitType: 'Sales Focused Visit' as VisitType,
    notes:     prefill?.notes   ?? '',
    status:    'planned' as Visit['status'],
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
      timeInStore:       '',
      coachingCompleted: false,
      repsObserved:      [],
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
          <label className="text-xs text-ink-muted block mb-1">Visit Type</label>
          <select
            className="input-base w-full"
            value={form.visitType}
            onChange={e => setForm(f => ({ ...f, visitType: e.target.value as VisitType }))}
          >
            {VISIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
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
