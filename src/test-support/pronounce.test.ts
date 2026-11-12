import { beforeEach, describe, expect, it, vi } from 'vitest';
import { edge } from './edgeStubs';

/** Fonction Supabase `pronounce` (supabase/functions/pronounce/index.ts), exécutée avec Deno simulé. */
let handler: (req: Request) => Promise<Response>;
const env: Record<string, string> = { SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k', AZURE_SPEECH_KEY: 'secret', AZURE_SPEECH_REGION: 'West Europe' };
vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => (handler = h) });
const calls: { url: string; init: RequestInit }[] = [];
let azureStatus = 200;
vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ RecognitionStatus: 'Success', NBest: [{ PronScore: 80 }] }), { status: azureStatus });
});
const fn = '../../supabase/functions/pronounce/index';
await import(/* @vite-ignore */ fn);

const post = (body: unknown) => handler(new Request('https://x/pronounce', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }));
const audio = btoa('RIFF....WAVEfmt ');

describe('fonction pronounce (Azure)', () => {
  beforeEach(() => {
    calls.length = 0;
    azureStatus = 200;
    edge.user = { email: 'a@example.com' };
  });

  it('envoie l’enregistrement et la phrase de référence à Azure, renvoie sa réponse', async () => {
    const r = await post({ audio, text: 'I will be back soon.', lang: 'en-US' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ RecognitionStatus: 'Success', NBest: [{ PronScore: 80 }] });
    const { url, init } = calls[0];
    expect(url).toBe('https://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed');
    const headers = init.headers as Record<string, string>;
    expect(headers['Ocp-Apim-Subscription-Key']).toBe('secret');
    expect(JSON.parse(atob(headers['Pronunciation-Assessment']))).toMatchObject({ ReferenceText: 'I will be back soon.', Granularity: 'Word', EnableMiscue: true });
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('RIFF....WAVEfmt ');
  });

  it('refus : non connecté, enregistrement trop long ou absent, langue invalide ; erreur Azure relayée', async () => {
    edge.user = null;
    expect((await post({ audio, text: 'x', lang: 'en-US' })).status).toBe(401);
    edge.user = { email: 'a@example.com' };
    expect((await post({ audio: 'A'.repeat(1_400_001), text: 'x', lang: 'en-US' })).status).toBe(400);
    expect((await post({ text: 'x', lang: 'en-US' })).status).toBe(400);
    expect((await post({ audio, text: 'x', lang: 'english' })).status).toBe(400);
    expect(calls).toHaveLength(0);
    azureStatus = 401;
    const r = await post({ audio, text: 'x', lang: 'en-US' });
    expect([r.status, await r.json()]).toEqual([502, { error: 'azure', status: 401 }]);
  });
});
