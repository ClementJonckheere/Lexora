import { describe, expect, it, beforeEach } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { createMemoryDatabase } from '../db/testing';
import { getSchemaVersion, LATEST_VERSION, migrate } from '../db/migrations';
import type { Database } from '../db/types';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { ValidationError } from '../domain/validation';
import { createScheduler, review } from '../srs/scheduler';
import { buildQueue } from '../srs/queue';
import { createNote, deleteNotes, findDuplicates, loadNotes, updateNote } from './notesRepo';
import { addToCollection, createCollection, deleteCollection, loadCollections } from './collectionsRepo';
import { countNewIntroduced, loadForgetCounts, recordPractice, recordReview, undoReview } from './reviewRepo';
import { loadSettings, saveSettings } from './settingsRepo';
import { computeStats } from './statsRepo';
import { exportBackup, exportCsv, exportNotesJson, importNotes, parseCsvNotes, parseJsonNotes, restoreBackup } from './transfer';

let db: Database;
const settings = { ...DEFAULT_SETTINGS, enableFuzz: false };
const scheduler = createScheduler(settings);

beforeEach(async () => {
  db = await createMemoryDatabase();
});

const tackle = {
  expression: 'To tackle an issue',
  translation: "S'attaquer à un problème",
  examples: ['We need to tackle this issue before it gets worse.'],
};

describe('migrations', () => {
  it('amène la base à la dernière version et est idempotente', async () => {
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    await migrate(db);
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
  });
  it('annule une migration en échec', async () => {
    await expect(
      migrate(db, [{ version: LATEST_VERSION + 1, name: 'ko', statements: ['CREATE TABLE ok_t (x)', 'INVALID SQL'] }]),
    ).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    expect(await db.select("SELECT name FROM sqlite_master WHERE name = 'ok_t'")).toEqual([]);
  });
});

describe('notes', () => {
  it('crée une note avec ses deux fiches, sa catégorie auto et ses tags', async () => {
    const id = await createNote(db, { ...tackle, tags: ['work', 'Work'] });
    const [n] = await loadNotes(db);
    expect(n).toMatchObject({ id, expression: 'To tackle an issue', category: 'Expression verbale', categoryAuto: true, tags: ['work'] });
    expect(n.examples).toEqual(tackle.examples);
    expect(n.cards.fr_en?.state).toBe(State.New);
    expect(n.cards.en_fr?.state).toBe(State.New);
  });

  it('refuse une note invalide sans rien écrire', async () => {
    await expect(createNote(db, { expression: '', translation: 'x' })).rejects.toBeInstanceOf(ValidationError);
    expect(await loadNotes(db)).toHaveLength(0);
  });

  it('détecte les doublons', async () => {
    await createNote(db, tackle);
    const notes = await loadNotes(db);
    expect(findDuplicates(notes, 'tackle an issue')).toHaveLength(1);
    expect(findDuplicates(notes, 'tackle a problem')).toHaveLength(0);
    expect(findDuplicates(notes, 'tackle an issue', notes[0].id)).toHaveLength(0);
  });

  it('modifie sans perdre la planification, supprime en cascade', async () => {
    const id = await createNote(db, tackle);
    let [n] = await loadNotes(db);
    const out = review(scheduler, n.cards.fr_en!, Rating.Good, Date.now());
    await recordReview(db, out.card, out.log, 3000);

    await updateNote(db, id, { ...tackle, examples: ['A', 'B'], category: 'Business', tags: ['x'] });
    [n] = await loadNotes(db);
    expect(n.examples).toEqual(['A', 'B']);
    expect(n).toMatchObject({ category: 'Business', categoryAuto: false });
    expect(n.cards.fr_en?.reps).toBe(1);

    await deleteNotes(db, [id]);
    expect(await loadNotes(db)).toHaveLength(0);
    expect(await db.select('SELECT * FROM review_logs')).toHaveLength(0);
    expect(await db.select('SELECT * FROM tags')).toHaveLength(0);
  });
});

describe('collections', () => {
  it('une note peut appartenir à plusieurs collections', async () => {
    const id = await createNote(db, tackle);
    const a = await createCollection(db, 'Business English');
    const b = await createCollection(db, 'Phrasal Verbs');
    await addToCollection(db, a, [id]);
    await addToCollection(db, b, [id]);
    await expect(createCollection(db, 'business english')).rejects.toThrow(/déjà/);
    let [n] = await loadNotes(db);
    expect(n.collectionIds.sort()).toEqual([a, b].sort());
    await deleteCollection(db, a);
    [n] = await loadNotes(db);
    expect(n.collectionIds).toEqual([b]);
    expect(await loadCollections(db)).toHaveLength(1);
  });
});

