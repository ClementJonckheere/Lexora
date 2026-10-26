import { HttpError, httpGetJson } from '../platform/http';

/**
 * Traduction automatique vers le français. Proposition seulement : le champ reste modifiable
 * et la saisie manuelle reste possible.
 * - DeepL (clé personnelle gratuite, facultative) : le plus fiable, tient compte de la phrase d'origine ;
 * - MyMemory (gratuit, sans clé) sinon, ou si DeepL est indisponible.
 */

export type TranslationProvider = 'deepl' | 'mymemory';

export interface TranslationResult {
  /** Meilleure traduction proposée. */
  text: string;
  /** Autres traductions trouvées dans la mémoire de traduction, sans doublon. */
  alternatives: string[];
  provider: TranslationProvider;
  /** DeepL configuré mais indisponible (quota, clé) : raison du repli sur MyMemory. */
  fallbackReason?: string;
}

export interface TranslateOptions {
  /** Phrase où apparaît l'expression : DeepL s'en sert pour choisir le bon sens (non traduite). */
  context?: string;
  deeplKey?: string;
  signal?: AbortSignal;
}

interface MyMemoryMatch {
  translation?: string;
  quality?: string | number;
  match?: number;
  segment?: string;
  'created-by'?: string;
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string; match?: number };
  responseStatus?: number | string;
  responseDetails?: string;
  matches?: MyMemoryMatch[];
}

const MYMEMORY = 'https://api.mymemory.translated.net/get';
const MYMEMORY_LANG: Record<string, string> = { zh: 'zh-CN', pt: 'pt-PT' };

export function myMemoryUrl(text: string, from: string, to = 'fr'): string {
  const langpair = `${MYMEMORY_LANG[from] ?? from}|${MYMEMORY_LANG[to] ?? to}`;
  return `${MYMEMORY}?${new URLSearchParams({ q: text, langpair })}`;
}

export class TranslationError extends Error {}

/**
 * Nettoie une traduction : entités HTML, espaces, et ponctuation parasite autour
 * (« anxieux.) » → « anxieux »), sauf si le texte d'origine a la même ponctuation.
 */
