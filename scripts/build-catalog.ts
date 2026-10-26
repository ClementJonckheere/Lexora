// Prépare le catalogue de lecture fourni avec l'application : livres les plus lus de chaque langue,
// avec couverture et niveau déjà estimé. L'onglet « Découvrir » s'affiche ainsi instantanément,
// sans attendre Gutendex ni télécharger un extrait de chaque livre.
//
// Exécuté par la CI (.github/workflows/catalog.yml), qui a accès à Gutendex et à Project Gutenberg.
// Usage : npx vite-node scripts/build-catalog.ts [langues…]   (ex. « en es »)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { decodeText, parseGutenberg } from '../src/core/reading/gutenberg';
import { catalogUrl, parseCatalogPage, type CatalogBook, type GutendexPage } from '../src/core/reading/gutendex';
import { estimateLevel, ranksFromList, sampleForLevel } from '../src/core/reading/level';

/** Nombre de livres par langue (les plus téléchargés). */
const TARGET: Record<string, number> = { en: 200, fr: 120, de: 120, es: 120, it: 100, pt: 100, nl: 100 };
const DEFAULT_TARGET = 60;
const LANGS = ['en', 'es', 'pt', 'de', 'it', 'ru', 'zh', 'ja', 'ko', 'ar', 'nl', 'fr'];
const SAMPLE_BYTES = 160_000;
const OUT = 'public/reading/catalog';

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
    for (const b of page.books) if (b.language === language && !books.some((x) => x.key === b.key)) books.push(b);
    url = page.next;
    await sleep(500);
  }
  books.splice(target);

  let estimated = 0;
  const withLevels = await pool(books, 4, async (b) => {
    if (!ranks) return { ...b, level: null, vocabRank: 0, sentenceLength: 0 };
    try {
      const parsed = parseGutenberg(await sample(b));
      const text = parsed.chapters.flatMap((c) => c.blocks.map((x) => x.text)).join('\n\n');
      const est = estimateLevel(sampleForLevel(text), ranks, language);
      if (est) estimated++;
      return { ...b, level: est?.level ?? null, vocabRank: est?.vocabRank ?? 0, sentenceLength: est?.sentenceLength ?? 0 };
    } catch (err) {
      console.warn(`  ${b.key} ${b.title} : ${err instanceof Error ? err.message : err}`);
      // Texte absent : livre illisible, écarté ; autre erreur : gardé, niveau estimé plus tard dans l'application.
      if (err instanceof Error && err.message === 'texte introuvable') return null;
      return { ...b, level: null, vocabRank: 0, sentenceLength: 0 };
    } finally {
      await sleep(250);
    }
  });

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    `${OUT}/${language}.json`,
    JSON.stringify({ version: 1, language, generatedAt: new Date().toISOString(), total, books: withLevels.filter(Boolean) }),
  );
  console.log(`${language} : ${withLevels.filter(Boolean).length} livres (${estimated} niveaux estimés) sur ${total}`);
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
