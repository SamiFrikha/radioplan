import { supabase } from './supabaseClient';
import { Doctor } from '../types';

export const doctorService = {
    async getAll(): Promise<Doctor[]> {
        const { data, error } = await supabase
            .from('doctors')
            .select('*')
            .order('name');

        if (error) throw error;

        // Map snake_case DB to camelCase TS
        return data.map((d: any) => ({
            id: d.id,
            name: d.name,
            specialty: d.specialty,
            color: d.color,
            excludedDays: d.excluded_days || [],
            excludedHalfDays: d.excluded_half_days || [],
            excludedActivities: d.excluded_activities || [],
            excludedSlotTypes: d.excluded_slot_types || []
        }));
    },

    async create(doctor: Omit<Doctor, 'id'>): Promise<Doctor> {
        const { data, error } = await supabase
            .from('doctors')
            .insert({
                name: doctor.name,
                specialty: doctor.specialty,
                color: doctor.color,
                excluded_days: doctor.excludedDays || [],
                excluded_half_days: doctor.excludedHalfDays || [],
                excluded_activities: doctor.excludedActivities || [],
                excluded_slot_types: doctor.excludedSlotTypes || []
            })
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            name: data.name,
            specialty: data.specialty,
            color: data.color,
            excludedDays: data.excluded_days || [],
            excludedHalfDays: data.excluded_half_days || [],
            excludedActivities: data.excluded_activities || [],
            excludedSlotTypes: data.excluded_slot_types || []
        };
    },

    async update(doctor: Doctor): Promise<Doctor> {
        const { data, error } = await supabase
            .from('doctors')
            .update({
                name: doctor.name,
                specialty: doctor.specialty,
                color: doctor.color,
                excluded_days: doctor.excludedDays || [],
                excluded_half_days: doctor.excludedHalfDays || [],
                excluded_activities: doctor.excludedActivities || [],
                excluded_slot_types: doctor.excludedSlotTypes || []
            })
            .eq('id', doctor.id)
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            name: data.name,
            specialty: data.specialty,
            color: data.color,
            excludedDays: data.excluded_days || [],
            excludedHalfDays: data.excluded_half_days || [],
            excludedActivities: data.excluded_activities || [],
            excludedSlotTypes: data.excluded_slot_types || []
        };
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('doctors')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
