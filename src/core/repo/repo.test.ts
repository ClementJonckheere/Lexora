import { describe, expect, it, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { Rating, State } from 'ts-fsrs';
import { createMemoryDatabase } from '../db/testing';
import { createDatabase } from '../db/database';
import { createSqlJsDriver } from '../db/sqljsDriver';
import { getSchemaVersion, LATEST_VERSION, migrate, MIGRATIONS } from '../db/migrations';
import type { Database } from '../db/types';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { ValidationError } from '../domain/validation';
import { createScheduler, review } from '../srs/scheduler';
import { buildQueue } from '../srs/queue';
import { addTag, createNote, deleteNotes, findDuplicates, loadNotes, moveNotes, restoreNotes, setSuspended, updateNote, type NoteTarget } from './notesRepo';
import { addToCollection, createCollection, deleteCollection, loadCollections } from './collectionsRepo';
import { createUniverse, deleteUniverse, loadUniverses } from './universesRepo';
import { countNewIntroduced, loadForgetCounts, recordPractice, recordReview, typedBaseline, undoReview } from './reviewRepo';
import { loadSettings, saveSettings } from './settingsRepo';
import { computeStats } from './statsRepo';
import { exportBackup, exportCsv, exportNotesJson, importNotes, parseCsvNotes, parseJsonNotes, restoreBackup } from './transfer';

let db: Database;
let en: NoteTarget;
const settings = { ...DEFAULT_SETTINGS, enableFuzz: false };
const scheduler = createScheduler(settings);

beforeEach(async () => {
  db = await createMemoryDatabase();
  en = { universeId: await createUniverse(db, 'Anglais', 'en'), language: 'en' };
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
      migrate(db, [...MIGRATIONS, { version: LATEST_VERSION + 1, name: 'ko', statements: ['CREATE TABLE ok_t (x)', 'INVALID SQL'] }]),
    ).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(LATEST_VERSION);
    expect(await db.select("SELECT name FROM sqlite_master WHERE name = 'ok_t'")).toEqual([]);
  });

  it('v1 → v2 : conserve notes, exemples, tags, collections, fiches et historique dans un univers « Anglais »', async () => {
    const SQL = await initSqlJs();
    const old = createDatabase(createSqlJsDriver(new SQL.Database(), 'memory'));
    await migrate(old, MIGRATIONS.slice(0, 1));
    await old.execute(
      `INSERT INTO notes (id, expression, translation, expression_key, category, category_auto, is_favorite, created_at, updated_at)
       VALUES (1, 'To tackle an issue', 'S''attaquer', 'tackle an issue', 'Expression verbale', 1, 1, 1000, 1000)`,
    );
    await old.execute("INSERT INTO examples (note_id, sentence, position) VALUES (1, 'Ex A', 0), (1, 'Ex B', 1)");
    await old.execute("INSERT INTO tags (id, name) VALUES (1, 'work')");
    await old.execute('INSERT INTO note_tags (note_id, tag_id) VALUES (1, 1)');
    await old.execute("INSERT INTO collections (id, name, description, created_at) VALUES (1, 'Business', '', 1000)");
    await old.execute('INSERT INTO collection_notes (collection_id, note_id, added_at) VALUES (1, 1, 1000)');
    await old.execute("INSERT INTO cards (id, note_id, direction, state, due, stability, reps) VALUES (1, 1, 'fr_en', 2, 5000, 12.5, 4), (2, 1, 'en_fr', 0, 1000, 0, 0)");
    await old.execute(
      `INSERT INTO review_logs (card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, reviewed_at)
       VALUES (1, 3, 2, 4000, 10, 5, 3, 2, 3, 0, 4000)`,
    );
    await old.execute(`INSERT INTO settings (key, value) VALUES ('newPerDay', '7'), ('ttsVoice', '"Zira"'), ('ttsRate', '1')`);

    await migrate(old);
    const [u] = await loadUniverses(old);
    expect(u).toMatchObject({ name: 'Anglais', language: 'en' });
    const [n] = await loadNotes(old);
    const [c] = await loadCollections(old);
    expect(n).toMatchObject({ universeId: u.id, examples: ['Ex A', 'Ex B'], tags: ['work'], collectionIds: [c.id], isFavorite: true });
    expect(n.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(n.cards.fr_en).toMatchObject({ state: State.Review, stability: 12.5, reps: 4 });
    expect(await old.select('SELECT * FROM review_logs')).toHaveLength(1);
    expect(await loadSettings(old)).toMatchObject({ newPerDay: 7, ttsVoices: { en: 'Zira' }, ttsRate: 1 });
    expect(await old.select("SELECT name FROM sqlite_master WHERE name LIKE '%_v1'")).toEqual([]);
  });
});

