// supabase/functions/send-push/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// npm: specifier uses Deno's native Node.js compatibility layer
// (esm.sh transpilation breaks web-push's crypto internals in Deno)
import webpush from 'npm:web-push@3.6.7';

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
  const { user_id, type, title, body, data } = await req.json();

  if (!user_id || !title) {
    return new Response(JSON.stringify({ error: 'user_id and title required' }), { status: 400 });
  }

  // Check user's notification preferences before sending push
  // Missing key or null defaults to enabled (opt-out model)
  if (type) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', user_id)
      .single();

    const prefs: Record<string, boolean> = profile?.notification_preferences ?? {};
    if (prefs[type] === false) {
      return new Response(JSON.stringify({ sent: 0, failed: 0, reason: 'preference_disabled' }));
    }
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

  // Include type in payload so sw.js can build a unique tag per notification type + slot
  const payload = JSON.stringify({ title, body: body ?? '', type: type ?? '', data: data ?? {} });
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
      // HTTP 410 = subscription expired/revoked, 404 = endpoint unknown — delete both
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        console.log(`Deleted stale subscription ${sub.id} (HTTP ${err.statusCode})`);
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
