import type { PlacementRecord, PlacementState } from '../domain/settings';
import { DEFAULT_PLACEMENT_CONFIG, updatePlacementProbability, type PlacementAnswer, type PlacementEstimate, type PlacementResponse } from './placement';
import type { PlacementItem } from './placementBank';

/**
 * Résultats du test de placement : l'état de chaque point (acquis, à consolider, à apprendre), corrigé par
 * l'utilisateur s'il le souhaite, et ce qu'on en tire dans Apprendre (par où commencer).
 */

export type DoneRecord = Extract<PlacementRecord, { status: 'done' }>;

export const STATE_LABEL: Record<PlacementState, string> = { mastered: 'Acquis', consolidate: 'À consolider', learn: 'À apprendre' };

/** Enregistrement d'un test terminé, à partir des estimations du moteur. */
export function placementRecord(estimates: readonly PlacementEstimate[], now = Date.now(), answers: readonly PlacementAnswer[] = []): DoneRecord {
  return {
    status: 'done',
    at: now,
    answers: answers.map((a) => ({ q: a.questionId, r: a.response })),
    results: estimates
      .filter((e) => e.kind === 'point')
      .map((e) => ({ id: e.id, state: e.state, probability: Math.round(e.probability * 1000) / 1000, evidence: e.evidence })),
    overrides: {},
  };
}

/** État d'un point : la correction de l'utilisateur d'abord, puis le mini-test de la leçon, sinon l'estimation du test. */
export function pointState(record: DoneRecord, id: string): PlacementState | null {
  return record.overrides[id] ?? record.checks?.[id]?.state ?? record.results.find((r) => r.id === id)?.state ?? null;
}

/* ------------------------------------------------------ mini-test de leçon --- */

/**
 * Mini-test : 3 questions au moins, 5 au plus, jusqu'à ce que réussir tout par hasard tombe à 1 chance sur 16 au
 * plus. Trois choix binaires réussis au hasard une fois sur 8 suffiraient sinon à sauter la leçon : il en faut 4.
 */
export const CHECK_SIZE = 3;
const CHECK_MAX = 5;
const CHECK_LUCK = 1 / 16;
const CONFIDENCE = DEFAULT_PLACEMENT_CONFIG.confidence;
const luck = (q: PlacementItem) => (q.mode === 'typed' ? DEFAULT_PLACEMENT_CONFIG.typedChance : 1 / (q.choices ?? 2));

/** Le test n'a pas tranché ce point (« à consolider »), et ni l'utilisateur ni un mini-test ne l'ont fait depuis. */
export function needsCheck(record: DoneRecord, id: string): boolean {
  return !(id in record.overrides) && !record.checks?.[id] && record.results.find((r) => r.id === id)?.state === 'consolidate';
}

/**
 * Questions du mini-test : réponses tapées d'abord, puis 3 propositions ou plus, les choix binaires en dernier ; natures
 * de réponse alternées (sujet / objet…). Autant de questions qu'il faut pour que le hasard ne suffise pas.
 */
export function checkItems(bank: readonly PlacementItem[], id: string, size = CHECK_SIZE): PlacementItem[] {
  const strength = (q: PlacementItem) => (q.mode === 'typed' ? 0 : (q.choices ?? 2) >= 3 ? 1 : 2);
  const byForm = new Map<string, PlacementItem[]>();
  for (const q of bank.filter((q) => q.targetId === id).sort((a, b) => strength(a) - strength(b)))
    byForm.set(q.form ?? '', [...(byForm.get(q.form ?? '') ?? []), q]);
  const queues = [...byForm.values()];
  const ordered: PlacementItem[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) ordered.push(q.shift()!);
  const out: PlacementItem[] = [];
  let chance = 1;
  for (const q of ordered) {
    if (out.length >= CHECK_MAX || (out.length >= size && chance <= CHECK_LUCK)) break;
    out.push(q);
    chance *= luck(q);
  }
  return out;
}

/**
 * Résultat d'un mini-test : la probabilité du test de placement, mise à jour réponse par réponse avec les mêmes
 * hypothèses (inattention, chance d'un choix ou d'une réponse tapée), puis l'état au même seuil de confiance.
 */
export function checkResult(
  prior: number,
  responses: readonly { response: PlacementResponse; mode: 'typed' | 'choice'; choices?: number }[],
  now = Date.now(),
): { at: number; probability: number; state: PlacementState } {
  const c = DEFAULT_PLACEMENT_CONFIG;
  // Le test n'a pas tranché : on repart d'un a priori neutre plutôt que de sa probabilité (qui peut frôler le seuil).
  let p = Math.min(0.5, Math.max(0.01, prior));
  let lucky = 1;
  for (const r of responses) {
    const chance = r.mode === 'typed' ? c.typedChance : 1 / (r.choices ?? 2);
    p = updatePlacementProbability(p, r.response, c.slip, chance);
    if (r.response === 'correct') lucky *= chance;
  }
  // « Acquis » seulement si le hasard n'aurait pas suffi (banque trop petite pour 4 choix binaires, par exemple).
  const state = p >= CONFIDENCE && lucky <= CHECK_LUCK ? 'mastered' : p <= 1 - CONFIDENCE ? 'learn' : 'consolidate';
  return { at: now, probability: Math.round(p * 1000) / 1000, state };
}

/** Nombre de points dans chaque état. */
export function placementSummary(record: DoneRecord): Record<PlacementState, number> {
  const out: Record<PlacementState, number> = { mastered: 0, consolidate: 0, learn: 0 };
  for (const r of record.results) out[pointState(record, r.id) ?? r.state]++;
  return out;
}

/** Première leçon à travailler, dans l'ordre du parcours : ni acquise au test, ni déjà acquise en exercices. */
export function suggestedLesson(record: DoneRecord, lessonsInOrder: readonly string[], alreadyMastered: (id: string) => boolean): string | null {
  return lessonsInOrder.find((id) => !alreadyMastered(id) && pointState(record, id) !== 'mastered') ?? null;
}

/** Libellé de la preuve, pour expliquer d'où vient l'état d'un point. */
export function evidenceLabel(evidence: string): string {
  switch (evidence) {
    case 'direct':
      return 'testé';
    case 'requires':
      return 'déduit';
    case 'level':
      return 'déduit du niveau';
    case 'unassessed':
      return 'non testé';
    case 'conflict':
      return 'réponses contradictoires';
    default:
      return 'incertain';
  }
}

/* ------------------------------------------------------------ périmètre --- */

/**
 * Réglages du test dans l'application, retenus d'après la simulation (docs/placement-simulation.json) : le niveau global
 * (pente 2, conclusions sans question à 99 % de confiance, bornées par les niveaux confirmés) classe seul les points
 * loin du niveau ; le modèle de règle superficielle (par défaut) empêche une forme unique de passer pour un acquis.
 */
export const PLACEMENT_APP_CONFIG = { globalLevel: 2 } as const;

/**
 * Points testés : les leçons existantes et leurs prérequis stricts (fermeture de `requires`). Ce sont les seuls dont le
 * résultat sert dans Apprendre ; sur ce périmètre, le test tranche beaucoup plus de points en 40 questions.
 */
export function placementScope<T extends { id: string; requires?: readonly string[] }>(points: readonly T[], lessonIds: readonly string[]): T[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  const keep = new Set<string>();
  const visit = (id: string) => {
    if (keep.has(id) || !byId.has(id)) return;
    keep.add(id);
    for (const r of byId.get(id)!.requires ?? []) visit(r);
  };
  for (const id of lessonIds) visit(id);
  return points.filter((p) => keep.has(p.id));
}
