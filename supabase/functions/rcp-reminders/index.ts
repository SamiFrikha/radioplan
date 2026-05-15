import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const DAY_OFFSETS: Record<string, number> = {
  'Lundi': 0, 'Mardi': 1, 'Mercredi': 2, 'Jeudi': 3, 'Vendredi': 4
};

const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

Deno.serve(async () => {
  const now = new Date();

  const in12h = new Date(now.getTime() + 12 * 3600_000);
  const in13h = new Date(now.getTime() + 13 * 3600_000);
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const in25h = new Date(now.getTime() + 25 * 3600_000);

  // Fetch configs in 12h window that haven't had their 12h reminder sent yet
  const { data: configs12h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .is('reminder_12h_sent_at', null)
    .gte('deadline_at', in12h.toISOString()).lte('deadline_at', in13h.toISOString());

  // Fetch configs in 24h window that haven't had their 24h reminder sent yet
  const { data: configs24h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .is('reminder_24h_sent_at', null)
    .gte('deadline_at', in24h.toISOString()).lte('deadline_at', in25h.toISOString());

  const [{ data: templateSlots }, { data: profiles }] = await Promise.all([
    supabase.from('schedule_templates').select('id, day, doctor_ids, default_doctor_id, secondary_doctor_ids, type, sub_type').eq('type', 'RCP'),
    supabase.from('profiles').select('id, doctor_id'),
  ]);

  const sendReminders = async (
    configs: any[],
    type: 'RCP_REMINDER_24H' | 'RCP_REMINDER_12H',
    hoursLabel: number,
    sentAtColumn: 'reminder_24h_sent_at' | 'reminder_12h_sent_at'
  ) => {
    for (const cfg of configs) {
      const weekStart = new Date(cfg.week_start_date + 'T00:00:00Z');
      let sentCount = 0;

      for (const slot of (templateSlots ?? [])) {
        const dayOffset = DAY_OFFSETS[slot.day];
        if (dayOffset === undefined) continue;

        const slotDate = new Date(weekStart);
        slotDate.setUTCDate(weekStart.getUTCDate() + dayOffset);
        const dateStr = toDateStr(slotDate);
        const slotId = `${slot.id}-${dateStr}`;

        // Load all attendance records for this slot in one query
        const { data: attendance, error: attendanceErr } = await supabase
          .from('rcp_attendance')
          .select('doctor_id, status')
          .eq('slot_id', slotId);

        if (attendanceErr) {
          console.error(`[rcp-reminders] Error checking attendance for ${slotId}:`, attendanceErr.message);
          continue;
        }

        // Skip entire slot if any doctor already confirmed PRÉSENT
        const hasPresent = (attendance ?? []).some((r: any) => r.status === 'PRESENT');
        if (hasPresent) continue;

        // Set of doctors who already declared any status (PRÉSENT or ABSENT)
        const decidedDocIds = new Set((attendance ?? []).map((r: any) => r.doctor_id));

        const assignedIds: string[] = slot.doctor_ids?.length
          ? slot.doctor_ids
          : [slot.default_doctor_id, ...(slot.secondary_doctor_ids ?? [])].filter(Boolean);

        for (const docId of assignedIds) {
          if (decidedDocIds.has(docId)) continue;

          const prof = (profiles ?? []).find((p: any) => p.doctor_id === docId);
          if (!prof) continue;

          await supabase.from('notifications').insert({
            user_id: prof.id,
            type,
            title: `Rappel RCP${slot.sub_type ? ` — ${slot.sub_type}` : ''} — ${hoursLabel}h avant tirage`,
            body: `Rappel : vous êtes assigné au RCP${slot.sub_type ? ` "${slot.sub_type}"` : ''} du ${dateStr}. Confirmez votre présence ou déclarez une absence avant le tirage automatique dans ${hoursLabel}h.`,
            data: { slotId, date: dateStr },
          });
          sentCount++;
        }
      }

      // Mark config as reminded (idempotent — won't re-send on next cron tick)
      if (sentCount >= 0) {
        await supabase
          .from('rcp_auto_config')
          .update({ [sentAtColumn]: now.toISOString() })
          .eq('id', cfg.id);
      }
    }
  };

  await sendReminders(configs12h ?? [], 'RCP_REMINDER_12H', 12, 'reminder_12h_sent_at');
  await sendReminders(configs24h ?? [], 'RCP_REMINDER_24H', 24, 'reminder_24h_sent_at');

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
