import { httpGetJson } from '../platform/http';

/**
 * Traduction automatique vers le français (MyMemory, gratuit, sans clé : https://mymemory.translated.net).
 * Proposition seulement : le champ reste modifiable et la saisie manuelle reste possible.
 */

export interface TranslationResult {
  /** Meilleure traduction proposée. */
  text: string;
  /** Autres traductions trouvées dans la mémoire de traduction, sans doublon. */
  alternatives: string[];
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string; match?: number };
  responseStatus?: number | string;
  responseDetails?: string;
  matches?: { translation?: string; quality?: string | number; match?: number; segment?: string }[];
}

const MYMEMORY = 'https://api.mymemory.translated.net/get';
const MYMEMORY_LANG: Record<string, string> = { zh: 'zh-CN', pt: 'pt-PT' };

export function myMemoryUrl(text: string, from: string, to = 'fr'): string {
  const langpair = `${MYMEMORY_LANG[from] ?? from}|${MYMEMORY_LANG[to] ?? to}`;
  return `${MYMEMORY}?${new URLSearchParams({ q: text, langpair })}`;
}

export class TranslationError extends Error {}

function tidy(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。]$/, '');
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

export function parseMyMemory(res: MyMemoryResponse, source: string): TranslationResult {
  const status = Number(res.responseStatus ?? 200);
  const main = tidy(res.responseData?.translatedText ?? '');
  if (status === 429 || /MYMEMORY WARNING|QUOTA/i.test(main)) {
    throw new TranslationError('Quota de traduction gratuite atteint pour aujourd’hui. Réessayez demain ou saisissez la traduction.');
  }
  if (status !== 200 || !main || /INVALID|NO QUERY|IS AN INVALID/i.test(main)) {
    throw new TranslationError(res.responseDetails || 'Traduction indisponible pour cette langue.');
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const text = matchCase(source, main);
  const seen = new Set([norm(text), norm(source)]);
  const alternatives: string[] = [];
  for (const m of res.matches ?? []) {
    const t = matchCase(source, tidy(m.translation ?? ''));
    const key = norm(t);
    if (!t || seen.has(key) || t.length > 80 || Number(m.quality ?? 0) < 50) continue;
    seen.add(key);
    alternatives.push(t);
    if (alternatives.length >= 3) break;
  }
  return { text, alternatives };
}

const cache = new Map<string, Promise<TranslationResult>>();

export function translate(text: string, from: string, to = 'fr', signal?: AbortSignal): Promise<TranslationResult> {
  const q = text.trim();
  if (!q) return Promise.reject(new TranslationError('Rien à traduire.'));
  if (from === to) return Promise.resolve({ text: q, alternatives: [] });
  const key = `${from}|${to}|${q.toLowerCase()}`;
  let p = cache.get(key);
  if (!p) {
    p = httpGetJson<MyMemoryResponse>(myMemoryUrl(q, from, to), { signal, timeoutMs: 15_000 }).then((r) => parseMyMemory(r, q));
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
