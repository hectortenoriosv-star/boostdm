import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useData } from '../../context/DataContext';
import { PlanVisitModal } from '../PlanVisitModal';

export default function Layout() {
  const { planVisitPrefill, closePlanVisit } = useData();

  return (
    <div className="flex min-h-screen w-full bg-navy-900">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col min-h-screen">
        <div className="flex-1 overflow-y-auto page-container">
          <Outlet />
        </div>
      </main>
      {planVisitPrefill !== null && (
        <PlanVisitModal
          prefill={planVisitPrefill}
          onClose={closePlanVisit}
        />
      )}
    </div>
  );
}
