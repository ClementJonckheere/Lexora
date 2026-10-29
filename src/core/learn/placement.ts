/**
 * Placement expérimental : Bayes sur les réponses directes, puis bornes issues des seuls `requires`.
 * Connaître un point implique ses prérequis ; ignorer un prérequis interdit ses dependants.
 * On garde la preuve la plus forte, sans multiplier des preuves corrélées. `after` n'est jamais consulté.
 * Aucun accès DB, aucune interface, aucun changement de l'historique des lecons ou de FSRS.
 */

export interface PlacementTarget {
  id: string;
  kind: 'point' | 'trap';
  requires: readonly string[];
  /** Métadonnée acceptee pour lire le parcours, sans effet sur le placement. */
  after?: readonly string[];
  level?: string;
}

export interface PlacementQuestion {
  id: string;
  targetId: string;
  mode: 'typed' | 'choice';
  /** Obligatoire pour un choix ; le modele de chance vaut 1 / nombre de propositions. */
  choices?: number;
  /** Une meme phrase ne peut servir deux fois dans le test. Par defaut : id. */
  evidenceId?: string;
}

export type PlacementResponse = 'correct' | 'incorrect' | 'unknown';
export interface PlacementAnswer {
  questionId: string;
  response: PlacementResponse;
}

export interface PlacementConfig {
  confidence: number;
  /** Plus exigeant avant de tirer plusieurs conclusions d'une seule source. */
  deductionConfidence: number;
  maxQuestions: number;
  minQuestions: number;
  prior: number;
  slip: number;
  typedChance: number;
}

export const DEFAULT_PLACEMENT_CONFIG: Readonly<PlacementConfig> = Object.freeze({
  confidence: 0.85,
  deductionConfidence: 0.99,
  maxQuestions: 40,
  minQuestions: 2,
  prior: 0.5,
  slip: 0.1,
  typedChance: 0.05,
});

export interface PlacementEstimate {
  id: string;
  kind: PlacementTarget['kind'];
  probability: number;
  directProbability: number;
  answered: number;
  unknown: number;
  state: 'mastered' | 'consolidate' | 'learn';
  evidence: 'direct' | 'requires' | 'unassessed' | 'incomplete' | 'uncertain' | 'conflict';
  /** Identifiants des points qui fournissent la preuve, pour rendre la déduction explicable. */
  sources: string[];
}

export type PlacementDecision =
  | { question: PlacementQuestion; reason: null }
  | { question: null; reason: 'complete' | 'budget' | 'bank-exhausted' };

const EPSILON = 1e-12;
const logit = (p: number) => Math.log(p / (1 - p));
const logistic = (x: number) => Math.max(EPSILON, Math.min(1 - EPSILON, x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x))));

function rates(slip: number, chance: number) {
  if (!Number.isFinite(slip) || !Number.isFinite(chance) || slip <= 0 || chance <= 0 || slip + chance >= 1) {
    throw new Error('Taux de chance et d\'inattention invalides.');
  }
}

function likelihood(correct: boolean, slip: number, chance: number): number {
  return correct ? Math.log((1 - slip) / chance) : Math.log(slip / (1 - chance));
}

/** Une observation binaire ; `unknown` est conserve a part mais vaut une réponse non réussie. */
export function updatePlacementProbability(prior: number, response: PlacementResponse, slip: number, chance: number): number {
  rates(slip, chance);
  if (!Number.isFinite(prior) || prior <= 0 || prior >= 1) throw new Error('Probabilite initiale invalide.');
  if (!['correct', 'incorrect', 'unknown'].includes(response)) throw new Error('Reponse de placement invalide.');
  return logistic(logit(prior) + likelihood(response === 'correct', slip, chance));
}