describe('univers', () => {
  it('sépare les bibliothèques et supprime en cascade', async () => {
    const es = await createUniverse(db, 'Espagnol', 'es');
    await expect(createUniverse(db, 'espagnol', 'es')).rejects.toThrow(/déjà/);
    await expect(createUniverse(db, 'Klingon', 'not a code')).rejects.toThrow(/Code/);
    await createNote(db, tackle, en);
    await createNote(db, { expression: 'Echar de menos', translation: 'Regretter' }, { universeId: es, language: 'es' });
    await createCollection(db, es, 'Voyage');
    let notes = await loadNotes(db);
    expect(notes.filter((n) => n.universeId === es)).toHaveLength(1);

    await deleteUniverse(db, es);
    notes = await loadNotes(db);
    expect(notes.map((n) => n.expression)).toEqual(['To tackle an issue']);
    expect((await loadUniverses(db)).map((u) => u.name)).toEqual(['Anglais']);
    expect(await loadCollections(db)).toEqual([]);
    // Suppression douce : les lignes restent pour propager la suppression aux autres appareils.
    expect(await db.select('SELECT * FROM notes WHERE deleted = 1 AND dirty = 1')).toHaveLength(1);
  });

  it('doublons par langue : accents conservés hors anglais', async () => {
    const es = { universeId: await createUniverse(db, 'Espagnol', 'es'), language: 'es' };
    await createNote(db, { expression: 'año', translation: 'an' }, es);
    const notes = (await loadNotes(db)).filter((n) => n.universeId === es.universeId);
    expect(findDuplicates(notes, 'Año', 'es')).toHaveLength(1);
    expect(findDuplicates(notes, 'ano', 'es')).toHaveLength(0);
  });
});

describe('notes', () => {
  it('crée une note avec ses deux fiches, sa catégorie auto et ses tags', async () => {
    const id = await createNote(db, { ...tackle, tags: ['work', 'Work'], pronunciation: '' }, en);
    const [n] = await loadNotes(db);
    expect(n).toMatchObject({ id, expression: 'To tackle an issue', category: 'Expression verbale', categoryAuto: true, tags: ['work'] });
    expect(n.examples).toEqual(tackle.examples);
    expect(n.cards.fr_en?.state).toBe(State.New);
    expect(n.cards.en_fr?.state).toBe(State.New);
  });

  it('refuse une note invalide sans rien écrire', async () => {
    await expect(createNote(db, { expression: '', translation: 'x' }, en)).rejects.toBeInstanceOf(ValidationError);
    expect(await loadNotes(db)).toHaveLength(0);
  });

  it('détecte les doublons', async () => {
    await createNote(db, tackle, en);
    const notes = await loadNotes(db);
    expect(findDuplicates(notes, 'tackle an issue', 'en')).toHaveLength(1);
    expect(findDuplicates(notes, 'tackle a problem', 'en')).toHaveLength(0);
    expect(findDuplicates(notes, 'tackle an issue', 'en', notes[0].id)).toHaveLength(0);
  });

  it('modifie sans perdre la planification, supprime notes et fiches', async () => {
    const id = await createNote(db, tackle, en);
    let [n] = await loadNotes(db);
    const out = review(scheduler, n.cards.fr_en!, Rating.Good, Date.now());
    await recordReview(db, out.card, out.log, 3000);

    await updateNote(db, id, { ...tackle, examples: ['A', 'B'], category: 'Business', tags: ['x'], pronunciation: '/ˈtækəl/' }, 'en');
    [n] = await loadNotes(db);
    expect(n).toMatchObject({ examples: ['A', 'B'], category: 'Business', categoryAuto: false, pronunciation: '/ˈtækəl/' });
    expect(n.cards.fr_en?.reps).toBe(1);

    await deleteNotes(db, [id]);
    expect(await loadNotes(db)).toHaveLength(0);
    expect(await db.select('SELECT * FROM cards WHERE deleted = 0')).toHaveLength(0);

    await restoreNotes(db, [id]);
    [n] = await loadNotes(db);
    expect(n.cards.fr_en?.reps).toBe(1);
  });

  it('suspend, ajoute un tag et déplace vers un autre univers', async () => {
    const id = await createNote(db, { ...tackle, tags: ['work'] }, en);
    const c = await createCollection(db, en.universeId, 'Business');
    await addToCollection(db, c, [id]);
    await setSuspended(db, [id], true);
    await addTag(db, [id], 'Work');
    await addTag(db, [id], 'verbs');
    let [n] = await loadNotes(db);
    expect(n).toMatchObject({ suspended: true, tags: ['work', 'verbs'] });

    const es = await createUniverse(db, 'Espagnol', 'es');
    await moveNotes(db, [id], { universeId: es, language: 'es' });
    [n] = await loadNotes(db);
    expect(n).toMatchObject({ universeId: es, collectionIds: [] });
  });
});

