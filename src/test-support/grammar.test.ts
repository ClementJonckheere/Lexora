import { beforeEach, describe, expect, it, vi } from 'vitest';
import { edge } from './edgeStubs';

/** Fonction Supabase `grammar` (supabase/functions/grammar/index.ts), exécutée avec Deno simulé. */
let handler: (req: Request) => Promise<Response>;
const env: Record<string, string> = { SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k', LANGUAGETOOL_URL: 'https://lt.example.org/v2/' };
vi.stubGlobal('Deno', { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => (handler = h) });
const calls: { url: string; init?: RequestInit }[] = [];
vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ matches: [{ offset: 3, length: 2, message: 'agreement' }] }), { status: 200 });
});
const fn = '../../supabase/functions/grammar/index';
await import(/* @vite-ignore */ fn);

const post = (body: unknown) => handler(new Request('https://x/grammar', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }));

describe('fonction grammar (LanguageTool)', () => {
  beforeEach(() => {
    calls.length = 0;
    edge.user = { email: 'a@example.com' };
    delete env.ALLOWED_EMAILS;
    delete env.LANGUAGETOOL_AUTH;
  });

  it('transmet la phrase au serveur LanguageTool (adresse normalisée, langue maternelle française) et renvoie sa réponse', async () => {
    const r = await post({ text: ' He go home. ', language: 'en-US' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ matches: [{ offset: 3, length: 2, message: 'agreement' }] });
    expect(calls[0].url).toBe('https://lt.example.org/v2/check');
    expect(Object.fromEntries(new URLSearchParams(String(calls[0].init?.body)))).toEqual({ text: 'He go home.', language: 'en-US', motherTongue: 'fr' });
  });

  it('en-tête d’accès facultatif ; test de connexion sans phrase', async () => {
    env.LANGUAGETOOL_AUTH = 'Basic abc';
    expect((await post({ check: true })).status).toBe(200);
    expect(calls[0].url).toBe('https://lt.example.org/v2/languages');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Basic abc');
  });

  it('refus : non connecté, adresse hors liste, texte trop long, serveur non configuré', async () => {
    edge.user = null;
    expect((await post({ text: 'x', language: 'en-US' })).status).toBe(401);
    edge.user = { email: 'b@example.com' };
    env.ALLOWED_EMAILS = 'a@example.com';
    expect((await post({ text: 'x', language: 'en-US' })).status).toBe(403);
    delete env.ALLOWED_EMAILS;
    expect((await post({ text: 'x'.repeat(501), language: 'en-US' })).status).toBe(400);
    const saved = env.LANGUAGETOOL_URL;
    delete env.LANGUAGETOOL_URL;
    expect((await post({ text: 'x', language: 'en-US' })).status).toBe(503);
    env.LANGUAGETOOL_URL = saved;
    expect(calls).toHaveLength(0);
  });
});
