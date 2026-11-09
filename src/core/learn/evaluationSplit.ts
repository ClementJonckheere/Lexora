/**
 * Séparation permanente entre entraînement et évaluation, par phrase Tatoeba.
 *
 * Une phrase sert soit aux exercices (entraînement), soit aux évaluations (test de placement, mini-tests de leçon,
 * futures mesures de transfert), jamais aux deux : réussir une question d'évaluation ne doit pas venir du souvenir de
 * la même phrase vue en exercice. Le choix dépend seulement de l'identifiant de la phrase (empreinte FNV-1a), si bien
 * qu'il est le même pour tous les générateurs, d'une génération à l'autre, quels que soient le trou ou la leçon.
 * Contrôlé en CI (evaluationSplit.test.ts) sur toutes les banques livrées.
 */

/** Une phrase sur EVALUATION_SHARE est réservée à l'évaluation. */
export const EVALUATION_SHARE = 5;

export type SentencePool = 'training' | 'evaluation';

/** Phrase réservée à l'évaluation. */
export function isEvaluationSentence(sentenceId: number): boolean {
  const key = String(sentenceId);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % EVALUATION_SHARE === 0;
}

export function poolOf(sentenceId: number): SentencePool {
  return isEvaluationSentence(sentenceId) ? 'evaluation' : 'training';
}

/**
 * Identifiant de la phrase Tatoeba d'un exercice ou d'une question (« present-perfect:1234 »,
 * « placement:be:be:1234 », preuve « tatoeba:1234 ») ; null pour une phrase rédigée à la main.
 */
export function tatoebaSentenceId(id: string): number | null {
  if (/(?:^|:)written:/.test(id)) return null;
  const last = id.split(':').pop() ?? '';
  return /^\d+$/.test(last) ? Number(last) : null;
}
