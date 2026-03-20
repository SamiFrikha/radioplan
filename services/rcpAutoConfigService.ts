// services/rcpAutoConfigService.ts
import { supabase } from './supabaseClient';
import { RcpAutoConfig } from '../types';

const mapRow = (r: any): RcpAutoConfig => ({
  id: r.id,
  weekStartDate: r.week_start_date,
  deadlineAt: r.deadline_at,
  executedAt: r.executed_at,
  createdAt: r.created_at,
});

export const getRcpAutoConfigs = async (): Promise<RcpAutoConfig[]> => {
  const { data, error } = await supabase
    .from('rcp_auto_config')
    .select('*')
    .order('week_start_date', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(mapRow);
};

export const upsertRcpAutoConfig = async (
  weekStartDate: string,
  deadlineAt: string,
  createdBy: string
): Promise<void> => {
  const { error } = await supabase.from('rcp_auto_config').upsert(
    { week_start_date: weekStartDate, deadline_at: deadlineAt, created_by: createdBy },
    { onConflict: 'week_start_date' }
  );
  if (error) throw error;
};

export const triggerAutoAssignNow = async (weekStartDate: string): Promise<void> => {
  const { error } = await supabase.functions.invoke('rcp-auto-assign', {
    body: { weekStartDate, force: true },
  });
  if (error) throw error;
};
