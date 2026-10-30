import { isTauri } from './env';

/**
 * Requêtes vers Gutendex, Project Gutenberg, DeepL et MyMemory (traduction), Tatoeba (exemples).
 * - Application : via la couche native (tauri-plugin-http), limitée à ces domaines ;
 *   Project Gutenberg n'autorise pas les requêtes directes depuis une page web.
 * - Aperçu navigateur : via le proxy du serveur de développement (vite.config.ts).
 * - Version web publiée (téléphone) : via la fonction Supabase « proxy » (voir `relayed`).
 */

const PROXIES: [string, string][] = [
  ['https://gutendex.com/', '/proxy/gutendex/'],
  ['https://www.gutenberg.org/', '/proxy/gutenberg/'],
  ['https://gutenberg.org/', '/proxy/gutenberg/'],
  ['https://api.mymemory.translated.net/', '/proxy/mymemory/'],
  ['https://tatoeba.org/', '/proxy/tatoeba/'],
  ['https://api-free.deepl.com/', '/proxy/deepl-free/'],
  ['https://api.deepl.com/', '/proxy/deepl/'],
  ['https://en.wiktionary.org/', '/proxy/wiktionary/'],
];

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function proxied(url: string): string {
  for (const [from, to] of PROXIES) if (url.startsWith(from)) return to + url.slice(from.length);
  return url;
}

export interface GetOptions {
  /** Octets [start, end] (inclus). Le serveur peut renvoyer le fichier entier. */
  range?: [number, number];
  signal?: AbortSignal;
  /** Délai maximal de la requête complète (ms). */
  timeoutMs?: number;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Corps JSON (POST). */
  json?: unknown;
}

const DEFAULT_TIMEOUT = 45_000;

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  if (isTauri()) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    return fetch(url, { ...init, connectTimeout: 20_000 });
  }
  if (import.meta.env?.DEV) return fetch(proxied(url), init);
  return relayed(url, init);
}

/**
 * Version web publiée (téléphone) : les domaines de PROXIES passent par la fonction Supabase « proxy »
 * (supabase/functions/proxy), réservée aux utilisateurs connectés. Les autres adresses sont appelées directement.
 */
async function relayed(url: string, init: RequestInit): Promise<Response> {
  if (!PROXIES.some(([from]) => url.startsWith(from))) return fetch(url, init);
  const { authConfigured, supabase, supabaseOrigin } = await import('./auth');
  if (!authConfigured || !supabaseOrigin) throw new HttpError(0, 'Version web sans Supabase : ce service n’est pas joignable.');
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new HttpError(401, 'Connectez-vous (Paramètres) pour accéder à ce service depuis la version web.');
  const headers = new Headers(init.headers);
  // La clé DeepL personnelle voyage à part : Authorization porte la session Supabase.
  const upstream = headers.get('Authorization');
  if (upstream) headers.set('x-upstream-authorization', upstream);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  headers.set('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY as string);
  return fetch(`${supabaseOrigin}/functions/v1/proxy?url=${encodeURIComponent(url)}`, { ...init, headers });
}

export async function httpGet(url: string, opts: GetOptions = {}): Promise<Uint8Array> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.range) headers.Range = `bytes=${opts.range[0]}-${opts.range[1]}`;
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  const body = opts.json !== undefined ? JSON.stringify(opts.json) : undefined;
  const host = new URL(url).host;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Un serveur qui ne répond pas ne doit jamais laisser l'interface en attente indéfiniment
  // (y compris pendant la lecture du corps de la réponse).
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new HttpError(0, `${host} ne répond pas (délai dépassé).`));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT);
  });
  const run = async (): Promise<Uint8Array> => {
    let res: Response;
    try {
      res = await doFetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal });
    } catch (err) {
      if (opts.signal?.aborted || ctrl.signal.aborted) throw err;
      throw new HttpError(0, `Connexion à ${host} impossible : ${err instanceof Error ? err.message : String(err)}`);
    }
    // 416 : fichier plus court que la plage demandée → on le prend en entier.
    if (res.status === 416 && opts.range) return httpGet(url, { signal: opts.signal, timeoutMs: opts.timeoutMs });
    if (!res.ok) throw new HttpError(res.status, `${host} a répondu ${res.status}.`);
    return new Uint8Array(await res.arrayBuffer());
  };
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

export async function httpGetText(url: string, opts: GetOptions = {}): Promise<string> {
  return new TextDecoder().decode(await httpGet(url, opts));
}

export async function httpGetJson<T>(url: string, opts: GetOptions = {}): Promise<T> {
  return JSON.parse(await httpGetText(url, opts)) as T;
}
