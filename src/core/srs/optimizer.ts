import { CLAMP_PARAMETERS, default_w, FSRSAlgorithm, forgetting_curve, generatorParameters, W17_W18_Ceiling, type FSRSState } from 'ts-fsrs';

/**
 * Paramètres FSRS personnels : FSRS suit déjà chaque fiche avec des paramètres par défaut, calculés sur des millions de
 * révisions d'autres personnes. Ici, on recalcule ces 21 paramètres sur l'historique d'une personne (toutes langues,
 * ou une langue si elle a assez de révisions), pour que le modèle prédise mieux SES oublis.
 *
 * Méthode (celle de l'optimiseur officiel, simplifiée) : on rejoue l'historique de chaque fiche avec le modèle FSRS-6
 * de ts-fsrs ; à chaque révision faite au moins un jour après la précédente, le modèle prédit la probabilité de se
 * souvenir, comparée à la réponse réelle (Oublié = 0, sinon 1). On minimise la perte logarithmique moyenne (Adam,
 * gradient numérique, paramètres bornés comme ts-fsrs, léger rappel vers les valeurs par défaut).
 *
 * Contrôle : les fiches sont partagées une fois pour toutes (par leur identifiant) entre apprentissage (80 %) et
 * contrôle (20 %, jamais vues par l'optimisation). Les nouveaux paramètres ne sont retenus que s'ils prédisent mieux
 * les révisions de contrôle que ceux utilisés aujourd'hui (perte et RMSE par tranches).
 */

export interface ReviewRow {
  cardId: string;
  /** Instant de la révision (ms). */
  at: number;
  /** 1 Oublié · 2 Difficile · 3 Retenu · 4 Facile. */
  rating: number;
  /** État de la fiche avant la révision (0 : nouvelle). */
  state: number;
}

export interface FitMetrics {
  /** Perte logarithmique moyenne : plus bas, meilleures prédictions. */
  logLoss: number;
  /** Écart entre taux prédit et taux réel, par tranches de prédiction (« RMSE (bins) » d'Anki). */
  rmse: number;
  /** Révisions évaluées (au moins un jour après la précédente). */
  reviews: number;
}

export interface FitResult {
  w: number[];
  /** Contrôle : paramètres actuels, puis nouveaux. */
  before: FitMetrics;
  after: FitMetrics;
  /** Les nouveaux paramètres font mieux sur les révisions de contrôle. */
  better: boolean;
  /** Révisions utilisables (apprentissage + contrôle). */
  reviews: number;
  cards: number;
}

/** En dessous, l'historique est trop court pour des paramètres fiables (ordre de grandeur conseillé par FSRS). */
export const MIN_FIT_REVIEWS = 400;
/** Gain minimal exigé sur la perte de contrôle, pour ne pas changer de paramètres pour du bruit. */
const MIN_GAIN = 0.005;
const DAY = 86_400_000;
const CLAMP = CLAMP_PARAMETERS(W17_W18_Ceiling, true);

/** Fiche rejouable : ses révisions dans l'ordre, l'écart en jours avec la précédente. */
interface Sequence {
  key: string;
  steps: { t: number; g: number }[];
  /** Révisions évaluées (t ≥ 1 jour, hors première). */
  scored: number;
}

/** Jour calendaire local (les écarts se comptent en jours, comme FSRS). */
const dayIndex = (at: number) => {
  const d = new Date(at);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

/** Historiques complets seulement : la première révision d'une fiche doit la trouver nouvelle. */
export function sequences(rows: readonly ReviewRow[]): Sequence[] {
  const byCard = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    if (r.rating < 1 || r.rating > 4) continue;
    const list = byCard.get(r.cardId) ?? [];
    list.push(r);
    byCard.set(r.cardId, list);
  }
  const out: Sequence[] = [];
  for (const [key, list] of byCard) {
    list.sort((a, b) => a.at - b.at);
    if (list[0].state !== 0 || list.length < 2) continue;
    const steps = list.map((r, i) => ({ t: i ? Math.max(0, dayIndex(r.at) - dayIndex(list[i - 1].at)) : 0, g: r.rating }));
    const scored = steps.filter((s, i) => i > 0 && s.t >= 1).length;
    if (scored) out.push({ key, steps, scored });
  }
  return out;
}

/** Contrôle : une fiche sur cinq, choisie par son identifiant (stable d'une optimisation à l'autre). */
export function isHoldout(key: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 5 === 0;
}

function algorithm(w: readonly number[]): FSRSAlgorithm {
  return new FSRSAlgorithm(generatorParameters({ w: [...w], enable_short_term: true }));
}

/** Prédictions (probabilité de se souvenir, résultat réel) des révisions évaluées d'un ensemble de fiches. */
function predictions(w: readonly number[], seqs: readonly Sequence[]): { p: number; y: number }[] {
  const alg = algorithm(w);
  const out: { p: number; y: number }[] = [];
  for (const seq of seqs) {
    let state: FSRSState | null = null;
    for (let i = 0; i < seq.steps.length; i++) {
      const { t, g } = seq.steps[i];
      if (state && i > 0 && t >= 1) out.push({ p: forgetting_curve(w, t, state.stability), y: g > 1 ? 1 : 0 });
      state = alg.next_state(state, t, g);
    }
  }
  return out;
}

