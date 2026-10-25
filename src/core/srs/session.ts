/**
 * File d'une session, indépendante de l'interface et de la base.
 * Une fiche notée « Oublié »/« Difficile » encore en phase d'apprentissage
 * (prochaine échéance dans moins de REQUEUE_WINDOW_MS) revient plus loin dans la même session.
 */
export const REQUEUE_WINDOW_MS = 30 * 60_000;

export class SessionQueue<T> {
  private queue: T[];
  private history: { queue: T[]; completed: number }[] = [];
  completed = 0;
  readonly total: number;

  constructor(items: T[]) {
    this.queue = [...items];
    this.total = items.length;
  }

  get current(): T | undefined {
    return this.queue[0];
  }

  get remaining(): number {
    return this.queue.length;
  }

  get finished(): boolean {
    return this.queue.length === 0;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /**
   * Retire la fiche courante. `requeueIn` (ms) : si défini et inférieur à la fenêtre,
   * la fiche est réinsérée quelques positions plus loin.
   */
  advance(requeueIn?: number): void {
    const item = this.queue[0];
    if (item === undefined) return;
    this.history.push({ queue: [...this.queue], completed: this.completed });
    this.queue.shift();
    if (requeueIn !== undefined && requeueIn <= REQUEUE_WINDOW_MS) {
      const gap = requeueIn <= 2 * 60_000 ? 3 : 6;
      this.queue.splice(Math.min(gap, this.queue.length), 0, item);
    } else {
      this.completed++;
    }
  }

  undo(): T | undefined {
    const prev = this.history.pop();
    if (!prev) return undefined;
    this.queue = prev.queue;
    this.completed = prev.completed;
    return this.queue[0];
  }

  /** Retire définitivement des fiches (note suspendue) ; elles comptent comme traitées. */
  remove(predicate: (item: T) => boolean): number {
    const before = this.queue.length;
    this.queue = this.queue.filter((i) => !predicate(i));
    const removed = before - this.queue.length;
    this.completed += removed;
    // L'annulation ne doit pas les faire réapparaître.
    this.history = this.history.map((h) => {
      const kept = h.queue.filter((i) => !predicate(i));
      return { queue: kept, completed: h.completed + (h.queue.length - kept.length) };
    });
    return removed;
  }
}
