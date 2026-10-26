import { httpGet, httpGetJson } from '../platform/http';
import { decodeText, parseGutenberg, type ParsedBook } from './gutenberg';
import { catalogUrl, parseCatalogPage, type CatalogBook, type GutendexPage } from './gutendex';
import { estimateLevel, ranksFromList, sampleForLevel, type FrequencyRanks, type LevelEstimate } from './level';

/** Accès réseau au catalogue et aux livres (Gutendex, Project Gutenberg). */

export interface CatalogResult {
  books: CatalogBook[];
  next: string | null;
  count: number;
}

export async function searchCatalog(language: string, search: string, pageUrl?: string | null, signal?: AbortSignal): Promise<CatalogResult> {
  const page = await httpGetJson<GutendexPage>(pageUrl ?? catalogUrl(language, search), signal);
  return parseCatalogPage(page, language);
}

const ranksCache = new Map<string, Promise<FrequencyRanks | null>>();

/** Liste de fréquence de la langue (fournie avec l'application), null si la langue n'en a pas. */
export function loadRanks(language: string): Promise<FrequencyRanks | null> {
  let p = ranksCache.get(language);
  if (!p) {
    p = fetch(`/reading/freq/${encodeURIComponent(language)}.txt`)
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        // Un serveur de développement renvoie index.html pour un fichier absent.
        if (!res.ok || type.includes('html')) return null;
        return ranksFromList(await res.text());
      })
      .catch(() => null);
    ranksCache.set(language, p);
  }
  return p;
}

/** Taille de l'extrait téléchargé pour estimer le niveau (début du fichier). */
const SAMPLE_BYTES = 160_000;

function bookText(book: ParsedBook): string {
  return book.chapters.flatMap((c) => c.blocks.map((b) => b.text)).join('\n\n');
}

export function levelOfText(book: ParsedBook, ranks: FrequencyRanks, language: string): LevelEstimate | null {
  return estimateLevel(sampleForLevel(bookText(book)), ranks, language);
}

/** Estime le niveau d'un livre du catalogue à partir du début de son texte. */
export async function estimateCatalogBook(book: CatalogBook, signal?: AbortSignal): Promise<LevelEstimate | null> {
  const ranks = await loadRanks(book.language);
  if (!ranks) return null;
  const bytes = await httpGet(book.textUrl, { range: [0, SAMPLE_BYTES - 1], signal });
  // Le dernier caractère multi-octets peut être coupé : sans conséquence pour l'estimation.
  return levelOfText(parseGutenberg(decodeText(bytes)), ranks, book.language);
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
