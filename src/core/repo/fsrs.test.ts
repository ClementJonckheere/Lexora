import { describe, expect, it } from 'vitest';
import { createMemoryDatabase } from '../db/testing';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { createScheduler, personalWeights, review, Rating } from '../srs/scheduler';
import { fitParameters } from '../srs/optimizer';
import { createNote, loadNotes } from './notesRepo';
import { recordReview } from './reviewRepo';
import { createUniverse } from './universesRepo';
import { loadReviewHistory } from './fsrsRepo';

const DAY = 86_400_000;

describe('paramètres FSRS personnels : de la base locale au planificateur', () => {
  it('lit l’historique avec la langue de chaque fiche, puis le planificateur reprend les paramètres retenus', async () => {
    const db = await createMemoryDatabase();
    const en = { universeId: await createUniverse(db, 'Anglais', 'en'), language: 'en' };
    const scheduler = createScheduler({ ...DEFAULT_SETTINGS, enableFuzz: false });
    let seed = 3;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const start = new Date(2025, 0, 6, 9).getTime();
    for (let i = 0; i < 160; i++) await createNote(db, { expression: `word ${i}`, translation: `mot ${i}` }, en);
    for (const note of await loadNotes(db)) {
      let card = note.cards.fr_en!;
      let now = start + Math.floor(rand() * 20) * DAY;
      for (let k = 0; k < 6; k++) {
        // Mémoire plus faible que prévu : un oubli sur trois aux échéances.
        const out = review(scheduler, card, k && rand() < 0.33 ? Rating.Again : Rating.Good, now);
        await recordReview(db, out.card, out.log, 4000);
        card = out.card;
        now = Math.max(now + DAY, card.due);
      }
    }
    const history = await loadReviewHistory(db);
    expect(history.length).toBe(160 * 6);
    expect(new Set(history.map((h) => h.universeId))).toEqual(new Set([en.universeId]));
    const fit = await fitParameters(history, { epochs: 3 });
    expect(fit?.better).toBe(true);

    // Retenus pour toutes langues : le planificateur de l'univers les utilise ; une langue a les siens en priorité.
    const fits = { all: { w: fit!.w, at: 1, applied: true, reviews: fit!.reviews, before: fit!.before, after: fit!.after } };
    expect(personalWeights({ fsrsParams: fits }, en.universeId)).toEqual(fit!.w);
    expect(personalWeights({ fsrsParams: { ...fits, all: { ...fits.all, applied: false } } }, en.universeId)).toBeUndefined();
    expect(createScheduler({ ...DEFAULT_SETTINGS, fsrsParams: fits }, en.universeId).parameters.w).toEqual(fit!.w);
  }, 120_000);
});