export function tidy(s: string, source = ''): string {
  let t = s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const src = source.trim();
  const lead = /^[\s"'«»“”‘’()[\]¿¡.,;:—–-]+/u;
  const trail = /[\s"'«»“”‘’()[\].,;:!?…—–-]+$/u;
  if (!lead.test(src)) t = t.replace(lead, '');
  if (!trail.test(src)) t = t.replace(trail, '');
  return t.replace(/[.。]$/, '').trim();
}

/** Même casse que le texte d'origine : « suddenly » → « soudain », pas « Soudain ». */
function matchCase(source: string, t: string): string {
  if (!t) return t;
  const first = source.trim()[0] ?? '';
  if (first && first === first.toLowerCase() && t[0] !== t[0].toLowerCase() && t.slice(1) !== t.slice(1).toUpperCase()) {
    return t[0].toLowerCase() + t.slice(1);
  }
  return t;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Meilleure traduction MyMemory. Sa mémoire contient des traductions versées par des internautes,
 * parfois approximatives : on ne garde une entrée de la mémoire que si elle correspond exactement
 * au texte demandé, sinon on préfère la traduction automatique.
 */
function pickMyMemory(res: MyMemoryResponse, source: string): string {
  const matches = res.matches ?? [];
  const exact = matches
    .filter((m) => m['created-by'] !== 'MT!' && m.segment && norm(m.segment) === norm(source) && Number(m.quality ?? 0) >= 70 && m.translation)
    .sort((a, b) => Number(b.quality ?? 0) - Number(a.quality ?? 0))[0];
  const machine = matches.find((m) => m['created-by'] === 'MT!' && m.translation);
  return (exact ?? machine)?.translation ?? res.responseData?.translatedText ?? '';
}

export function parseMyMemory(res: MyMemoryResponse, source: string): TranslationResult {
  const status = Number(res.responseStatus ?? 200);
  const main = tidy(pickMyMemory(res, source), source);
  if (status === 429 || /MYMEMORY WARNING|QUOTA/i.test(main)) {
    throw new TranslationError('Quota de traduction gratuite atteint pour aujourd’hui. Réessayez demain ou saisissez la traduction.');
  }
  if (status !== 200 || !main || /INVALID|NO QUERY|IS AN INVALID/i.test(main)) {
    throw new TranslationError(res.responseDetails || 'Traduction indisponible pour cette langue.');
  }
  const text = matchCase(source, main);
  const seen = new Set([norm(text), norm(source)]);
  const alternatives: string[] = [];
  for (const m of res.matches ?? []) {
    const t = matchCase(source, tidy(m.translation ?? '', source));
    const key = norm(t);
    if (!t || seen.has(key) || t.length > 80 || Number(m.quality ?? 0) < 50) continue;
    seen.add(key);
    alternatives.push(t);
    if (alternatives.length >= 3) break;
  }
  return { text, alternatives, provider: 'mymemory' };
}

/* ---------------------------------------------------------------- DeepL --- */

/** Langues sources prises en charge par DeepL. */
const DEEPL_SOURCES = new Set([
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru',
  'sk', 'sl', 'sv', 'tr', 'uk', 'zh',
]);

export function deeplSupports(language: string): boolean {
  return DEEPL_SOURCES.has(language);
}

/** Les clés gratuites se terminent par « :fx » et utilisent un serveur dédié. */
export function deeplEndpoint(key: string, path: 'translate' | 'usage'): string {
  return `https://${key.trim().endsWith(':fx') ? 'api-free' : 'api'}.deepl.com/v2/${path}`;
}

export function deeplRequest(text: string, from: string, to: string, context?: string) {
  return {
    text: [text],
    source_lang: from.toUpperCase(),
    target_lang: to.toUpperCase(),
    ...(context && context.trim() && context.trim() !== text.trim() ? { context: context.trim() } : {}),
  };
}

export function deeplError(status: number): string {
  if (status === 403 || status === 401) return 'clé DeepL refusée (vérifiez-la dans les Paramètres)';
  if (status === 456) return 'quota DeepL du mois atteint';
  if (status === 429) return 'DeepL est très sollicité, réessayez dans un instant';
  return `DeepL a répondu ${status}`;
}

async function translateDeepl(text: string, from: string, to: string, key: string, context?: string, signal?: AbortSignal): Promise<TranslationResult> {
  try {
    const res = await httpGetJson<{ translations?: { text?: string }[] }>(deeplEndpoint(key, 'translate'), {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key.trim()}` },
      json: deeplRequest(text, from, to, context),
      signal,
      timeoutMs: 15_000,
    });
    const t = tidy(res.translations?.[0]?.text ?? '', text);
    if (!t) throw new TranslationError('Réponse DeepL vide.');
    return { text: matchCase(text, t), alternatives: [], provider: 'deepl' };
  } catch (err) {
    if (err instanceof HttpError && err.status) throw new TranslationError(deeplError(err.status));
    throw err;
  }
}

export interface DeeplUsage {
  used: number;
  limit: number;
}

/** Vérifie une clé DeepL et renvoie la consommation du mois. */
export async function deeplUsage(key: string): Promise<DeeplUsage> {
  try {
    const r = await httpGetJson<{ character_count?: number; character_limit?: number }>(deeplEndpoint(key, 'usage'), {
      headers: { Authorization: `DeepL-Auth-Key ${key.trim()}` },
      timeoutMs: 15_000,
    });
    return { used: Number(r.character_count ?? 0), limit: Number(r.character_limit ?? 0) };
  } catch (err) {
    if (err instanceof HttpError && err.status) throw new TranslationError(deeplError(err.status));
    throw err;
  }
}

/* --------------------------------------------------------------- Accès --- */

const cache = new Map<string, Promise<TranslationResult>>();

export function translate(text: string, from: string, to = 'fr', opts: TranslateOptions = {}): Promise<TranslationResult> {
  const q = text.trim();
  if (!q) return Promise.reject(new TranslationError('Rien à traduire.'));
  if (from === to) return Promise.resolve({ text: q, alternatives: [], provider: 'mymemory' });
  const useDeepl = !!opts.deeplKey?.trim() && deeplSupports(from);
  const key = `${useDeepl ? 'deepl' : 'mm'}|${from}|${to}|${q.toLowerCase()}|${useDeepl ? (opts.context ?? '') : ''}`;
  let p = cache.get(key);
  if (!p) {
    const myMemory = () => httpGetJson<MyMemoryResponse>(myMemoryUrl(q, from, to), { signal: opts.signal, timeoutMs: 15_000 }).then((r) => parseMyMemory(r, q));
    p = useDeepl
      ? translateDeepl(q, from, to, opts.deeplKey!, opts.context, opts.signal).catch(async (err) => {
          if (opts.signal?.aborted) throw err;
          // DeepL indisponible (quota, clé, réseau) : MyMemory prend le relais, en le signalant.
          const r = await myMemory();
          return { ...r, fallbackReason: err instanceof Error ? err.message : String(err) };
        })
      : myMemory();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
