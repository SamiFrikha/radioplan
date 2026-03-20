// supabase/functions/send-push/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,           // e.g. "mailto:admin@radioplan.fr"
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

Deno.serve(async (req) => {
  const { user_id, title, body, data } = await req.json();

  if (!user_id || !title) {
    return new Response(JSON.stringify({ error: 'user_id and title required' }), { status: 400 });
  }

  // Fetch all push subscriptions for this user
  const { data: subscriptions, error: fetchError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user_id);

  if (fetchError) {
    console.error('Failed to fetch subscriptions:', fetchError);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500 });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, reason: 'no subscriptions' }));
  }

  const payload = JSON.stringify({ title, body: body ?? '', data: data ?? {} });
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err: any) {
      // HTTP 410 = subscription expired or revoked — delete it
      if (err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        console.log(`Deleted expired subscription ${sub.id}`);
      } else {
        console.error(`Push failed for subscription ${sub.id}:`, err.message);
        failed++;
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
