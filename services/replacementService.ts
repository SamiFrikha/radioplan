// services/replacementService.ts
import { supabase } from './supabaseClient';
import { ReplacementRequest, Period } from '../types';

const mapRow = (r: any): ReplacementRequest => ({
  id: r.id,
  requesterDoctorId: r.requester_doctor_id,
  targetDoctorId: r.target_doctor_id,
  slotDate: r.slot_date,
  period: r.period as Period,
  activityName: r.activity_name,
  slotId: r.slot_id,
  status: r.status,
  created_at: r.created_at,
  resolved_at: r.resolved_at,
});

export const sendReplacementRequest = async (
  req: Omit<ReplacementRequest, 'id' | 'created_at' | 'resolved_at' | 'status'>
): Promise<string> => {
  const { data, error } = await supabase
    .from('replacement_requests')
    .insert({
      requester_doctor_id: req.requesterDoctorId,
      target_doctor_id: req.targetDoctorId,
      slot_date: req.slotDate,
      period: req.period,
      activity_name: req.activityName,
      slot_id: req.slotId,
      status: 'PENDING',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

export const resolveReplacementRequest = async (
  requestId: string,
  status: 'ACCEPTED' | 'REJECTED'
): Promise<ReplacementRequest> => {
  const { data, error } = await supabase
    .from('replacement_requests')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data);
};

/**
 * Accepts a replacement request AND directly assigns the target doctor to the slot.
 * - Marks replacement_requests.status = 'ACCEPTED'
 * - Merges slotId → targetDoctorId into app_settings.manual_overrides
 * - For RCP slots: upserts rcp_attendance with status PRESENT
 */
export const acceptAndAssignReplacement = async (
  requestId: string,
  slotId: string,
  targetDoctorId: string,
  slotType?: string
): Promise<ReplacementRequest> => {
  // 1. Mark request accepted
  const resolved = await resolveReplacementRequest(requestId, 'ACCEPTED');

  // 2. Merge into app_settings.manual_overrides (singleton row id=1)
  const { data: settings, error: settingsErr } = await supabase
    .from('app_settings')
    .select('id, manual_overrides')
    .eq('id', 1)
    .single();

  if (!settingsErr && settings) {
    const current: Record<string, string> = settings.manual_overrides ?? {};
    const merged = { ...current, [slotId]: targetDoctorId };
    await supabase
      .from('app_settings')
      .update({ manual_overrides: merged, updated_at: new Date().toISOString() })
      .eq('id', 1);
  }

  // 3. For RCP slots: mark the accepting doctor as PRESENT in rcp_attendance
  if (slotType === 'RCP') {
    await supabase
      .from('rcp_attendance')
      .upsert(
        { slot_id: slotId, doctor_id: targetDoctorId, status: 'PRESENT' },
        { onConflict: 'slot_id,doctor_id' }
      );
  }

  return resolved;
};
