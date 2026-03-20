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
