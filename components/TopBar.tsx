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
      className="fixed top-0 left-0 right-0 z-topbar bg-surface border-b border-border
                 flex items-center justify-between px-4 lg:hidden print:hidden"
      style={{
        height: 'calc(56px + env(safe-area-inset-top))',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="w-9" aria-hidden="true" />
      <h1 className="font-heading font-semibold text-base text-text-base absolute left-1/2 -translate-x-1/2">
        {title}
      </h1>
      <div className="ml-auto">
        <NotificationBell />
      </div>
    </header>
  );
};

export default TopBar;
