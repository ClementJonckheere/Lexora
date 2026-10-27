import { describe, expect, it } from 'vitest';
import type { Note } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { buildQueue } from './queue';
import { createScheduler } from './scheduler';
import { checkTyped, clozeFront, fastLimitMs, frequencyRank, suggestGrade, UNRANKED } from './typed';

const note = (expression: string, examples: string[] = [], extra: Partial<Note> = {}) =>
  ({ id: expression, universeId: 'u', expression, translation: 'trad', examples, suspended: false, createdAt: 0, cards: {}, ...extra }) as unknown as Note;

describe('recto en contexte', () => {
  const n = note('to figure out', ['I finally figured it out.', 'This sentence has nothing.', 'Can you figure out the answer?']);

  it("ne garde que les exemples contenant l'expression, et change d'exemple à chaque révision", () => {
    const a = clozeFront(n, 'en', 0)!;
    const b = clozeFront(n, 'en', 1)!;
    expect(a.choices).toBe(2);
    expect(a.sentence).toBe('I finally figured it out.');
    expect(b.sentence).toBe('Can you figure out the answer?');
    expect(clozeFront(n, 'en', 2)!.sentence).toBe(a.sentence);
  });

  it("sans exemple utilisable : recto classique", () => {
    expect(clozeFront(note('serendipity', ['Nothing here.']), 'en', 0)).toBeNull();
    expect(clozeFront(note('serendipity'), 'en', 0)).toBeNull();
  });

  it("accepte la forme de la phrase ou l'expression", () => {
    const front = clozeFront(n, 'en', 0);
    expect(checkTyped(n, front, 'figured out', 'en')).toBe('exact');
    expect(checkTyped(n, front, 'to figure out', 'en')).toBe('exact');
    expect(checkTyped(n, front, 'figure it', 'en')).toBe('wrong');
    // Faute de frappe : forme approchée, pas oubli.
    expect(checkTyped(note('serendipity'), null, 'serendipiti', 'en')).toBe('close');
    expect(checkTyped(note('serendipity'), null, 'surprise', 'en')).toBe('wrong');
    expect(checkTyped(note('cat'), null, 'cut', 'en')).toBe('wrong');
  });
});

describe('note proposée', () => {
  const median = 10_000;
  it('faux → Oublié, approché → Difficile, exact → Retenu, exact et rapide → Facile', () => {
    expect(suggestGrade('wrong', 2000, 7, median)).toBe(1);
    expect(suggestGrade('skipped', 2000, 7, median)).toBe(1);
    expect(suggestGrade('close', 2000, 7, median)).toBe(2);
    expect(suggestGrade('exact', 9000, 7, median)).toBe(3);
    expect(suggestGrade('exact', 4000, 7, median)).toBe(4);
  });
  it('tient compte de la longueur de la réponse et de votre rythme habituel', () => {
    expect(fastLimitMs(20, median)).toBeGreaterThan(fastLimitMs(5, median));
    expect(fastLimitMs(7, 20_000)).toBeGreaterThan(fastLimitMs(7, 6000));
    // Bornes : un historique très rapide ou très lent ne rend pas « Facile » absurde.
    expect(fastLimitMs(0, 500)).toBe(2000);
    expect(fastLimitMs(0, 120_000)).toBe(10_000);
  });
});

describe('nouveaux mots par utilité', () => {
  const ranks = new Map([
    ['the', 1],
    ['give', 120],
    ['up', 80],
    ['take', 90],
    ['granted', 4000],
    ['tackle', 9000],
  ]);
  it('rang du mot le plus rare, formes fléchies comprises', () => {
    expect(frequencyRank(note('to give up'), ranks, 'en')).toBe(120);
    expect(frequencyRank(note('to take for granted'), new Map([...ranks, ['for', 10]]), 'en')).toBe(4000);
    expect(frequencyRank(note('serendipity'), ranks, 'en')).toBe(UNRANKED);
  });

  it('la file présente les plus utiles d’abord', () => {
    const settings = { ...DEFAULT_SETTINGS, enableFuzz: false, directions: 'fr_en' as const };
    const mk = (expression: string, createdAt: number) =>
      note(expression, [], {
        createdAt,
        cards: { fr_en: { id: expression, noteId: expression, direction: 'fr_en', state: 0, due: 0, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReview: null } },
      } as Partial<Note>);
    const notes = [mk('tackle', 1), mk('to give up', 2), mk('serendipity', 0)];
    const opts = { now: Date.now(), settings, scheduler: createScheduler(settings), newIntroducedToday: 0 };
    expect(buildQueue(notes, opts).map((i) => i.noteId)).toEqual(['serendipity', 'tackle', 'to give up']);
    expect(buildQueue(notes, { ...opts, newRank: (n) => frequencyRank(n, ranks, 'en') }).map((i) => i.noteId)).toEqual(['to give up', 'tackle', 'serendipity']);
  });
});

describe('réglages : nouveau défaut appliqué une seule fois', async () => {
  const { sanitizeSettings, settingsUpgrade, SETTINGS_VERSION } = await import('../domain/settings');
  it('active la réponse tapée pour les réglages enregistrés avant, puis respecte le choix', () => {
    const old = sanitizeSettings({ typeAnswer: false });
    expect(settingsUpgrade(old)).toEqual({ settingsVersion: SETTINGS_VERSION, typeAnswer: true });
    const after = sanitizeSettings({ typeAnswer: false, settingsVersion: SETTINGS_VERSION });
    expect(after.typeAnswer).toBe(false);
    expect(settingsUpgrade(after)).toBeNull();
  });
});
