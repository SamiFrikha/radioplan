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
  isActive
    ? 'flex items-center gap-3 w-full px-3 py-2.5 rounded-btn-sm bg-gradient-primary text-white font-semibold shadow-[0_2px_8px_rgba(79,70,229,0.4)] transition-all duration-150'
    : 'flex items-center gap-3 w-full px-3 py-2.5 rounded-btn-sm text-white/60 hover:text-white hover:bg-white/10 font-medium transition-all duration-150';

function SidebarNavLink({ item }: { item: NavItemDef }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={navLinkClass}
    >
      {({ isActive }) => (
        <>
          <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          <span className="hidden lg:block text-sm truncate">{item.label}</span>
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
    <aside className="print:hidden hidden md:flex flex-col flex-shrink-0 w-sidebar-collapsed lg:w-sidebar bg-[#0F172A] border-r border-white/5 z-sidebar overflow-y-auto">

      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-white/10 flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          RP
        </div>
        <span className="text-white font-extrabold text-base lg:text-lg hidden lg:block ml-3">
          RadioPlan AI
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <NotificationBell />
        </div>
      </div>

      {/* Main nav */}
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.filter(i => i.show).map(item => (
          <SidebarNavLink key={item.to} item={item} />
        ))}

        {/* Admin section */}
        {visibleAdminItems.length > 0 && (
          <div className="border-t border-white/10 mt-2 pt-2">
            <p className="text-[10px] font-medium uppercase text-white/40 tracking-wider px-3 mb-1 hidden lg:block">
              Administration
            </p>
            {visibleAdminItems.map(item => (
              <SidebarNavLink key={item.to} item={item} />
            ))}
          </div>
        )}
      </nav>

      {/* Footer — user info + logout */}
      <div className="mt-auto border-t border-white/10 p-3">
        {profile ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              {profile.email?.substring(0, 2).toUpperCase() ?? 'U'}
            </div>
            <div className="hidden lg:block flex-1 min-w-0">
              <p className="text-white/70 text-sm font-medium hidden lg:block truncate">{profile.email}</p>
              <p className="text-xs text-white/40 truncate">{profile.role_name || profile.role}</p>
            </div>
            <button
              onClick={async () => {
                await signOut();
                setCurrentUser(null);
                navigate('/login');
              }}
              className="ml-auto text-white/40 hover:text-white transition-colors duration-150 flex-shrink-0"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="w-full flex items-center justify-center gap-2 text-sm text-white/40 hover:text-white transition-colors duration-150 py-2"
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
