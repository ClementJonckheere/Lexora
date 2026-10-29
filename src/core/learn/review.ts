import { MASTERY_RATE, MASTERY_WINDOW, type GrammarAnswer } from './progress';

/**
 * Révision espacée des leçons acquises : une règle comprise s'oublie si on ne la revoit pas. Une leçon acquise revient
 * à intervalles croissants (3 jours, une semaine, deux semaines…) pour une courte séance de 5 exercices. Réussie
 * (4 sur 5), l'intervalle suivant s'allonge ; manquée, la leçon revient le lendemain et l'intervalle repart du début.
 *
 * Tout se déduit des réponses déjà enregistrées (et synchronisées) : on rejoue l'historique, séance par séance (des
 * réponses à moins de 20 minutes d'écart forment une séance). Pas de table de plus, pas d'état à garder à part.
 */

const DAY = 86_400_000;
/** Intervalles successifs entre deux révisions, en jours. */
export const REVIEW_INTERVALS = [3, 7, 16, 35, 75, 160];
/** Exercices d'une séance de révision, et bonnes réponses pour la réussir. */
export const REVIEW_SIZE = 5;
export const REVIEW_PASS = 4;
/** Écart au-delà duquel deux réponses appartiennent à deux séances différentes. */
const SESSION_GAP = 20 * 60_000;

export interface LessonReview {
  /** La leçon a été acquise au moins une fois (18 bonnes réponses sur 20). */
  scheduled: boolean;
  /** Date de la prochaine révision (null tant que la leçon n'a jamais été acquise). */
  dueAt: number | null;
  /** La révision est à faire maintenant. */
  due: boolean;
  /** Rang de l'intervalle en cours (0 : 3 jours…). */
  step: number;
  /** Révisions réussies d'affilée, et la dernière révision manquée (la leçon est alors « à retravailler »). */
  streak: number;
  lapsed: boolean;
}

/** Séances : réponses consécutives à moins de 20 minutes d'écart. */
function sessions(answers: GrammarAnswer[]): GrammarAnswer[][] {
  const out: GrammarAnswer[][] = [];
  for (const a of answers) {
    const last = out.at(-1);
    if (last && a.createdAt - last[last.length - 1].createdAt <= SESSION_GAP) last.push(a);
    else out.push([a]);
  }
  return out;
}

/** État de révision d'une leçon, à partir de toutes ses réponses. */
export function lessonReview(answers: GrammarAnswer[], now = Date.now()): LessonReview {
  const counted = answers.filter((a) => !a.reported).sort((a, b) => a.createdAt - b.createdAt);
  const window: boolean[] = [];
  let dueAt: number | null = null;
  let step = 0;
  let streak = 0;
  let lapsed = false;
  for (const session of sessions(counted)) {
    // Séance commencée à l'échéance : ses 5 premières réponses font la révision.
    if (dueAt !== null && session[0].createdAt >= dueAt) {
      const first = session.slice(0, REVIEW_SIZE);
      const end = first[first.length - 1].createdAt;
      if (first.length >= REVIEW_SIZE) {
        if (first.filter((a) => a.correct).length >= REVIEW_PASS) {
          step = lapsed ? 0 : Math.min(step + 1, REVIEW_INTERVALS.length - 1);
          streak = lapsed ? 1 : streak + 1;
          lapsed = false;
        } else {
          step = 0;
          streak = 0;
          lapsed = true;
        }
        dueAt = end + (lapsed ? 1 : REVIEW_INTERVALS[step]) * DAY;
      }
    }
    for (const a of session) {
      window.push(a.correct);
      if (window.length > MASTERY_WINDOW) window.shift();
      // Première acquisition : la première révision tombe trois jours plus tard.
      if (dueAt === null && window.length === MASTERY_WINDOW && window.filter(Boolean).length / MASTERY_WINDOW >= MASTERY_RATE) {
        dueAt = a.createdAt + REVIEW_INTERVALS[0] * DAY;
      }
    }
  }
  return { scheduled: dueAt !== null, dueAt, due: dueAt !== null && now >= dueAt, step, streak, lapsed };
}

/** « dans 3 jours », « demain », « aujourd'hui » : échéance lisible. */
export function dueLabel(dueAt: number, now = Date.now()): string {
  const days = Math.ceil((dueAt - now) / DAY);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days < 14) return `dans ${days} jours`;
  if (days < 60) return `dans ${Math.round(days / 7)} semaines`;
  return `dans ${Math.round(days / 30)} mois`;
}
