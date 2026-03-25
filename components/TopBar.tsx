import React from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useAuth } from '../context/AuthContext';

const routeTitles: Record<string, string> = {
  '/':              'Tableau de bord',
  '/planning':      'Planning Global',
  '/mon-planning':  'Mon Planning',
  '/activities':    'Activités',
  '/profile':       'Mon Profil',
  '/configuration': 'Règles & Postes',
  '/data':          'Données',
  '/admin/team':    "Gestion d'équipe",
  '/admin/roles':   'Gestion des rôles',
};

const TopBar: React.FC = () => {
  const { pathname } = useLocation();
  const { profile, signOut } = useAuth();
  const title = routeTitles[pathname] ?? 'RadioPlan AI';
  const initials = (profile?.email ?? 'U').substring(0, 2).toUpperCase();

  return (
    <header
      className="fixed top-0 left-0 right-0 z-topbar lg:hidden print:hidden bg-surface border-b border-border"
      style={{ height: 'calc(56px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center h-14 px-3 gap-2">
        {/* User avatar — shows who is connected */}
        <div
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
          title={profile?.email ?? ''}
        >
          {initials}
        </div>

        <h1 className="text-base font-bold text-text-base tracking-tight flex-1 truncate">
          {title}
        </h1>

        <div className="flex items-center gap-0.5">
          <NotificationBell />
          <button
            onClick={() => signOut()}
            aria-label="Se déconnecter"
            className="p-2 rounded-full hover:bg-muted text-text-muted hover:text-danger transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
