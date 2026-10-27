import { BAND_EDGES, bandOf, bandWidth, type VocabBank } from './coverage';

/**
 * Test de vocabulaire « oui / non » (principe du test LexTALE et des tests de taille de vocabulaire) :
 * des mots tirés de chaque tranche de fréquence, mêlés à des mots inventés. Répondre « je connais » à un mot
 * inventé révèle une tendance à surestimer, que l'on corrige : p = (h − f) / (1 − f), où h est la part de
 * « je connais » sur les vrais mots de la tranche et f celle sur les mots inventés.
 * Aucune IA : des listes de fréquence et du calcul.
 */

export interface TestItem {
  word: string;
  real: boolean;
  /** Tranche de fréquence (vrais mots). */
  band: number;
}

type Rng = () => number;

export const WORDS_PER_BAND = 8;
export const PSEUDO_WORDS = 20;

const VOWELS = 'aeiou';

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mot inventé plausible : un vrai mot dont une voyelle change, et qui n'existe pas dans la liste. */
export function pseudoword(word: string, lexicon: Set<string>, rng: Rng): string | null {
  const positions = [...word].map((c, i) => (VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
  for (let attempt = 0; attempt < 12 && positions.length; attempt++) {
    const i = positions[Math.floor(rng() * positions.length)];
    const others = VOWELS.replace(word[i], '');
    const candidate = word.slice(0, i) + others[Math.floor(rng() * others.length)] + word.slice(i + 1);
    if (!lexicon.has(candidate)) return candidate;
  }
  return null;
}

/** Mots utilisables : minuscules uniquement (pas d'abréviations), au moins 3 lettres. */
const usable = (w: string) => /^\p{Ll}{3,}$/u.test(w);

/** Banque de secours tirée de la seule liste de fréquence (sans le filtre des noms propres de la CI). */
export function bankFromList(list: string[]): VocabBank {
  const bands: string[][] = BAND_EDGES.map(() => []);
  list.forEach((w, i) => {
    const b = bandOf(i + 1);
    if (b < BAND_EDGES.length && usable(w)) bands[b].push(w);
  });
  return { bands };
}

/**
 * Construit le test : `perBand` mots de chaque tranche de la banque, plus des mots inventés.
 * `list` (liste de fréquence complète) sert à vérifier qu'un mot inventé n'existe pas.
 */
export function buildVocabTest(
  list: string[],
  rng: Rng = Math.random,
  perBand = WORDS_PER_BAND,
  pseudoCount = PSEUDO_WORDS,
  bank: VocabBank = bankFromList(list),
): TestItem[] {
  const lexicon = new Set(list);
  const byBand = BAND_EDGES.map((_, b) => (bank.bands[b] ?? []).filter(usable));
  const real: TestItem[] = byBand.flatMap((words, band) =>
    shuffle(words, rng)
      .slice(0, perBand)
      .map((word) => ({ word, real: true, band })),
  );
  // Mots inventés à partir de mots courants de 5 lettres ou plus (structure crédible).
  const bases = shuffle(
    byBand
      .slice(1, 6)
      .flat()
      .filter((w) => w.length >= 5),
    rng,
  );
  const used = new Set(real.map((r) => r.word));
  const fake: TestItem[] = [];
  for (const base of bases) {
    if (fake.length >= pseudoCount) break;
    const p = pseudoword(base, lexicon, rng);
    if (p && !used.has(p)) {
      used.add(p);
      fake.push({ word: p, real: false, band: -1 });
    }
  }
  // Quelques mots très courants pour commencer en confiance, puis tout mélangé.
  const warm = real.filter((r) => r.band === 0).slice(0, 3);
  const rest = real.filter((r) => !warm.includes(r));
  return [...warm, ...shuffle([...rest, ...fake], rng)];
}

export interface VocabScore {
  bands: number[];
  vocabSize: number;
  falseAlarm: number;
}

/** Régression isotone décroissante (fusion des voisins qui violent l'ordre), pondérée. */
export function decreasing(values: number[], weights: number[]): number[] {
  const blocks: { v: number; w: number; n: number }[] = [];
  values.forEach((v, i) => {
    blocks.push({ v, w: weights[i] || 1e-9, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].v < blocks[blocks.length - 1].v) {
      const b = blocks.pop()!;
      const a = blocks.pop()!;
      blocks.push({
        v: (a.v * a.w + b.v * b.w) / (a.w + b.w),
        w: a.w + b.w,
        n: a.n + b.n,
      });
    }
  });
  return blocks.flatMap((b) => new Array<number>(b.n).fill(b.v));
}

/** Résultat : part de mots connus par tranche (corrigée, décroissante) et taille du vocabulaire. */
export function scoreVocabTest(items: TestItem[], answers: boolean[]): VocabScore {
  const fakes = items.map((it, i) => ({ it, yes: answers[i] })).filter((x) => !x.it.real && x.yes !== undefined);
  const falseAlarm = fakes.length ? fakes.filter((x) => x.yes).length / fakes.length : 0;
  const hits = BAND_EDGES.map(() => 0);
  const seen = BAND_EDGES.map(() => 0);
  items.forEach((it, i) => {
    if (!it.real || answers[i] === undefined) return;
    seen[it.band]++;
    if (answers[i]) hits[it.band]++;
  });
  const raw = seen.map((n, b) => {
    if (!n) return 0;
    const h = hits[b] / n;
    return falseAlarm >= 1 ? 0 : (h - falseAlarm) / (1 - falseAlarm);
  });
  // Lissage puis bornes : borner chaque tranche avant de lisser couperait les erreurs négatives et garderait
  // les positives, d'où une surestimation (les tranches rares sont très larges).
  const bands = decreasing(raw, seen).map((p) => Math.round(Math.max(0, Math.min(1, p)) * 1000) / 1000);
  const vocabSize = bands.reduce((sum, p, b) => sum + p * bandWidth(b), 0);
  return {
    bands,
    vocabSize: Math.round(vocabSize / 50) * 50,
    falseAlarm: Math.round(falseAlarm * 1000) / 1000,
  };
}
