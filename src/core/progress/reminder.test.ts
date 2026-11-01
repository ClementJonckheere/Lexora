import { describe, expect, it } from 'vitest';
import { reminderHour, reminderText, usualHour } from './reminder';

const now = new Date(2026, 10, 1, 23, 0).getTime();
const at = (daysAgo: number, hour: number, minute = 10) => new Date(2026, 10, 1 - daysAgo, hour, minute).getTime();

describe('heure habituelle', () => {
  it("l'heure où l'on révise le plus de jours, une séance longue ne comptant qu'une fois", () => {
    const times = [at(1, 21), at(2, 21), at(3, 8), at(3, 8, 20), at(3, 8, 40), at(4, 21), at(5, 8)];
    expect(usualHour(times, now)).toBe(21);
  });
  it('pas assez de recul : inconnue', () => {
    expect(usualHour([at(1, 20), at(2, 20)], now)).toBeNull();
    expect(usualHour([at(40, 20), at(41, 20), at(42, 20)], now)).toBeNull();
  });
  it('heure du rappel : habituelle si connue et choisie, sinon celle du réglage', () => {
    expect(reminderHour('19:30', true, 21)).toEqual({ hour: 21, minute: 0 });
    expect(reminderHour('19:30', true, null)).toEqual({ hour: 19, minute: 30 });
    expect(reminderHour('19:30', false, 21)).toEqual({ hour: 19, minute: 30 });
  });
});

describe('texte du rappel', () => {
  const base = { streak: 0, atRisk: false, doneToday: false, repairable: 0, due: 0 };
  it('série en jeu, série à sauver, révisions, rien', () => {
    expect(reminderText({ ...base, streak: 5, atRisk: true })?.title).toBe("5 jours d'affilée");
    expect(reminderText({ ...base, repairable: 1, due: 3 })?.body).toMatch(/bouclier.*3 fiches/);
    expect(reminderText({ ...base, due: 1 })?.title).toBe("C'est l'heure de réviser");
    expect(reminderText({ ...base, doneToday: true })).toBeNull();
  });
});
