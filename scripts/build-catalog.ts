// Prépare le catalogue de lecture fourni avec l'application : livres les plus lus de chaque langue,
// avec couverture et niveau déjà estimé. L'onglet « Découvrir » s'affiche ainsi instantanément,
// sans attendre Gutendex ni télécharger un extrait de chaque livre.
//
// Exécuté par la CI (.github/workflows/catalog.yml), qui a accès à Gutendex et à Project Gutenberg.
// Usage : npx vite-node scripts/build-catalog.ts [langues…]   (ex. « en es »)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { decodeText, parseGutenberg } from '../src/core/reading/gutenberg';
import { catalogUrl, parseCatalogPage, type CatalogBook, type GutendexPage } from '../src/core/reading/gutendex';
import { classifyWords, estimateLevel, formsFactor, ranksFromList, REFERENCE_MEDIAN_RANK, sampleForLevel, type Level } from '../src/core/reading/level';
import { languageInfo } from '../src/core/domain/languages';

/** Nombre de livres par langue (les plus téléchargés). */
const TARGET: Record<string, number> = { en: 200, fr: 120, de: 120, es: 120, it: 100, pt: 100, nl: 100 };
const DEFAULT_TARGET = 60;
const LANGS = ['en', 'es', 'pt', 'de', 'it', 'ru', 'zh', 'ja', 'ko', 'ar', 'nl', 'fr'];
const SAMPLE_BYTES = 160_000;
const OUT = 'public/reading/catalog';

/** Ouvrages de référence (dictionnaires, grammaires…) : pas des lectures. */
const REFERENCE = /dictionar|dictionnaire|diccionario|dizionario|wörterbuch|woordenboek|dicionário|glossar|grammar|grammaire|gramática|grammatica|grammatik|vocabular|lexicon|phrase-?book|manual of|handbook|encyclop|index of|catalogue of/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, init: RequestInit = {}, tries = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': 'Lexora catalog builder (github.com/ClementJonckheere/Lexora)', ...init.headers }, signal: AbortSignal.timeout(90_000) });
      if (res.ok || res.status === 206 || res.status === 416 || res.status === 404) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i >= tries) throw err;
      await sleep(2000 * 2 ** i);
    }
  }
}

async function sample(book: CatalogBook): Promise<string> {
  let res = await get(book.textUrl, { headers: { Range: `bytes=0-${SAMPLE_BYTES - 1}` } });
  if (res.status === 416) res = await get(book.textUrl);
  if (res.status === 404) throw new Error('texte introuvable');
  return decodeText(new Uint8Array(await res.arrayBuffer()));
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function buildLanguage(language: string) {
  const freq = `public/reading/freq/${language}.txt`;
  const ranks = existsSync(freq) ? ranksFromList(readFileSync(freq, 'utf8')) : null;
  const target = TARGET[language] ?? DEFAULT_TARGET;
  const books: CatalogBook[] = [];
  let url: string | null = catalogUrl(language);
  let total = 0;
  while (url && books.length < target) {
    const page = parseCatalogPage((await (await get(url)).json()) as GutendexPage, language);
    total = page.count;
    for (const b of page.books) {
      if (b.language !== language || REFERENCE.test(b.title) || books.some((x) => x.key === b.key)) continue;
      books.push(b);
    }
    url = page.next;
    await sleep(500);
  }
  books.splice(target);

  // 1. Mesures brutes (sans facteur de langue) sur un extrait de chaque livre.
  type Measured = CatalogBook & { level: Level | null; vocabRank: number; sentenceLength: number; sample: number };
  const measured = await pool(books, 4, async (b): Promise<Measured | null> => {
    const none = { ...b, level: null, vocabRank: 0, sentenceLength: 0, sample: 0 };
    if (!ranks) return none;
    try {
      const parsed = parseGutenberg(await sample(b));
      const text = parsed.chapters.flatMap((c) => c.blocks.map((x) => x.text)).join('\n\n');
      const est = estimateLevel(sampleForLevel(text), ranks, language, 1);
      return est ? { ...b, level: est.level, vocabRank: est.vocabRank, sentenceLength: est.sentenceLength, sample: est.sample } : none;
    } catch (err) {
      console.warn(`  ${b.key} ${b.title} : ${err instanceof Error ? err.message : err}`);
      // Texte absent : livre illisible, écarté ; autre erreur : gardé, niveau estimé plus tard dans l'application.
      if (err instanceof Error && err.message === 'texte introuvable') return null;
      return none;
    } finally {
      await sleep(250);
    }
  });
  const kept = measured.filter((b): b is Measured => b !== null);

  // 2. Étalonnage de la langue : son classique « moyen » reçoit le même niveau qu'un classique anglais moyen.
  const spaced = !languageInfo(language).noSpaces;
  const ranksMeasured = kept.filter((b) => b.vocabRank > 0).map((b) => b.vocabRank).sort((a, b) => a - b);
  let factor = formsFactor(language);
  if (spaced && language !== 'en' && ranksMeasured.length >= 15) {
    const median = ranksMeasured[Math.floor(ranksMeasured.length / 2)];
    factor = Math.round(Math.min(5, Math.max(1, median / REFERENCE_MEDIAN_RANK)) * 100) / 100;
  }
  if (language === 'en') factor = 1;
  for (const b of kept) if (spaced && b.vocabRank > 0) b.level = classifyWords(b.vocabRank, b.sentenceLength, b.sample, factor);
  const estimated = kept.filter((b) => b.level).length;
  const withLevels = kept;

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    `${OUT}/${language}.json`,
    JSON.stringify({ version: 2, language, generatedAt: new Date().toISOString(), total, formsFactor: factor, books: withLevels }),
  );
  console.log(`${language} : facteur ${factor} · ${withLevels.length} livres (${estimated} niveaux estimés) sur ${total}`);
}

const wanted = process.argv.slice(2).filter((a) => /^[a-z]{2}$/.test(a));
let failures = 0;
for (const language of wanted.length ? wanted : LANGS) {
  try {
    await buildLanguage(language);
  } catch (err) {
    failures++;
    // Une langue en échec garde son fichier précédent.
    console.error(`${language} : échec (${err instanceof Error ? err.message : err}) — fichier précédent conservé`);
  }
}
if (failures === (wanted.length || LANGS.length)) process.exit(1);
