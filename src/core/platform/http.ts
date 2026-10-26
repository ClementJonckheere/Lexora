import { isTauri } from './env';

/**
 * Requêtes vers Gutendex et Project Gutenberg.
 * - Application : via la couche native (tauri-plugin-http), limitée à ces domaines ;
 *   Project Gutenberg n'autorise pas les requêtes directes depuis une page web.
 * - Aperçu navigateur : via le proxy du serveur de développement (vite.config.ts).
 */

const PROXIES: [string, string][] = [
  ['https://gutendex.com/', '/proxy/gutendex/'],
  ['https://www.gutenberg.org/', '/proxy/gutenberg/'],
  ['https://gutenberg.org/', '/proxy/gutenberg/'],
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
}

const DEFAULT_TIMEOUT = 45_000;

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  if (isTauri()) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    return fetch(url, { ...init, connectTimeout: 20_000 });
  }
  return fetch(proxied(url), init);
}

export async function httpGet(url: string, opts: GetOptions = {}): Promise<Uint8Array> {
  const headers: Record<string, string> = {};
  if (opts.range) headers.Range = `bytes=${opts.range[0]}-${opts.range[1]}`;
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
      res = await doFetch(url, { headers, signal: ctrl.signal });
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
