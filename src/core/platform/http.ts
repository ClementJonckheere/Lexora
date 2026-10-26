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
}

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
  let res: Response;
  try {
    res = await doFetch(url, { headers, signal: opts.signal });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new HttpError(0, 'Connexion impossible. Vérifiez votre accès à Internet.');
  }
  // 416 : fichier plus court que la plage demandée → on le prend en entier.
  if (res.status === 416 && opts.range) return httpGet(url, { signal: opts.signal });
  if (!res.ok) throw new HttpError(res.status, `Le serveur a répondu ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function httpGetJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const bytes = await httpGet(url, { signal });
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
