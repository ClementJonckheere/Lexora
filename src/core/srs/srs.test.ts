import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings';
import type { CardRecord, Direction, Note } from '../domain/types';
import { buildQueue, countDue, noteMastery } from './queue';
import { createScheduler, previewIntervals, review } from './scheduler';
import { SessionQueue } from './session';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 23, 12, 0).getTime();
const settings: Settings = { ...DEFAULT_SETTINGS, enableFuzz: false };
const scheduler = createScheduler(settings);

let cardSeq = 1;
function card(noteId: number, direction: Direction, patch: Partial<CardRecord> = {}): CardRecord {
  return {
    id: cardSeq++,
    noteId,
    direction,
    state: State.New,
    due: NOW - DAY,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    ...patch,
  };
}

function note(id: number, cards: Partial<Record<Direction, Partial<CardRecord>>> = {}, createdAt = NOW - id * 1000): Note {
  return {
    id,
    expression: `expr ${id}`,
    translation: `trad ${id}`,
    expressionKey: `expr ${id}`,
    comment: '',
    category: '',
    categoryAuto: true,
    isFavorite: false,
    createdAt,
    updatedAt: createdAt,
    examples: [],
    tags: [],
    collectionIds: [],
    cards: { fr_en: card(id, 'fr_en', cards.fr_en), en_fr: card(id, 'en_fr', cards.en_fr) },
  };
}

const reviewState = (dueOffsetDays: number, stability = 5): Partial<CardRecord> => ({
  state: State.Review,
  due: NOW + dueOffsetDays * DAY,
  stability,
  difficulty: 5,
  reps: 3,
  lastReview: NOW - 10 * DAY,
  scheduledDays: 10,
});

const opts = (extra: Partial<Parameters<typeof buildQueue>[1]> = {}) => ({
  now: NOW,
  settings,
  scheduler,
  newIntroducedToday: 0,
  ...extra,
});

