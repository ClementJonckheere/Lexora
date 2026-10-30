import { httpGet, httpGetJson, httpGetText } from '../platform/http';
import { assetUrl } from '../platform/env';
import { opdsUrl, parseOpds } from './opds';
import { decodeText, parseGutenberg, type ParsedBook } from './gutenberg';
import { catalogUrl, parseCatalogPage, shortTitle, type CatalogBook, type GutendexPage } from './gutendex';
import { estimateLevel, ranksFromList, sampleForLevel, type FrequencyRanks, type Level, type LevelEstimate } from './level';
import { normalizeSearch } from '../domain/text';
import { BAND_EDGES, type VocabBank } from './coverage';

/** Accès réseau au catalogue et aux livres (Gutendex, Project Gutenberg). */

export interface CatalogResult {
  books: CatalogBook[];
  next: string | null;
  /** Taille du catalogue (null : inconnue, catalogue de secours). */
  count: number | null;
  source: 'gutendex' | 'gutenberg';
}

/** Gutendex est souvent lent : au-delà, on interroge directement gutenberg.org. */
const GUTENDEX_PATIENCE_MS = 12_000;

async function fromGutendex(url: string, language: string, signal?: AbortSignal): Promise<CatalogResult> {
  const page = await httpGetJson<GutendexPage>(url, { signal, timeoutMs: GUTENDEX_PATIENCE_MS });
  return { ...parseCatalogPage(page, language), source: 'gutendex' };
}

async function fromGutenberg(url: string, language: string, signal?: AbortSignal): Promise<CatalogResult> {
  const page = parseOpds(await httpGetText(url, { signal, timeoutMs: 30_000 }), language);
  return { ...page, count: null, source: 'gutenberg' };
}

/**
 * Une page du catalogue. `pageUrl` (page suivante) garde la source de la première page.
 * Gutendex en premier (métadonnées plus riches), gutenberg.org en secours.
 */
export async function searchCatalog(language: string, search: string, pageUrl?: string | null, signal?: AbortSignal): Promise<CatalogResult> {
  if (pageUrl) return pageUrl.startsWith('https://gutendex.com/') ? fromGutendex(pageUrl, language, signal) : fromGutenberg(pageUrl, language, signal);
  try {
    return await fromGutendex(catalogUrl(language, search), language, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    try {
      return await fromGutenberg(opdsUrl(language, search), language, signal);
    } catch {
      throw err; // l'erreur de Gutendex est la plus parlante
    }
  }
}

/* ------------------------------------------------ catalogue fourni --- */

/** Livre du catalogue préparé par la CI (scripts/build-catalog.ts), niveau déjà estimé. */
export interface BundledBook extends CatalogBook {
  level: Level | null;
  vocabRank: number;
  sentenceLength: number;
  /** Profil de fréquence (voir coverage.ts) : couverture de vocabulaire de chaque lecteur. */
  profile?: number[];
}

export interface BundledCatalog {
  generatedAt: string;
  /** Taille du catalogue complet de la langue (Gutendex). */
  total: number;
  /** Facteur de flexion mesuré sur les livres de la langue (étalonnage du niveau). */
  formsFactor?: number;
  books: BundledBook[];
}

const bundleCache = new Map<string, Promise<BundledCatalog | null>>();

/** Catalogue fourni avec l'application pour la langue (null s'il n'y en a pas) : aucun accès réseau. */
export function loadBundledCatalog(language: string): Promise<BundledCatalog | null> {
  let p = bundleCache.get(language);
  if (!p) {
    p = fetch(assetUrl(`reading/catalog/${encodeURIComponent(language)}.json`))
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('html')) return null;
        const data = (await res.json()) as BundledCatalog;
        if (!Array.isArray(data.books) || !data.books.length) return null;
        // Catalogues préparés avant le nettoyage des titres.
        for (const b of data.books) b.title = shortTitle(b.title);
        return data;
      })
      .catch(() => null);
    bundleCache.set(language, p);
  }
  return p;
}

/** Page de Gutendex qui suit les livres fournis (32 par page ; les doublons sont écartés à l'affichage). */
export function pageAfter(language: string, count: number): string {
  return `${catalogUrl(language)}&page=${Math.floor(count / 32) + 1}`;
}

/** Recherche instantanée (titre, auteur, sujets) dans les livres fournis, sans tenir compte des accents. */
export function matchesSearch(book: CatalogBook, search: string): boolean {
  const words = normalizeSearch(search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = normalizeSearch([book.title, ...book.authors, ...book.subjects].join(' '));
  return words.every((w) => hay.includes(w));
}

const listCache = new Map<string, Promise<string | null>>();
const ranksCache = new Map<string, Promise<FrequencyRanks | null>>();

/** Texte de la liste de fréquence fournie (un mot par ligne, du plus fréquent au plus rare), null si absente. */
function loadFrequencyText(language: string): Promise<string | null> {
  let p = listCache.get(language);
  if (!p) {
    p = fetch(assetUrl(`reading/freq/${encodeURIComponent(language)}.txt`))
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        // Un serveur de développement renvoie index.html pour un fichier absent.
        if (!res.ok || type.includes('html')) return null;
        return res.text();
      })
      .catch(() => null);
    listCache.set(language, p);
  }
  return p;
}

