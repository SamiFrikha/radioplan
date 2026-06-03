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

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

type ReminderType = 'RCP_REMINDER_24H' | 'RCP_REMINDER_12H';
type SentAtColumn = 'reminder_24h_sent_at' | 'reminder_12h_sent_at';

// Send reminder notifications for one RCP slot.
// Skips the whole slot if someone is already PRÉSENT; skips individual doctors
// who already declared a status or are unavailable that day/period.
const notifySlot = async (
  slotId: string,
  dateStr: string,
  slotPeriod: string,
  assignedIds: string[],
  subType: string | null,
  weekUnavail: Unavail[],
  profiles: any[],
  type: ReminderType,
  hoursLabel: number,
  overrides: Record<string, string>,
  blockingActivityIds: Set<string>,
) => {
  if (assignedIds.length === 0) return;

  const { data: attendance, error: attendanceErr } = await supabase
    .from('rcp_attendance')
    .select('doctor_id, status')
    .eq('slot_id', slotId);

  if (attendanceErr) {
    console.error(`[rcp-reminders] attendance error for ${slotId}:`, attendanceErr.message);
    return;
  }

  // Skip the entire slot if any doctor already confirmed PRÉSENT.
  if ((attendance ?? []).some((r: any) => r.status === 'PRESENT')) return;

  const decidedDocIds = new Set((attendance ?? []).map((r: any) => r.doctor_id));
  const unavailableOnDay = unavailableDoctorSet(weekUnavail, dateStr, slotPeriod);
  const busyOnActivity = busyDoctorSetFromActivities(overrides, blockingActivityIds, dateStr, slotPeriod);

  for (const docId of assignedIds) {
    if (decidedDocIds.has(docId)) continue;     // already declared PRÉSENT/ABSENT
    if (unavailableOnDay.has(docId)) continue;  // unavailable that day/period
    if (busyOnActivity.has(docId)) continue;    // on a blocking activity (astreinte, UNITY, …)

    const prof = profiles.find((p: any) => p.doctor_id === docId);
    if (!prof) continue;

    await supabase.from('notifications').insert({
      user_id: prof.id,
      type,
      title: `Rappel RCP${subType ? ` — ${subType}` : ''} — ${hoursLabel}h avant tirage`,
      body: `Rappel : vous êtes assigné au RCP${subType ? ` "${subType}"` : ''} du ${dateStr}. Confirmez votre présence ou déclarez une absence avant le tirage automatique dans ${hoursLabel}h.`,
      data: { slotId, date: dateStr },
    });
  }
};

Deno.serve(async () => {
  const now = new Date();

  const in12h = new Date(now.getTime() + 12 * 3600_000);
  const in13h = new Date(now.getTime() + 13 * 3600_000);
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const in25h = new Date(now.getTime() + 25 * 3600_000);

  // Configs whose 12h reminder hasn't been sent yet.
  const { data: configs12h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .is('reminder_12h_sent_at', null)
    .gte('deadline_at', in12h.toISOString()).lte('deadline_at', in13h.toISOString());

  // Configs whose 24h reminder hasn't been sent yet.
  const { data: configs24h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .is('reminder_24h_sent_at', null)
    .gte('deadline_at', in24h.toISOString()).lte('deadline_at', in25h.toISOString());

  const [
    { data: templateSlots },
    { data: profiles },
    { data: rcpDefs },
    { data: rcpExceptions },
    { data: appSettings },
    { data: activities },
  ] = await Promise.all([
    supabase.from('schedule_templates')
      .select('id, day, period, doctor_ids, default_doctor_id, secondary_doctor_ids, type, sub_type, location, frequency')
      .eq('type', 'RCP'),
    supabase.from('profiles').select('id, doctor_id'),
    supabase.from('rcp_definitions')
      .select('id, name, frequency, week_parity, monthly_week_number'),
    supabase.from('rcp_exceptions')
      .select('rcp_template_id, original_date, is_cancelled'),
    supabase.from('app_settings').select('manual_overrides').limit(1).maybeSingle(),
    supabase.from('activities').select('id, allow_double_booking'),
  ]);

  const defs = (rcpDefs ?? []) as RcpDef[];

  // Activity assignments (astreinte, UNITY, …) live in app_settings.manual_overrides.
  // Doctors already on a *blocking* activity that half-day shouldn't be reminded.
  const overrides = (appSettings?.manual_overrides ?? {}) as Record<string, string>;
  const blockingActivityIds = new Set<string>(
    (activities ?? []).filter((a: any) => a.allow_double_booking === false).map((a: any) => a.id)
  );

  const sendReminders = async (
    configs: any[],
    type: ReminderType,
    hoursLabel: number,
    sentAtColumn: SentAtColumn,
  ) => {
    for (const cfg of configs) {
      const weekStart = new Date(cfg.week_start_date + 'T00:00:00Z');
      const weekNum = getISOWeekNumber(weekStart);
      const { startStr: weekStartStr, endStr: weekEndStr } = weekRange(weekStart);

      // One query for ALL unavailabilities overlapping this week (covers both
      // template-assigned and manual-instance doctors).
      const { data: weekUnavail } = await supabase
        .from('unavailabilities')
        .select('doctor_id, start_date, end_date, period')
        .lte('start_date', weekEndStr)
        .gte('end_date', weekStartStr);

      const unavail = (weekUnavail ?? []) as Unavail[];

      // ── 1. TEMPLATE-BASED RCPs ──────────────────────────────────────────────
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

        // slot_id always uses the original template date (even if an exception moved it).
        const slotId = `${slot.id}-${dateStr}`;

        await notifySlot(
          slotId, dateStr, slot.period,
          resolveAssignedIds(slot), slot.sub_type,
          unavail, profiles ?? [],
          type, hoursLabel,
          overrides, blockingActivityIds,
        );
      }

      // ── 2. MANUAL RCP INSTANCES ─────────────────────────────────────────────
      const manualDefIds = defs.filter((r) => r.frequency === 'MANUAL').map((r) => r.id);
      if (manualDefIds.length) {
        const { data: manualInstances } = await supabase
          .from('rcp_manual_instances')
          .select('id, rcp_definition_id, date, time, doctor_ids')
          .in('rcp_definition_id', manualDefIds)
          .gte('date', weekStartStr)
          .lte('date', weekEndStr);

        for (const inst of (manualInstances ?? [])) {
          const slotId = `manual-rcp-${inst.rcp_definition_id}-${inst.id}`;
          await notifySlot(
            slotId, inst.date, periodFromTime(inst.time),
            inst.doctor_ids ?? [], null,
            unavail, profiles ?? [],
            type, hoursLabel,
            overrides, blockingActivityIds,
          );
        }
      }

      // Mark this config as reminded so the next cron tick won't re-send
      // (idempotence — replaces per-notification dedup).
      await supabase
        .from('rcp_auto_config')
        .update({ [sentAtColumn]: now.toISOString() })
        .eq('id', cfg.id);
    }
  };

  await sendReminders(configs12h ?? [], 'RCP_REMINDER_12H', 12, 'reminder_12h_sent_at');
  await sendReminders(configs24h ?? [], 'RCP_REMINDER_24H', 24, 'reminder_24h_sent_at');

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
