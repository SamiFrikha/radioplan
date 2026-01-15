import { supabase } from './supabaseClient';
import { GlobalBackupData } from '../types';

export const backupService = {
    async exportData(): Promise<GlobalBackupData> {
        const [
            { data: doctors },
            { data: activities },
            { data: rcpDefinitions },
            { data: template },
            { data: unavailabilities },
            { data: slots },
            { data: rcpAttendance },
            { data: rcpExceptions },
            { data: appSettings },
            { data: specialties }
        ] = await Promise.all([
            supabase.from('doctors').select('*'),
            supabase.from('activities').select('*'),
            supabase.from('rcp_definitions').select('*, rcp_manual_instances(*)'),
            supabase.from('schedule_templates').select('*'),
            supabase.from('unavailabilities').select('*'),
            supabase.from('schedule_slots').select('*'),
            supabase.from('rcp_attendance').select('*'),
            supabase.from('rcp_exceptions').select('*'),
            supabase.from('app_settings').select('*'),
            supabase.from('specialties').select('*')
        ]);

        return {
            metadata: {
                version: '2.0',
                appName: 'RadioPlan AI',
                exportDate: new Date().toISOString()
            },
            data: {
                doctors: (doctors || []).map((d: any) => ({
                    id: d.id,
                    name: d.name,
                    specialty: d.specialty,
                    color: d.color,
                    excludedDays: d.excluded_days || [],
                    excludedHalfDays: d.excluded_half_days || [], // NEW: Granular half-day exclusions
                    excludedActivities: d.excluded_activities || [],
                    excludedSlotTypes: d.excluded_slot_types || []
                })),
                activityDefinitions: (activities || []).map((a: any) => ({
                    id: a.id,
                    name: a.name,
                    granularity: a.granularity,
                    allowDoubleBooking: a.allow_double_booking,
                    color: a.color,
                    isSystem: a.is_system,
                    equityGroup: a.equity_group
                })),
                rcpTypes: (rcpDefinitions || []).map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    frequency: r.frequency,
                    weekParity: r.week_parity,
                    monthlyWeekNumber: r.monthly_week_number,
                    manualInstances: r.rcp_manual_instances.map((m: any) => ({
                        id: m.id,
                        date: m.date,
                        time: m.time,
                        doctorIds: m.doctor_ids,
                        backupDoctorId: m.backup_doctor_id
                    }))
                })),
                template: (template || []).map((t: any) => ({
                    id: t.id,
                    day: t.day,
                    period: t.period,
                    time: t.time,
                    location: t.location,
                    type: t.type,
                    defaultDoctorId: t.default_doctor_id,
                    secondaryDoctorIds: t.secondary_doctor_ids,
                    doctorIds: t.doctor_ids,
                    backupDoctorId: t.backup_doctor_id,
                    subType: t.sub_type,
                    isRequired: t.is_required,
                    isBlocking: t.is_blocking,
                    frequency: t.frequency
                })),
                unavailabilities: (unavailabilities || []).map((u: any) => ({
                    id: u.id,
                    doctorId: u.doctor_id,
                    startDate: u.start_date,
                    endDate: u.end_date,
                    period: u.period,
                    reason: u.reason
                })),
                rcpAttendance: (rcpAttendance || []).reduce((acc: any, curr: any) => {
                    if (!acc[curr.slot_id]) acc[curr.slot_id] = {};
                    acc[curr.slot_id][curr.doctor_id] = curr.status;
                    return acc;
                }, {}),
                rcpExceptions: (rcpExceptions || []).map((e: any) => ({
                    id: e.id,
                    rcpTemplateId: e.rcp_template_id,
                    originalDate: e.original_date,
                    newDate: e.new_date,
                    newPeriod: e.new_period,
                    isCancelled: e.is_cancelled,
                    newTime: e.new_time,
                    customDoctorIds: e.custom_doctor_ids
                })),
                // app_settings is a singleton row, get first item
                postes: appSettings?.[0]?.postes || [],
                shiftHistory: {},
                manualOverrides: appSettings?.[0]?.manual_overrides || {},
                activitiesStartDate: appSettings?.[0]?.activities_start_date || null,
                specialties: (specialties || []).map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color
                }))
            }
        };
    },

    async importData(data: any): Promise<void> {
        const d = data.data || data; // Handle wrapped or unwrapped

        // 1. Doctors
        if (d.doctors && d.doctors.length > 0) {
            const dbDoctors = d.doctors.map((doc: any) => ({
                id: doc.id,
                name: doc.name,
                specialty: doc.specialty,
                color: doc.color,
                excluded_days: doc.excludedDays || [],
                excluded_half_days: doc.excludedHalfDays || [], // NEW: Granular half-day exclusions
                excluded_activities: doc.excludedActivities || [],
                excluded_slot_types: doc.excludedSlotTypes || []
            }));
            await supabase.from('doctors').upsert(dbDoctors);
        }

        // 2. Activities
        if (d.activityDefinitions) {
            const dbActs = d.activityDefinitions.map((a: any) => ({
                id: a.id,
                name: a.name,
                granularity: a.granularity,
                allow_double_booking: a.allowDoubleBooking,
                color: a.color,
                is_system: a.isSystem
            }));
            await supabase.from('activities').upsert(dbActs);
        }

        // 3. RCP Definitions
        if (d.rcpTypes) {
            const dbRcps = d.rcpTypes.map((r: any) => ({
                id: r.id,
                name: r.name,
                frequency: r.frequency,
                week_parity: r.weekParity,
                monthly_week_number: r.monthlyWeekNumber
            }));
            await supabase.from('rcp_definitions').upsert(dbRcps);

            // Manual Instances
            for (const r of d.rcpTypes) {
                if (r.manualInstances && r.manualInstances.length > 0) {
                    const dbInst = r.manualInstances.map((m: any) => ({
                        id: m.id,
                        rcp_definition_id: r.id,
                        date: m.date,
                        time: m.time,
                        doctor_ids: m.doctorIds,
                        backup_doctor_id: m.backupDoctorId
                    }));
                    await supabase.from('rcp_manual_instances').upsert(dbInst);
                }
            }
        }

        // 4. Template
        if (d.template) {
            const dbTpl = d.template.map((t: any) => ({
                id: t.id,
                day: t.day,
                period: t.period,
                time: t.time,
                location: t.location,
                type: t.type,
                default_doctor_id: t.defaultDoctorId,
                secondary_doctor_ids: t.secondaryDoctorIds,
                doctor_ids: t.doctorIds,
                backup_doctor_id: t.backupDoctorId,
                sub_type: t.subType,
                is_required: t.isRequired,
                is_blocking: t.isBlocking,
                frequency: t.frequency
            }));
            await supabase.from('schedule_templates').upsert(dbTpl);
        }

        // 5. Unavailabilities
        if (d.unavailabilities) {
            const dbUnav = d.unavailabilities.map((u: any) => ({
                id: u.id,
                doctor_id: u.doctorId,
                start_date: u.startDate,
                end_date: u.endDate,
                period: u.period,
                reason: u.reason
            }));
            await supabase.from('unavailabilities').upsert(dbUnav);
        }

        // 6. RCP Exceptions
        if (d.rcpExceptions) {
            const dbExc = d.rcpExceptions.map((e: any) => ({
                id: e.id,
                rcp_template_id: e.rcpTemplateId,
                original_date: e.originalDate,
                new_date: e.newDate,
                new_period: e.newPeriod,
                is_cancelled: e.isCancelled,
                new_time: e.newTime,
                custom_doctor_ids: e.customDoctorIds
            }));
            await supabase.from('rcp_exceptions').upsert(dbExc);
        }

        // 7. RCP Attendance
        if (d.rcpAttendance) {
            const attendanceList: any[] = [];
            Object.keys(d.rcpAttendance).forEach(slotId => {
                Object.keys(d.rcpAttendance[slotId]).forEach(docId => {
                    attendanceList.push({
                        slot_id: slotId,
                        doctor_id: docId,
                        status: d.rcpAttendance[slotId][docId]
                    });
                });
            });
            if (attendanceList.length > 0) {
                await supabase.from('rcp_attendance').upsert(attendanceList, { onConflict: 'slot_id, doctor_id' });
            }
        }

        // 8. App Settings (postes, activitiesStartDate, manualOverrides) - singleton row
        const settingsToUpsert: any = { id: 1 };

        if (d.postes && d.postes.length > 0) {
            settingsToUpsert.postes = d.postes;
        }
        if (d.activitiesStartDate) {
            settingsToUpsert.activities_start_date = d.activitiesStartDate;
        }
        if (d.manualOverrides && Object.keys(d.manualOverrides).length > 0) {
            settingsToUpsert.manual_overrides = d.manualOverrides;
        }

        if (Object.keys(settingsToUpsert).length > 1) { // More than just id
            await supabase.from('app_settings').upsert(settingsToUpsert);
        }

        // 9. Specialties
        if (d.specialties && d.specialties.length > 0) {
            const dbSpec = d.specialties.map((s: any) => ({
                id: s.id,
                name: s.name,
                color: s.color
            }));
            await supabase.from('specialties').upsert(dbSpec);
        }
    }
};
