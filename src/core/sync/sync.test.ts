import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { createMemoryDatabase } from '../db/testing';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { createNote, deleteNotes, loadNotes, updateNote } from '../repo/notesRepo';
import { createUniverse, loadUniverses } from '../repo/universesRepo';
import { recordReview } from '../repo/reviewRepo';
import { loadSettings, saveSettings } from '../repo/settingsRepo';
import { createScheduler, review } from '../srs/scheduler';
import { loadBookText, loadBooks, removeBook, saveBook, saveProgress } from '../repo/booksRepo';
import { bindAccount, pendingChanges, resetLocalData, syncOnce } from './engine';
import { MemoryRemote } from './memoryRemote';

const scheduler = createScheduler({ ...DEFAULT_SETTINGS, enableFuzz: false });
const strip = (notes: Awaited<ReturnType<typeof loadNotes>>) =>
  notes.map(({ cards, ...n }) => ({ ...n, cards: Object.fromEntries(Object.entries(cards).map(([d, c]) => [d, c!.reps])) }));

describe('synchronisation entre appareils', () => {
  it('un PC et un mobile convergent vers les mêmes données', async () => {
    const remote = new MemoryRemote();
    const pc = await createMemoryDatabase();
    const phone = await createMemoryDatabase();

    const en = { universeId: await createUniverse(pc, 'Anglais', 'en'), language: 'en' };
    const id = await createNote(pc, { expression: 'To tackle an issue', translation: "S'attaquer", examples: ['We tackle it.'] }, en);
    await saveSettings(pc, { newPerDay: 15, ttsRate: 1.2 });
    expect(await pendingChanges(pc)).toBeGreaterThan(0);
    await syncOnce(pc, remote);
    expect(await pendingChanges(pc)).toBe(0);

    // Le mobile reçoit tout (sauf les réglages propres à l'appareil).
    await syncOnce(phone, remote);
    expect(strip(await loadNotes(phone))).toEqual(strip(await loadNotes(pc)));
    expect((await loadUniverses(phone))[0].name).toBe('Anglais');
    expect(await loadSettings(phone)).toMatchObject({ newPerDay: 15, ttsRate: DEFAULT_SETTINGS.ttsRate });

    // Révision sur le mobile, modification du texte sur le PC.
    const [n] = await loadNotes(phone);
    const out = review(scheduler, n.cards.fr_en!, Rating.Good, Date.now());
    await recordReview(phone, out.card, out.log, 1500);
    await new Promise((r) => setTimeout(r, 5));
    await updateNote(pc, id, { expression: 'To tackle an issue', translation: "S'attaquer à un problème", examples: ['We tackle it.'] }, 'en');

    await syncOnce(phone, remote);
    await syncOnce(pc, remote);
    await syncOnce(phone, remote);
    const [onPc] = await loadNotes(pc);
    const [onPhone] = await loadNotes(phone);
    expect(onPc.translation).toBe("S'attaquer à un problème");
    expect(onPc.cards.fr_en!.reps).toBe(1);
    expect(strip([onPhone])).toEqual(strip([onPc]));
    expect(await pc.select('SELECT id FROM review_logs')).toEqual(await phone.select('SELECT id FROM review_logs'));
  });

  it('la modification la plus récente gagne, la suppression se propage', async () => {
    const remote = new MemoryRemote();
    const a = await createMemoryDatabase();
    const b = await createMemoryDatabase();
    const en = { universeId: await createUniverse(a, 'Anglais', 'en'), language: 'en' };
    const id = await createNote(a, { expression: 'Serendipity', translation: 'Hasard' }, en);
    await syncOnce(a, remote);
    await syncOnce(b, remote);

    // Hors ligne des deux côtés : b modifie après a.
    await updateNote(a, id, { expression: 'Serendipity', translation: 'Version A' }, 'en', 1_000_000_000_000_0);
    await updateNote(b, id, { expression: 'Serendipity', translation: 'Version B' }, 'en', 1_000_000_000_000_1);
    await syncOnce(a, remote);
    await syncOnce(b, remote);
    await syncOnce(a, remote);
    expect((await loadNotes(a))[0].translation).toBe('Version B');
    expect((await loadNotes(b))[0].translation).toBe('Version B');

    await deleteNotes(b, [id], 1_000_000_000_000_2);
    await syncOnce(b, remote);
    await syncOnce(a, remote);
    expect(await loadNotes(a)).toEqual([]);
  });

  it('livres : la position de lecture suit l’utilisateur, le texte reste local', async () => {
    const remote = new MemoryRemote();
    const pc = await createMemoryDatabase();
    const phone = await createMemoryDatabase();
    const u = await createUniverse(pc, 'Anglais', 'en');
    const book = {
      key: 'gutenberg:11', gutenbergId: 11, title: "Alice's Adventures in Wonderland", authors: ['Lewis Carroll'], language: 'en',
      coverUrl: 'https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg', textUrl: 'https://www.gutenberg.org/ebooks/11.txt.utf-8',
      subjects: [], downloads: 1, children: true,
    };
    const content = { chapters: [{ title: 'CHAPTER I', blocks: [{ kind: 'p' as const, text: 'Alice was beginning…' }] }] };
    await saveBook(pc, book, u, 'B1', content, '');
    await saveProgress(pc, book.key, 3, 12, 0.27);
    await syncOnce(pc, remote);
    await syncOnce(phone, remote);
    const [b] = await loadBooks(phone);
    expect(b).toMatchObject({ key: 'gutenberg:11', universeId: u, authors: ['Lewis Carroll'], level: 'B1', chapter: 3, block: 12, progress: 0.27 });
    expect(await loadBookText(phone, book.key)).toBeNull();
    expect(await loadBookText(pc, book.key)).toEqual(content);

    // Ré-ajout sur le mobile : la position est conservée ; retrait sur le PC : propagé.
    await saveBook(phone, book, u, 'B1', content, '');
    expect((await loadBooks(phone))[0].chapter).toBe(3);
    await new Promise((r) => setTimeout(r, 5));
    await removeBook(pc, book.key);
    await syncOnce(pc, remote);
    await syncOnce(phone, remote);
    expect(await loadBooks(phone)).toHaveLength(0);
  });

  it('pagination : plus de 500 lignes', async () => {
    const remote = new MemoryRemote();
    const a = await createMemoryDatabase();
    const b = await createMemoryDatabase();
    const en = { universeId: await createUniverse(a, 'Anglais', 'en'), language: 'en' };
    for (let i = 0; i < 620; i++) await createNote(a, { expression: `word ${i}`, translation: `mot ${i}` }, en);
    expect((await syncOnce(a, remote)).pushed).toBe(1 + 620 * 3);
    await syncOnce(b, remote);
    expect(await loadNotes(b)).toHaveLength(620);
  });

  it('liaison de compte : même compte, autre compte, réinitialisation', async () => {
    const db = await createMemoryDatabase();
    await createUniverse(db, 'Anglais', 'en');
    expect(await bindAccount(db, 'user-1')).toBe('bound');
    expect(await bindAccount(db, 'user-1')).toBe('same');
    expect(await bindAccount(db, 'user-2')).toBe('other-account');
    await resetLocalData(db, 'user-2');
    expect(await loadUniverses(db)).toEqual([]);
    expect(await bindAccount(db, 'user-2')).toBe('same');
  });
});
