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

const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export const deleteRcpAutoConfig = async (weekStartDate: string): Promise<void> => {
  const { error } = await supabase
    .from('rcp_auto_config')
    .delete()
    .eq('week_start_date', weekStartDate);
  if (error) throw error;
};

export const cancelWeekAutoAssign = async (
  weekStartDate: string,
  rcpTemplateIds: string[]
): Promise<void> => {
  const weekStart = new Date(weekStartDate + 'T12:00:00');
  const dates = [0, 1, 2, 3, 4].map(i => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return toDateStr(d);
  });
  const slotIds = rcpTemplateIds.flatMap(id => dates.map(date => `${id}-${date}`));
  if (slotIds.length > 0) {
    const { error } = await supabase
      .from('rcp_attendance')
      .delete()
      .in('slot_id', slotIds)
      .eq('status', 'PRESENT');
    if (error) throw error;
  }
  const { error: err2 } = await supabase
    .from('rcp_auto_config')
    .update({ executed_at: null })
    .eq('week_start_date', weekStartDate);
  if (err2) throw err2;
};
