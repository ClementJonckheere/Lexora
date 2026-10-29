import { PlacementModel, type PlacementAnswer, type PlacementDecision, type PlacementTarget } from './placement';

/** Simulations abstraites de connaissances ; ces identifiants ne sont pas des exercices a montrer a l'utilisateur. */
export interface PlacementProfile {
  name: string;
  knowledge: (rng: () => number) => Readonly<Record<string, boolean>>;
}

export interface PlacementNoise {
  slip: number;
  typedChance: number;
  /** Une partie des réponses non réussies devient "Je ne sais pas", sans changer leur probabilité totale. */
  unknownShare: number;
}

export interface PlacementSimulationRow {
  profile: string;
  learners: number;
  meanQuestions: number;
  classifiedRate: number;
  classifiedErrorRate: number;
  misclassifiedAllRate: number;
  uncertainRate: number;
  /** Erreur si l'on forcé un choix sur TOUS les points, seuil p >= 0.5, meme sans preuve. */
  forcedErrorRate: number;
  brier: number;
  stops: Record<NonNullable<PlacementDecision['reason']>, number>;
}

export function placementRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Verite construite indépendamment du moteur : fermeture logique des prérequis, jamais de `after`. */
function knownWithPrerequisites(targets: readonly PlacementTarget[], initial: Set<string>): Record<string, boolean> {
  const known = new Set(initial);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of targets) if (known.has(t.id)) for (const p of t.requires) if (!known.has(p)) { known.add(p); changed = true; }
  }
  return Object.fromEntries(targets.map((t) => [t.id, known.has(t.id)]));
}

export function referencePlacementProfiles(targets: readonly PlacementTarget[]): PlacementProfile[] {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
  return [
    { name: 'Débutant', knowledge: () => knownWithPrerequisites(targets, new Set()) },
    ...levels.map((level, rank) => ({
      name: `Acquis jusqu'à ${level}`,
      knowledge: () => knownWithPrerequisites(targets, new Set(targets.filter((t) => {
        const index = levels.indexOf(t.level ?? '');
        return index >= 0 && index <= rank;
      }).map((t) => t.id))),
    })),
    {
      name: 'Avancé avec lacunes hors after',
      knowledge: () => knownWithPrerequisites(targets, new Set(['subjunctive', 'cleft-sentences', 'be-used-to', 'wish', 'future-perfect', 'phrasal-verbs', 'perfect-continuous'])),
    },
    {
      name: 'Profils dispersés',
      knowledge: (rng) => knownWithPrerequisites(targets, new Set(targets.filter(() => rng() < 0.35).map((t) => t.id))),
    },
  ];
}

export function simulatePlacement(
  model: PlacementModel,
  profiles: readonly PlacementProfile[],
  learners: number,
  seed: number,
  noise: PlacementNoise = { slip: 0.1, typedChance: 0.05, unknownShare: 0.35 },
): PlacementSimulationRow[] {
  if (!model.targets.length || !Number.isInteger(learners) || learners < 1 || !Number.isFinite(seed)) throw new Error('Simulation de placement invalide.');
  for (const n of Object.values(noise)) if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('Bruit de simulation invalide.');
  return profiles.map((profile, index) => {
    let questions = 0;
    let classified = 0;
    let errors = 0;
    let forcedErrors = 0;
    let squaredError = 0;
    const stops = { complete: 0, budget: 0, 'bank-exhausted': 0 };
    for (let learner = 0; learner < learners; learner++) {
      const rng = placementRng(seed + index * 1000003 + learner * 7919);
      const truth = profile.knowledge(rng);
      if (model.targets.some((t) => typeof truth[t.id] !== 'boolean')) throw new Error('Profil incomplet.');
      let answers: PlacementAnswer[] = [];
      while (true) {
        const decision = model.next(answers);
        if (!decision.question) { stops[decision.reason]++; break; }
        const q = decision.question;
        const probability = truth[q.targetId] ? 1 - noise.slip : q.mode === 'choice' ? 1 / q.choices! : noise.typedChance;
        const success = rng() < probability;
        const response = success ? 'correct' : rng() < noise.unknownShare ? 'unknown' : 'incorrect';
        answers = model.answer(answers, q.id, response);
      }
      questions += answers.length;
      for (const e of model.estimate(answers)) {
        const known = truth[e.id];
        squaredError += (e.probability - Number(known)) ** 2;
        if ((e.probability >= 0.5) !== known) forcedErrors++;
        if (e.state === 'consolidate') continue;
        classified++;
        if ((e.state === 'mastered') !== known) errors++;
      }
    }
    const total = learners * model.targets.length;
    return {
      profile: profile.name, learners, meanQuestions: questions / learners,
      classifiedRate: classified / total, classifiedErrorRate: classified ? errors / classified : 0,
      misclassifiedAllRate: errors / total, uncertainRate: 1 - classified / total,
      forcedErrorRate: forcedErrors / total, brier: squaredError / total, stops,
    };
  });
}