describe('révisions', () => {
  it('enregistre, compte les nouveaux mots et annule', async () => {
    await createNote(db, tackle);
    const [n] = await loadNotes(db);
    const before = n.cards.fr_en!;
    const now = Date.now();
    const out = review(scheduler, before, Rating.Again, now);
    const logId = await recordReview(db, out.card, out.log, 4200);
    expect(await countNewIntroduced(db, now - 1000, 'fr_en')).toBe(1);

    let [m] = await loadNotes(db);
    expect(m.cards.fr_en?.state).toBe(State.Learning);

    await undoReview(db, before, logId);
    [m] = await loadNotes(db);
    expect(m.cards.fr_en).toEqual(before);
    expect(await countNewIntroduced(db, now - 1000, 'fr_en')).toBe(0);
  });

  it("l'entraînement libre ne modifie pas la planification", async () => {
    const id = await createNote(db, tackle);
    const before = (await loadNotes(db))[0].cards;
    await recordPractice(db, id, 'random', 1);
    await recordPractice(db, id, 'cloze', 1);
    expect((await loadNotes(db))[0].cards).toEqual(before);
    expect((await loadForgetCounts(db)).get(id)).toBe(2);
  });

  it('statistiques calculées sur les données réelles', async () => {
    await createNote(db, tackle);
    await createNote(db, { expression: 'To figure out', translation: 'Comprendre' });
    let notes = await loadNotes(db);
    const now = Date.now();
    const q = buildQueue(notes, { now, settings, scheduler, newIntroducedToday: 0 });
    expect(q).toHaveLength(2);
    const target = notes.find((x) => x.id === q[0].noteId)!.cards.fr_en!;
    const out = review(scheduler, target, Rating.Good, now);
    await recordReview(db, out.card, out.log, 2000);
    notes = await loadNotes(db);
    const stats = await computeStats(db, notes, settings, scheduler, now + 1000);
    expect(stats.totalNotes).toBe(2);
    expect(stats.reviewsToday).toBe(1);
    expect(stats.mastery).toEqual({ new: 1, learning: 1, mastered: 0 });
    expect(stats.streakDays).toBe(1);
    expect(stats.due.new).toBe(1);
  });
});

describe('réglages', () => {
  it('sauvegarde et relit des réglages bornés', async () => {
    await saveSettings(db, { newPerDay: 25, directions: 'fr_en' });
    expect(await loadSettings(db)).toMatchObject({ newPerDay: 25, directions: 'fr_en', desiredRetention: 0.9 });
  });
});

describe('import / export', () => {
  it('import par lot : doublons ignorés, invalides signalés, collections créées', async () => {
    await createNote(db, tackle);
    const report = await importNotes(
      db,
      [
        { expression: 'tackle an issue', translation: 'doublon' },
        { expression: 'To figure out', translation: 'Comprendre', collectionNames: ['Phrasal Verbs'] },
        { expression: 'To figure out', translation: 'doublon interne' },
        { expression: '', translation: 'invalide' },
      ],
      await loadNotes(db),
    );
    expect(report).toMatchObject({ imported: 1, duplicates: 2 });
    expect(report.invalid).toHaveLength(1);
    expect((await loadCollections(db)).map((c) => c.name)).toEqual(['Phrasal Verbs']);
  });

  it('aller-retour CSV et JSON', async () => {
    const cid = await createCollection(db, 'Work');
    await createNote(db, { ...tackle, examples: ['Ex 1; with "quotes"', 'Ex 2'], tags: ['a', 'b'], collectionIds: [cid], isFavorite: true });
    const notes = await loadNotes(db);
    const collections = await loadCollections(db);

    const csv = exportCsv(notes, collections, settings);
    const fromCsv = parseCsvNotes(csv);
    expect(fromCsv[0]).toMatchObject({
      expression: tackle.expression,
      translation: tackle.translation,
      examples: ['Ex 1; with "quotes"', 'Ex 2'],
      tags: ['a', 'b'],
      collectionNames: ['Work'],
      isFavorite: true,
    });

    const fromJson = parseJsonNotes(JSON.parse(JSON.stringify(exportNotesJson(notes, collections))));
    expect(fromJson[0]).toMatchObject({ expression: tackle.expression, collectionNames: ['Work'], isFavorite: true });
  });

  it('CSV sans en-tête : expression, traduction, exemple', () => {
    expect(parseCsvNotes('To go;Aller;I go home')[0]).toMatchObject({ expression: 'To go', translation: 'Aller', examples: ['I go home'] });
  });

  it('sauvegarde complète puis restauration à l’identique (historique compris)', async () => {
    await createNote(db, tackle);
    const [n] = await loadNotes(db);
    const out = review(scheduler, n.cards.fr_en!, Rating.Good, Date.now());
    await recordReview(db, out.card, out.log, 1000);
    await saveSettings(db, { newPerDay: 7 });
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));

    const other = await createMemoryDatabase();
    await createNote(other, { expression: 'à écraser', translation: 'x' });
    await restoreBackup(other, backup);
    expect(await loadNotes(other)).toEqual(await loadNotes(db));
    expect(await other.select('SELECT * FROM review_logs')).toEqual(await db.select('SELECT * FROM review_logs'));
    expect((await loadSettings(other)).newPerDay).toBe(7);
  });

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    await expect(restoreBackup(db, { foo: 1 } as never)).rejects.toThrow(/sauvegarde/);
  });
});
