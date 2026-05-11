import { useNavigate } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-signal-red/10 border border-signal-red/20 flex items-center justify-center mb-4">
        <AlertTriangle size={28} className="text-signal-red" />
      </div>
      <p className="text-xl font-bold text-ink-primary mb-1">Page Not Found</p>
      <p className="text-sm text-ink-secondary mb-6">This area of the Command Center doesn't exist yet.</p>
      <button className="btn-primary" onClick={() => navigate('/')}>
        <Home size={14} />
        Return to Dashboard
      </button>
    </div>
  );
}
