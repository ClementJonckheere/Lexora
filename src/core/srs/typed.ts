import { checkAnswer, type AnswerVerdict } from '../domain/answer';
import { buildCloze, checkCloze, clozeKeywords, inflections, type Cloze } from '../domain/cloze';
import { languageInfo } from '../domain/languages';
import { normalizeSearch } from '../domain/text';
import type { Note } from '../domain/types';
import type { FrequencyRanks } from '../reading/level';
import { State } from 'ts-fsrs';
import type { Grade } from './scheduler';

/**
 * Révision planifiée, sens français → langue :
 * - recto en contexte : une phrase d'exemple avec le trou, la traduction en indice ;
 * - réponse tapée, avec une note proposée d'après la justesse et le temps de réponse ;
 * - nouveaux mots présentés par utilité (fréquence dans la langue).
 */

export interface ClozeFront {
  sentence: string;
  cloze: Cloze;
  /** Nombre de phrases utilisables (l'exemple change à chaque révision). */
  choices: number;
}

/** Au-delà, la phrase est trop longue pour un recto lisible. */
const MAX_FRONT_LENGTH = 220;

/** Phrase à trous du recto, différente à chaque révision (`reps`), ou null si aucun exemple ne contient l'expression. */
export function clozeFront(note: Note, language: string, reps: number): ClozeFront | null {
  const usable: { sentence: string; cloze: Cloze }[] = [];
  for (const sentence of note.examples) {
    if (sentence.length > MAX_FRONT_LENGTH) continue;
    const cloze = buildCloze(note.expression, sentence, language);
    if (cloze) usable.push({ sentence, cloze });
  }
  if (!usable.length) return null;
  return { ...usable[reps % usable.length], choices: usable.length };
}

/** Verdict d'une réponse tapée : la forme de la phrase (« figured out ») ou l'expression elle-même sont acceptées. */
export function checkTyped(note: Note, front: ClozeFront | null, typed: string, language: string): AnswerVerdict {
  const direct = checkAnswer(note.expression, typed, language);
  if (direct === 'exact') return direct;
  const inSentence = front ? checkCloze(front.cloze, typed, language) : 'wrong';
  const rank = { exact: 2, close: 1, wrong: 0 } as const;
  const best = rank[inSentence] > rank[direct] ? inSentence : direct;
  if (best !== 'wrong' || languageInfo(language).noSpaces) return best;
  // Faute de frappe sur un mot : forme approchée plutôt qu'oubli.
  const targets = [note.expression.replace(/^to\s+/i, ''), ...(front ? [front.cloze.answers.join(' ')] : [])];
  return targets.some((t) => isTypo(t, typed)) ? 'close' : 'wrong';
}

/** Mêmes mots, sauf un mal orthographié (une lettre ; deux pour un mot d'au moins 8 lettres, mots courts exclus). */
function isTypo(expected: string, typed: string): boolean {
  const a = normalizeSearch(expected).split(' ');
  const b = normalizeSearch(typed).split(' ');
  if (a.length !== b.length) return false;
  const differing = a.map((w, i) => [w, b[i]] as const).filter(([x, y]) => x !== y);
  if (differing.length !== 1) return false;
  const [x, y] = differing[0];
  if (x.length < 5) return false;
  return editDistance(x, y, 2) <= (x.length >= 8 ? 2 : 1);
}

/** Distance d'édition (Levenshtein), arrêtée dès qu'elle dépasse `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Temps de frappe estimé par caractère de la réponse. */
export const MS_PER_CHAR = 150;
/** « Facile » : temps de réflexion inférieur à cette part de votre temps habituel. */
const EASY_SHARE = 0.6;

/**
 * Délai sous lequel une réponse exacte compte comme « immédiate » : 60 % de votre temps de réflexion habituel
 * (médiane de vos réponses exactes tapées dans cet univers), plus le temps de frappe de la réponse.
 */
export function fastLimitMs(answerChars: number, baselineMs: number): number {
  return EASY_SHARE * baselineMs + MS_PER_CHAR * answerChars;
}

/**
 * Note proposée : faux → Oublié, forme approchée → Difficile, exact → Retenu, exact et immédiat → Facile.
 * Jamais « Facile » sur une fiche nouvelle ou en (ré)apprentissage : un mot frais se tape vite parce qu'il est
 * frais, pas parce qu'il est mémorisé. Ni tant que le temps habituel n'est pas connu (`baselineMs` null).
 */
export function suggestGrade(
  verdict: AnswerVerdict | 'skipped',
  elapsedMs: number,
  answerChars: number,
  baselineMs: number | null,
  cardState: State,
): Grade {
  if (verdict === 'close') return 2;
  if (verdict !== 'exact') return 1;
  if (cardState !== State.Review || baselineMs === null) return 3;
  return elapsedMs <= fastLimitMs(answerChars, baselineMs) ? 4 : 3;
}

/** Mot inconnu de la liste de fréquence : après tous les autres. */
export const UNRANKED = 1_000_000;

/**
 * Utilité d'une expression : rang de fréquence de son mot le plus rare (plus petit = plus utile).
 * « to give up » → rang de « give » ou de « up », le plus élevé des deux.
 */
export function frequencyRank(note: Note, ranks: FrequencyRanks, language: string): number {
  if (languageInfo(language).noSpaces) {
    const chars = [...note.expression].map((c) => ranks.get(c)).filter((r): r is number => r !== undefined);
    return chars.length ? Math.max(...chars) : UNRANKED;
  }
  const keywords = clozeKeywords(note.expression, language);
  if (!keywords.length) return UNRANKED;
  let worst = 0;
  for (const k of keywords) {
    const word = k.toLowerCase();
    let rank = ranks.get(word) ?? ranks.get(normalizeSearch(word));
    if (rank === undefined && language === 'en') {
      for (const form of inflections(word)) {
        const r = ranks.get(form);
        if (r !== undefined) rank = Math.min(rank ?? r, r);
      }
    }
    worst = Math.max(worst, rank ?? UNRANKED);
  }
  return worst;
}
