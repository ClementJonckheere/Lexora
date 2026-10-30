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
  /** Nature de la bonne réponse (sujet / objet, will / présent…) : sert à démasquer une règle superficielle. */
  form?: string;
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
  /**
   * Niveau global (principe des tests adaptatifs, IRT) : 0 pour l'ignorer. Sinon, pente de la probabilité de
   * départ d'un point selon l'écart entre le niveau θ de l'apprenant et la difficulté du point (A1 = 0 … C1 = 4) :
   * P(connu | θ) = logistique(pente × (θ − difficulté)). θ est estimé à partir de toutes les réponses.
   */
  globalLevel: number;
  /** Confiance exigée pour classer un point jamais posé à partir du seul niveau global. */
  levelConfidence: number;
  /**
   * Part des apprenants qui, sans connaître un point, appliquent une règle superficielle (toujours la même forme :
   * sans do, toujours to…) plutôt que de répondre au hasard. Pour un point dont les questions ont plusieurs natures de
   * réponse, l'hypothèse « inconnu » mêle hasard et règle unique : réussir toutes les phrases d'une nature et rater les
   * autres ne prouve alors rien. 0 pour l'ignorer.
   */
  shortcutShare: number;
}

export const DEFAULT_PLACEMENT_CONFIG: Readonly<PlacementConfig> = Object.freeze({
  confidence: 0.85,
  deductionConfidence: 0.99,
  maxQuestions: 40,
  minQuestions: 2,
  prior: 0.5,
  slip: 0.1,
  typedChance: 0.05,
  globalLevel: 0,
  levelConfidence: 0.99,
  shortcutShare: 0.5,
});

/** Difficulté d'un point selon son niveau du CECRL (A1 = 0 … C1 = 4) ; milieu de l'échelle sinon. */
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export function levelDifficulty(level?: string): number {
  const i = LEVELS.indexOf(level ?? '');
  return i >= 0 ? i : 2;
}
/** Grille du niveau θ, et a priori sur θ : large, centré sur B1. */
const THETA = Array.from({ length: 41 }, (_, i) => -3 + i * 0.25);
const THETA_PRIOR = THETA.map((t) => Math.exp(-((t - 2) ** 2) / (2 * 2.5 ** 2)));

export interface PlacementEstimate {
  id: string;
  kind: PlacementTarget['kind'];
  probability: number;
  directProbability: number;
  answered: number;
  unknown: number;
  state: 'mastered' | 'consolidate' | 'learn';
  evidence: 'direct' | 'requires' | 'level' | 'unassessed' | 'incomplete' | 'uncertain' | 'conflict';
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
  /** Natures de réponse des questions de chaque point (seulement s'il en a au moins deux). */
  private readonly formsOf = new Map<string, string[]>();

  constructor(targets: readonly PlacementTarget[], questions: readonly PlacementQuestion[], config: Partial<PlacementConfig> = {}) {
    const c = { ...DEFAULT_PLACEMENT_CONFIG, ...config };
    rates(c.slip, c.typedChance);
    if (!Number.isFinite(c.confidence) || c.confidence <= 0.5 || c.confidence >= 1
      || !Number.isFinite(c.deductionConfidence) || c.deductionConfidence < c.confidence || c.deductionConfidence >= 1
      || !Number.isFinite(c.prior) || c.prior <= 0 || c.prior >= 1
      || !Number.isInteger(c.maxQuestions) || c.maxQuestions < 2 || c.maxQuestions > 40 || !Number.isInteger(c.minQuestions)
      || c.minQuestions < 2 || c.minQuestions > c.maxQuestions
      || !Number.isFinite(c.globalLevel) || c.globalLevel < 0
      || !Number.isFinite(c.levelConfidence) || c.levelConfidence < c.confidence || c.levelConfidence >= 1
      || !Number.isFinite(c.shortcutShare) || c.shortcutShare < 0 || c.shortcutShare >= 1) throw new Error('Configuration du placement invalide.');
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
    for (const q of this.questions) if (q.form) this.formsOf.set(q.targetId, [...new Set([...(this.formsOf.get(q.targetId) ?? []), q.form])]);
    for (const [id, forms] of this.formsOf) if (forms.length < 2) this.formsOf.delete(id);
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
    const { slip, shortcutShare } = this.config;
    const data = new Map(this.targets.map((t) => [t.id, { logOdds: logit(this.config.prior), n: 0, unknown: 0, forms: new Map<string, number>() }]));
    const observations = new Map<string, { correct: boolean; chance: number; form?: string }[]>();
    for (const a of answers) {
      const q = this.byQuestion.get(a.questionId);
      if (!q || !['correct', 'incorrect', 'unknown'].includes(a.response)) throw new Error('Historique de placement invalide.');
      const evidence = q.evidenceId ?? q.id;
      if (seen.has(evidence)) throw new Error('Une phrase ne peut pas compter deux fois.');
      seen.add(evidence);
      const d = data.get(q.targetId)!;
      d.n++;
      if (a.response === 'unknown') d.unknown++;
      if (q.form) d.forms.set(q.form, (d.forms.get(q.form) ?? 0) + 1);
      observations.set(q.targetId, [...(observations.get(q.targetId) ?? []), { correct: a.response === 'correct', chance: this.chance(q), form: q.form }]);
    }
    for (const [id, obs] of observations) {
      const d = data.get(id)!;
      const forms = this.formsOf.get(id);
      // Connu : réussite sauf inattention. Inconnu : hasard, ou (points à plusieurs natures) une règle unique.
      const known = obs.reduce((s, o) => s + Math.log(o.correct ? 1 - slip : slip), 0);
      const guess = obs.reduce((s, o) => s + Math.log(o.correct ? o.chance : 1 - o.chance), 0);
      let unknown = guess;
      if (forms && shortcutShare > 0) {
        const terms = [Math.log(1 - shortcutShare) + guess];
        for (const f of forms) {
          const rule = obs.reduce((s, o) => {
            const right = o.form ? (o.form === f ? 1 - slip : slip) : o.chance;
            return s + Math.log(o.correct ? right : 1 - right);
          }, 0);
          terms.push(Math.log(shortcutShare / forms.length) + rule);
        }
        const m = Math.max(...terms);
        unknown = m + Math.log(terms.reduce((s, t) => s + Math.exp(t - m), 0));
      }
      d.logOdds += known - unknown;
    }
    return { data, seen };
  }

