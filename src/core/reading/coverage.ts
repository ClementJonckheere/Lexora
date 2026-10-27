import { clozeKeywords, inflections } from '../domain/cloze';
import { languageInfo } from '../domain/languages';
import type { Note } from '../domain/types';
import type { FrequencyRanks } from './level';

/**
 * Couverture de vocabulaire : part des mots d'un texte que vous connaissez.
 * On lit confortablement sans dictionnaire vers 98 % de mots connus, avec effort vers 95 % (Hu & Nation, 2000).
 *
 * « Connu » combine, par ordre de priorité :
 * 1. vos marques explicites (« je connais » / « je ne connais pas », posées en lisant) ;
 * 2. les mots de vos notes (en cours d'apprentissage : le lecteur les surligne avec leur traduction) ;
 * 3. le test de vocabulaire : part de mots connus par tranche de fréquence.
 * Les noms propres (jamais écrits en minuscules dans le texte) ne comptent pas. En allemand, où tous les noms
 * prennent une majuscule, seuls les mots à majuscule absents de la liste de fréquence sont tenus pour des noms propres.
 */

/** Bornes supérieures des tranches de rang de fréquence (listes de 50 000 formes). */
export const BAND_EDGES = [250, 500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 50000] as const;

/** Lecture confortable (zone recommandée) : entre ces deux couvertures. */
export const COMFORT_MIN = 0.95;
export const COMFORT_MAX = 0.98;

export function bandOf(rank: number): number {
  const i = BAND_EDGES.findIndex((edge) => rank <= edge);
  return i < 0 ? BAND_EDGES.length : i;
}

export function bandWidth(i: number): number {
  return BAND_EDGES[i] - (i === 0 ? 0 : BAND_EDGES[i - 1]);
}

export interface Knowledge {
  /** Part de mots connus par tranche (test de vocabulaire). */
  bands: number[];
  /** Marques explicites : forme en minuscules → connue ou non. */
  marks: Map<string, boolean>;
  /** Formes des expressions de vos notes. */
  noteForms: Set<string>;
}

/** Formes (minuscules) des mots de vos notes, formes fléchies anglaises comprises. */
export function noteForms(notes: Note[], language: string): Set<string> {
  const out = new Set<string>();
  for (const n of notes) {
    for (const k of clozeKeywords(n.expression, language)) {
      const w = k.toLowerCase();
      out.add(w);
      if (language === 'en') for (const f of inflections(w)) out.add(f);
    }
  }
  return out;
}

/**
 * Formes de base possibles d'un mot anglais fléchi : « replied » → « reply », « chooses » → « choose »,
 * « stopped » → « stop », « quietly » → « quiet ». Les listes tirées de sous-titres classent mal les formes
 * écrites (« replied » y est rare, « reply » courant) ; qui connaît la base connaît la forme.
 */
export function englishBases(w: string): string[] {
  const out: string[] = [];
  const add = (b: string) => b.length >= 2 && out.push(b);
  const undouble = (stem: string) => (/([b-df-hj-np-tv-z])\1$/.test(stem) ? stem.slice(0, -1) : null);
  if (w.endsWith('ies') || w.endsWith('ied')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ed')) {
    const stem = w.slice(0, -2);
    add(stem);
    add(w.slice(0, -1));
    const u = undouble(stem);
    if (u) add(u);
  }
  if (w.endsWith('ing')) {
    const stem = w.slice(0, -3);
    add(stem);
    add(`${stem}e`);
    const u = undouble(stem);
    if (u) add(u);
  }
  if (w.endsWith('ily')) add(`${w.slice(0, -3)}y`);
  else if (w.endsWith('ly')) add(w.slice(0, -2));
  return out;
}

/** Base d'un mot rencontré (« replied » → « reply ») et son rang : c'est sous cette forme que les signaux sont comptés. */
export function wordBase(ranks: FrequencyRanks, word: string, language: string): { base: string; rank: number | null } {
  const { rank, base } = lookup(ranks, word.toLowerCase().replace(/’/g, "'"), language);
  return { base, rank: rank ?? null };
}

