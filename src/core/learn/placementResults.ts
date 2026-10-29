import type { PlacementRecord, PlacementState } from '../domain/settings';
import type { PlacementEstimate } from './placement';

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

/** État d'un point : la correction de l'utilisateur d'abord, sinon l'estimation du test. */
export function pointState(record: DoneRecord, id: string): PlacementState | null {
  return record.overrides[id] ?? record.results.find((r) => r.id === id)?.state ?? null;
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
