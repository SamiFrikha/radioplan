import { supabase } from './supabaseClient';
import { ActivityDefinition } from '../types';

export const activityService = {
    async getAll(): Promise<ActivityDefinition[]> {
        const { data, error } = await supabase
            .from('activities')
            .select('*')
            .order('name');

        if (error) throw error;

        return data.map((a: any) => ({
            id: a.id,
            name: a.name,
            granularity: a.granularity,
            allowDoubleBooking: a.allow_double_booking,
            color: a.color,
            isSystem: a.is_system,
            equityGroup: a.equity_group,
            morningStart: a.morning_start,
            morningEnd: a.morning_end,
            afternoonStart: a.afternoon_start,
            afternoonEnd: a.afternoon_end
        }));
    },

    async create(activity: Omit<ActivityDefinition, 'id'>): Promise<ActivityDefinition> {
        const { data, error } = await supabase
            .from('activities')
            .insert({
                name: activity.name,
                granularity: activity.granularity,
                allow_double_booking: activity.allowDoubleBooking,
                color: activity.color,
                is_system: activity.isSystem || false,
                equity_group: activity.equityGroup,
                morning_start: activity.morningStart ?? null,
                morning_end: activity.morningEnd ?? null,
                afternoon_start: activity.afternoonStart ?? null,
                afternoon_end: activity.afternoonEnd ?? null
            })
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            name: data.name,
            granularity: data.granularity,
            allowDoubleBooking: data.allow_double_booking,
            color: data.color,
            isSystem: data.is_system,
            equityGroup: data.equity_group,
            morningStart: data.morning_start,
            morningEnd: data.morning_end,
            afternoonStart: data.afternoon_start,
            afternoonEnd: data.afternoon_end
        };
    },

    async update(activity: ActivityDefinition): Promise<ActivityDefinition> {
        const { data, error } = await supabase
            .from('activities')
            .update({
                name: activity.name,
                granularity: activity.granularity,
                allow_double_booking: activity.allowDoubleBooking,
                color: activity.color,
                is_system: activity.isSystem,
                equity_group: activity.equityGroup,
                morning_start: activity.morningStart ?? null,
                morning_end: activity.morningEnd ?? null,
                afternoon_start: activity.afternoonStart ?? null,
                afternoon_end: activity.afternoonEnd ?? null
            })
            .eq('id', activity.id)
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            name: data.name,
            granularity: data.granularity,
            allowDoubleBooking: data.allow_double_booking,
            color: data.color,
            isSystem: data.is_system,
            equityGroup: data.equity_group,
            morningStart: data.morning_start,
            morningEnd: data.morning_end,
            afternoonStart: data.afternoon_start,
            afternoonEnd: data.afternoon_end
        };
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