/** Rang de fréquence d'une forme (contraction ramenée au mot ; en anglais, la base si elle est plus fréquente), et cette base. */
function lookup(ranks: FrequencyRanks, w: string, language: string): { rank: number | undefined; base: string } {
  let rank = ranks.get(w) ?? ranks.get(w.replace(/['’].*$/, ''));
  let base = w;
  if (language === 'en') {
    for (const b of englishBases(w)) {
      const r = ranks.get(b);
      if (r !== undefined && (rank === undefined || r < rank)) {
        rank = r;
        base = b;
      }
    }
  }
  return { rank, base };
}

const rankOf = (ranks: FrequencyRanks, w: string, language: string) => lookup(ranks, w, language).rank;

/** Probabilité que vous connaissiez cette forme. */
export function knownProbability(word: string, ranks: FrequencyRanks, k: Knowledge, language: string): number {
  const { rank, base } = lookup(ranks, word, language);
  // Une marque posée sur la base (« humour ») vaut pour ses formes (« humoured »).
  const mark = k.marks.get(word) ?? k.marks.get(base);
  if (mark !== undefined) return mark ? 1 : 0;
  if (k.noteForms.has(word) || k.noteForms.has(base)) return 1;
  if (rank === undefined) return 0;
  return k.bands[bandOf(rank)] ?? 0;
}

interface Token {
  word: string;
  proper: boolean;
}

/** Langues où les noms communs prennent une majuscule. */
const CAPITALIZED_NOUNS = new Set(['de', 'lb']);

/** Mots du texte en minuscules ; les noms propres (jamais en minuscules dans ce texte) sont repérés. */
function tokens(text: string, ranks: FrequencyRanks, language: string): Token[] {
  const all = text.normalize('NFC').match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) ?? [];
  const lowerSeen = new Set<string>();
  for (const t of all) if (t === t.toLowerCase()) lowerSeen.add(t.replace(/’/g, "'"));
  const nounsCapitalized = CAPITALIZED_NOUNS.has(language);
  return all.map((t) => {
    const word = t.toLowerCase().replace(/’/g, "'");
    const capitalOnly = t !== t.toLowerCase() && !lowerSeen.has(word);
    return {
      word,
      proper: capitalOnly && (!nounsCapitalized || rankOf(ranks, word, language) === undefined),
    };
  });
}

export function supportsCoverage(language: string): boolean {
  return !languageInfo(language).noSpaces;
}

/**
 * Profil de fréquence d'un texte (calculé une fois, sans connaître le lecteur) : part des mots dans chaque
 * tranche de BAND_EDGES, puis la part des mots absents de la liste. Noms propres exclus.
 */
export function textProfile(text: string, ranks: FrequencyRanks, language: string): number[] | null {
  const counts = new Array<number>(BAND_EDGES.length + 1).fill(0);
  let total = 0;
  for (const t of tokens(text, ranks, language)) {
    if (t.proper) continue;
    const rank = rankOf(ranks, t.word, language);
    counts[rank === undefined ? BAND_EDGES.length : bandOf(rank)]++;
    total++;
  }
  if (total < 300) return null;
  return counts.map((c) => Math.round((c / total) * 10_000) / 10_000);
}

/** Couverture estimée d'un livre à partir de son profil et de votre test. */
export function coverageFromProfile(profile: number[], bands: number[]): number {
  let covered = 0;
  for (let i = 0; i < BAND_EDGES.length; i++) covered += (profile[i] ?? 0) * (bands[i] ?? 0);
  return covered;
}

export interface UnknownWord {
  word: string;
  /** Occurrences dans le texte. */
  count: number;
  rank: number | null;
  /** Formes rencontrées dans le texte (« vexing » pour « vex »). */
  forms: string[];
}

export interface TextCoverage {
  coverage: number;
  words: number;
  /** Mots probablement inconnus, du plus fréquent dans le texte au moins fréquent. */
  unknown: UnknownWord[];
  /**
   * Mots que le test prédit connus (ni marqués ni dans vos notes), sous leur base : « mots rencontrés » du recalage.
   * Un clic sur l'un d'eux en lisant est un signe qu'il est en fait inconnu.
   */
  predictedKnown: { word: string; rank: number }[];
}

/** Couverture exacte d'un texte (un chapitre), mot par mot, avec vos marques et vos notes. */
export function analyzeText(text: string, ranks: FrequencyRanks, k: Knowledge, language: string): TextCoverage {
  const unknown = new Map<string, UnknownWord>();
  const predictedKnown = new Map<string, number>();
  let known = 0;
  let words = 0;
  for (const t of tokens(text, ranks, language)) {
    if (t.proper) continue;
    words++;
    const p = knownProbability(t.word, ranks, k, language);
    known += p;
    if (p >= 0.5 && t.word.length > 1) {
      const { rank, base } = lookup(ranks, t.word, language);
      if (rank !== undefined && !k.marks.has(base) && !k.marks.has(t.word) && !k.noteForms.has(t.word) && !k.noteForms.has(base)) predictedKnown.set(base, rank);
    }
    if (p < 0.5 && t.word.length > 1) {
      // Formes d'un même mot regroupées sous leur base (« humoured », « humour » → « humour »).
      const { rank, base } = lookup(ranks, t.word, language);
      const u = unknown.get(base) ?? { word: base, count: 0, rank: rank ?? null, forms: [] };
      u.count++;
      if (!u.forms.includes(t.word)) u.forms.push(t.word);
      unknown.set(base, u);
    }
  }
  const list = [...unknown.values()].sort((a, b) => b.count - a.count || (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return {
    coverage: words ? known / words : 1,
    words,
    unknown: list,
    predictedKnown: [...predictedKnown].map(([word, rank]) => ({ word, rank })),
  };
}

/** « Confortable », « avec effort »… pour une couverture. */
export function coverageLabel(c: number): {
  label: string;
  tone: 'easy' | 'comfort' | 'effort' | 'hard';
} {
  if (c > COMFORT_MAX) return { label: 'facile pour vous', tone: 'easy' };
  if (c >= COMFORT_MIN) return { label: 'idéal pour progresser', tone: 'comfort' };
  if (c >= 0.9) return { label: 'avec effort', tone: 'effort' };
  return { label: 'difficile', tone: 'hard' };
}

/* -------------------------------------------- banque de mots du test --- */

/**
 * Mots candidats du test de vocabulaire, par tranche de fréquence. Préparée par la CI (scripts/build-catalog.ts)
 * à partir des livres de la langue : un mot n'y entre que s'il apparaît dans ces livres, surtout en minuscules
 * (ce qui écarte les prénoms et les noms de lieux des listes tirées de sous-titres).
 */
export interface VocabBank {
  bands: string[][];
}

/** Statistiques d'écriture d'un mot dans un corpus : occurrences en minuscules et au total. */
export interface CaseStats {
  lower: number;
  total: number;
}

/** Compte, pour chaque mot (minuscules), ses occurrences en minuscules et au total, hors début de phrase. */
export function caseStats(text: string, into: Map<string, CaseStats> = new Map()): Map<string, CaseStats> {
  // Contractions entières (« wasn't ») : leur moitié (« wasn ») ne doit pas passer pour un mot.
  for (const m of text.normalize('NFC').matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)) {
    // Début de phrase (ou de texte) : la majuscule n'y dit rien.
    const before = text.slice(Math.max(0, m.index - 4), m.index).replace(/[\s"'“”«»‘’(—–-]+$/u, '');
    if (!before || /[.!?…:]$/.test(before)) continue;
    const t = m[0];
    const w = t.toLowerCase();
    const s = into.get(w) ?? { lower: 0, total: 0 };
    s.total++;
    if (t === w) s.lower++;
    into.set(w, s);
  }
  return into;
}

/** Banque du test : jusqu'à `perBand` mots valides par tranche, tirés dans l'ordre de `rng`. */
/** Un mot au moins autant de fois plus courant dans une autre langue est tenu pour une citation étrangère. */
export const FOREIGN_RATIO = 10;

export function buildVocabBank(
  list: string[],
  stats: Map<string, CaseStats>,
  language: string,
  rng: () => number,
  perBand = 40,
  /** Listes de fréquence des autres langues : écarte les mots cités d'une autre langue (« très » dans un roman anglais). */
  others: FrequencyRanks[] = [],
): VocabBank {
  const nounsCapitalized = CAPITALIZED_NOUNS.has(language);
  // Début d'une contraction rencontrée dans les livres (« didn » de « didn't ») : pas un mot.
  const contractions = new Set<string>();
  for (const w of stats.keys()) {
    const i = w.search(/['’]/);
    if (i > 0) contractions.add(w.slice(0, i));
  }
  const bands: string[][] = BAND_EDGES.map(() => []);
  list.forEach((w, i) => {
    const rank = i + 1;
    const b = bandOf(rank);
    if (b >= BAND_EDGES.length || !/^\p{Ll}{3,}$/u.test(w) || contractions.has(w)) return;
    const s = stats.get(w);
    if (!s || s.total < 2) return;
    // Un nom commun s'écrit surtout en minuscules (sauf en allemand, où l'on exige seulement sa présence).
    if (!nounsCapitalized && s.lower / s.total < 0.8) return;
    if (others.some((o) => (o.get(w) ?? Infinity) * FOREIGN_RATIO < rank)) return;
    bands[b].push(w);
  });
  return {
    bands: bands.map((words) => {
      const a = [...words];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a.slice(0, perBand);
    }),
  };
}
