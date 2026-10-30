// Lexora : relais HTTP de la version web (Supabase Edge Function).
//
// Project Gutenberg, Gutendex, Tatoeba, MyMemory, DeepL et le Wiktionnaire n'autorisent pas les requêtes directes depuis
// une page web (CORS). L'application Windows passe par sa couche native ; la version web (téléphone) passe par ce relais,
// limité à ces domaines et aux utilisateurs connectés (ALLOWED_EMAILS, facultatif, restreint à ces comptes).
//
// Appel : GET ou POST /functions/v1/proxy?url=<adresse encodée>. L'en-tête x-upstream-authorization est transmis comme
// Authorization (clé DeepL personnelle) ; Range et Content-Type sont transmis tels quels.
// Déploiement : voir docs/SUPABASE.md, section « Version web (téléphone) ».
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_HOSTS = new Set([
  'gutendex.com',
  'www.gutenberg.org',
  'gutenberg.org',
  'api.mymemory.translated.net',
  'tatoeba.org',
  'api-free.deepl.com',
  'api.deepl.com',
  'en.wiktionary.org',
]);
/** Un livre de Gutenberg dépasse rarement quelques mégaoctets. */
const MAX_BYTES = 12 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, x-upstream-authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'content-type, content-range',
};
const fail = (error: string, status: number) => new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') return fail('method_not_allowed', 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail('unauthorized', 401);
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email ?? '').toLowerCase())) return fail('forbidden', 403);

  let target: URL;
  try {
    target = new URL(new URL(req.url).searchParams.get('url') ?? '');
  } catch {
    return fail('bad_url', 400);
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.host)) return fail('host_not_allowed', 403);

  const headers: Record<string, string> = { 'User-Agent': 'Lexora (relais de la version web)' };
  for (const h of ['range', 'content-type']) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  const upstreamAuth = req.headers.get('x-upstream-authorization');
  if (upstreamAuth) headers.Authorization = upstreamAuth;

  let res: Response;
  try {
    res = await fetch(target, { method: req.method, headers, body: req.method === 'POST' ? await req.text() : undefined, redirect: 'follow' });
  } catch {
    return fail('upstream_unreachable', 502);
  }
  // Les redirections (gutenberg.org → www) ne doivent pas sortir de la liste.
  if (!ALLOWED_HOSTS.has(new URL(res.url || target.href).host)) return fail('host_not_allowed', 403);
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return fail('too_large', 413);
  const out: Record<string, string> = { ...CORS, 'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream' };
  const range = res.headers.get('content-range');
  if (range) out['Content-Range'] = range;
  return new Response(body, { status: res.status, headers: out });
});