function entropy(p: number) {
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/** Gain d'information moyen d'une question, sous les hypotheses de chance / inattention du modele. */
function information(p: number, slip: number, chance: number) {
  const correct = p * (1 - slip) + (1 - p) * chance;
  return entropy(p) - correct * entropy(logistic(logit(p) + likelihood(true, slip, chance)))
    - (1 - correct) * entropy(logistic(logit(p) + likelihood(false, slip, chance)));
}

/** Gain espéré sur un petit horizon : une confirmation de prérequis peut resoudre plusieurs points. */
function resolutionWeights(p: number, steps: number, c: PlacementConfig, chance: number): readonly [number, number, number] {
  let own = 0;
  let parents = 0;
  let children = 0;
  let combinations = 1;
  for (let right = 0; right <= steps; right++) {
    const wrong = steps - right;
    const probability = combinations * (p * (1 - c.slip) ** right * c.slip ** wrong + (1 - p) * chance ** right * (1 - chance) ** wrong);
    const posterior = logistic(logit(p) + right * likelihood(true, c.slip, chance) + wrong * likelihood(false, c.slip, chance));
    if (posterior >= c.confidence || posterior <= 1 - c.confidence) own += probability;
    if (posterior >= c.deductionConfidence) parents += probability;
    if (posterior <= 1 - c.deductionConfidence) children += probability;
    combinations *= (steps - right) / (right + 1);
  }
  return [own / steps, parents / steps, children / steps];
}

interface Evidence {
  probability: number;
  sources: string[];
}

/** Catalogue compilé une seule fois ; les réponses sont des données immuables et rejouables. */
export class PlacementModel {
  readonly config: Readonly<PlacementConfig>;
  readonly targets: readonly PlacementTarget[];
  readonly questions: readonly PlacementQuestion[];
  private readonly byTarget: Map<string, PlacementTarget>;
  private readonly byQuestion: Map<string, PlacementQuestion>;
  private readonly ancestors = new Map<string, Set<string>>();
  private readonly descendants = new Map<string, Set<string>>();
  private lastAnswers?: readonly PlacementAnswer[];
  private lastSignature?: string;
  private lastDecision?: PlacementDecision;
  private readonly weightsCache = new Map<string, readonly [number, number, number]>();

  constructor(targets: readonly PlacementTarget[], questions: readonly PlacementQuestion[], config: Partial<PlacementConfig> = {}) {
    const c = { ...DEFAULT_PLACEMENT_CONFIG, ...config };
    rates(c.slip, c.typedChance);
    if (!Number.isFinite(c.confidence) || c.confidence <= 0.5 || c.confidence >= 1
      || !Number.isFinite(c.deductionConfidence) || c.deductionConfidence < c.confidence || c.deductionConfidence >= 1
      || !Number.isFinite(c.prior) || c.prior <= 0 || c.prior >= 1
      || !Number.isInteger(c.maxQuestions) || c.maxQuestions < 2 || c.maxQuestions > 40 || !Number.isInteger(c.minQuestions)
      || c.minQuestions < 2 || c.minQuestions > c.maxQuestions) throw new Error('Configuration du placement invalide.');
    this.config = Object.freeze(c);
    this.targets = Object.freeze(targets.map((t) => Object.freeze({ ...t, requires: Object.freeze([...t.requires]), after: Object.freeze([...(t.after ?? [])]) })));
    this.questions = Object.freeze(questions.map((q) => Object.freeze({ ...q })));
    this.byTarget = new Map(this.targets.map((t) => [t.id, t]));
    this.byQuestion = new Map(this.questions.map((q) => [q.id, q]));
    if (!targets.length || this.byTarget.size !== targets.length || this.byQuestion.size !== questions.length) throw new Error('Catalogue vide ou identifiants de placement dupliqués.');
    for (const t of this.targets) {
      if (!t.id || !['point', 'trap'].includes(t.kind) || (t.kind === 'trap' && t.requires.length)) throw new Error('Point ou piège invalide.');
      for (const id of t.requires) if (this.byTarget.get(id)?.kind !== 'point') throw new Error('Prerequis absent ou rattaché a un piège.');
      this.descendants.set(t.id, new Set());
    }
    const visit = (id: string, path: Set<string>): Set<string> => {
      if (path.has(id)) throw new Error('Cycle de prérequis dans le placement.');
      const cached = this.ancestors.get(id);
      if (cached) return cached;
      const next = new Set([...path, id]);
      const found = new Set<string>();
      for (const p of this.byTarget.get(id)!.requires) {
        found.add(p);
        for (const a of visit(p, next)) found.add(a);
      }
      this.ancestors.set(id, found);
      return found;
    };
    for (const t of this.targets) for (const id of visit(t.id, new Set())) this.descendants.get(id)!.add(t.id);
    for (const q of this.questions) {
      if (!q.id || !this.byTarget.has(q.targetId) || !['typed', 'choice'].includes(q.mode) || q.evidenceId === '') throw new Error('Question de placement invalide.');
      if (q.mode === 'choice' && (!Number.isInteger(q.choices) || q.choices! < 2)) throw new Error('Nombre de propositions invalide.');
      rates(c.slip, this.chance(q));
    }
  }

  chance(question: PlacementQuestion): number {
    return question.mode === 'choice' ? 1 / question.choices! : this.config.typedChance;
  }

  private history(answers: readonly PlacementAnswer[]) {
    if (answers.length > this.config.maxQuestions) throw new Error('Plafond de questions dépassé.');
    const seen = new Set<string>();
    const data = new Map(this.targets.map((t) => [t.id, { logOdds: logit(this.config.prior), n: 0, unknown: 0 }]));
    for (const a of answers) {
      const q = this.byQuestion.get(a.questionId);
      if (!q || !['correct', 'incorrect', 'unknown'].includes(a.response)) throw new Error('Historique de placement invalide.');
      const evidence = q.evidenceId ?? q.id;
      if (seen.has(evidence)) throw new Error('Une phrase ne peut pas compter deux fois.');
      seen.add(evidence);
      const d = data.get(q.targetId)!;
      d.logOdds += likelihood(a.response === 'correct', this.config.slip, this.chance(q));
      d.n++;
      if (a.response === 'unknown') d.unknown++;
    }
    return { data, seen };
  }

  estimate(answers: readonly PlacementAnswer[]): PlacementEstimate[] {
    const { data } = this.history(answers);
    const { confidence, minQuestions } = this.config;
    const direct = new Map([...data].map(([id, d]) => [id, logistic(d.logOdds)]));
    const strong = (id: string) => data.get(id)!.n >= minQuestions;
    // Une réussite du dependant et un échec de son prérequis sont contradictoires. Ces sources sont
    // suspendues pour la déduction ; un controle supplémentaire doit les départager.
    const conflicts = new Map<string, Set<string>>();
    for (const t of this.targets) {
      if (!strong(t.id) || direct.get(t.id)! < confidence) continue;
      for (const a of this.ancestors.get(t.id)!) if (strong(a) && direct.get(a)! <= 1 - confidence) {
        conflicts.set(t.id, new Set([...(conflicts.get(t.id) ?? []), a]));
        conflicts.set(a, new Set([...(conflicts.get(a) ?? []), t.id]));
      }
    }
    const positive = new Map<string, Evidence>();
    const negative = new Map<string, Evidence>();
    const add = (map: Map<string, Evidence>, id: string, p: number, source: string, high: boolean) => {
      const old = map.get(id);
      if (!old || (high ? p > old.probability : p < old.probability)) map.set(id, { probability: p, sources: [source] });
      else if (p === old.probability) old.sources.push(source);
    };
    for (const t of this.targets) {
      if (!strong(t.id) || conflicts.has(t.id)) continue;
      const p = direct.get(t.id)!;
      if (p >= confidence) add(positive, t.id, p, t.id, true);
      if (p <= 1 - confidence) add(negative, t.id, p, t.id, false);
      if (p >= this.config.deductionConfidence) for (const id of this.ancestors.get(t.id)!) add(positive, id, p, t.id, true);
      if (p <= 1 - this.config.deductionConfidence) for (const id of this.descendants.get(t.id)!) add(negative, id, p, t.id, false);
    }
    return this.targets.map((t) => {
      const d = data.get(t.id)!;
      const raw = direct.get(t.id)!;
      const common = { id: t.id, kind: t.kind, directProbability: raw, answered: d.n, unknown: d.unknown };
      if (conflicts.has(t.id)) return { ...common, probability: 0.5, state: 'consolidate', evidence: 'conflict', sources: [...conflicts.get(t.id)!].sort() };
      const proof = positive.get(t.id) ?? negative.get(t.id);
      if (d.n > 0 && d.n < minQuestions) return { ...common, probability: raw, state: 'consolidate', evidence: 'incomplete', sources: [] };
      if (proof) return {
        ...common, probability: proof.probability, state: proof.probability >= confidence ? 'mastered' : 'learn',
        evidence: proof.sources.includes(t.id) ? 'direct' : 'requires', sources: [...proof.sources].sort(),
      };
      return { ...common, probability: raw, state: 'consolidate', evidence: d.n ? 'uncertain' : 'unassessed', sources: [] };
    });
  }

  next(answers: readonly PlacementAnswer[]): PlacementDecision {
    const signature = JSON.stringify(answers);
    if (this.lastAnswers === answers && this.lastSignature === signature && this.lastDecision) return this.lastDecision;
    const decision = Object.freeze(this.select(answers));
    this.lastAnswers = answers;
    this.lastSignature = signature;
    this.lastDecision = decision;
    return decision;
  }

  private select(answers: readonly PlacementAnswer[]): PlacementDecision {
    const estimates = this.estimate(answers);
    if (estimates.every((e) => e.state !== 'consolidate')) return { question: null, reason: 'complete' };
    const budget = this.config.maxQuestions - answers.length;
    if (!budget) return { question: null, reason: 'budget' };
    const { seen } = this.history(answers);
    const available = new Map<string, PlacementQuestion[]>();
    for (const q of this.questions) if (!seen.has(q.evidenceId ?? q.id)) {
      const pool = available.get(q.targetId);
      if (pool) pool.push(q);
      else available.set(q.targetId, [q]);
    }
    const unresolved = new Set(estimates.filter((e) => e.state === 'consolidate').map((e) => e.id));
    let best: PlacementQuestion | null = null;
    let bestScore = -Infinity;
    let needsBudget = false;
    for (const e of estimates) {
      const parents = [...this.ancestors.get(e.id)!].filter((id) => unresolved.has(id)).length;
      const children = [...this.descendants.get(e.id)!].filter((id) => unresolved.has(id)).length;
      // On peut confirmer un résultat direct déjà classe pour rendre sa propagation assez sure.
      const confirm = e.evidence === 'direct' && (e.state === 'mastered' ? parents > 0 : children > 0)
        && Math.max(e.directProbability, 1 - e.directProbability) < this.config.deductionConfidence;
      if (!unresolved.has(e.id) && !confirm) continue;
      const pool = available.get(e.id) ?? [];
      const distinct = new Set(pool.map((q) => q.evidenceId ?? q.id)).size;
      const needed = Math.max(1, this.config.minQuestions - e.answered);
      if (distinct < needed) continue; // ne pas commencer un point avec une seule phrase disponible
      if (needed > budget) { needsBudget = true; continue; }
      const unfinished = e.answered > 0 && e.answered < this.config.minQuestions;
      const p = e.directProbability;
      const chances = new Set<number>();
      for (const q of pool) {
        const chance = this.chance(q);
        if (chances.has(chance)) continue; // a information égale, garder la premiere phrase disponible
        chances.add(chance);
        let gain = 0;
        for (let steps = needed; steps <= Math.min(Math.max(4, needed), distinct, budget); steps++) {
          const key = `${p}|${chance}|${steps}`;
          let weights = this.weightsCache.get(key);
          if (!weights) {
            weights = resolutionWeights(p, steps, this.config, chance);
            if (this.weightsCache.size >= 2048) this.weightsCache.clear();
            this.weightsCache.set(key, weights);
          }
          gain = Math.max(gain, (unresolved.has(e.id) ? weights[0] : 0) + parents * weights[1] + children * weights[2]);
        }
        const score = (unfinished ? 1e6 : 0) + gain + information(p, this.config.slip, chance) * (e.evidence === 'conflict' ? 0.5 : 0.001);
        if (score > bestScore) { best = q; bestScore = score; }
      }
    }
    return best ? { question: best, reason: null } : { question: null, reason: needsBudget ? 'budget' : 'bank-exhausted' };
  }

  answer(answers: readonly PlacementAnswer[], questionId: string, response: PlacementResponse): PlacementAnswer[] {
    if (!['correct', 'incorrect', 'unknown'].includes(response)) throw new Error('Reponse de placement invalide.');
    if (this.next(answers).question?.id !== questionId) throw new Error('Question inattendue ou déjà traitée.');
    return [...answers.map((a) => ({ ...a })), { questionId, response }];
  }
}