describe('collections', () => {
  it('une note peut appartenir à plusieurs collections', async () => {
    const id = await createNote(db, tackle, en);
    const a = await createCollection(db, en.universeId, 'Business English');
    const b = await createCollection(db, en.universeId, 'Phrasal Verbs');
    await addToCollection(db, a, [id]);
    await addToCollection(db, b, [id]);
    await expect(createCollection(db, en.universeId, 'business english')).rejects.toThrow(/déjà/);
    let [n] = await loadNotes(db);
    expect([...n.collectionIds].sort()).toEqual([a, b].sort());
    await deleteCollection(db, a);
    [n] = await loadNotes(db);
    expect(n.collectionIds).toEqual([b]);
    expect(await loadCollections(db)).toHaveLength(1);
  });
});

describe('révisions', () => {
  it('enregistre, compte les nouveaux mots et annule', async () => {
    await createNote(db, tackle, en);
    const [n] = await loadNotes(db);
    const before = n.cards.fr_en!;
    const now = Date.now();
    const out = review(scheduler, before, Rating.Again, now);
    const logId = await recordReview(db, out.card, out.log, 4200, now, null, en.universeId);
    expect(await countNewIntroduced(db, now - 1000, 'fr_en', en.universeId)).toBe(1);
    const typedRows = () => db.select<{ n: number }>('SELECT COUNT(*) AS n FROM typed_answers WHERE log_id = ? AND deleted = 0', [logId]);
    expect((await typedRows())[0].n).toBe(1);

    let [m] = await loadNotes(db);
    expect(m.cards.fr_en?.state).toBe(State.Learning);

    await undoReview(db, before, logId);
    [m] = await loadNotes(db);
    expect(m.cards.fr_en).toEqual(before);
    expect(await countNewIntroduced(db, now - 1000, 'fr_en', en.universeId)).toBe(0);
    expect((await typedRows())[0].n).toBe(0);
  });

  it("l'entraînement libre ne modifie pas la planification", async () => {
    const id = await createNote(db, tackle, en);
    const before = (await loadNotes(db))[0].cards;
    await recordPractice(db, id, 'random', 1);
    await recordPractice(db, id, 'cloze', 1);
    expect((await loadNotes(db))[0].cards).toEqual(before);
    expect((await loadForgetCounts(db)).get(id)).toBe(2);
  });

  it('statistiques calculées sur les données réelles, par univers', async () => {
    await createNote(db, tackle, en);
    await createNote(db, { expression: 'To figure out', translation: 'Comprendre' }, en);
    const es = await createUniverse(db, 'Espagnol', 'es');
    await createNote(db, { expression: 'Hola', translation: 'Bonjour' }, { universeId: es, language: 'es' });
    let notes = (await loadNotes(db)).filter((n) => n.universeId === en.universeId);
    const now = Date.now();
    const q = buildQueue(notes, { now, settings, scheduler, newIntroducedToday: 0 });
    expect(q).toHaveLength(2);
    const target = notes.find((x) => x.id === q[0].noteId)!.cards.fr_en!;
    const out = review(scheduler, target, Rating.Good, now);
    await recordReview(db, out.card, out.log, 2000);
    notes = (await loadNotes(db)).filter((n) => n.universeId === en.universeId);
    const stats = await computeStats(db, notes, settings, scheduler, en.universeId, now + 1000);
    expect(stats.totalNotes).toBe(2);
    expect(stats.reviewsToday).toBe(1);
    expect(stats.mastery).toEqual({ new: 1, learning: 1, mastered: 0 });
    expect(stats.streakDays).toBe(1);
    const esStats = await computeStats(db, [], settings, scheduler, es, now + 1000);
    expect(esStats.reviewsToday).toBe(0);
  });
});

describe('réglages', () => {
  it('sépare réglages partagés et réglages de l’appareil', async () => {
    await saveSettings(db, { newPerDay: 25, directions: 'fr_en', ttsVoices: { en: 'Zira' } });
    expect(await loadSettings(db)).toMatchObject({ newPerDay: 25, directions: 'fr_en', desiredRetention: 0.9, ttsVoices: { en: 'Zira' } });
    expect((await db.select<{ key: string }>('SELECT key FROM settings')).map((r) => r.key).sort()).toEqual(['directions', 'newPerDay']);
    expect(await db.select('SELECT key FROM device_settings')).toEqual([{ key: 'ttsVoices' }]);
  });
});

