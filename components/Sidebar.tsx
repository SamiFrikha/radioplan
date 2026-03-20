import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, UserCircle, Database, LogOut, Activity, Settings2, X, Users, Shield, LayoutGrid } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { currentUser, setCurrentUser } = useContext(AppContext);
  const { hasPermission, signOut, profile } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', show: true },
    { to: '/planning', icon: CalendarDays, label: 'Planning Global', show: hasPermission('view_planning') },
    { to: '/mon-planning', icon: LayoutGrid, label: 'Mon Planning', show: true },
    { to: '/activities', icon: Activity, label: 'Activités', show: true },
    { to: '/configuration', icon: Settings2, label: 'Règles & Postes', show: hasPermission('manage_settings') },
    { to: '/profile', icon: UserCircle, label: 'Mon Profil', show: true },
  ];

  const adminItems = [
    { to: '/admin/team', icon: Users, label: 'Gestion d\'équipe', show: hasPermission('manage_users') },
    { to: '/admin/roles', icon: Shield, label: 'Gestion des rôles', show: hasPermission('manage_users') },
    { to: '/data', icon: Database, label: 'Données', show: hasPermission('manage_settings') },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out
            md:relative md:translate-x-0 print:hidden
            ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-wider text-blue-400">RadioPlan AI</h1>
            <p className="text-xs text-slate-400 mt-1">Oncologie & Radiothérapie</p>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            {/* Close button for Mobile */}
            <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <nav className="flex-1 py-6 space-y-2 px-3 overflow-y-auto">
          {navItems.filter(i => i.show).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-colors relative ${isActive
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}

          {/* Admin Section */}
          {adminItems.some(i => i.show) && (
            <>
              <div className="px-4 py-2 mt-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Administration
              </div>
              {adminItems.filter(i => i.show).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 rounded-lg transition-colors relative ${isActive
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User Section - Show authenticated profile */}
        {profile ? (
          <div className="p-4 bg-slate-800 border-t border-slate-700">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold mr-3 bg-blue-600 text-white shadow-lg">
                {profile.email?.substring(0, 2).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{profile.email}</p>
                <p className="text-xs text-slate-400">{profile.role_name || profile.role}</p>
                <button
                  onClick={async () => {
                    await signOut();
                    setCurrentUser(null);
                    navigate('/login');
                    onClose();
                  }}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center mt-2 bg-slate-700/50 px-2 py-1 rounded"
                >
                  <LogOut className="w-3 h-3 mr-1" />
                  Se déconnecter
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 border-t border-slate-800">
            <button
              onClick={() => navigate('/login')}
              className="w-full text-sm text-blue-400 hover:text-blue-300 flex items-center justify-center py-2 bg-slate-800 rounded"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Se connecter
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

export default Sidebar;