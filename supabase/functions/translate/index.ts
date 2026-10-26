// Lexora — traduction DeepL partagée (Supabase Edge Function).
//
// La clé DeepL reste sur le serveur (secret DEEPL_API_KEY) : elle n'est ni dans le dépôt ni dans
// l'application. Seuls les utilisateurs connectés à Lexora peuvent s'en servir ; ALLOWED_EMAILS
// (facultatif, adresses séparées par des virgules) limite l'accès à ces comptes.
//
// Déploiement : voir docs/SUPABASE.md, section « Traduction DeepL partagée ».
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const LANG = /^[A-Z]{2}(-[A-Z]{2,4})?$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const key = Deno.env.get('DEEPL_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);

  // Utilisateur réellement connecté (la clé publique « anon » seule ne suffit pas).
  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email ?? '').toLowerCase())) return json({ error: 'forbidden' }, 403);

  let body: { text?: unknown; source_lang?: unknown; target_lang?: unknown; context?: unknown; usage?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const host = key.trim().endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const headers = { Authorization: `DeepL-Auth-Key ${key.trim()}`, 'Content-Type': 'application/json' };

  if (body.usage === true) {
    const r = await fetch(`${host}/v2/usage`, { headers });
    if (!r.ok) return json({ error: 'deepl', status: r.status }, 502);
    return json(await r.json());
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const source = typeof body.source_lang === 'string' ? body.source_lang.toUpperCase() : '';
  const target = typeof body.target_lang === 'string' ? body.target_lang.toUpperCase() : 'FR';
  const context = typeof body.context === 'string' ? body.context.trim().slice(0, 1500) : '';
  // Des mots, des expressions et des phrases d'exemple : pas de textes entiers (quota partagé).
  if (!text || text.length > 600 || !LANG.test(source) || !LANG.test(target)) return json({ error: 'bad_request' }, 400);

  const r = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: [text], source_lang: source, target_lang: target, ...(context && context !== text ? { context } : {}) }),
  });
  if (!r.ok) return json({ error: 'deepl', status: r.status }, r.status === 456 ? 429 : 502);
  const out = await r.json();
  return json({ text: out?.translations?.[0]?.text ?? '' });
});
