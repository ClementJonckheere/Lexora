// Lexora : rappels sur le téléphone (Supabase Edge Function, Web Push).
//
// Appelée chaque quart d'heure par une tâche planifiée (pg_cron, docs/SUPABASE.md « Rappels sur le téléphone »),
// avec l'en-tête x-cron-secret. Pour chaque abonnement (table push_subscriptions) dont l'heure de rappel tombe
// dans l'heure en cours (fuseau de l'appareil), et qui n'a pas encore reçu de rappel aujourd'hui (un envoi en échec
// est retenté au passage suivant, dans cette heure) : si aucune
// révision n'est enregistrée aujourd'hui (tous appareils, table review_logs), envoie « N jours d'affilée » ou
// « C'est l'heure de réviser ».
//
// Secrets : CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (paire d'envoi ; la publique est aussi dans
// src/core/platform/push.ts), VAPID_SUBJECT facultatif (mailto:…). La clé « service role », fournie
// automatiquement aux fonctions par Supabase, ne quitte pas le serveur : elle sert à lire les abonnements de tous.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const DAY = 86_400_000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Sub {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  time_zone: string;
  hour: number;
  minute: number;
  day_start_hour: number;
  last_sent_day: string | null;
}

/** Date (AAAA-MM-JJ) et heure locales dans un fuseau. */
function local(t: number, timeZone: string): { day: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Journée de révision : une révision avant l'heure de bascule compte pour la veille. */
const studyDay = (t: number, sub: Sub) => local(t - sub.day_start_hour * 3_600_000, sub.time_zone).day;

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return json({ error: 'not_configured' }, 503);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:lexora@example.invalid', publicKey, privateKey);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: subs, error } = await db.from('push_subscriptions').select('*');
  if (error) return json({ error: error.message }, 500);

  const now = Date.now();
  let sent = 0;
  for (const sub of (subs ?? []) as Sub[]) {
    const { minutes } = local(now, sub.time_zone);
    const target = sub.hour * 60 + sub.minute;
    if (minutes < target || minutes >= target + 60) continue;
    const today = studyDay(now, sub);
    if (sub.last_sent_day === today) continue;

    // Série : jours avec au moins une révision (tous appareils), jours couverts par un bouclier.
    const [{ data: logs }, { data: shields }] = await Promise.all([
      db.from('review_logs').select('reviewed_at').eq('user_id', sub.user_id).eq('deleted', 0).gte('reviewed_at', now - 400 * DAY),
      db.from('streak_shields').select('day').eq('user_id', sub.user_id).eq('deleted', 0),
    ]);
    const active = new Set((logs ?? []).map((l: { reviewed_at: number }) => studyDay(Number(l.reviewed_at), sub)));
    const covered = new Set((shields ?? []).map((s: { day: string }) => s.day));
    // Déjà révisé aujourd'hui : rien à envoyer, plus rien à vérifier avant demain.
    const markSent = () => db.from('push_subscriptions').update({ last_sent_day: today }).eq('endpoint', sub.endpoint);
    if (active.has(today)) {
      await markSent();
      continue;
    }
    let streak = 0;
    for (let t = now - DAY; ; t -= DAY) {
      const day = studyDay(t, sub);
      if (active.has(day)) streak++;
      else if (!covered.has(day)) break;
    }

    const payload =
      streak > 0
        ? { title: `${streak} jour${streak > 1 ? 's' : ''} d'affilée`, body: "Quelques minutes aujourd'hui pour garder votre série." }
        : { title: "C'est l'heure de réviser", body: 'Quelques minutes suffisent pour avancer.' };
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600 });
      // Noté seulement une fois envoyé : une erreur passagère est retentée au passage suivant (toutes les 15 minutes,
      // tant qu'on reste dans l'heure du rappel).
      await markSent();
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // Abonnement expiré ou retiré (application désinstallée, notifications refusées) : on l'oublie.
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      else console.error('Envoi impossible', status, (err as Error).message);
    }
  }
  return json({ ok: true, sent });
});
