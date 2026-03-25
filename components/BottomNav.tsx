import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, LayoutGrid, Activity, UserCircle } from 'lucide-react';

const tabs = [
  { to: '/',             icon: LayoutDashboard, label: 'Tableau' },
  { to: '/planning',     icon: CalendarDays,    label: 'Planning' },
  { to: '/mon-planning', icon: LayoutGrid,      label: 'Mon Plan.' },
  { to: '/activities',   icon: Activity,        label: 'Activités' },
  { to: '/profile',      icon: UserCircle,      label: 'Profil' },
];

const BottomNav: React.FC = () => (
  <nav
    className="fixed bottom-0 left-0 right-0 z-bottomnav lg:hidden print:hidden bg-surface border-t border-border"
    style={{ height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
    aria-label="Navigation principale"
  >
    <div className="flex items-stretch h-16">
      {tabs.map(({ to, icon: Icon, label }) => (
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
    </div>
  </nav>
);

export default BottomNav;
