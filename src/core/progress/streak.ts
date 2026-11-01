/**
 * Série de jours d'affilée et boucliers.
 *
 * Un jour compte s'il a au moins une révision (journée de révision : bascule à l'heure choisie dans les réglages).
 * Chaque fois que la série atteint un multiple de 6 jours travaillés, un bouclier est gagné. Un bouclier utilisé
 * couvre un jour manqué : la série continue (le jour couvert ne s'ajoute pas au compte). Les jours couverts sont
 * synchronisés (table `streak_shields`) ; les boucliers gagnés se déduisent de l'historique, sur tous les appareils.
 */

/** Jours travaillés d'affilée pour gagner un bouclier. */
export const SHIELD_EVERY = 6;
/** Au-delà, on ne cherche plus de série à sauver (un mois d'absence). */
const MAX_GAP = 30;

export interface StreakState {
  /** Jours travaillés d'affilée (aujourd'hui compris s'il y a déjà une révision). */
  streak: number;
  doneToday: boolean;
  /** La série continue si l'on révise aujourd'hui. */
  atRisk: boolean;
  /** Boucliers disponibles. */
  shields: number;
  earned: number;
  used: number;
  /** Jours manqués juste avant aujourd'hui, que des boucliers peuvent couvrir (vide : rien à sauver). */
  missed: string[];
  /** Série perdue à cause de ces jours manqués. */
  lost: number;
  /** Jours travaillés restants avant le prochain bouclier. */
  nextShieldIn: number;
}

/** Jour (AAAA-MM-JJ) décalé de `n` jours. */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function computeStreak(active: ReadonlySet<string>, shielded: ReadonlySet<string>, today: string): StreakState {
  const past = [...active, ...shielded].filter((d) => d <= today).sort();
  const used = [...shielded].filter((d) => d <= today).length;
  let run = 0;
  let earned = 0;
  // Série en fin de chaque jour parcouru (pour retrouver celle d'avant un trou).
  const runAt = new Map<string, number>();
  if (past.length) {
    for (let day = past[0]; day <= today; day = shiftDay(day, 1)) {
      if (active.has(day)) {
        run++;
        if (run % SHIELD_EVERY === 0) earned++;
      } else if (!shielded.has(day) && day !== today) run = 0;
      runAt.set(day, run);
    }
  }
  const doneToday = active.has(today);
  const streak = run;

  // Jours manqués juste avant aujourd'hui, et série d'avant.
  const missed: string[] = [];
  let day = shiftDay(today, -1);
  while (missed.length < MAX_GAP && past.length && day >= past[0] && !active.has(day) && !shielded.has(day)) {
    missed.unshift(day);
    day = shiftDay(day, -1);
  }
  const lost = missed.length && (active.has(day) || shielded.has(day)) ? (runAt.get(day) ?? 0) : 0;

  return {
    streak,
    doneToday,
    atRisk: !doneToday && streak > 0,
    shields: Math.max(0, earned - used),
    earned,
    used,
    missed: lost > 0 ? missed : [],
    lost,
    nextShieldIn: SHIELD_EVERY - (streak % SHIELD_EVERY),
  };
}
