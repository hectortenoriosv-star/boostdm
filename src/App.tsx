import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Agenda from './pages/Agenda';
import DailyNumbers from './pages/DailyNumbers';
import Stores from './pages/Stores';
import StoreProfile from './pages/StoreProfile';
import Reps from './pages/Reps';
import RepProfile from './pages/RepProfile';
import Visits from './pages/Visits';
import Tasks from './pages/Tasks';
import Schedule from './pages/Schedule';
import SettingsPage from './pages/Settings';
import CoachingHub from './pages/CoachingHub';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/daily-numbers" element={<DailyNumbers />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/stores/:id" element={<StoreProfile />} />
            <Route path="/reps" element={<Reps />} />
            <Route path="/reps/:id" element={<RepProfile />} />
            <Route path="/visits" element={<Visits />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/eod-reports" element={<Navigate to="/coaching?tab=from-eod" replace />} />
            <Route path="/coaching" element={<CoachingHub />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}
