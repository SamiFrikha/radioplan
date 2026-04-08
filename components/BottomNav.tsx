import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, LayoutGrid, Activity, ScrollText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const staticTabs = [
  { to: '/',             icon: LayoutDashboard, label: 'Tableau' },
  { to: '/planning',     icon: CalendarDays,    label: 'Planning' },
  { to: '/mon-planning', icon: LayoutGrid,      label: 'Mon Plan.' },
  { to: '/activities',   icon: Activity,        label: 'Activités' },
];

const BottomNav: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const initials = (profile?.email ?? 'U').substring(0, 2).toUpperCase();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-bottomnav lg:hidden print:hidden bg-surface border-t border-border"
      style={{ height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigation principale"
    >
      <div className="flex items-stretch h-16">
        {staticTabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            className="relative flex flex-col items-center justify-center gap-0.5 flex-1 pt-1 cursor-pointer"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary" aria-hidden="true" />
                )}
                <Icon className={isActive ? 'w-6 h-6 text-primary' : 'w-6 h-6 text-text-muted'} aria-hidden="true" />
                <span className={isActive ? 'text-[10px] font-bold text-primary leading-none' : 'text-[10px] font-medium text-text-muted leading-none'}>
                  {label}
                </span>
                {isActive && <span className="sr-only">(page actuelle)</span>}
              </>
            )}
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink
            to="/logs"
            aria-label="Logs"
            className="relative flex flex-col items-center justify-center gap-0.5 flex-1 pt-1 cursor-pointer"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary" aria-hidden="true" />
                )}
                <ScrollText className={isActive ? 'w-6 h-6 text-primary' : 'w-6 h-6 text-text-muted'} aria-hidden="true" />
                <span className={isActive ? 'text-[10px] font-bold text-primary leading-none' : 'text-[10px] font-medium text-text-muted leading-none'}>
                  Logs
                </span>
                {isActive && <span className="sr-only">(page actuelle)</span>}
              </>
            )}
          </NavLink>
        )}

        {/* Profile tab with user initials */}
        <NavLink
          to="/profile"
          aria-label="Profil"
          className="relative flex flex-col items-center justify-center gap-0.5 flex-1 pt-1 cursor-pointer"
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary" aria-hidden="true" />
              )}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)'
                    : 'linear-gradient(135deg, #94A3B8 0%, #64748B 100%)'
                }}
                aria-hidden="true"
              >
                {initials}
              </div>
              <span className={isActive ? 'text-[10px] font-bold text-primary leading-none' : 'text-[10px] font-medium text-text-muted leading-none'}>
                Profil
              </span>
              {isActive && <span className="sr-only">(page actuelle)</span>}
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
};

export default BottomNav;
