/**
 * Temps de lecture. Seul le temps actif compte : entre deux gestes (page tournée, sélection, touche, mouvement de
 * souris), l'écart est ajouté s'il ne dépasse pas 5 minutes ; au-delà, le lecteur est sans doute parti et l'écart
 * entier est perdu. Une fenêtre masquée ou réduite coupe la mesure.
 *
 * Pour l'XP, une séance compte au plus 5 minutes par page tournée : un livre laissé ouvert, la souris bougeant, ne
 * rapporte rien sans avancer dans le texte.
 */

/** Écart maximal entre deux gestes encore compté comme lecture. */
export const READING_IDLE_MS = 5 * 60_000;
/** Minutes comptées au plus par page (ou double page) tournée. */
export const READING_MINUTES_PER_PAGE = 5;

export class ReadingClock {
  /** Temps actif mesuré, en millisecondes. */
  activeMs = 0;
  /** Pages (ou doubles pages) tournées vers l'avant. */
  pages = 0;
  private last = -Infinity;

  /** Un geste du lecteur : l'écart depuis le précédent compte s'il est assez court. */
  activity(now: number): void {
    const gap = now - this.last;
    if (gap > 0 && gap <= READING_IDLE_MS) this.activeMs += gap;
    this.last = Math.max(this.last, now);
  }

  /** Page tournée vers l'avant : un geste, et une page de plus. */
  pageTurn(now: number): void {
    this.pages++;
    this.activity(now);
  }

  /** Fenêtre masquée : l'écart jusqu'au prochain geste ne compte pas. */
  pause(): void {
    this.last = -Infinity;
  }
}

/** Minutes de lecture comptées pour une séance : le temps actif, borné par les pages tournées. */
export function countedReadingMinutes(activeMs: number, pages: number): number {
  return Math.max(0, Math.min(activeMs / 60_000, pages * READING_MINUTES_PER_PAGE));
}
