// Validation théorique du moteur, avec questions abstraites. Aucun exercice utilisateur n'est généré.
// npx vite-node scripts/simulate-placement.ts [--output docs/placement-simulation.json]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PlacementModel, type PlacementTarget, type PlacementQuestion } from '../src/core/learn/placement';
import { referencePlacementProfiles, simulatePlacement } from '../src/core/learn/placementSimulation';

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
const hashes = Object.fromEntries([path, 'src/core/learn/placement.ts', 'src/core/learn/placementSimulation.ts'].map((p) => [
  p, createHash('sha256').update(readFileSync(p)).digest('hex'),
]));
const report = {
  version: 1,
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
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error('Chemin de sortie manquant.');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Rapport : ${output}`);
}