/** Liste de fréquence de la langue (fournie avec l'application), null si la langue n'en a pas. */
export function loadRanks(language: string): Promise<FrequencyRanks | null> {
  let p = ranksCache.get(language);
  if (!p) {
    p = loadFrequencyText(language).then((t) => (t ? ranksFromList(t) : null));
    ranksCache.set(language, p);
  }
  return p;
}

/** Liste de fréquence sous forme de tableau (test de vocabulaire). */
export async function loadFrequencyList(language: string): Promise<string[] | null> {
  const t = await loadFrequencyText(language);
  return t ? t.split('\n').map((w) => w.trim()).filter(Boolean) : null;
}

/** Banque de mots du test préparée par la CI (null : absente, le test utilise la liste de fréquence seule). */
export async function loadVocabBank(language: string): Promise<VocabBank | null> {
  try {
    const res = await fetch(assetUrl(`reading/vocab/${encodeURIComponent(language)}.json`));
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || type.includes('html')) return null;
    const data = (await res.json()) as VocabBank;
    return Array.isArray(data.bands) && data.bands.length === BAND_EDGES.length ? data : null;
  } catch {
    return null;
  }
}

/** Taille de l'extrait téléchargé pour estimer le niveau (début du fichier). */
const SAMPLE_BYTES = 160_000;

function bookText(book: ParsedBook): string {
  return book.chapters.flatMap((c) => c.blocks.map((b) => b.text)).join('\n\n');
}

/** Facteur d'étalonnage de la langue : celui du catalogue fourni, sinon la valeur par défaut. */
export async function languageFactor(language: string): Promise<number | undefined> {
  return (await loadBundledCatalog(language))?.formsFactor;
}

export function levelOfText(book: ParsedBook, ranks: FrequencyRanks, language: string, factor?: number): LevelEstimate | null {
  return estimateLevel(sampleForLevel(bookText(book)), ranks, language, factor);
}

/** Estime le niveau d'un livre du catalogue à partir du début de son texte. */
export async function estimateCatalogBook(book: CatalogBook, signal?: AbortSignal): Promise<LevelEstimate | null> {
  const ranks = await loadRanks(book.language);
  if (!ranks) return null;
  const bytes = await httpGet(book.textUrl, { range: [0, SAMPLE_BYTES - 1], signal });
  // Le dernier caractère multi-octets peut être coupé : sans conséquence pour l'estimation.
  return levelOfText(parseGutenberg(decodeText(bytes)), ranks, book.language, await languageFactor(book.language));
}

/** Télécharge et met en forme le livre complet. */
export async function downloadBook(book: { textUrl: string }, signal?: AbortSignal): Promise<ParsedBook> {
  const parsed = parseGutenberg(decodeText(await httpGet(book.textUrl, { signal })));
  if (!parsed.chapters.some((c) => c.blocks.length)) throw new Error('Ce livre ne contient pas de texte lisible.');
  return parsed;
}

/** Couverture en data URL (affichage hors ligne), ou chaîne vide. */
export async function downloadCover(url: string | null): Promise<string> {
  if (!url) return '';
  try {
    const bytes = await httpGet(url);
    if (bytes.length > 400_000) return '';
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return '';
  }
}

/**
 * File d'estimation des niveaux : quelques requêtes à la fois, pour ne pas surcharger Project Gutenberg.
 * Chaque livre n'est estimé qu'une fois (le résultat est mis en cache par l'appelant).
 */
export class LevelQueue {
  private pending: CatalogBook[] = [];
  private queued = new Set<string>();
  private running = 0;

  constructor(
    private readonly onResult: (book: CatalogBook, estimate: LevelEstimate | null) => void,
    private readonly concurrency = 3,
  ) {}

  add(books: CatalogBook[]): void {
    for (const b of books) {
      if (this.queued.has(b.key)) continue;
      this.queued.add(b.key);
      this.pending.push(b);
    }
    this.pump();
  }

  /** Abandonne les estimations pas encore commencées (changement de langue, de recherche…). */
  clear(): void {
    for (const b of this.pending) this.queued.delete(b.key);
    this.pending = [];
  }

  get busy(): number {
    return this.pending.length + this.running;
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length) {
      const book = this.pending.shift()!;
      this.running++;
      estimateCatalogBook(book)
        .catch(() => null)
        .then((estimate) => this.onResult(book, estimate))
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}
