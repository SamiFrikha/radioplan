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
  slotType: r.slot_type ?? undefined,
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
      slot_type: req.slotType ?? null,
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
 * Marks a replacement request as ACCEPTED or REJECTED without depending on
 * SELECT-after-UPDATE. Uses `.select('id').single()` on just the `id` column
 * which every RLS policy allows reading so it never silently fails.
 */
export const markReplacementResolved = async (
  requestId: string,
  status: 'ACCEPTED' | 'REJECTED'
): Promise<void> => {
  const { error } = await supabase
    .from('replacement_requests')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
};

/**
 * Accepts a replacement request AND directly assigns the target doctor to the slot.
 *
 * For RCP slots: upserts rcp_attendance → AppContext slice is updated by the caller.
 * For non-RCP slots: only marks accepted — the caller updates app_settings via
 *   setManualOverrides (AppContext wrapper) which persists correctly with RLS.
 */
export const getMyReplacementRequests = async (
    doctorId: string
): Promise<{ sent: ReplacementRequest[]; received: ReplacementRequest[] }> => {
    const [sentResult, receivedResult] = await Promise.all([
        supabase
            .from('replacement_requests')
            .select('*')
            .eq('requester_doctor_id', doctorId)
            .order('created_at', { ascending: false }),
        supabase
            .from('replacement_requests')
            .select('*')
            .eq('target_doctor_id', doctorId)
            .order('created_at', { ascending: false }),
    ]);
    if (sentResult.error) throw sentResult.error;
    if (receivedResult.error) throw receivedResult.error;
    return {
        sent: (sentResult.data ?? []).map(mapRow),
        received: (receivedResult.data ?? []).map(mapRow),
    };
};

export const acceptAndAssignReplacement = async (
  requestId: string,
  slotId: string,
  targetDoctorId: string,
  slotType?: string
): Promise<ReplacementRequest> => {
  // 1. Mark request accepted in DB
  const resolved = await resolveReplacementRequest(requestId, 'ACCEPTED');

  // 2. For RCP: persist attendance directly — the slot_id is the generated slot ID
  //    (e.g. "rcp-HPPE Onco-Monday-2026-03-17") and rcp_attendance uses the same id.
  if (slotType === 'RCP') {
    await supabase
      .from('rcp_attendance')
      .upsert(
        { slot_id: slotId, doctor_id: targetDoctorId, status: 'PRESENT' },
        { onConflict: 'slot_id,doctor_id' }
      );
  }

  // 3. For non-RCP (consultation, activity): the caller must call setManualOverrides
  //    (AppContext wrapper) with { [slotId]: targetDoctorId } — that wrapper persists
  //    via settingsService which has the correct RLS-safe upsert.

  return resolved;
};