const clampP = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, Number.isFinite(p) ? p : 0.5));

export function metrics(w: readonly number[], seqs: readonly Sequence[]): FitMetrics {
  const preds = predictions(w, seqs);
  if (!preds.length) return { logLoss: Infinity, rmse: Infinity, reviews: 0 };
  let loss = 0;
  const bins = new Map<number, { n: number; p: number; y: number }>();
  for (const { p, y } of preds) {
    const q = clampP(p);
    loss -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
    const b = Math.min(19, Math.floor(q * 20));
    const bin = bins.get(b) ?? { n: 0, p: 0, y: 0 };
    bin.n++;
    bin.p += q;
    bin.y += y;
    bins.set(b, bin);
  }
  let se = 0;
  for (const bin of bins.values()) se += bin.n * ((bin.p - bin.y) / bin.n) ** 2;
  return { logLoss: loss / preds.length, rmse: Math.sqrt(se / preds.length), reviews: preds.length };
}

const clip = (w: number[]) => w.map((x, i) => Math.min(CLAMP[i][1], Math.max(CLAMP[i][0], x)));

/** Perte d'apprentissage : log-loss moyenne + rappel léger vers les valeurs par défaut (peu de données = prudence). */
function objective(w: readonly number[], seqs: readonly Sequence[], reviews: number): number {
  let loss = 0;
  let n = 0;
  for (const { p, y } of predictions(w, seqs)) {
    const q = clampP(p);
    loss -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
    n++;
  }
  let penalty = 0;
  for (let i = 0; i < w.length; i++) penalty += ((w[i] - default_w[i]) / Math.max(0.1, Math.abs(default_w[i]))) ** 2;
  return (n ? loss / n : 0) + (2 / reviews) * penalty;
}

export interface FitOptions {
  /** Paramètres utilisés aujourd'hui (comparaison de contrôle) ; par défaut ceux de FSRS. */
  current?: readonly number[];
  epochs?: number;
  /** Révisions évaluées par lot (fiches entières). */
  batch?: number;
  /** Avancement (0 à 1) ; rendre la main à l'interface entre deux lots. */
  onProgress?: (done: number) => void | Promise<void>;
}

/** Optimise les paramètres sur l'historique ; null si trop peu de révisions. */
export async function fitParameters(rows: readonly ReviewRow[], options: FitOptions = {}): Promise<FitResult | null> {
  const all = sequences(rows);
  const total = all.reduce((a, s) => a + s.scored, 0);
  if (total < MIN_FIT_REVIEWS) return null;
  const train = all.filter((s) => !isHoldout(s.key));
  const test = all.filter((s) => isHoldout(s.key));
  const current = [...(options.current ?? default_w)];
  const trainReviews = train.reduce((a, s) => a + s.scored, 0);

  // Lots de fiches entières (l'état d'une fiche dépend de toute son histoire), mélangés à chaque époque.
  const batchSize = options.batch ?? 512;
  const epochs = options.epochs ?? 8;
  let seed = 12345;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const batches = () => {
    const order = [...train].sort(() => rand() - 0.5);
    const out: Sequence[][] = [];
    let cur: Sequence[] = [];
    let n = 0;
    for (const s of order) {
      cur.push(s);
      n += s.scored;
      if (n >= batchSize) {
        out.push(cur);
        cur = [];
        n = 0;
      }
    }
    if (cur.length) out.push(cur);
    return out;
  };

  // Adam (pas de 0,04 comme l'optimiseur officiel), gradient par différences centrées, paramètres bornés.
  let w = clip([...default_w]);
  const m = new Array<number>(w.length).fill(0);
  const v = new Array<number>(w.length).fill(0);
  const lr = 0.04;
  let step = 0;
  const plan = Array.from({ length: epochs }, batches);
  const totalSteps = plan.reduce((a, b) => a + b.length, 0);
  for (const epoch of plan) {
    for (const batch of epoch) {
      step++;
      const grad = w.map((x, i) => {
        const h = 1e-4 * Math.max(1, Math.abs(x));
        const up = clip(w.map((y, j) => (j === i ? y + h : y)));
        const down = clip(w.map((y, j) => (j === i ? y - h : y)));
        const span = up[i] - down[i];
        return span > 0 ? (objective(up, batch, trainReviews) - objective(down, batch, trainReviews)) / span : 0;
      });
      w = clip(
        w.map((x, i) => {
          m[i] = 0.9 * m[i] + 0.1 * grad[i];
          v[i] = 0.999 * v[i] + 0.001 * grad[i] ** 2;
          const mh = m[i] / (1 - 0.9 ** step);
          const vh = v[i] / (1 - 0.999 ** step);
          return x - (lr * mh) / (Math.sqrt(vh) + 1e-8);
        }),
      );
      await options.onProgress?.(step / totalSteps);
    }
  }

  const before = metrics(current, test);
  const after = metrics(w, test);
  // Contrôle trop maigre : aucune conclusion (les paramètres actuels restent).
  const better = after.reviews >= 80 && after.logLoss < before.logLoss * (1 - MIN_GAIN) && after.rmse <= before.rmse * 1.02;
  return { w: w.map((x) => Math.round(x * 1e4) / 1e4), before, after, better, reviews: total, cards: all.length };
}
