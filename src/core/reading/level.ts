import { languageInfo } from '../domain/languages';

/**
 * Estimation du niveau (CECRL) d'un texte, sans IA :
 * - vocabulaire : combien de mots courants faut-il connaître pour comprendre 95 % du texte
 *   (rang, dans une liste de fréquence de la langue, du mot au 95e centile) ;
 * - syntaxe : longueur moyenne des phrases.
 * Chinois et japonais : même principe avec les caractères.
 * C'est une estimation : elle sert à éviter un livre bien trop difficile, pas à certifier un niveau.
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof LEVELS)[number];

export interface LevelEstimate {
  level: Level;
  /** Rang de fréquence couvrant 90 % des mots (ou caractères). */
  vocabRank: number;
  /** Mots par phrase (caractères par phrase pour le chinois et le japonais). */
  sentenceLength: number;
  /** Nombre de mots analysés. */
  sample: number;
}

export type FrequencyRanks = Map<string, number>;

export function ranksFromList(list: string): FrequencyRanks {
  const ranks = new Map<string, number>();
  list.split('\n').forEach((w, i) => {
    const word = w.trim();
    if (word && !ranks.has(word)) ranks.set(word, i + 1);
  });
  return ranks;
}

/** Les langues flexionnelles ont plus de formes par mot : on ramène le rang à une échelle comparable. */
// Valeurs par défaut ; le catalogue fourni contient un facteur mesuré pour chaque langue (formsFactor).
const FORMS_FACTOR: Record<string, number> = { en: 1, de: 1.6, fr: 1.9, it: 2.2, nl: 2.2, es: 2.4, pt: 2.4, ar: 2.5, ru: 2.6, ko: 3 };

/**
 * Rang médian (90 % du texte) des 200 livres anglais les plus lus de Project Gutenberg : référence de l'étalonnage.
 * Pour une autre langue, facteur = rang médian de ses livres les plus lus / cette valeur : un classique « moyen »
 * reçoit le même niveau dans toutes les langues, malgré des listes de fréquence et des flexions différentes.
 */
export const REFERENCE_MEDIAN_RANK = 7000;

export function formsFactor(language: string): number {
  return FORMS_FACTOR[language] ?? 2;
}

// Seuils du vocabulaire (rang ajusté couvrant 90 % du texte) calibrés sur des livres de référence en anglais
// (rang mesuré → niveau) : Alice's Adventures in Wonderland 2 400 → B1, The Tale of Peter Rabbit 3 900 → B1
// (texte très court : −1), Treasure Island 4 200–4 600 → B2, Pride and Prejudice 4 300–5 400 → B2/C1,
// Moby-Dick 10 000–12 000 → C2.
const WORD_THRESHOLDS: [number, Level][] = [
  [800, 'A1'],
  [1600, 'A2'],
  [3000, 'B1'],
  [4800, 'B2'],
  [8000, 'C1'],
];
// Caractères (repères HSK : ~600 → HSK 3, ~1000 → HSK 4, ~1700 → HSK 5, ~2600 → HSK 6).
const CHAR_THRESHOLDS: [number, Level][] = [
  [300, 'A1'],
  [600, 'A2'],
  [1000, 'B1'],
  [1700, 'B2'],
  [2600, 'C1'],
];

const UNKNOWN_RANK = 50_000;
/** Part du texte que le vocabulaire doit couvrir. */
const COVERAGE = 0.9;

function levelIndex(l: Level): number {
  return LEVELS.indexOf(l);
}