describe('import / export', () => {
  it('import par lot : doublons ignorés, invalides signalés, collections créées', async () => {
    await createNote(db, tackle, en);
    const report = await importNotes(
      db,
      [
        { expression: 'tackle an issue', translation: 'doublon' },
        { expression: 'To figure out', translation: 'Comprendre', collectionNames: ['Phrasal Verbs'] },
        { expression: 'To figure out', translation: 'doublon interne' },
        { expression: '', translation: 'invalide' },
      ],
      await loadNotes(db),
      en,
    );
    expect(report).toMatchObject({ imported: 1, duplicates: 2 });
    expect(report.invalid).toHaveLength(1);
    expect((await loadCollections(db)).map((c) => c.name)).toEqual(['Phrasal Verbs']);
  });

  it('aller-retour CSV et JSON', async () => {
    const cid = await createCollection(db, en.universeId, 'Work');
    await createNote(db, { ...tackle, examples: ['Ex 1; with "quotes"', 'Ex 2'], tags: ['a', 'b'], collectionIds: [cid], isFavorite: true, pronunciation: 'tak' }, en);
    const notes = await loadNotes(db);
    const collections = await loadCollections(db);

    const fromCsv = parseCsvNotes(exportCsv(notes, collections, settings));
    expect(fromCsv[0]).toMatchObject({
      expression: tackle.expression,
      translation: tackle.translation,
      pronunciation: 'tak',
      examples: ['Ex 1; with "quotes"', 'Ex 2'],
      tags: ['a', 'b'],
      collectionNames: ['Work'],
      isFavorite: true,
    });

    const fromJson = parseJsonNotes(JSON.parse(JSON.stringify(exportNotesJson(notes, collections))));
    expect(fromJson[0]).toMatchObject({ expression: tackle.expression, collectionNames: ['Work'], isFavorite: true, pronunciation: 'tak' });
  });

  it('CSV sans en-tête : expression, traduction, exemple', () => {
    expect(parseCsvNotes('To go;Aller;I go home')[0]).toMatchObject({ expression: 'To go', translation: 'Aller', examples: ['I go home'] });
  });

  it('sauvegarde complète puis restauration à l’identique (historique compris)', async () => {
    await createNote(db, tackle, en);
    const [n] = await loadNotes(db);
    const out = review(scheduler, n.cards.fr_en!, Rating.Good, Date.now());
    await recordReview(db, out.card, out.log, 1000);
    await saveSettings(db, { newPerDay: 7 });
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));

    const other = await createMemoryDatabase();
    const u = await createUniverse(other, 'Russe', 'ru');
    await createNote(other, { expression: 'à écraser', translation: 'x' }, { universeId: u, language: 'ru' });
    await restoreBackup(other, backup);
    const strip = (notes: Awaited<ReturnType<typeof loadNotes>>) => notes.map(({ updatedAt: _u, ...x }) => x);
    expect(strip(await loadNotes(other))).toEqual(strip(await loadNotes(db)));
    expect((await loadUniverses(other)).map((x) => x.name)).toEqual(['Anglais']);
    expect(await other.select('SELECT id FROM review_logs WHERE deleted = 0')).toEqual(await db.select('SELECT id FROM review_logs'));
    expect((await loadSettings(other)).newPerDay).toBe(7);
  });

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    await expect(restoreBackup(db, { foo: 1 } as never)).rejects.toThrow(/sauvegarde/);
  });
});

describe('temps de saisie', () => {
  it("médiane du temps de réflexion des réponses tapées, par univers, à partir de 20 réponses", async () => {
    const es = { universeId: await createUniverse(db, 'Espagnol', 'es'), language: 'es' };
    await createNote(db, tackle, en);
    await createNote(db, { expression: 'Rendirse', translation: 'Abandonner', examples: [] }, es);
    const notes = await loadNotes(db);
    const enCard = notes.find((n) => n.universeId === en.universeId)!.cards.fr_en!;
    const esCard = notes.find((n) => n.universeId === es.universeId)!.cards.fr_en!;
    const record = (card: typeof enCard, ms: number | null, chars = 10) => {
      const out = review(scheduler, card, Rating.Good, Date.now());
      return recordReview(db, out.card, out.log, 9000, Date.now(), ms === null ? null : { ms, chars });
    };
    for (let i = 0; i < 19; i++) await record(enCard, 3000 + i * 100);
    expect(await typedBaseline(db, en.universeId, 150)).toBeNull();
    await record(enCard, 6000);
    await record(enCard, null); // réponse non tapée : ignorée
    for (let i = 0; i < 25; i++) await record(esCard, 20_000);
    // 20 réponses anglaises : 3000…4800 et 6000, moins 10 × 150 ms de frappe.
    expect(await typedBaseline(db, en.universeId, 150)).toBe(4000 - 1500);
    expect(await typedBaseline(db, es.universeId, 150)).toBe(20_000 - 1500);
  });
});
