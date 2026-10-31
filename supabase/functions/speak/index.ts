// Lexora : voix naturelle partagée (Supabase Edge Function, Azure AI Speech).
//
// La clé Azure reste sur le serveur (secrets AZURE_SPEECH_KEY et AZURE_SPEECH_REGION) : elle n'est
// ni dans le dépôt ni dans l'application. Seuls les utilisateurs connectés à Lexora peuvent s'en
// servir ; ALLOWED_EMAILS (facultatif, adresses séparées par des virgules) limite l'accès à ces comptes.
// L'application garde chaque son en cache : une expression n'est synthétisée qu'une fois par appareil.
//
// Déploiement : voir docs/SUPABASE.md, section « Voix naturelle partagée ».
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Voix neuronales par langue (BCP 47) ; à défaut, une voix multilingue lit la langue demandée. */
const VOICES: Record<string, string> = {
  'en-US': 'en-US-AvaNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'es-MX': 'es-MX-DaliaNeural',
  'pt-PT': 'pt-PT-RaquelNeural',
  'pt-BR': 'pt-BR-FranciscaNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'ru-RU': 'ru-RU-SvetlanaNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
  'ko-KR': 'ko-KR-SunHiNeural',
  'ar-SA': 'ar-SA-ZariyahNeural',
  'nl-NL': 'nl-NL-ColetteNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'pl-PL': 'pl-PL-AgnieszkaNeural',
  'sv-SE': 'sv-SE-SofieNeural',
  'tr-TR': 'tr-TR-EmelNeural',
  'el-GR': 'el-GR-AthinaNeural',
  'uk-UA': 'uk-UA-PolinaNeural',
  'cs-CZ': 'cs-CZ-VlastaNeural',
  'fi-FI': 'fi-FI-NooraNeural',
  'da-DK': 'da-DK-ChristelNeural',
  'he-IL': 'he-IL-HilaNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'vi-VN': 'vi-VN-HoaiMyNeural',
};
const MULTILINGUAL = 'en-US-AvaMultilingualNeural';

const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

function voiceFor(lang: string): string {
  if (VOICES[lang]) return VOICES[lang];
  const base = lang.split('-')[0];
  return Object.entries(VOICES).find(([k]) => k.startsWith(`${base}-`))?.[1] ?? MULTILINGUAL;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const key = Deno.env.get('AZURE_SPEECH_KEY')?.trim();
  // « West Europe » (nom affiché dans Azure) vaut « westeurope ».
  const region = Deno.env.get('AZURE_SPEECH_REGION')?.replace(/\s+/g, '').toLowerCase();
  if (!key || !region) return json({ error: 'not_configured' }, 503);

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

  let body: { text?: unknown; lang?: unknown; check?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  // Vérification depuis les Paramètres : configurée et accessible, sans consommer de quota.
  if (body.check === true) return json({ ok: true, region });

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const lang = typeof body.lang === 'string' ? body.lang : '';
  // Des mots, des expressions et des phrases d'exemple : pas de textes entiers (quota partagé).
  if (!text || text.length > 400 || !LANG.test(lang)) return json({ error: 'bad_request' }, 400);

  const voice = voiceFor(lang);
  // <lang> n'est accepté que par les voix multilingues.
  const inner = voice === MULTILINGUAL ? `<lang xml:lang="${lang}">${escapeXml(text)}</lang>` : escapeXml(text);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}">${inner}</voice></speak>`;
  const synthesize = () =>
    fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Lexora',
      },
      body: ssml,
    }).catch(() => null);
  // Une seconde tentative si Azure ne répond pas ou répond par une erreur passagère (5xx).
  let r = await synthesize();
  if (!r || r.status >= 500) r = await synthesize();
  if (!r) {
    console.error('Azure injoignable', region);
    return json({ error: 'azure', status: 0 }, 502);
  }
  if (!r.ok) {
    // Visible dans Supabase : Edge Functions → speak → Logs.
    console.error('Azure', r.status, (await r.text().catch(() => '')).slice(0, 300), { region, voice, lang, length: text.length });
    return json({ error: 'azure', status: r.status }, r.status === 429 ? 429 : 502);
  }
  // octet-stream : supabase-js le rend tel quel (Blob) au lieu de le lire comme du texte.
  return new Response(await r.arrayBuffer(), { headers: { ...CORS, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
});
