import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PlacementItem } from './placementBank';
import { appPlacementEstimates, appPlacementModel } from './placementResults';
import { irregularPlacementProfiles, referencePlacementProfiles, simulatePlacement, type PlacementSimulationRow } from './placementSimulation';

/**
 * Contrôle bloquant du placement LIVRÉ : vraie banque (placement.json), périmètre des leçons, réglages de l'application
 * (appPlacementModel) et ce qu'elle enregistre (appPlacementEstimates). Apprenants simulés honnêtes ou à règle
 * superficielle, profils par niveau et à lacunes irrégulières. Les seuils sont des garde-fous, pas des objectifs :
 * une régression de la banque, des réglages ou du moteur fait échouer la CI.
 */
const DIR = 'public/grammar/en';
const read = <T>(f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as T;
const points = read<{ points: { id: string; level: string; requires: string[] }[] }>('points.json').points;
const lessons = read<{ lessons: { id: string }[] }>('lessons.json').lessons.map((l) => l.id);
const bank = read<{ items: PlacementItem[] }>('placement.json').items;
const model = appPlacementModel(points, lessons, bank);
const profiles = [...referencePlacementProfiles(model.targets), ...irregularPlacementProfiles(model.targets)];

/** Faux acquis : le défaut le plus coûteux (leçon sautée à tort). */
const MAX_FALSE_MASTERY = 0.03;
/** Faux « à apprendre » : le moins grave (leçon refaite), mais au-delà le test ne sert plus. */
const MAX_FALSE_LEARN = 0.05;
const MAX_CLASSIFIED_ERROR = 0.08;

const summary = (rows: PlacementSimulationRow[]) =>
  rows
    .filter((r) => r.falseMasteryRate > MAX_FALSE_MASTERY || r.falseLearnRate > MAX_FALSE_LEARN || r.classifiedErrorRate > MAX_CLASSIFIED_ERROR || r.meanQuestions > 40)
    .map((r) => `${r.profile} : faux acquis ${(100 * r.falseMasteryRate).toFixed(1)} % ${JSON.stringify(r.falseMasteryByEvidence)}, faux à apprendre ${(100 * r.falseLearnRate).toFixed(1)} %, erreurs ${(100 * r.classifiedErrorRate).toFixed(1)} %, ${r.meanQuestions.toFixed(1)} questions`);

describe('placement livré : vraie banque, réglages de l’application', () => {
  it('chaque point du périmètre a des questions', () => {
    const counts = new Map(model.targets.map((t) => [t.id, 0]));
    for (const q of model.questions) counts.set(q.targetId, (counts.get(q.targetId) ?? 0) + 1);
    expect([...counts].filter(([, n]) => n < 2).map(([id]) => id)).toEqual([]);
  });

  it.each(['random', 'shortcut'] as const)('apprenants « %s » : peu de faux acquis, même avec des lacunes irrégulières', (behaviour) => {
    const rows = simulatePlacement(model, profiles, 20, 20261102, undefined, behaviour, undefined, appPlacementEstimates);
    expect(summary(rows)).toEqual([]);
  });

  it('hors des hypothèses du modèle : règle « forme la plus courte », questions mal posées', () => {
    const rows = simulatePlacement(model, profiles, 12, 20261103, undefined, 'random', { heuristic: 'shortest', share: 0.8, defective: 0.15 }, appPlacementEstimates);
    // Questions mal posées : on tolère plus de faux « à apprendre » (le coût est une leçon refaite), pas de faux acquis.
    const bad = rows.filter((r) => r.falseMasteryRate > 0.05).map((r) => `${r.profile} : faux acquis ${(100 * r.falseMasteryRate).toFixed(1)} %`);
    expect(bad).toEqual([]);
  });
});
