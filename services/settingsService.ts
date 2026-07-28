import { supabase } from './supabaseClient';
import { ManualOverrides, ConsultationHours, DectDisplaySettings } from '../types';
import { DEFAULT_DECT_DISPLAY, normalizeDectDisplay } from './dectDisplay';

// Default consultation half-day time ranges (used when not configured yet).
export const DEFAULT_CONSULTATION_HOURS: ConsultationHours = {
    morning:   { start: '08:30', end: '13:00' },
    afternoon: { start: '14:00', end: '18:00' },
};

// Settings service to persist global app settings
export const settingsService = {
    async get(): Promise<{ postes: string[], activitiesStartDate: string | null, validatedWeeks: string[], manualOverrides: ManualOverrides, consultationHours: ConsultationHours, dectDisplay: DectDisplaySettings }> {
        const { data, error } = await supabase
            .from('app_settings')
            .select('*')
            .single();

        if (error) {
            // Return defaults if table doesn't exist or is empty
            console.warn('Settings not found, using defaults:', error.message);
            return {
                postes: ['Box 1', 'Box 2', 'Box 3'],
                activitiesStartDate: null,
                validatedWeeks: [],
                manualOverrides: {},
                consultationHours: DEFAULT_CONSULTATION_HOURS,
                dectDisplay: DEFAULT_DECT_DISPLAY
            };
        }

        return {
            postes: data?.postes || ['Box 1', 'Box 2', 'Box 3'],
            activitiesStartDate: data?.activities_start_date || null,
            validatedWeeks: data?.validated_weeks || [],
            manualOverrides: data?.manual_overrides || {},
            consultationHours: data?.consultation_hours || DEFAULT_CONSULTATION_HOURS,
            dectDisplay: normalizeDectDisplay(data?.dect_display)
        };
    },

    async update(settings: { postes?: string[], activitiesStartDate?: string | null, validatedWeeks?: string[], manualOverrides?: ManualOverrides, consultationHours?: ConsultationHours, dectDisplay?: DectDisplaySettings }): Promise<boolean> {
        const updateData: any = {};
        if (settings.postes !== undefined) updateData.postes = settings.postes;
        if (settings.activitiesStartDate !== undefined) updateData.activities_start_date = settings.activitiesStartDate;
        if (settings.validatedWeeks !== undefined) updateData.validated_weeks = settings.validatedWeeks;
        if (settings.manualOverrides !== undefined) updateData.manual_overrides = settings.manualOverrides;
        if (settings.consultationHours !== undefined) updateData.consultation_hours = settings.consultationHours;
        if (settings.dectDisplay !== undefined) updateData.dect_display = settings.dectDisplay;

        // Try to upsert using id = 1 as the singleton pattern
        const { error } = await supabase
            .from('app_settings')
            .upsert({ id: 1, ...updateData, updated_at: new Date().toISOString() });

        if (error) {
            console.error('Failed to update settings:', error);
            return false;
        }
        return true;
    }
};
