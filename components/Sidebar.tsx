import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, UserCircle, Database,
  LogOut, Activity, Settings2, Users, Shield, LayoutGrid,
} from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

interface NavItemDef {
  to: string;
  icon: React.ElementType;
  label: string;
  show: boolean;
  end?: boolean;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center px-3 h-11 rounded-lg transition-colors duration-150 relative',
    isActive
      ? 'bg-muted text-primary border-l-[3px] border-primary pl-[calc(0.75rem-3px)]'
      : 'text-text-muted hover:bg-muted hover:text-text-base border-l-[3px] border-transparent pl-[calc(0.75rem-3px)]',
  ].join(' ');

function SidebarNavLink({ item }: { item: NavItemDef }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={navLinkClass}
    >
      {({ isActive }) => (
        <>
          <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="hidden lg:block ml-3 text-sm font-medium">{item.label}</span>
          {isActive && <span className="sr-only">(page actuelle)</span>}
        </>
      )}
    </NavLink>
  );
}

const Sidebar: React.FC = () => {
  const { setCurrentUser } = useContext(AppContext);
  const { hasPermission, signOut, profile } = useAuth();
  const navigate = useNavigate();

  const navItems: NavItemDef[] = [
    { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', show: true, end: true },
    { to: '/planning', icon: CalendarDays, label: 'Planning Global', show: hasPermission('view_planning') },
    { to: '/mon-planning', icon: LayoutGrid, label: 'Mon Planning', show: true },
    { to: '/activities', icon: Activity, label: 'Activités', show: true },
    { to: '/configuration', icon: Settings2, label: 'Règles & Postes', show: hasPermission('manage_settings') },
    { to: '/profile', icon: UserCircle, label: 'Mon Profil', show: true },
  ];

  const adminItems: NavItemDef[] = [
    { to: '/admin/team', icon: Users, label: "Gestion d'équipe", show: hasPermission('manage_users') },
    { to: '/admin/roles', icon: Shield, label: 'Gestion des rôles', show: hasPermission('manage_users') },
    { to: '/data', icon: Database, label: 'Données', show: hasPermission('manage_settings') },
  ];

  const visibleAdminItems = adminItems.filter(i => i.show);

  return (
    <aside className="print:hidden hidden md:flex flex-col h-full w-sidebar-collapsed lg:w-sidebar bg-surface border-r border-border">

      {/* Header */}
      <div className="flex items-center justify-between px-3 h-14 border-b border-border shrink-0">
        <span className="hidden lg:block text-primary font-heading font-bold text-sm">
          RadioPlan AI
        </span>
        <div className="flex items-center gap-1">
          <NotificationBell />
        </div>
      </div>

      {/* Main nav */}
      <nav aria-label="Navigation principale" className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.filter(i => i.show).map(item => (
          <SidebarNavLink key={item.to} item={item} />
        ))}

        {/* Admin section */}
        {visibleAdminItems.length > 0 && (
          <div className="border-t border-border mt-2 pt-2">
            <p className="text-[10px] font-medium uppercase text-text-muted tracking-wider px-3 mb-1 hidden lg:block">
              Administration
            </p>
            {visibleAdminItems.map(item => (
              <SidebarNavLink key={item.to} item={item} />
            ))}
          </div>
        )}
      </nav>

      {/* Footer — user info + logout */}
      <div className="border-t border-border px-2 py-3 shrink-0">
        {profile ? (
          <div className="flex items-center gap-2 px-1">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {profile.email?.substring(0, 2).toUpperCase() ?? 'U'}
            </div>
            <div className="hidden lg:block flex-1 min-w-0">
              <p className="text-sm font-medium text-text-base truncate">{profile.email}</p>
              <p className="text-xs text-text-muted">{profile.role_name || profile.role}</p>
            </div>
            <button
              onClick={async () => {
                await signOut();
                setCurrentUser(null);
                navigate('/login');
              }}
              className="ml-auto text-text-muted hover:text-accent-red transition-colors duration-150 shrink-0"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="w-full flex items-center justify-center gap-2 text-sm text-text-muted hover:text-primary transition-colors duration-150 py-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:block">Se connecter</span>
          </button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
