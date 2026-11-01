import { addDays, dayKey } from '../domain/dates';

/**
 * Rappel au bon moment : l'heure à laquelle vous révisez le plus souvent. Chaque jour ne compte qu'une fois par heure
 * (une longue séance ne pèse pas plus qu'une courte) ; les 30 derniers jours, au moins 3 jours de révisions.
 */
export const USUAL_HOUR_DAYS = 30;
const MIN_DAYS = 3;

export function usualHour(times: readonly number[], now = Date.now()): number | null {
  const since = addDays(now, -USUAL_HOUR_DAYS);
  const seen = new Set<string>();
  const days = new Set<string>();
  const counts = new Array<number>(24).fill(0);
  for (const t of times) {
    if (t < since || t > now) continue;
    const day = dayKey(t);
    const hour = new Date(t).getHours();
    days.add(day);
    if (seen.has(`${day}|${hour}`)) continue;
    seen.add(`${day}|${hour}`);
    counts[hour]++;
  }
  if (days.size < MIN_DAYS) return null;
  // À égalité, l'heure la plus tardive : on rappelle après l'habitude plutôt qu'avant.
  let best = 0;
  for (let h = 1; h < 24; h++) if (counts[h] >= counts[best]) best = h;
  return best;
}

/** Heure du rappel : réglée à la main, sinon l'heure habituelle, sinon 19 h. */
export function reminderHour(setting: string, auto: boolean, usual: number | null): { hour: number; minute: number } {
  if (auto && usual !== null) return { hour: usual, minute: 0 };
  const [hour, minute] = setting.split(':').map(Number);
  return { hour: Number.isFinite(hour) ? hour : 19, minute: Number.isFinite(minute) ? minute : 0 };
}

export interface ReminderInput {
  streak: number;
  atRisk: boolean;
  /** Révisions déjà faites aujourd'hui. */
  doneToday: boolean;
  /** Jours manqués que les boucliers disponibles peuvent couvrir. */
  repairable: number;
  /** Fiches à réviser (toutes langues), et le détail par langue s'il y en a plusieurs. */
  due: number;
  dueDetail?: string;
}

/** Texte du rappel ; null : rien à rappeler (révision faite et plus rien à réviser). */
export function reminderText(r: ReminderInput): { title: string; body: string } | null {
  const days = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;
  const dueText = r.due ? `${r.due} fiche${r.due > 1 ? 's' : ''} à réviser${r.dueDetail ?? ''}.` : '';
  if (r.repairable && !r.doneToday)
    return { title: "Votre série s'est arrêtée", body: `Un bouclier peut la sauver : ouvrez Lexora et révisez quelques minutes. ${dueText}`.trim() };
  if (r.atRisk) return { title: `${days(r.streak)} d'affilée`, body: `Quelques minutes aujourd'hui pour garder votre série. ${dueText}`.trim() };
  if (!r.due) return null;
  return { title: "C'est l'heure de réviser", body: `${dueText} Quelques minutes suffisent.` };
}
