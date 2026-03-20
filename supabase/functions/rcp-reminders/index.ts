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

  const { data: configs12h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .gte('deadline_at', in12h.toISOString()).lte('deadline_at', in13h.toISOString());

  const { data: configs24h } = await supabase
    .from('rcp_auto_config').select('*').is('executed_at', null)
    .gte('deadline_at', in24h.toISOString()).lte('deadline_at', in25h.toISOString());

  const [{ data: templateSlots }, { data: profiles }] = await Promise.all([
    supabase.from('schedule_templates').select('id, day, doctor_ids, default_doctor_id, secondary_doctor_ids, type, sub_type').eq('type', 'RCP'),
    supabase.from('profiles').select('id, doctor_id'),
  ]);

  const sendReminders = async (
    configs: any[],
    type: 'RCP_REMINDER_24H' | 'RCP_REMINDER_12H',
    hoursLabel: number
  ) => {
    for (const cfg of configs) {
      const weekStart = new Date(cfg.week_start_date + 'T00:00:00Z');

      for (const slot of (templateSlots ?? [])) {
        const dayOffset = DAY_OFFSETS[slot.day];
        if (dayOffset === undefined) continue;

        const slotDate = new Date(weekStart);
        slotDate.setUTCDate(weekStart.getUTCDate() + dayOffset);
        const dateStr = toDateStr(slotDate);
        const slotId = `${slot.id}-${dateStr}`;

        // Skip if already confirmed
        const { data: present } = await supabase
          .from('rcp_attendance').select('id').eq('slot_id', slotId).eq('status', 'PRESENT').limit(1);
        if (present && present.length > 0) continue;

        const assignedIds: string[] = slot.doctor_ids?.length
          ? slot.doctor_ids
          : [slot.default_doctor_id, ...(slot.secondary_doctor_ids ?? [])].filter(Boolean);

        for (const docId of assignedIds) {
          const prof = (profiles ?? []).find((p: any) => p.doctor_id === docId);
          if (!prof) continue;

          await supabase.from('notifications').insert({
            user_id: prof.id,
            type,
            title: `Rappel RCP — ${hoursLabel}h avant tirage`,
            body: `Personne n'a encore confirmé pour le RCP du ${dateStr}. Tirage automatique dans ${hoursLabel}h.`,
            data: { slotId, date: dateStr },
          });
        }
      }
    }
  };

  await sendReminders(configs12h ?? [], 'RCP_REMINDER_12H', 12);
  await sendReminders(configs24h ?? [], 'RCP_REMINDER_24H', 24);

  return new Response(JSON.stringify({ ok: true }));
});
