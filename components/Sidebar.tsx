
import React, { useContext, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, UserCircle, Database, LogOut, Activity, Settings2, X, Shield, HardDrive } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext'; // Only for user info and logout
import { getDateForDayOfWeek } from '../services/scheduleService';
import { PERMISSION_KEYS } from '../config/permissions';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  // CRITICAL: Destructure hasPermission from AppContext, NOT useAuth.
  const { currentUser, setCurrentUser, template, rcpAttendance, rcpTypes, hasPermission, isCloudMode } = useContext(AppContext);
  const { logout, user } = useAuth();

  // Calculate Notification Count for RCPs
  const notificationCount = useMemo(() => {
    if (!currentUser) return 0;
    
    let pendingCount = 0;
    const today = new Date();
    const currentMonday = new Date(today);
    const day = currentMonday.getDay();
    const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
    currentMonday.setDate(diff);
    currentMonday.setHours(0,0,0,0);

    const targetMonday = new Date(currentMonday);
    targetMonday.setDate(targetMonday.getDate() + 7);
    const targetWeekEnd = new Date(targetMonday);
    targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
    const startStr = targetMonday.toISOString().split('T')[0];
    const endStr = targetWeekEnd.toISOString().split('T')[0];

    template.forEach(t => {
        if (t.type === 'RCP') {
            const isInvolved = 
                (t.doctorIds && t.doctorIds.includes(currentUser.id)) ||
                (t.defaultDoctorId === currentUser.id) ||
                (t.secondaryDoctorIds && t.secondaryDoctorIds.includes(currentUser.id)) ||
                (t.backupDoctorId === currentUser.id);

            if (isInvolved) {
                const slotDate = getDateForDayOfWeek(targetMonday, t.day);
                const generatedId = `${t.id}-${slotDate}`;
                const myDecision = rcpAttendance[generatedId]?.[currentUser.id];
                if (!myDecision) pendingCount++;
            }
        }
    });

    rcpTypes.forEach(rcp => {
        if (rcp.frequency === 'MANUAL' && rcp.manualInstances) {
            rcp.manualInstances.forEach(inst => {
                if (inst.date >= startStr && inst.date <= endStr) {
                    // SAFE CHECK: Ensure doctorIds exists and is an array
                    const doctorIds = inst.doctorIds || [];
                    const isInvolved = doctorIds.includes(currentUser.id) || inst.backupDoctorId === currentUser.id;
                    if (isInvolved) {
                         const generatedId = `manual-rcp-${rcp.id}-${inst.id}`;
                         const myDecision = rcpAttendance[generatedId]?.[currentUser.id];
                         if (!myDecision) pendingCount++;
                    }
                }
            });
        }
    });

    return pendingCount;
  }, [currentUser, template, rcpAttendance, rcpTypes]);

  // Define Nav Items dynamically based on permissions
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Tableau de bord', show: hasPermission(PERMISSION_KEYS.VIEW_DASHBOARD) },
    { to: '/planning', icon: CalendarDays, label: 'Planning Global', show: true }, // Usually everyone sees planning
    { to: '/activities', icon: Activity, label: 'Activités', show: true },
    { to: '/configuration', icon: Settings2, label: 'Règles & Postes', show: hasPermission(PERMISSION_KEYS.MANAGE_RULES) },
    { to: '/admin', icon: Shield, label: 'Administration', show: hasPermission(PERMISSION_KEYS.VIEW_ADMIN_PANEL) }, 
    { to: '/profile', icon: UserCircle, label: 'Mon Profil & Dispo', badge: notificationCount, show: hasPermission(PERMISSION_KEYS.VIEW_OWN_PROFILE) },
  ];

  const handleLogout = () => {
      logout(); // Call global logout
      onClose();
  };

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
            {/* Close button for Mobile */}
            <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
            </button>
          </div>
          
          <nav className="flex-1 py-6 space-y-2 px-3 overflow-y-auto">
            {navItems.filter(i => i.show).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose} // Close sidebar on navigate (Mobile UX)
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 rounded-lg transition-colors relative ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{item.label}</span>
                {item.badge && item.badge > 0 && (
                    <span className="absolute right-3 top-3 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                    </span>
                )}
              </NavLink>
            ))}
          </nav>
          
          {/* DB STATUS INDICATOR */}
          <div className="px-6 py-2 mb-2">
                <div className={`flex items-center text-[10px] font-bold uppercase tracking-wider py-1 px-2 rounded-full bg-slate-800/50 border ${isCloudMode ? 'text-green-400 border-green-900/30' : 'text-orange-400 border-orange-900/30'}`}>
                    {isCloudMode ? <Database className="w-3 h-3 mr-1.5"/> : <HardDrive className="w-3 h-3 mr-1.5"/>}
                    {isCloudMode ? 'Supabase Connecté' : 'Mode Local (Mock)'}
                </div>
          </div>

          {/* User Footer */}
          <div className="p-4 bg-slate-800 border-t border-slate-700">
                <div className="flex items-center">
                    {/* Display currently authenticated user */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${user?.color || 'bg-slate-600'}`}>
                        {user?.name.substring(0,2) || '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user?.name || 'Utilisateur'}</p>
                        <p className="text-[10px] text-slate-400 truncate">{user?.role === 'ADMIN' ? 'Administrateur' : 'Médecin'}</p>
                        
                        <button 
                            onClick={handleLogout}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center mt-2 w-full"
                        >
                            <LogOut className="w-3 h-3 mr-1" />
                            Déconnexion
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    </>
  );
};

export default Sidebar;
