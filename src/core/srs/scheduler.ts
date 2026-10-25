import { fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade, type ReviewLog } from 'ts-fsrs';
import type { CardRecord, Mastery } from '../domain/types';
import type { Settings } from '../domain/settings';

/**
 * Répétition espacée : algorithme FSRS (Free Spaced Repetition Scheduler)
 * via la bibliothèque de référence `ts-fsrs`, paramètres par défaut du modèle.
 *
 * Notation : 1 Oublié (Again) · 2 Difficile (Hard) · 3 Retenu (Good) · 4 Facile (Easy).
 * Étapes d'apprentissage courtes (1 min, 10 min) puis intervalles calculés par FSRS
 * à partir de la stabilité et de la difficulté de chaque fiche.
 */

export { Rating, State };
export type { Grade };

export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: 'Oublié', key: '1' },
  { grade: Rating.Hard, label: 'Difficile', key: '2' },
  { grade: Rating.Good, label: 'Retenu', key: '3' },
  { grade: Rating.Easy, label: 'Facile', key: '4' },
];

export type Scheduler = FSRS;

export function createScheduler(settings: Pick<Settings, 'desiredRetention' | 'maximumInterval' | 'enableFuzz'>): Scheduler {
  return fsrs(
    generatorParameters({
      request_retention: settings.desiredRetention,
      maximum_interval: settings.maximumInterval,
      enable_fuzz: settings.enableFuzz,
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
    }),
  );
}

export function toFsrsCard(c: CardRecord): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsedDays,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.lastReview != null ? new Date(c.lastReview) : undefined,
  };
}

export function fromFsrsCard(base: CardRecord, card: Card): CardRecord {
  return {
    ...base,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}

export interface ReviewOutcome {
  card: CardRecord;
  log: ReviewLog;
}

export function review(scheduler: Scheduler, card: CardRecord, grade: Grade, now: number): ReviewOutcome {
  const { card: next, log } = scheduler.next(toFsrsCard(card), new Date(now), grade);
  return { card: fromFsrsCard(card, next), log };
}

/** Échéance prévue pour chaque note possible (affichée sous les boutons). */
export function previewIntervals(scheduler: Scheduler, card: CardRecord, now: number): Record<Grade, number> {
  const preview = scheduler.repeat(toFsrsCard(card), new Date(now));
  return {
    [Rating.Again]: preview[Rating.Again].card.due.getTime() - now,
    [Rating.Hard]: preview[Rating.Hard].card.due.getTime() - now,
    [Rating.Good]: preview[Rating.Good].card.due.getTime() - now,
    [Rating.Easy]: preview[Rating.Easy].card.due.getTime() - now,
  } as Record<Grade, number>;
}

/** Probabilité estimée de se souvenir maintenant (0-1). 0 pour une fiche jamais révisée. */
export function retrievability(scheduler: Scheduler, card: CardRecord, now: number): number {
  if (card.state === State.New) return 0;
  return scheduler.get_retrievability(toFsrsCard(card), new Date(now), false);
}

/**
 * Critère explicite de maîtrise : fiche en phase « Révision » dont la stabilité FSRS
 * (durée au bout de laquelle la probabilité de rappel tombe à 90 %) atteint le seuil
 * (21 jours par défaut).
 */
export function cardMastery(card: CardRecord | undefined, thresholdDays: number): Mastery {
  if (!card || card.state === State.New) return 'new';
  if (card.state === State.Review && card.stability >= thresholdDays) return 'mastered';
  return 'learning';
}
