import React from 'react';
import { useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';

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
  const title = routeTitles[pathname] ?? 'RadioPlan AI';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-topbar lg:hidden print:hidden bg-surface border-b border-border"
      style={{ height: 'calc(56px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center h-14 px-4 gap-3">
        <h1 className="text-base font-bold text-text-base tracking-tight flex-1 truncate">
          {title}
        </h1>
        <div className="ml-auto">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
};

export default TopBar;
