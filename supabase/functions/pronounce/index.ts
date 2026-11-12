// Lexora : notation de la prononciation (Supabase Edge Function, Azure AI Speech, évaluation de la prononciation).
//
// Facultative : l'utilisateur l'active dans les Paramètres (réglage désactivé par défaut). L'enregistrement de sa
// répétition (WAV 16 kHz mono, 30 s au plus) et la phrase de référence sont transmis à Azure, puis oubliés : rien
// n'est gardé ni journalisé ici. Renvoie la réponse d'Azure telle quelle (lue par src/core/speech/pronunciation.ts).
// Mêmes secrets que la voix naturelle (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION) ; seuls les utilisateurs connectés,
// et ceux d'ALLOWED_EMAILS s'il est renseigné, peuvent s'en servir.
//
// Déploiement : voir docs/SUPABASE.md, section « Notation de la prononciation ».
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const LANG = /^[a-z]{2,3}-[A-Za-z]{2,4}$/;
/** 30 s de WAV 16 kHz 16 bits mono, encodées en base64 (avec une marge). */
const MAX_BASE64 = 1_400_000;

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const key = Deno.env.get('AZURE_SPEECH_KEY')?.trim();
  const region = Deno.env.get('AZURE_SPEECH_REGION')?.replace(/\s+/g, '').toLowerCase();
  if (!key || !region) return json({ error: 'not_configured' }, 503);

  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email ?? '').toLowerCase())) return json({ error: 'forbidden' }, 403);

  let body: { audio?: unknown; text?: unknown; lang?: unknown; check?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (body.check === true) return json({ ok: true, region });

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const lang = typeof body.lang === 'string' ? body.lang : '';
  const audio = typeof body.audio === 'string' ? body.audio : '';
  if (!text || text.length > 300 || !LANG.test(lang) || !audio || audio.length > MAX_BASE64) return json({ error: 'bad_request' }, 400);
  let wav: Uint8Array;
  try {
    wav = decodeBase64(audio);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const assessment = btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(JSON.stringify({ ReferenceText: text, GradingSystem: 'HundredMark', Granularity: 'Word', Dimension: 'Comprehensive', EnableMiscue: true })),
    ),
  );
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(lang)}&format=detailed`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Pronunciation-Assessment': assessment,
      Accept: 'application/json',
    },
    body: wav,
  }).catch(() => null);
  if (!r) return json({ error: 'azure', status: 0 }, 502);
  if (!r.ok) {
    console.error('Azure', r.status, { region, lang, bytes: wav.length });
    return json({ error: 'azure', status: r.status }, r.status === 429 ? 429 : 502);
  }
  return json(await r.json());
});