  /**
   * Probabilité de chaque point avec le niveau global : calcul bayésien exact sur une grille de θ. Les réponses d'un
   * point comptent une seule fois : P(θ | réponses) ∝ a priori(θ) × Π [p(θ) · e^r + 1 − p(θ)], où r est le
   * log-rapport de vraisemblance des réponses du point, puis P(connu) = Σ P(θ | réponses) · p(θ) · e^r / (p(θ) · e^r + 1 − p(θ)).
   */
  private withLevel(data: Map<string, { logOdds: number }>): Map<string, number> {
    const slope = this.config.globalLevel;
    const priorLogit = logit(this.config.prior);
    const llr = new Map([...data].map(([id, d]) => [id, d.logOdds - priorLogit]));
    const p = (t: PlacementTarget, theta: number) => logistic(slope * (theta - levelDifficulty(t.level)));
    const logPost = THETA.map((theta, i) => {
      let s = Math.log(THETA_PRIOR[i]);
      for (const t of this.targets) {
        const r = llr.get(t.id)!;
        if (r !== 0) s += Math.log(1 + p(t, theta) * (Math.exp(r) - 1));
      }
      return s;
    });
    const max = Math.max(...logPost);
    const weights = logPost.map((s) => Math.exp(s - max));
    const total = weights.reduce((a, b) => a + b, 0);
    return new Map(
      this.targets.map((t) => {
        const r = llr.get(t.id)!;
        let known = 0;
        THETA.forEach((theta, i) => {
          const q = p(t, theta);
          known += (weights[i] / total) * ((q * Math.exp(r)) / (q * Math.exp(r) + 1 - q));
        });
        return [t.id, Math.max(EPSILON, Math.min(1 - EPSILON, known))];
      }),
    );
  }

  estimate(answers: readonly PlacementAnswer[]): PlacementEstimate[] {
    const { data } = this.history(answers);
    const { confidence, minQuestions } = this.config;
    // Un point posé se classe sur ses seules réponses ; le niveau global (s'il est activé) oriente le choix des
    // questions et classe les points jamais posés, sans pouvoir faire basculer un point posé.
    const direct = new Map([...data].map(([id, d]) => [id, logistic(d.logOdds)]));
    const levelled = this.config.globalLevel > 0 ? this.withLevel(data) : direct;
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
    // Le niveau n'extrapole pas au-delà de ce que les réponses montrent : « acquis » seulement jusqu'au niveau le plus
    // haut d'un point acquis en réponses directes, « à apprendre » seulement à partir du plus bas d'un point raté.
    const directLevels = (high: boolean) =>
      this.targets.filter((t) => strong(t.id) && (high ? direct.get(t.id)! >= confidence : direct.get(t.id)! <= 1 - confidence)).map((t) => levelDifficulty(t.level));
    const ceiling = Math.max(-Infinity, ...directLevels(true));
    const floor = Math.min(Infinity, ...directLevels(false));
    return this.targets.map((t) => {
      const d = data.get(t.id)!;
      const raw = direct.get(t.id)!;
      const common = { id: t.id, kind: t.kind, directProbability: levelled.get(t.id)!, answered: d.n, unknown: d.unknown };
      if (conflicts.has(t.id)) return { ...common, probability: 0.5, state: 'consolidate', evidence: 'conflict', sources: [...conflicts.get(t.id)!].sort() };
      const proof = positive.get(t.id) ?? negative.get(t.id);
      if (d.n > 0 && d.n < minQuestions) return { ...common, probability: raw, state: 'consolidate', evidence: 'incomplete', sources: [] };
      if (proof) return {
        ...common, probability: proof.probability, state: proof.probability >= confidence ? 'mastered' : 'learn',
        evidence: proof.sources.includes(t.id) ? 'direct' : 'requires', sources: [...proof.sources].sort(),
      };
      // Niveau global : un point jamais posé mais loin du niveau estimé se classe seul.
      const lc = this.config.levelConfidence;
      const level = levelDifficulty(t.level);
      const fromLevel = levelled.get(t.id)!;
      if (this.config.globalLevel > 0 && !d.n && ((fromLevel >= lc && level <= ceiling) || (fromLevel <= 1 - lc && level >= floor)))
        return { ...common, probability: fromLevel, state: fromLevel >= lc ? 'mastered' : 'learn', evidence: 'level', sources: [] };
      return { ...common, probability: d.n ? raw : fromLevel, state: 'consolidate', evidence: d.n ? 'uncertain' : 'unassessed', sources: [] };
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
    const { seen, data } = this.history(answers);
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
      // Natures de réponse alternées : la phrase suivante est d'une nature encore peu posée pour ce point.
      const used = data.get(e.id)!.forms;
      const pool = [...(available.get(e.id) ?? [])].sort((a, b) => (used.get(a.form ?? '') ?? 0) - (used.get(b.form ?? '') ?? 0));
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
