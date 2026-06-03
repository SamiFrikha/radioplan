import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DAY_OFFSETS,
  toDateStr,
  getISOWeekNumber,
  templateRcpOccurs,
  unavailableDoctorSet,
  busyDoctorSetFromActivities,
  resolveAssignedIds,
  periodFromTime,
  weekRange,
  type RcpDef,
  type Unavail,
} from '../_shared/rcp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

type Slot = {
  slotId: string;
  dateStr: string;
  period: string;
  assignedIds: string[];
  subType: string | null;
};

// Run the auto-assignment draw for a single RCP slot.
const drawForSlot = async (
  slot: Slot,
  unavail: Unavail[],
  profiles: any[],
  results: any[],
  overrides: Record<string, string>,
  blockingActivityIds: Set<string>,
) => {
  const { slotId, dateStr, period, assignedIds, subType } = slot;

  // Skip if already locked (a PRÉSENT record exists).
  const { data: presentRecord } = await supabase
    .from('rcp_attendance')
    .select('doctor_id')
    .eq('slot_id', slotId)
    .eq('status', 'PRESENT')
    .limit(1);
  if (presentRecord && presentRecord.length > 0) return;

  // Doctors who declared ABSENT for this slot.
  const { data: absentRecords } = await supabase
    .from('rcp_attendance')
    .select('doctor_id')
    .eq('slot_id', slotId)
    .eq('status', 'ABSENT');
  const absentIds = new Set((absentRecords ?? []).map((r: any) => r.doctor_id));

  // Doctors unavailable that day/period (handles half-days).
  const unavailableOnDay = unavailableDoctorSet(unavail, dateStr, period);

  // Doctors already assigned to a blocking activity (astreinte, UNITY, …) on the
  // same half-day — they cannot also cover this RCP.
  const busyOnActivity = busyDoctorSetFromActivities(overrides, blockingActivityIds, dateStr, period);

  const available = assignedIds.filter(
    (docId) => !absentIds.has(docId) && !unavailableOnDay.has(docId) && !busyOnActivity.has(docId)
  );

  if (available.length === 0) {
    const admins = (profiles ?? []).filter((p: any) => !p.doctor_id);
    for (const admin of admins) {
      await supabase.from('notifications').insert({
        user_id: admin.id,
        type: 'RCP_UNASSIGNED_ALERT',
        title: 'RCP sans médecin disponible',
        body: `Aucun médecin disponible pour le RCP du ${dateStr} (${subType ?? 'RCP'})`,
        data: { slotId, date: dateStr },
      });
    }
    return;
  }

  const pickedDoctorId = available[Math.floor(Math.random() * available.length)];

  await supabase.from('rcp_attendance').upsert(
    { slot_id: slotId, doctor_id: pickedDoctorId, status: 'PRESENT' },
    { onConflict: 'slot_id,doctor_id' }
  );

  const pickedProfile = (profiles ?? []).find((p: any) => p.doctor_id === pickedDoctorId);
  if (pickedProfile) {
    await supabase.from('notifications').insert({
      user_id: pickedProfile.id,
      type: 'RCP_AUTO_ASSIGNED',
      title: 'Vous avez été assigné à un RCP',
      body: `Vous avez été sélectionné pour le RCP du ${dateStr} (${subType ?? 'RCP'})`,
      data: { slotId, date: dateStr },
    });
  }

  results.push({ slotId, assignedTo: pickedDoctorId });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* pg_cron may send empty body */ }

  // --- checkPending mode: called by pg_cron ---
  if (body.checkPending || body.action === 'checkPending') {
    const { data: pending } = await supabase
      .from('rcp_auto_config')
      .select('week_start_date')
      .is('executed_at', null)
      .lte('deadline_at', new Date().toISOString());

    for (const cfg of (pending ?? [])) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/rcp-auto-assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ weekStartDate: cfg.week_start_date }),
      });
    }
    return new Response(JSON.stringify({ checked: pending?.length ?? 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // --- Main mode: process a specific week ---
  const { weekStartDate, force } = body;

  const { data: config } = await supabase
    .from('rcp_auto_config')
    .select('*')
    .eq('week_start_date', weekStartDate)
    .single();

  if (!config) return new Response('No config for this week', { status: 404, headers: corsHeaders });
  if (config.executed_at && !force) return new Response('Already executed', { status: 200, headers: corsHeaders });

  const weekStart = new Date(weekStartDate + 'T00:00:00Z');
  const weekNum = getISOWeekNumber(weekStart);
  const { startStr: weekStartStr, endStr: weekEndStr } = weekRange(weekStart);

  const [
    { data: templateSlots },
    { data: unavailabilities },
    { data: profiles },
    { data: rcpDefs },
    { data: rcpExceptions },
    { data: appSettings },
    { data: activities },
  ] = await Promise.all([
    supabase.from('schedule_templates')
      .select('id, day, period, doctor_ids, default_doctor_id, secondary_doctor_ids, type, sub_type, location, frequency')
      .eq('type', 'RCP'),
    supabase.from('unavailabilities')
      .select('doctor_id, start_date, end_date, period')
      .lte('start_date', weekEndStr)
      .gte('end_date', weekStartStr),
    supabase.from('profiles').select('id, doctor_id'),
    supabase.from('rcp_definitions')
      .select('id, name, frequency, week_parity, monthly_week_number'),
    supabase.from('rcp_exceptions')
      .select('rcp_template_id, original_date, is_cancelled'),
    supabase.from('app_settings').select('manual_overrides').limit(1).maybeSingle(),
    supabase.from('activities').select('id, allow_double_booking'),
  ]);

  const defs = (rcpDefs ?? []) as RcpDef[];
  const unavail = (unavailabilities ?? []) as Unavail[];
  const results: any[] = [];

  // Activity assignments (astreinte, UNITY, …) live in app_settings.manual_overrides.
  // A doctor already on a *blocking* activity that half-day is unavailable for the RCP.
  const overrides = (appSettings?.manual_overrides ?? {}) as Record<string, string>;
  const blockingActivityIds = new Set<string>(
    (activities ?? []).filter((a: any) => a.allow_double_booking === false).map((a: any) => a.id)
  );

  // ── 1. TEMPLATE-BASED RCPs ────────────────────────────────────────────────
  for (const slot of (templateSlots ?? [])) {
    const dayOffset = DAY_OFFSETS[slot.day];
    if (dayOffset === undefined) continue;

    const slotDate = new Date(weekStart);
    slotDate.setUTCDate(weekStart.getUTCDate() + dayOffset);
    const dateStr = toDateStr(slotDate);

    const rcpDef = defs.find((r) => r.name === slot.location);
    const cancelled = (rcpExceptions ?? []).some(
      (ex: any) => ex.rcp_template_id === slot.id && ex.original_date === dateStr && ex.is_cancelled
    );

    if (!templateRcpOccurs(rcpDef, slot.frequency, weekNum, dateStr, cancelled)) continue;

    await drawForSlot(
      {
        slotId: `${slot.id}-${dateStr}`,
        dateStr,
        period: slot.period,
        assignedIds: resolveAssignedIds(slot),
        subType: slot.sub_type ?? null,
      },
      unavail, profiles ?? [], results, overrides, blockingActivityIds,
    );
  }

  // ── 2. MANUAL RCP INSTANCES ───────────────────────────────────────────────
  const manualDefIds = defs.filter((r) => r.frequency === 'MANUAL').map((r) => r.id);
  if (manualDefIds.length) {
    const { data: manualInstances } = await supabase
      .from('rcp_manual_instances')
      .select('id, rcp_definition_id, date, time, doctor_ids')
      .in('rcp_definition_id', manualDefIds)
      .gte('date', weekStartStr)
      .lte('date', weekEndStr);

    for (const inst of (manualInstances ?? [])) {
      await drawForSlot(
        {
          slotId: `manual-rcp-${inst.rcp_definition_id}-${inst.id}`,
          dateStr: inst.date,
          period: periodFromTime(inst.time),
          assignedIds: inst.doctor_ids ?? [],
          subType: null,
        },
        unavail, profiles ?? [], results, overrides, blockingActivityIds,
      );
    }
  }

  // Mark config as executed.
  await supabase
    .from('rcp_auto_config')
    .update({ executed_at: new Date().toISOString() })
    .eq('week_start_date', weekStartDate);

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
