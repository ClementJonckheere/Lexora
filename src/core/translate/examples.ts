import { httpGetJson } from '../platform/http';
import { buildCloze } from '../domain/cloze';

/**
 * Phrases d'exemple réelles (Tatoeba, https://tatoeba.org : phrases écrites et traduites par des bénévoles),
 * avec leur traduction française quand elle existe.
 */

export interface ExampleSentence {
  text: string;
  /** Traduction française (aide à la compréhension, non enregistrée dans la fiche). */
  translation: string | null;
}

/** Codes Tatoeba (ISO 639-3). */
const TATOEBA_LANG: Record<string, string> = {
  en: 'eng', es: 'spa', pt: 'por', de: 'deu', it: 'ita', ru: 'rus', zh: 'cmn', ja: 'jpn', ko: 'kor', ar: 'ara', nl: 'nld', fr: 'fra',
  pl: 'pol', sv: 'swe', tr: 'tur', el: 'ell', uk: 'ukr', cs: 'ces', fi: 'fin', da: 'dan', he: 'heb', hi: 'hin', vi: 'vie',
};

export function tatoebaCode(language: string): string | null {
  return TATOEBA_LANG[language] ?? null;
}

export function tatoebaUrl(query: string, language: string, exact: boolean): string | null {
  const from = tatoebaCode(language);
  if (!from) return null;
  const params = new URLSearchParams({
    from,
    query: exact ? `="${query.replace(/"/g, '')}"` : query,
    to: 'fra',
    orphans: 'no',
    unapproved: 'no',
    sort: 'relevance',
  });
  return `https://tatoeba.org/en/api_v0/search?${params}`;
}

type Json = Record<string, unknown>;

/** Lecture tolérante des résultats (ancienne et nouvelle API de Tatoeba). */
export function parseTatoeba(json: unknown): ExampleSentence[] {
  const root = (json ?? {}) as Json;
  const list = (Array.isArray(root.results) ? root.results : Array.isArray(root.data) ? root.data : []) as Json[];
  const out: ExampleSentence[] = [];
  for (const r of list) {
    const text = typeof r.text === 'string' ? r.text.trim() : '';
    if (!text) continue;
    const flat = ([] as unknown[]).concat(...((Array.isArray(r.translations) ? r.translations : []) as unknown[]).map((t) => (Array.isArray(t) ? t : [t])));
    const fr = (flat as Json[]).find((t) => t && t.lang === 'fra' && typeof t.text === 'string');
    out.push({ text, translation: fr ? String(fr.text) : null });
  }
  return out;
}

/** Garde les phrases où l'expression apparaît vraiment, de longueur raisonnable, les plus courtes d'abord. */
export function rankExamples(list: ExampleSentence[], expression: string, language: string, max = 3): ExampleSentence[] {
  const seen = new Set<string>();
  return list
    .filter((s) => {
      const k = s.text.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return s.text.length >= 12 && s.text.length <= 180 && buildCloze(expression, s.text, language) !== null;
    })
    .sort((a, b) => Number(!!b.translation) - Number(!!a.translation) || Math.abs(a.text.length - 70) - Math.abs(b.text.length - 70))
    .slice(0, max);
}

/** Expression de recherche : sans « to » initial (anglais) ni marqueurs « sth », « sb ». */
function searchForm(expression: string, language: string): string {
  let q = expression.trim();
  if (language === 'en') q = q.replace(/^to\s+/i, '');
  return q.replace(/\b(sth|sb|someone|something|algo|alguien|etw|jdn|jdm)\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

const cache = new Map<string, Promise<ExampleSentence[]>>();

export function findExamples(expression: string, language: string, signal?: AbortSignal): Promise<ExampleSentence[]> {
  const q = searchForm(expression, language);
  const key = `${language}|${q.toLowerCase()}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      // Expression exacte d'abord, puis tous les mots (formes conjuguées comprises).
      for (const exact of q.includes(' ') ? [true, false] : [false]) {
        const url = tatoebaUrl(q, language, exact);
        if (!url) return [];
        const found = rankExamples(parseTatoeba(await httpGetJson<unknown>(url, { signal, timeoutMs: 15_000 })), expression, language);
        if (found.length) return found;
      }
      return [];
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