describe('FSRS', () => {
  it('une fiche oubliée revient vite, une fiche retenue s’espace progressivement', () => {
    let c = card(1, 'fr_en');
    let t = NOW;
    const first = review(scheduler, c, Rating.Good, t);
    expect(first.card.state).toBe(State.Learning);
    // Enchaîne des « Retenu » : les intervalles croissent.
    const intervals: number[] = [];
    c = first.card;
    for (let i = 0; i < 5; i++) {
      t = c.due;
      const r = review(scheduler, c, Rating.Good, t);
      intervals.push(r.card.due - t);
      c = r.card;
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(c.state).toBe(State.Review);

    // Un oubli : retour en réapprentissage dans les minutes qui suivent, lapses incrémenté.
    t = c.due;
    const lapse = review(scheduler, c, Rating.Again, t);
    expect(lapse.card.state).toBe(State.Relearning);
    expect(lapse.card.lapses).toBe(1);
    expect(lapse.card.due - t).toBeLessThanOrEqual(10 * 60_000);
    expect(lapse.card.stability).toBeLessThan(c.stability);
  });

  it('les aperçus d’intervalle sont ordonnés', () => {
    const p = previewIntervals(scheduler, card(1, 'fr_en', reviewState(0)), NOW);
    expect(p[Rating.Again]).toBeLessThan(p[Rating.Hard]);
    expect(p[Rating.Hard]).toBeLessThan(p[Rating.Good]);
    expect(p[Rating.Good]).toBeLessThan(p[Rating.Easy]);
  });

  it('critère de maîtrise explicite (stabilité ≥ 21 j)', () => {
    const n = note(1, { fr_en: reviewState(10, 30), en_fr: reviewState(10, 30) });
    expect(noteMastery(n, settings)).toBe('mastered');
    const m = note(2, { fr_en: reviewState(10, 30), en_fr: reviewState(10, 5) });
    expect(noteMastery(m, settings)).toBe('learning');
    expect(noteMastery(note(3), settings)).toBe('new');
  });
});

describe('file de révision', () => {
  it('respecte le plafond de nouveaux mots (FR→EN d’abord)', () => {
    const notes = Array.from({ length: 15 }, (_, i) => note(i + 1));
    const q = buildQueue(notes, opts());
    expect(q).toHaveLength(settings.newPerDay);
    expect(q.every((i) => i.kind === 'new' && i.direction === 'fr_en')).toBe(true);
    expect(buildQueue(notes, opts({ newIntroducedToday: 8 }))).toHaveLength(2);
    expect(countDue(notes, opts()).newWaiting).toBe(5);
  });

  it('introduit la direction EN→FR le lendemain de la première révision', () => {
    const seenYesterday = note(1, { fr_en: { ...reviewState(3), lastReview: NOW - DAY } });
    const seenToday = note(2, { fr_en: { ...reviewState(3), lastReview: NOW - 60_000 } });
    const q = buildQueue([seenYesterday, seenToday], opts());
    expect(q).toEqual([expect.objectContaining({ noteId: 1, direction: 'en_fr', kind: 'new' })]);
  });

  it('priorité : apprentissage → révisions fragiles → nouveaux ; limite appliquée', () => {
    const notes = [
      note(1, { fr_en: { state: State.Learning, due: NOW - 1000, reps: 1, lastReview: NOW - 600_000 } }),
      note(2, { fr_en: reviewState(-20, 3) }), // très en retard
      note(3, { fr_en: reviewState(0, 50) }), // dû aujourd'hui, solide
      note(4),
    ];
    const q = buildQueue(notes, opts({ limit: 3 }));
    expect(q.map((i) => i.noteId)).toEqual([1, 2, 3]);
    const all = buildQueue(notes, opts());
    expect(all.map((i) => i.kind)).toContain('new');
    expect(all[0].kind).toBe('learning');
  });

  it('ne présente jamais les deux directions d’une note à la suite', () => {
    const notes = [
      note(1, { fr_en: reviewState(-1), en_fr: reviewState(-1) }),
      note(2, { fr_en: reviewState(-1), en_fr: reviewState(-1) }),
      note(3, { fr_en: reviewState(-1), en_fr: reviewState(4) }),
    ];
    const limited = buildQueue(notes, opts({ limit: 3 }));
    expect(new Set(limited.map((i) => i.noteId)).size).toBe(3);
    const all = buildQueue(notes, opts());
    expect(all).toHaveLength(5);
    for (let i = 1; i < all.length; i++) expect(all[i].noteId).not.toBe(all[i - 1].noteId);
  });

  it('filtre par direction et par collection', () => {
    const notes = [note(1, { fr_en: reviewState(-1), en_fr: reviewState(-1) }), note(2, { fr_en: reviewState(-1), en_fr: reviewState(4) })];
    expect(buildQueue(notes, opts({ direction: 'en_fr' }))).toEqual([expect.objectContaining({ noteId: 1, direction: 'en_fr' })]);
    expect(buildQueue(notes, opts({ noteIds: new Set([2]) })).map((i) => i.noteId)).toEqual([2]);
  });

  it('les fiches non dues ne sont pas proposées', () => {
    expect(buildQueue([note(1, { fr_en: reviewState(5), en_fr: reviewState(5) })], opts())).toEqual([]);
  });
});

describe('session', () => {
  it('remet en file une fiche en apprentissage, annule correctement', () => {
    const s = new SessionQueue(['a', 'b', 'c', 'd', 'e']);
    s.advance(60_000); // « Oublié » → revient 3 positions plus loin
    expect(s.current).toBe('b');
    expect(s.completed).toBe(0);
    s.advance(); // b terminé
    s.advance(); // c terminé
    s.advance(); // d terminé
    expect(s.current).toBe('a');
    expect(s.completed).toBe(3);
    s.undo();
    expect(s.current).toBe('d');
    expect(s.completed).toBe(2);
    s.advance(5 * DAY); // hors fenêtre : terminé
    s.advance();
    s.advance();
    expect(s.finished).toBe(true);
    expect(s.completed).toBe(5);
  });
});
