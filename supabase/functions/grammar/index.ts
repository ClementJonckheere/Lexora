// Lexora : correction des phrases libres par LanguageTool, sur le serveur LanguageTool de l'utilisateur
// (Supabase Edge Function).
//
// Secrets : LANGUAGETOOL_URL (adresse du serveur, par exemple https://lt.mondomaine.fr) ; facultatif
// LANGUAGETOOL_AUTH (valeur d'en-tête Authorization si le serveur est protégé, par exemple « Basic … »).
// L'adresse reste sur le serveur. Seuls les utilisateurs connectés à Lexora peuvent s'en servir ; ALLOWED_EMAILS
// (facultatif, adresses séparées par des virgules) limite l'accès à ces comptes. Renvoie la réponse de LanguageTool
// telle quelle (lue par src/core/grammar/languageTool.ts). Le texte n'est ni gardé ni journalisé.
//
// Déploiement : voir docs/SUPABASE.md, section « Correction des phrases (LanguageTool) ».
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const base = Deno.env.get('LANGUAGETOOL_URL')?.trim().replace(/\/+$/, '').replace(/\/v2(\/check)?$/, '');
  if (!base) return json({ error: 'not_configured' }, 503);

  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email ?? '').toLowerCase())) return json({ error: 'forbidden' }, 403);

  let body: { text?: unknown; language?: unknown; check?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const extra = Deno.env.get('LANGUAGETOOL_AUTH')?.trim();
  if (extra) headers.Authorization = extra;

  // Vérification depuis les Paramètres : le serveur répond-il ?
  if (body.check === true) {
    const r = await fetch(`${base}/v2/languages`, { headers }).catch(() => null);
    return r?.ok ? json({ ok: true }) : json({ error: 'languagetool', status: r?.status ?? 0 }, 502);
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const language = typeof body.language === 'string' ? body.language : '';
  // Des phrases d'exercice : pas de textes entiers.
  if (!text || text.length > 500 || !LANG.test(language)) return json({ error: 'bad_request' }, 400);

  const form = new URLSearchParams({ text, language, motherTongue: 'fr' });
  const r = await fetch(`${base}/v2/check`, { method: 'POST', headers, body: form }).catch(() => null);
  if (!r) return json({ error: 'languagetool', status: 0 }, 502);
  if (!r.ok) {
    console.error('LanguageTool', r.status, { language, length: text.length });
    return json({ error: 'languagetool', status: r.status }, 502);
  }
  return json(await r.json());
});
