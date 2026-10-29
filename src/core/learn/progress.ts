/**
 * Progression dans une leçon : une leçon est acquise quand au moins 90 % des 20 dernières réponses sont justes.
 * Un pourcentage sur trop peu de réponses serait trompeur : il en faut 20.
 */

export const MASTERY_WINDOW = 20;
export const MASTERY_RATE = 0.9;
/** Exercices par séance. */
export const SESSION_SIZE = 10;

export interface GrammarAnswer {
  lessonId: string;
  itemId: string;
  correct: boolean;
  reported: boolean;
  createdAt: number;
}

export type LessonState = 'new' | 'learning' | 'mastered';

export interface LessonProgress {
  /** Réponses prises en compte (au plus 20, les plus récentes, hors phrases signalées). */
  window: number;
  correct: number;
  /** Justes parmi les 20 dernières, ramené à 20 : la barre de progression (objectif 18 / 20). */
  ratio: number;
  state: LessonState;
  total: number;
}

export function lessonProgress(answers: GrammarAnswer[]): LessonProgress {
  const counted = answers.filter((a) => !a.reported).sort((a, b) => b.createdAt - a.createdAt);
  const last = counted.slice(0, MASTERY_WINDOW);
  const correct = last.filter((a) => a.correct).length;
  const mastered = last.length >= MASTERY_WINDOW && correct / last.length >= MASTERY_RATE;
  return {
    window: last.length,
    correct,
    ratio: correct / MASTERY_WINDOW,
    state: mastered ? 'mastered' : counted.length ? 'learning' : 'new',
    total: counted.length,
  };
}

/** Bonnes réponses nécessaires sur 20 pour acquérir la leçon. */
export const MASTERY_TARGET = Math.ceil(MASTERY_WINDOW * MASTERY_RATE);

/**
 * Exercices d'une séance : tirés au hasard, sans les phrases signalées ; on évite de reproposer les phrases déjà
 * réussies récemment tant qu'il en reste d'autres. Quand les exercices ont une nature de réponse (`form` : will ou
 * présent, prétérit ou present perfect…), chaque nature a sa part égale de la séance : une règle unique (« jamais
 * will ») ne suffit pas à réussir.
 */
export function pickSession<T extends { id: string; form?: string }>(
  items: T[],
  answers: GrammarAnswer[],
  rng: () => number = Math.random,
  size = SESSION_SIZE,
): T[] {
  const reported = new Set(answers.filter((a) => a.reported).map((a) => a.itemId));
  const recentlyRight = new Set(
    [...answers]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 60)
      .filter((a) => a.correct)
      .map((a) => a.itemId),
  );
  const pool = items.filter((it) => !reported.has(it.id));
  const shuffle = <U>(list: U[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const ordered = (list: T[]) => [...shuffle(list.filter((it) => !recentlyRight.has(it.id))), ...shuffle(list.filter((it) => recentlyRight.has(it.id)))];
  const groups = new Map<string, T[]>();
  for (const it of pool) groups.set(it.form ?? '', [...(groups.get(it.form ?? '') ?? []), it]);
  if (groups.size <= 1) return ordered(pool).slice(0, size);
  // Tour à tour dans chaque nature (ordre des natures tiré au hasard) ; une nature épuisée laisse sa place aux autres.
  const queues = shuffle([...groups.values()].map(ordered));
  const picked: T[] = [];
  while (picked.length < size && queues.some((q) => q.length)) for (const q of queues) if (q.length && picked.length < size) picked.push(q.shift()!);
  return shuffle(picked);
}
