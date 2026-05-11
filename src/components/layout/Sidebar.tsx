import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, BarChart3,
  MapPin, Store, Users,
  CheckSquare, Clock, BookOpen,
  Settings, ChevronLeft, ChevronRight, Zap,
} from 'lucide-react';
import { useData } from '../../context/DataContext';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badgeFn?: () => number | undefined;
  alertFn?: () => boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { tasks, repSummaries, storeSummaries, visitStats, settings, eodReports, coachingNotes } = useData();

  const openTaskCount = tasks.filter(t => t.status !== 'completed' && t.priority === 'urgent').length;
  const unreviewedEOD = (eodReports ?? []).filter(e => e.status === 'new').length;
  const _now2 = new Date();
  const _todayLocal = `${_now2.getFullYear()}-${String(_now2.getMonth() + 1).padStart(2, '0')}-${String(_now2.getDate()).padStart(2, '0')}`;
  const overdueCoaching = (coachingNotes ?? []).filter(n => n.status === 'open' && !!n.followUpDue && n.followUpDue < _todayLocal).length;
  const coachingBadge = overdueCoaching + unreviewedEOD;
  const redRepCount = repSummaries.filter(r => r.isRed).length;
  const redStoreCount = storeSummaries.filter(s => s.isRed).length;
  const urgentCount = redRepCount + redStoreCount + openTaskCount;

  const navGroups: NavGroup[] = [
    {
      label: 'Command',
      items: [
        {
          label: 'Dashboard',
          path: '/',
          icon: LayoutDashboard,
          badgeFn: () => urgentCount > 0 ? urgentCount : undefined,
        },
        { label: 'Today\'s Agenda', path: '/agenda', icon: CalendarDays },
        { label: 'Daily Numbers', path: '/daily-numbers', icon: BarChart3 },
      ],
    },
    {
      label: 'Field Execution',
      items: [
        {
          label: 'Store Visits',
          path: '/visits',
          icon: MapPin,
          alertFn: () => !visitStats.onPace,
        },
        {
          label: 'Stores',
          path: '/stores',
          icon: Store,
          badgeFn: () => redStoreCount > 0 ? redStoreCount : undefined,
        },
        {
          label: 'Reps',
          path: '/reps',
          icon: Users,
          badgeFn: () => redRepCount > 0 ? redRepCount : undefined,
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        {
          label: 'Tasks',
          path: '/tasks',
          icon: CheckSquare,
          badgeFn: () => {
            const open = tasks.filter(t => t.status !== 'completed').length;
            return open > 0 ? open : undefined;
          },
        },
        { label: 'Schedule', path: '/schedule', icon: Clock },
        {
          label: 'Coaching Hub',
          path: '/coaching',
          icon: BookOpen,
          badgeFn: () => coachingBadge > 0 ? coachingBadge : undefined,
          alertFn: () => overdueCoaching > 0,
        },
      ],
    },
  ];

  const bottomItems: NavItem[] = [
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const districtPct = Math.round(
    (repSummaries.reduce((s, r) => s + r.mtdAttachments, 0) /
      repSummaries.reduce((s, r) => s + r.attachmentGoal, 0) * 100) || 0
  );

  return (
    <aside
      className={`flex flex-col bg-navy-900 border-r border-navy-500 transition-all duration-200 flex-shrink-0 sticky top-0 h-screen ${collapsed ? 'w-16' : 'w-60'}`}
    >
      {/* Brand */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-navy-500 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-orange to-accent-orange-light flex items-center justify-center flex-shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink-primary leading-tight">DM Dashboard</p>
            <p className="text-[10px] text-ink-muted leading-tight">Hector's Command Center</p>
          </div>
        )}
      </div>

      {/* District Snapshot */}
      {!collapsed && (
        <div className="mx-3 my-3 p-3 bg-navy-700 rounded-xl border border-navy-500">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">District MTD</p>
            {settings.districtRank && (
              <span className="text-[10px] font-bold text-accent-orange">Rank #{settings.districtRank}</span>
            )}
          </div>
          <div className="flex items-end justify-between">
            <p className="text-lg font-bold text-ink-primary">{districtPct}%</p>
            <p className="text-[10px] text-ink-muted">of goal</p>
          </div>
          <div className="mt-1.5 h-1 bg-navy-500 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${districtPct >= 90 ? 'bg-signal-green' : districtPct >= 70 ? 'bg-signal-amber' : 'bg-signal-red'}`}
              style={{ width: `${Math.min(100, districtPct)}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            {redRepCount > 0 && (
              <span className="text-[10px] text-signal-red font-semibold">{redRepCount} reps red</span>
            )}
            {redStoreCount > 0 && (
              <span className="text-[10px] text-signal-red font-semibold">{redStoreCount} stores red</span>
            )}
            {redRepCount === 0 && redStoreCount === 0 && (
              <span className="text-[10px] text-signal-green font-semibold">No red flags</span>
            )}
          </div>
        </div>
      )}

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {navGroups.map(group => (
          <div key={group.label}>
            {!collapsed && <p className="section-label">{group.label}</p>}
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(item.path);
                const badge = item.badgeFn?.();
                const alert = item.alertFn?.();
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`${active ? 'nav-item-active' : 'nav-item'} ${collapsed ? 'justify-center px-2' : ''}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={16} className="flex-shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge !== undefined && (
                          <span className="text-[10px] font-bold bg-signal-red text-white rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                        {alert && !badge && (
                          <span className="w-2 h-2 rounded-full bg-signal-amber flex-shrink-0" />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-navy-500 px-3 py-3 space-y-0.5">
        {bottomItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`nav-item ${collapsed ? 'justify-center px-2' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={15} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={`nav-item w-full ${collapsed ? 'justify-center px-2' : ''}`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          {!collapsed && <span className="truncate">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
