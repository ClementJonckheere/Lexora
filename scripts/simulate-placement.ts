// Validation du moteur : questions abstraites (comme avant), puis la vraie banque (public/grammar/en/placement.json)
// avec des apprenants honnêtes (hasard sur un point inconnu) ou à règle superficielle (forme dominante du point,
// proposition bizarre écartée), pour le moteur actuel et avec un niveau global, sur les 74 points ou les seules leçons.
// npx vite-node scripts/simulate-placement.ts [--output docs/placement-simulation.json]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PlacementModel, type PlacementTarget, type PlacementQuestion } from '../src/core/learn/placement';
import { referencePlacementProfiles, simulatePlacement, type PlacementBehaviour } from '../src/core/learn/placementSimulation';
import type { PlacementItem } from '../src/core/learn/placementBank';
import { placementScope } from '../src/core/learn/placementResults';

const path = 'public/grammar/en/points.json';
const data = JSON.parse(readFileSync(path, 'utf8')) as { points: { id: string; level: string; requires: string[]; after: string[] }[] };
const targets: PlacementTarget[] = data.points.map((p) => ({ ...p, kind: 'point' }));
const questions = (mode: 'typed' | 'choice'): PlacementQuestion[] => targets.flatMap((t) => Array.from({ length: 12 }, (_, i) => ({
  id: `simulation:${t.id}:${i}`, targetId: t.id, mode, ...(mode === 'choice' ? { choices: 2 } : {}),
})));
const seed = 20261029;
const learners = 200;
const profiles = referencePlacementProfiles(targets);
const conditions = [
  { name: 'typed-matched', mode: 'typed' as const, noise: { slip: 0.1, typedChance: 0.05, unknownShare: 0.35 } },
  { name: 'choice-matched', mode: 'choice' as const, noise: { slip: 0.1, typedChance: 0.05, unknownShare: 0.35 } },
  { name: 'typed-stress', mode: 'typed' as const, noise: { slip: 0.2, typedChance: 0.15, unknownShare: 0.35 } },
];
// Vraie banque : chaque question garde son mode, son nombre de propositions et sa nature de réponse.
const bankPath = 'public/grammar/en/placement.json';
const bank = (JSON.parse(readFileSync(bankPath, 'utf8')) as { items: PlacementItem[] }).items;
const lessonIds = (JSON.parse(readFileSync('public/grammar/en/lessons.json', 'utf8')) as { lessons: { id: string }[] }).lessons.map((l) => l.id);
/** Leçons existantes et leurs prérequis (même périmètre que l'application). */
const lessonScope = placementScope(targets, lessonIds);
const bankLearners = 100;
const bankConditions: { name: string; scope: 'all' | 'lessons'; globalLevel: number; behaviour: PlacementBehaviour }[] = [];
for (const scope of ['all', 'lessons'] as const)
  for (const globalLevel of [0, 2])
    for (const behaviour of ['random', 'shortcut'] as const)
      bankConditions.push({ name: `bank-${scope}-${globalLevel ? `level${globalLevel}` : 'base'}-${behaviour}`, scope, globalLevel, behaviour });

const hashes = Object.fromEntries([path, bankPath, 'src/core/learn/placement.ts', 'src/core/learn/placementSimulation.ts'].map((p) => [
  p, createHash('sha256').update(readFileSync(p)).digest('hex'),
]));
const report = {
  version: 2,
  scope: 'Simulation abstraite du moteur, pas une mesure de validite des futurs exercices A1-C1.',
  seed, learnersPerProfile: learners, targets: targets.length, config: new PlacementModel(targets, []).config,
  truth: 'Les profils respectent requires mais peuvent ne pas respecter after. Ils sont binaires, sans apprentissage pendant le test.',
  sourceHashes: hashes,
  conditions: conditions.map(({ name, mode, noise }) => {
    const model = new PlacementModel(targets, questions(mode));
    const rows = simulatePlacement(model, profiles, learners, seed, noise);
    console.log(`\n${name} : ${rows.length * learners} apprenants simulés, ${targets.length} points`);
    console.table(rows.map((r) => ({
      profil: r.profile, questions: r.meanQuestions.toFixed(2),
      'classes %': (100 * r.classifiedRate).toFixed(2), 'erreurs / classes %': (100 * r.classifiedErrorRate).toFixed(2),
      'incertains %': (100 * r.uncertainRate).toFixed(2), 'erreur si forcé %': (100 * r.forcedErrorRate).toFixed(2),
    })));
    return { name, mode, noise, rows };
  }),
  bank: {
    learnersPerProfile: bankLearners,
    questions: bank.length,
    lessonScope: lessonScope.length,
    conditions: bankConditions.map(({ name, scope, globalLevel, behaviour }) => {
      const scoped = scope === 'all' ? targets : lessonScope;
      const ids = new Set(scoped.map((t) => t.id));
      const model = new PlacementModel(scoped, bank.filter((q) => ids.has(q.targetId)), { globalLevel });
      const rows = simulatePlacement(model, referencePlacementProfiles(scoped), bankLearners, seed, undefined, behaviour);
      console.log(`\n${name} : ${scoped.length} points`);
      console.table(rows.map((r) => ({
        profil: r.profile, questions: r.meanQuestions.toFixed(1),
        'incertains %': (100 * r.uncertainRate).toFixed(1), 'erreurs / classés %': (100 * r.classifiedErrorRate).toFixed(1),
        'faux acquis %': (100 * r.falseMasteryRate).toFixed(1),
      })));
      return { name, scope, globalLevel, behaviour, points: scoped.length, rows };
    }),
  },
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error('Chemin de sortie manquant.');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Rapport : ${output}`);
}
