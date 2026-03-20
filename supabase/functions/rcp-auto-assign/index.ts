import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

const DAY_OFFSETS: Record<string, number> = {
  'Lundi': 0, 'Mardi': 1, 'Mercredi': 2, 'Jeudi': 3, 'Vendredi': 4
};

const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

Deno.serve(async (req) => {
  const body = await req.json();

  // --- checkPending mode: called by pg_cron every hour ---
  if (body.checkPending) {
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
    return new Response(JSON.stringify({ checked: pending?.length ?? 0 }));
  }

  // --- Main mode: process a specific week ---
  const { weekStartDate, force } = body;

  const { data: config } = await supabase
    .from('rcp_auto_config')
    .select('*')
    .eq('week_start_date', weekStartDate)
    .single();

  if (!config) return new Response('No config for this week', { status: 404 });
  if (config.executed_at && !force) return new Response('Already executed', { status: 200 });

  // Load data from dedicated tables
  const [
    { data: templateSlots },
    { data: unavailabilities },
    { data: profiles }
  ] = await Promise.all([
    supabase.from('schedule_templates').select('id, day, doctor_ids, default_doctor_id, secondary_doctor_ids, type, sub_type').eq('type', 'RCP'),
    supabase.from('unavailabilities').select('doctor_id, start_date, end_date'),
    supabase.from('profiles').select('id, doctor_id'),
  ]);

  const weekStart = new Date(weekStartDate + 'T00:00:00Z');
  const results = [];

  for (const slot of (templateSlots ?? [])) {
    const dayOffset = DAY_OFFSETS[slot.day];
    if (dayOffset === undefined) continue;

    const slotDate = new Date(weekStart);
    slotDate.setUTCDate(weekStart.getUTCDate() + dayOffset);
    const dateStr = toDateStr(slotDate);
    const slotId = `${slot.id}-${dateStr}`;

    // Check if already locked (PRÉSENT record exists)
    const { data: presentRecord } = await supabase
      .from('rcp_attendance')
      .select('doctor_id')
      .eq('slot_id', slotId)
      .eq('status', 'PRESENT')
      .limit(1);

    if (presentRecord && presentRecord.length > 0) continue;

    // Get assigned doctor IDs
    const assignedIds: string[] = (slot.doctor_ids?.length
      ? slot.doctor_ids
      : [slot.default_doctor_id, ...(slot.secondary_doctor_ids ?? [])].filter(Boolean)
    );

    // Filter: not ABSENT, not on leave
    const { data: absentRecords } = await supabase
      .from('rcp_attendance')
      .select('doctor_id')
      .eq('slot_id', slotId)
      .eq('status', 'ABSENT');

    const absentIds = new Set((absentRecords ?? []).map((r: any) => r.doctor_id));

    const available = assignedIds.filter((docId: string) => {
      if (absentIds.has(docId)) return false;
      const onLeave = (unavailabilities ?? []).some((u: any) =>
        u.doctor_id === docId && dateStr >= u.start_date && dateStr <= u.end_date
      );
      return !onLeave;
    });

    if (available.length === 0) {
      // Notify admins (profiles without doctor_id)
      const admins = (profiles ?? []).filter((p: any) => !p.doctor_id);
      for (const admin of admins) {
        await supabase.from('notifications').insert({
          user_id: admin.id,
          type: 'RCP_UNASSIGNED_ALERT',
          title: 'RCP sans médecin disponible',
          body: `Aucun médecin disponible pour le RCP du ${dateStr} (${slot.sub_type ?? slot.type})`,
          data: { slotId, date: dateStr },
        });
      }
      continue;
    }

    // Random pick
    const pickedDoctorId = available[Math.floor(Math.random() * available.length)];

    // Insert PRÉSENT in rcp_attendance
    await supabase.from('rcp_attendance').upsert(
      { slot_id: slotId, doctor_id: pickedDoctorId, status: 'PRESENT' },
      { onConflict: 'slot_id,doctor_id' }
    );

    // Notify the picked doctor
    const pickedProfile = (profiles ?? []).find((p: any) => p.doctor_id === pickedDoctorId);
    if (pickedProfile) {
      await supabase.from('notifications').insert({
        user_id: pickedProfile.id,
        type: 'RCP_AUTO_ASSIGNED',
        title: 'Vous avez été assigné à un RCP',
        body: `Vous avez été sélectionné pour le RCP du ${dateStr} (${slot.sub_type ?? 'RCP'})`,
        data: { slotId, date: dateStr },
      });

      // Push notification
      const { data: pushSubs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', pickedProfile.id);

      for (const sub of (pushSubs ?? [])) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: 'RadioPlan — RCP assigné', body: `RCP du ${dateStr}` })
          );
        } catch { /* expired subscription */ }
      }
    }

    results.push({ slotId, assignedTo: pickedDoctorId });
  }

  // Mark config as executed
  await supabase
    .from('rcp_auto_config')
    .update({ executed_at: new Date().toISOString() })
    .eq('week_start_date', weekStartDate);

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
