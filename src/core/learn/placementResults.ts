import type { PlacementRecord, PlacementState } from '../domain/settings';
import { DEFAULT_PLACEMENT_CONFIG, updatePlacementProbability, type PlacementEstimate, type PlacementResponse } from './placement';
import type { PlacementItem } from './placementBank';

/**
 * Résultats du test de placement : l'état de chaque point (acquis, à consolider, à apprendre), corrigé par
 * l'utilisateur s'il le souhaite, et ce qu'on en tire dans Apprendre (par où commencer).
 */

export type DoneRecord = Extract<PlacementRecord, { status: 'done' }>;

export const STATE_LABEL: Record<PlacementState, string> = { mastered: 'Acquis', consolidate: 'À consolider', learn: 'À apprendre' };

/** Enregistrement d'un test terminé, à partir des estimations du moteur. */
export function placementRecord(estimates: readonly PlacementEstimate[], now = Date.now()): DoneRecord {
  return {
    status: 'done',
    at: now,
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

/** Questions d'un mini-test, et seuil de confiance (le même que le test de placement). */
export const CHECK_SIZE = 3;
const CONFIDENCE = DEFAULT_PLACEMENT_CONFIG.confidence;

/** Le test n'a pas tranché ce point (« à consolider »), et ni l'utilisateur ni un mini-test ne l'ont fait depuis. */
export function needsCheck(record: DoneRecord, id: string): boolean {
  return !(id in record.overrides) && !record.checks?.[id] && record.results.find((r) => r.id === id)?.state === 'consolidate';
}

/** Questions du mini-test : jusqu'à 3, natures de réponse alternées (sujet / objet…), dans l'ordre de la banque. */
export function checkItems(bank: readonly PlacementItem[], id: string, size = CHECK_SIZE): PlacementItem[] {
  const byForm = new Map<string, PlacementItem[]>();
  for (const q of bank.filter((q) => q.targetId === id)) byForm.set(q.form ?? '', [...(byForm.get(q.form ?? '') ?? []), q]);
  const queues = [...byForm.values()];
  const out: PlacementItem[] = [];
  while (out.length < size && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < size) out.push(q.shift()!);
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
  let p = Math.min(0.99, Math.max(0.01, prior));
  for (const r of responses) p = updatePlacementProbability(p, r.response, c.slip, r.mode === 'typed' ? c.typedChance : 1 / (r.choices ?? 2));
  return { at: now, probability: Math.round(p * 1000) / 1000, state: p >= CONFIDENCE ? 'mastered' : p <= 1 - CONFIDENCE ? 'learn' : 'consolidate' };
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
    case 'unassessed':
      return 'non testé';
    case 'conflict':
      return 'réponses contradictoires';
    default:
      return 'incertain';
  }
}
