import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { NotificationType } from '../types';

// Human-readable labels for each notification type
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  RCP_REMINDER_24H:     'Rappel RCP 24h avant',
  RCP_REMINDER_12H:     'Rappel RCP 12h avant',
  RCP_AUTO_ASSIGNED:    'Affectation automatique RCP',
  RCP_SLOT_FILLED:      'RCP créneau pourvu',
  RCP_UNASSIGNED_ALERT: 'Alerte RCP non assignée',
  REPLACEMENT_REQUEST:  'Demande de remplacement reçue',
  REPLACEMENT_ACCEPTED: 'Remplacement accepté',
  REPLACEMENT_REJECTED: 'Remplacement refusé',
};

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'REPLACEMENT_REQUEST',
  'REPLACEMENT_ACCEPTED',
  'REPLACEMENT_REJECTED',
  'RCP_REMINDER_24H',
  'RCP_REMINDER_12H',
  'RCP_AUTO_ASSIGNED',
  'RCP_SLOT_FILLED',
  'RCP_UNASSIGNED_ALERT',
];

interface UseNotificationPreferencesResult {
  prefs: Record<string, boolean>;
  isEnabled: (type: NotificationType) => boolean;
  toggle: (type: NotificationType) => Promise<void>;
  loading: boolean;
}

export function useNotificationPreferences(userId: string | undefined): UseNotificationPreferencesResult {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('notification_preferences')
          .eq('id', userId)
          .single();
        if (data?.notification_preferences) {
          setPrefs(data.notification_preferences as Record<string, boolean>);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const isEnabled = useCallback(
    (type: NotificationType) => prefs[type] !== false, // missing key = enabled by default
    [prefs]
  );

  const toggle = useCallback(async (type: NotificationType) => {
    if (!userId) return;
    const newPrefs = { ...prefs, [type]: !isEnabled(type) };
    setPrefs(newPrefs);
    await supabase
      .from('profiles')
      .update({ notification_preferences: newPrefs })
      .eq('id', userId);
  }, [userId, prefs, isEnabled]);

  return { prefs, isEnabled, toggle, loading };
}
