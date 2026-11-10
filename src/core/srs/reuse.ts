import { State } from 'ts-fsrs';
import { buildCloze, type Cloze } from '../domain/cloze';
import { primaryDirection, type Settings } from '../domain/settings';
import { tokenize } from '../domain/text';
import type { Note } from '../domain/types';
import { isEvaluationSentence } from '../learn/evaluationSplit';
import { checkTyped } from './typed';

/**
 * « Réutiliser mes expressions » : entraînement facultatif, sans effet sur la planification FSRS, pour passer de la
 * réussite d'une fiche à l'emploi de l'expression. Trois étapes, franchies dans l'ordre pour chaque note :
 * 1. retrouver l'expression dans une autre phrase réelle (Tatoeba), jamais vue dans la note ;
 * 2. à partir d'une intention (la phrase française d'une paire Tatoeba), écrire la phrase entière : la phrase source
 *    est une réponse de référence, pas la seule possible ; les variantes jugées justes sont gardées comme acceptées ;
 * 3. l'employer dans une phrase personnelle, écrite ou dite à voix haute, comparée à des exemples, puis autoévaluée.
 * Sans IA générative : la présence de l'expression est vérifiée, jamais la justesse de toute la phrase.
 * Mécanisme commun à toutes les langues (repérage par src/core/domain/cloze.ts, phrases Tatoeba avec traduction française).
 */

export type ReuseStage = 1 | 2 | 3;

/** Autoévaluation (ou note proposée) : 1 à revoir, 2 à peu près, 3 juste. */
export type ReuseRating = 1 | 2 | 3;

/** Vérification automatique : forme tapée (étape 1), présence de l'expression (étapes 2 et 3), phrase dite à voix haute. */
export type ReuseVerdict = 'exact' | 'close' | 'wrong' | 'reference' | 'present' | 'absent' | 'spoken';

export interface ReuseAnswer {
  id: string;
  universeId: string;
  noteId: string;
  stage: ReuseStage;
  /** Phrase Tatoeba (étapes 1 et 2), 0 sinon. */
  sentenceId: number;
  given: string;
  verdict: ReuseVerdict;
  rating: ReuseRating;
  createdAt: number;
}

/** Phrase Tatoeba candidate, avec sa traduction française. */
export interface ReuseSentence {
  id: number;
  text: string;
  translation: string;
}

export interface ReuseItem {
  note: Note;
  stage: ReuseStage;
  /** Étapes 1 et 2 : la phrase choisie et son trou. */
  sentence: (ReuseSentence & { cloze: Cloze }) | null;
}

export const STAGE_LABELS: Record<ReuseStage, string> = {
  1: 'Dans une autre phrase',
  2: 'À partir d’une intention',
  3: 'Dans une phrase à vous',
};

/** Une note réussie à une étape n'y revient pas avant ce délai (et pas deux fois le même jour). */
const MIN_GAP_MS = 2 * 86_400_000;
const MAX_LENGTH = 180;

/** Étape où en est une note : la première dont la dernière réponse n'est pas « juste » ; done quand les trois le sont. */
export function stageOf(history: readonly ReuseAnswer[]): { stage: ReuseStage; done: boolean } {
  const last = new Map<number, ReuseAnswer>();
  for (const a of [...history].sort((x, y) => x.createdAt - y.createdAt)) last.set(a.stage, a);
  for (const s of [1, 2, 3] as const) if (last.get(s)?.rating !== 3) return { stage: s, done: false };
  return { stage: 3, done: true };
}

/**
 * Notes à réutiliser : celles qu'on retrouve déjà en révision (fiche principale en révision, non suspendue). D'abord
 * celles en cours de parcours, puis les nouvelles venues, puis les parcours terminés (entretien en phrase libre) ;
 * à égalité, la plus anciennement pratiquée, puis la mieux retenue. Une note pratiquée depuis moins de deux jours attend.
 */