function fromThresholds(value: number, thresholds: [number, Level][]): Level {
  for (const [max, level] of thresholds) if (value <= max) return level;
  return 'C2';
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const SENTENCE_END = /(?<!\b(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|Mme|Mlle|Sra|Sr|Hr|Fr|Nr)\.?)[.!?…。！？]+["'”’»)]*\s*/u;

/** Mots du texte, sans les noms propres (capitale en milieu de phrase). */
function wordsOf(text: string): { words: string[]; sentences: number } {
  const words: string[] = [];
  let sentences = 0;
  for (const sentence of text.split(SENTENCE_END)) {
    const tokens = sentence.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) ?? [];
    if (!tokens.length) continue;
    sentences++;
    tokens.forEach((t, i) => {
      const lower = t.toLocaleLowerCase();
      // Nom propre probable : capitale hors début de phrase (sauf « I » anglais).
      if (i > 0 && t !== lower && t !== 'I' && t !== t.toUpperCase()) return;
      words.push(t !== lower ? `^${lower}` : lower);
    });
  }
  return { words, sentences };
}

/** `factor` : facteur de flexion de la langue (sinon valeur par défaut, voir formsFactor). */
export function estimateLevel(text: string, ranks: FrequencyRanks, language: string, factor?: number): LevelEstimate | null {
  return languageInfo(language).noSpaces ? estimateByCharacters(text, ranks) : estimateByWords(text, ranks, factor ?? formsFactor(language));
}

/** Niveau à partir des mesures (rang de vocabulaire, longueur des phrases, taille de l'extrait). */
export function classifyWords(vocabRank: number, sentenceLength: number, sample: number, factor: number): Level {
  let index = levelIndex(fromThresholds(vocabRank / factor, WORD_THRESHOLDS));
  // Phrases très longues : +1 niveau ; très courtes : −1 (jamais au-delà des bornes).
  if (sentenceLength > 24) index++;
  else if (sentenceLength < 9) index--;
  if (sample < SHORT_TEXT_WORDS) index--;
  return LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))];
}

/** En dessous (texte entier), un livre très court : quelques mots rares s'apprennent au fil de la lecture. */
const SHORT_TEXT_WORDS = 3000;

function estimateByWords(text: string, ranks: FrequencyRanks, factor: number): LevelEstimate | null {
  const { words, sentences } = wordsOf(text.normalize('NFC'));
  if (words.length < 300) return null;
  // Contractions et possessifs (« don't », « captain's ») : rang du mot de base.
  const lookup = (w: string) => ranks.get(w) ?? ranks.get(w.replace(/['’].*$/, ''));
  const known: number[] = [];
  for (const w of words) {
    const capital = w.startsWith('^');
    const rank = lookup(capital ? w.slice(1) : w);
    // Mot inconnu écrit avec une capitale en début de phrase : sans doute un nom propre.
    if (rank === undefined && capital) continue;
    known.push(rank ?? UNKNOWN_RANK);
  }
  if (known.length < 300) return null;
  const sorted = known.sort((a, b) => a - b);
  const vocabRank = percentile(sorted, COVERAGE);
  const sentenceLength = words.length / Math.max(1, sentences);

  return { level: classifyWords(vocabRank, sentenceLength, known.length, factor), vocabRank, sentenceLength: round(sentenceLength), sample: known.length };
}

function estimateByCharacters(text: string, ranks: FrequencyRanks): LevelEstimate | null {
  const chars = [...text.normalize('NFC')].filter((c) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c));
  if (chars.length < 500) return null;
  const sorted = chars.map((c) => ranks.get(c) ?? UNKNOWN_RANK).sort((a, b) => a - b);
  const vocabRank = percentile(sorted, 0.95);
  const sentences = text.split(/[。！？!?]+/u).filter((s) => s.trim()).length;
  const sentenceLength = chars.length / Math.max(1, sentences);
  let index = levelIndex(fromThresholds(vocabRank, CHAR_THRESHOLDS));
  if (sentenceLength > 40) index++;
  return { level: LEVELS[Math.min(LEVELS.length - 1, index)], vocabRank, sentenceLength: round(sentenceLength), sample: chars.length };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Extrait analysé : le texte, sans son début (pages de titre, préface), limité en taille.
 * `body` est déjà débarrassé des mentions de Project Gutenberg.
 */
export function sampleForLevel(body: string, maxChars = 60_000): string {
  const skip = body.length > maxChars * 1.5 ? Math.floor(body.length * 0.1) : 0;
  return body.slice(skip, skip + maxChars);
}

/** Niveau d'un livre ≤ niveau maximal choisi. */
export function withinLevel(level: Level, max: Level): boolean {
  return levelIndex(level) <= levelIndex(max);
}

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export const LEVEL_LABEL: Record<Level, string> = {
  A1: 'Débutant',
  A2: 'Élémentaire',
  B1: 'Intermédiaire',
  B2: 'Intermédiaire avancé',
  C1: 'Avancé',
  C2: 'Maîtrise',
};
