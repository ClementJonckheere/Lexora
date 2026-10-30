import { PlacementModel, type PlacementAnswer, type PlacementDecision, type PlacementQuestion, type PlacementTarget } from './placement';

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

/**
 * Comportement face à un point inconnu : `random` répond au hasard (1 / propositions) ; `shortcut` applique une règle
 * superficielle au lieu du hasard : la nature de réponse la plus fréquente du point (forme sans do, pronom au milieu,
 * toujours to…), et, sans cette prise, écarte une proposition bizarre (hasard sur une proposition de moins).
 */
export type PlacementBehaviour = 'random' | 'shortcut';

/**
 * Apprenant plus réaliste, pour tester le modèle hors de ses propres hypothèses. Sur un point inconnu, avec la
 * probabilité `share`, il applique une règle superficielle que le modèle ne connaît pas forcément :
 * - `dominant` : la nature de réponse dominante du point (celle que le modèle anticipe) ;
 * - `suffix-s` : toujours la forme en -s (proposition en -s ; en réponse tapée, juste seulement si la réponse finit par s) ;
 * - `longest` : la proposition la plus longue ;
 * - `shortest` : la plus courte, approximation du calque français (présent pour will, pas de do, base verbale).
 * Sinon il répond au hasard. `defective` : part des questions mal posées, ratées une fois sur deux même quand on
 * connaît le point (deux réponses justes, traduction ambiguë…), alors que le modèle suppose 10 % d'inattention.
 */
export interface PlacementLearner {
  heuristic: 'dominant' | 'suffix-s' | 'longest' | 'shortest';
  share: number;
  defective: number;
}

/** Nature de réponse dominante de chaque point (seulement s'il en a au moins deux) : la règle superficielle. */
export function shortcutForms(questions: readonly (PlacementQuestion & { form?: string })[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const q of questions) {
    if (!q.form) continue;
    const c = counts.get(q.targetId) ?? new Map<string, number>();
    c.set(q.form, (c.get(q.form) ?? 0) + 1);
    counts.set(q.targetId, c);
  }
  const out = new Map<string, string>();
  for (const [id, c] of counts) if (c.size >= 2) out.set(id, [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  return out;
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
  /** Part des points inconnus de l'apprenant classés « acquis » : le défaut que la règle superficielle révèle. */
  falseMasteryRate: number;
  /** Part des points connus classés « à apprendre » : ce que des questions mal posées coûtent. */
  falseLearnRate: number;
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
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
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
  behaviour: PlacementBehaviour = 'random',
  learner?: PlacementLearner,
): PlacementSimulationRow[] {
  const shortcuts = behaviour === 'shortcut' || learner?.heuristic === 'dominant' ? shortcutForms(model.questions) : new Map<string, string>();
  type Q = PlacementQuestion & { form?: string; options?: string[]; answer?: string };
  const random = (q: Q) => (q.mode === 'choice' ? 1 / q.choices! : noise.typedChance);
  /** Probabilité de réussir une question d'un point inconnu, selon la règle superficielle. */
  const byRule = (q: Q, heuristic: PlacementLearner['heuristic']): number => {
    if (heuristic === 'dominant') {
      const rule = shortcuts.get(q.targetId);
      if (rule && q.form) return q.form === rule ? 1 - noise.slip : noise.slip / 2;
      return q.mode === 'choice' ? 1 / Math.max(2, q.choices! - 1) : noise.typedChance;
    }
    if (q.mode === 'typed') return heuristic === 'suffix-s' ? (/s$/.test(q.answer ?? '') ? 1 - noise.slip : noise.slip / 2) : noise.typedChance;
    const options = q.options ?? [];
    if (!options.length || !q.answer) return random(q);
    const pick =
      heuristic === 'suffix-s'
        ? options.filter((o) => /s$/.test(o))
        : options.filter((o) => o.length === (heuristic === 'longest' ? Math.max(...options.map((x) => x.length)) : Math.min(...options.map((x) => x.length))));
    if (!pick.length || pick.length === options.length) return random(q);
    return pick.includes(q.answer) ? (1 - noise.slip) / pick.length : noise.slip / 2;
  };
  const guess = (q: Q) => {
    if (learner) return learner.share * byRule(q, learner.heuristic) + (1 - learner.share) * random(q);
    if (behaviour === 'shortcut') return byRule(q, 'dominant');
    return random(q);
  };
  /** Question mal posée (choix déterministe par identifiant) : ratée une fois sur deux même par qui connaît le point. */
  const defective = (q: Q) => {
    if (!learner?.defective) return false;
    let h = 2166136261;
    for (const ch of q.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0) / 4294967296 < learner.defective;
  };
  if (!model.targets.length || !Number.isInteger(learners) || learners < 1 || !Number.isFinite(seed)) throw new Error('Simulation de placement invalide.');
  for (const n of Object.values(noise)) if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('Bruit de simulation invalide.');
  return profiles.map((profile, index) => {
    let questions = 0;
    let classified = 0;
    let errors = 0;
    let forcedErrors = 0;
    let squaredError = 0;
    let unknownPoints = 0;
    let falseMastery = 0;
    let knownPoints = 0;
    let falseLearn = 0;
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
        const probability = truth[q.targetId] ? (defective(q) ? 0.5 : 1 - noise.slip) : guess(q);
        const success = rng() < probability;
        const response = success ? 'correct' : rng() < noise.unknownShare ? 'unknown' : 'incorrect';
        answers = model.answer(answers, q.id, response);
      }
      questions += answers.length;
      for (const e of model.estimate(answers)) {
        const known = truth[e.id];
        squaredError += (e.probability - Number(known)) ** 2;
        if ((e.probability >= 0.5) !== known) forcedErrors++;
        if (!known) {
          unknownPoints++;
          if (e.state === 'mastered') falseMastery++;
        } else {
          knownPoints++;
          if (e.state === 'learn') falseLearn++;
        }
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
      forcedErrorRate: forcedErrors / total, falseMasteryRate: unknownPoints ? falseMastery / unknownPoints : 0,
      falseLearnRate: knownPoints ? falseLearn / knownPoints : 0, brier: squaredError / total, stops,
    };
  });
}
