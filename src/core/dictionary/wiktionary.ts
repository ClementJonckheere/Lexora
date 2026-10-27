import { httpGetJson } from '../platform/http';

/**
 * Wiktionnaire (en.wiktionary.org, gratuit, sans clé) : nature du mot, définitions,
 * et prononciations enregistrées par des personnes (fichiers Wikimedia Commons, dont Lingua Libre).
 */

export const WIKTIONARY = 'https://en.wiktionary.org';

export interface Sense {
  /** Nature en français (« verbe », « nom »…). */
  pos: string;
  /** Définitions (en anglais : le Wiktionnaire anglais couvre toutes les langues). */
  definitions: string[];
}

const POS_FR: Record<string, string> = {
  noun: 'nom',
  'proper noun': 'nom propre',
  verb: 'verbe',
  'phrasal verb': 'verbe à particule',
  adjective: 'adjectif',
  adverb: 'adverbe',
  pronoun: 'pronom',
  preposition: 'préposition',
  conjunction: 'conjonction',
  interjection: 'interjection',
  determiner: 'déterminant',
  article: 'article',
  numeral: 'numéral',
  particle: 'particule',
  idiom: 'expression idiomatique',
  phrase: 'locution',
  proverb: 'proverbe',
  'prepositional phrase': 'locution prépositionnelle',
  contraction: 'contraction',
  suffix: 'suffixe',
  prefix: 'préfixe',
};

export function posInFrench(pos: string): string {
  return POS_FR[pos.trim().toLowerCase()] ?? pos.trim().toLowerCase();
}

/** Titre de page : « to take for granted » → « take for granted ». */
export function pageTitle(expression: string, language: string): string {
  let t = expression.trim().replace(/\s+/g, ' ');
  if (language === 'en') t = t.replace(/^to\s+/i, '');
  return t;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

type DefinitionResponse = Record<string, { partOfSpeech?: string; language?: string; definitions?: { definition?: string }[] }[]>;

/** Réponse de l'API REST « page/definition » → sens dans la langue voulue. */
export function parseDefinitions(json: DefinitionResponse, language: string, maxPerPos = 2): Sense[] {
  const entries = json?.[language] ?? [];
  const out: Sense[] = [];
  for (const e of entries) {
    const defs = (e.definitions ?? [])
      .map((d) => stripHtml(d.definition ?? ''))
      // Entrées vides ou purement grammaticales (« plural of … ») moins utiles en tête.
      .filter((d) => d.length > 1)
      .slice(0, maxPerPos);
    if (!defs.length) continue;
    const pos = posInFrench(e.partOfSpeech ?? '');
    const existing = out.find((s) => s.pos === pos);
    if (existing) existing.definitions.push(...defs.slice(0, Math.max(0, maxPerPos - existing.definitions.length)));
    else out.push({ pos, definitions: defs });
  }
  return out.slice(0, 3);
}

const defCache = new Map<string, Promise<Sense[]>>();

export function lookupDefinitions(expression: string, language: string, signal?: AbortSignal): Promise<Sense[]> {
  const title = pageTitle(expression, language);
  const key = `${language}|${title}`;
  let p = defCache.get(key);
  if (!p) {
    p = (async () => {
      // Titre tel quel, puis en minuscules (« Rabbit » en début de phrase).
      for (const t of [...new Set([title, title.toLowerCase()])]) {
        try {
          const json = await httpGetJson<DefinitionResponse>(`${WIKTIONARY}/api/rest_v1/page/definition/${encodeURIComponent(t.replace(/ /g, '_'))}`, {
            signal,
            timeoutMs: 10_000,
          });
          const senses = parseDefinitions(json, language);
          if (senses.length) return senses;
        } catch (err) {
          if (signal?.aborted) throw err;
          // 404 : page absente, on essaie la variante suivante.
        }
      }
      return [];
    })();
    defCache.set(key, p);
    p.catch(() => defCache.delete(key));
  }
  return p;
}

/* -------------------------------------------- prononciations enregistrées --- */

/** Codes ISO 639-3 présents dans les noms de fichiers Lingua Libre (« LL-Q1860 (eng)-… »). */
const LINGUA_LIBRE: Record<string, string[]> = {
  en: ['eng'], es: ['spa'], fr: ['fra'], de: ['deu'], it: ['ita'], pt: ['por'], ru: ['rus'], zh: ['cmn', 'zho'], ja: ['jpn'], ko: ['kor'], ar: ['ara', 'arb'], nl: ['nld'],
};

const AUDIO = /\.(ogg|oga|opus|mp3|wav|flac)$/i;

/**
 * Le fichier est-il une prononciation dans la langue ? « File:En-us-tackle.ogg », « File:Es-hola.ogg »,
 * « File:LL-Q1860 (eng)-Vealhurl-tackle.wav ». Renvoie un score (plus haut = préféré) ou 0.
 */
export function audioScore(fileTitle: string, language: string): number {
  const name = fileTitle.replace(/^File:/i, '');
  if (!AUDIO.test(name)) return 0;
  const lower = name.toLowerCase();
  if (/^ll-q\d+ /.test(lower) && (LINGUA_LIBRE[language] ?? []).some((c) => lower.includes(`(${c})`))) return 2;
  if (language === 'en' && /^en-us-/.test(lower)) return 4;
  if (language === 'en' && /^en-(uk|gb|au|ca|nz)-/.test(lower)) return 3;
  if (lower.startsWith(`${language}-`)) return 3;
  return 0;
}

type ImagesResponse = { query?: { pages?: Record<string, { title?: string; imageinfo?: { url?: string }[] }> } };

/** Meilleur enregistrement parmi les fichiers de la page (API MediaWiki, générateur « images »). */
export function pickRecording(json: ImagesResponse, language: string): string | null {
  const pages = Object.values(json?.query?.pages ?? {});
  const ranked = pages
    .map((p) => ({ url: p.imageinfo?.[0]?.url ?? '', score: audioScore(p.title ?? '', language) }))
    .filter((p) => p.url && p.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.url ?? null;
}

export function recordingsUrl(title: string): string {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'images',
    titles: title,
    gimlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url',
    origin: '*',
  });
  return `${WIKTIONARY}/w/api.php?${params}`;
}

const audioCache = new Map<string, Promise<string | null>>();

/** Adresse d'une prononciation enregistrée (mot ou expression), ou null s'il n'y en a pas. */
export function findRecording(expression: string, language: string, signal?: AbortSignal): Promise<string | null> {
  const title = pageTitle(expression, language);
  const key = `${language}|${title.toLowerCase()}`;
  let p = audioCache.get(key);
  if (!p) {
    p = (async () => {
      for (const t of [...new Set([title, title.toLowerCase()])]) {
        const url = pickRecording(await httpGetJson<ImagesResponse>(recordingsUrl(t), { signal, timeoutMs: 8_000 }), language);
        if (url) return url;
      }
      return null;
    })();
    audioCache.set(key, p);
    p.catch(() => audioCache.delete(key));
  }
  return p;
}
