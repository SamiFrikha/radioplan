import React from 'react';
import { X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

const NOTIF_ICON: Record<string, string> = {
  RCP_AUTO_ASSIGNED: '🎲',
  RCP_SLOT_FILLED: '✅',
  RCP_REMINDER_24H: '⏰',
  RCP_REMINDER_12H: '⚠️',
  RCP_UNASSIGNED_ALERT: '🚨',
  REPLACEMENT_REQUEST: '🔄',
  REPLACEMENT_ACCEPTED: '✅',
  REPLACEMENT_REJECTED: '❌',
};

const NotificationToastStack: React.FC = () => {
  const { toasts, dismissToast } = useNotifications();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="bg-surface border border-border shadow-modal rounded-card p-3 flex items-start gap-3 pointer-events-auto"
        >
          <span className="text-xl leading-none flex-shrink-0 mt-0.5">{NOTIF_ICON[toast.type] ?? '🔔'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-base leading-tight">{toast.title}</p>
            <p className="text-xs text-text-muted mt-0.5 line-clamp-2 leading-snug">{toast.body}</p>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Fermer"
            className="flex-shrink-0 p-0.5 rounded text-text-muted hover:text-text-base transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default NotificationToastStack;
