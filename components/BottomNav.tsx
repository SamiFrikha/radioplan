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
    className="fixed bottom-0 left-0 right-0 z-bottomnav bg-surface border-t border-border
               flex items-center justify-around lg:hidden print:hidden"
    style={{
      height: 'calc(64px + env(safe-area-inset-bottom))',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}
    aria-label="Navigation principale"
  >
    {tabs.map(({ to, icon: Icon, label }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        aria-label={label}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-0.5 px-2 min-w-[56px] h-full
           transition-colors duration-150
           ${isActive ? 'text-primary' : 'text-[#94A3B8]'}`
        }
      >
        {({ isActive }) => (
          <>
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span className={`text-[10px] font-heading font-medium leading-none ${isActive ? 'text-primary' : ''}`}>
              {label}
            </span>
            {isActive && <span className="sr-only">(page actuelle)</span>}
          </>
        )}
      </NavLink>
    ))}
  </nav>
);

export default BottomNav;