export function pickReuseNotes(
  notes: readonly Note[],
  answers: readonly ReuseAnswer[],
  settings: Pick<Settings, 'directions'>,
  now: number,
  max = 5,
): { note: Note; stage: ReuseStage; done: boolean }[] {
  const byNote = new Map<string, ReuseAnswer[]>();
  for (const a of answers) {
    const xs = byNote.get(a.noteId);
    if (xs) xs.push(a);
    else byNote.set(a.noteId, [a]);
  }
  const primary = primaryDirection(settings);
  const out: { note: Note; stage: ReuseStage; done: boolean; lastAt: number; stability: number; started: boolean }[] = [];
  for (const note of notes) {
    const card = note.cards[primary];
    if (note.suspended || !card || card.state !== State.Review) continue;
    const history = byNote.get(note.id) ?? [];
    const lastAt = history.reduce((m, a) => Math.max(m, a.createdAt), 0);
    if (lastAt && now - lastAt < MIN_GAP_MS) continue;
    out.push({ note, ...stageOf(history), lastAt, stability: card.stability, started: history.length > 0 });
  }
  const rank = (x: (typeof out)[number]) => (x.done ? 2 : x.started ? 0 : 1);
  return out
    .sort((a, b) => rank(a) - rank(b) || a.lastAt - b.lastAt || b.stability - a.stability)
    .slice(0, max)
    .map(({ note, stage, done }) => ({ note, stage, done }));
}

/** Clé de comparaison d'une phrase (casse, ponctuation et accents ignorés). */
export function sentenceKey(text: string): string {
  return tokenize(text).join(' ');
}

/**
 * Phrases utilisables pour une note : traduites en français, de longueur raisonnable, contenant l'expression, absentes
 * de ses exemples (déjà vus en révision) et réservées à l'entraînement (les phrases d'évaluation restent intactes pour
 * mesurer plus tard la réussite dans un exemple jamais rencontré). Les phrases déjà travaillées passent en dernier.
 */
export function usableSentences(
  note: Note,
  candidates: readonly ReuseSentence[],
  language: string,
  usedIds: ReadonlySet<number> = new Set(),
): (ReuseSentence & { cloze: Cloze })[] {
  const own = new Set(note.examples.map(sentenceKey));
  const seen = new Set<string>();
  const out: (ReuseSentence & { cloze: Cloze })[] = [];
  for (const s of candidates) {
    const key = sentenceKey(s.text);
    if (!s.translation.trim() || s.text.length < 12 || s.text.length > MAX_LENGTH) continue;
    if (own.has(key) || seen.has(key) || isEvaluationSentence(s.id)) continue;
    const cloze = buildCloze(note.expression, s.text, language);
    if (!cloze) continue;
    seen.add(key);
    out.push({ ...s, cloze });
  }
  return out.sort((a, b) => Number(usedIds.has(a.id)) - Number(usedIds.has(b.id)));
}

/** Élément de séance : l'étape prévue, ou la suivante possible quand aucune phrase n'est disponible (hors ligne, rien trouvé). */
export function reuseItem(note: Note, stage: ReuseStage, sentences: readonly (ReuseSentence & { cloze: Cloze })[]): ReuseItem {
  if (stage < 3 && sentences.length) return { note, stage, sentence: sentences[0] };
  return { note, stage: 3, sentence: null };
}

/** Étape 1 : forme tapée dans le trou (formes conjuguées et fautes de frappe tolérées, comme en révision). */
export function checkReuseTyped(item: ReuseItem, typed: string, language: string): { verdict: ReuseVerdict; rating: ReuseRating } {
  const verdict = checkTyped(item.note, item.sentence ? { sentence: item.sentence.text, cloze: item.sentence.cloze, choices: 1 } : null, typed, language);
  return { verdict, rating: verdict === 'exact' ? 3 : verdict === 'close' ? 2 : 1 };
}

/**
 * Étapes 2 et 3 : phrase écrite. « reference » : la phrase de référence ou une variante déjà jugée juste (note
 * proposée : juste) ; sinon présence ou absence de l'expression, puis autoévaluation.
 */
export function checkReuseSentence(
  note: Note,
  given: string,
  language: string,
  accepted: readonly string[] = [],
): { verdict: ReuseVerdict; suggested: ReuseRating | null } {
  const key = sentenceKey(given);
  if (!key) return { verdict: 'absent', suggested: 1 };
  if (accepted.some((a) => sentenceKey(a) === key)) return { verdict: 'reference', suggested: 3 };
  return buildCloze(note.expression, given, language) ? { verdict: 'present', suggested: null } : { verdict: 'absent', suggested: null };
}

/** Variantes acceptées pour une intention : la phrase source et les phrases jugées justes pour cette même intention. */
export function acceptedVariants(sentence: ReuseSentence, answers: readonly ReuseAnswer[]): string[] {
  return [sentence.text, ...answers.filter((a) => a.stage === 2 && a.sentenceId === sentence.id && a.rating === 3 && a.given.trim()).map((a) => a.given)];
}
