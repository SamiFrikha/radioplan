import { supabase } from './supabaseClient';
import { Unavailability } from '../types';

export const unavailabilityService = {
    async getAll(): Promise<Unavailability[]> {
        const { data, error } = await supabase
            .from('unavailabilities')
            .select('*');

        if (error) throw error;

        return data.map((u: any) => ({
            id: u.id,
            doctorId: u.doctor_id,
            startDate: u.start_date,
            endDate: u.end_date,
            period: u.period,
            reason: u.reason
        }));
    },

    async create(unavailability: Omit<Unavailability, 'id'>): Promise<Unavailability> {
        const payload = {
            doctor_id: unavailability.doctorId,
            start_date: unavailability.startDate,
            end_date: unavailability.endDate,
            period: unavailability.period || 'ALL_DAY',
            reason: unavailability.reason
        };

        // Try insert first; if duplicate (UNIQUE violation), fetch the existing row
        const { data, error } = await supabase
            .from('unavailabilities')
            .insert(payload)
            .select()
            .single();

        if (error) {
            // 23505 = unique_violation — duplicate already exists, fetch it
            if (error.code === '23505') {
                const { data: existing } = await supabase
                    .from('unavailabilities')
                    .select('*')
                    .eq('doctor_id', payload.doctor_id)
                    .eq('start_date', payload.start_date)
                    .eq('end_date', payload.end_date)
                    .eq('period', payload.period)
                    .single();
                if (existing) {
                    return {
                        id: existing.id,
                        doctorId: existing.doctor_id,
                        startDate: existing.start_date,
                        endDate: existing.end_date,
                        period: existing.period,
                        reason: existing.reason
                    };
                }
            }
            throw error;
        }

        return {
            id: data.id,
            doctorId: data.doctor_id,
            startDate: data.start_date,
            endDate: data.end_date,
            period: data.period,
            reason: data.reason
        };
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('unavailabilities')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
