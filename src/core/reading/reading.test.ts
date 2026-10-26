import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeText, isHeading, parseGutenberg, progressAt, splitChapterTitle, stripBoilerplate } from './gutenberg';
import { catalogUrl, displayName, parseCatalogPage, shortTitle, textFormat, type GutendexPage } from './gutendex';
import { estimateLevel, ranksFromList, sampleForLevel, withinLevel } from './level';
import { cleanSelection, sentenceAround, sourceNote, startsSentence } from './selection';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const alice = fixture('pg11-alice.txt');
const peter = fixture('pg14838-peter-rabbit.txt');
const enRanks = ranksFromList(readFileSync(new URL('../../../public/reading/freq/en.txt', import.meta.url), 'utf8'));
const bodyText = (raw: string) =>
  parseGutenberg(raw)
    .chapters.flatMap((c) => c.blocks.map((b) => b.text))
    .join('\n\n');

describe('texte Project Gutenberg', () => {
  it('retire en-tête et licence', () => {
    const body = stripBoilerplate(alice);
    expect(body.startsWith("ALICE'S ADVENTURES IN WONDERLAND")).toBe(true);
    expect(body).not.toMatch(/PROJECT GUTENBERG/);
    expect(body.trimEnd().endsWith('THE END')).toBe(true);
  });

  it('découpe Alice en 12 chapitres titrés, sans la table des matières', () => {
    const book = parseGutenberg(alice);
    expect(book.chapters).toHaveLength(12);
    expect(book.chapters[0].title).toBe('CHAPTER I. Down the Rabbit-Hole');
    expect(book.chapters[11].title).toBe("CHAPTER XII. Alice's Evidence");
    expect(book.chapters[0].blocks[0]).toEqual({
      kind: 'p',
      text: expect.stringMatching(/^Alice was beginning to get very tired of sitting by her sister on the bank, and of having/),
    });
    // Les poèmes gardent leurs retours à la ligne.
    expect(book.chapters.flatMap((c) => c.blocks).some((b) => b.kind === 'verse' && b.text.includes('\n'))).toBe(true);
  });

  it('livre sans chapitres : une seule partie, sans [Illustration]', () => {
    const book = parseGutenberg(peter);
    expect(book.chapters).toHaveLength(1);
    const all = book.chapters[0].blocks.map((b) => b.text).join(' ');
    expect(all).toMatch(/Once upon a time there were four little Rabbits/);
    expect(all).not.toMatch(/\[Illustration\]/);
  });

  it('reconnaît les titres de chapitres dans plusieurs langues', () => {
    for (const h of ['CHAPTER IV.', 'Chapter 12', 'Capítulo III', 'KAPITEL 2', 'Глава 5', '第三章', 'XIV.', 'Chapitre premier']) expect(isHeading(h), h).toBe(true);
    for (const p of ['Chapter and verse were quoted at length by the vicar, who', 'It was the best of times.']) expect(isHeading(p), p).toBe(false);
  });

  it('progression et décodage Latin-1', () => {
    const book = parseGutenberg(alice);
    expect(progressAt(book, 0, 0)).toBe(0);
    expect(progressAt(book, 6, 0)).toBeGreaterThan(0.3);
    expect(progressAt(book, 6, 0)).toBeLessThan(0.6);
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // « café » en Latin-1
    expect(decodeText(latin1)).toBe('café');
    expect(decodeText(new TextEncoder().encode('café'))).toBe('café');
  });
});

describe('catalogue Gutendex', () => {
  const page: GutendexPage = {
    count: 2,
    next: 'https://gutendex.com/books/?languages=en&page=2',
    previous: null,
    results: [
      {
        id: 11,
        title: "Alice's Adventures in Wonderland",
        authors: [{ name: 'Carroll, Lewis', birth_year: 1832, death_year: 1898 }],
        subjects: ['Fantasy fiction'],
        bookshelves: ["Children's Literature"],
        languages: ['en'],
        copyright: false,
        media_type: 'Text',
        formats: {
          'text/html': 'https://www.gutenberg.org/ebooks/11.html.images',
          'text/plain; charset=us-ascii': 'https://www.gutenberg.org/ebooks/11.txt.utf-8',
          'image/jpeg': 'https://www.gutenberg.org/cache/epub/11/pg11.cover.small.jpg',
        },
        download_count: 30000,
      },
      { id: 99, title: 'Audio', authors: [], subjects: [], bookshelves: [], languages: ['en'], copyright: false, media_type: 'Sound', formats: {}, download_count: 1 },
    ],
  };

  it('convertit les livres et ignore ceux sans texte', () => {
    const { books, next } = parseCatalogPage(page, 'en');
    expect(next).toContain('page=2');
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({
      key: 'gutenberg:11',
      authors: ['Lewis Carroll'],
      coverUrl: 'https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg',
      textUrl: 'https://www.gutenberg.org/ebooks/11.txt.utf-8',
      children: true,
    });
  });

  it('noms, titres, formats et adresse de recherche', () => {
    expect(displayName('Doyle, Arthur Conan, Sir')).toBe('Arthur Conan Doyle');
    expect(displayName('Homer')).toBe('Homer');
    expect(shortTitle('Moby Dick; Or, The Whale')).toBe('Moby Dick');
    expect(textFormat({ 'text/plain; charset=utf-8': 'a.txt', 'text/plain': 'b.zip', 'text/plain; charset=us-ascii': 'c.txt' })).toBe('a.txt');
    const url = new URL(catalogUrl('es', ' quijote '));
    expect(url.searchParams.get('languages')).toBe('es');
    expect(url.searchParams.get('search')).toBe('quijote');
    expect(url.searchParams.get('mime_type')).toBe('text/plain');
  });
});

describe('niveau estimé', () => {
  it('Alice ≈ B1, Peter Rabbit (texte très court) ≈ B1, sur un extrait', () => {
    const a = estimateLevel(sampleForLevel(bodyText(alice)), enRanks, 'en');
    expect(a?.level).toBe('B1');
    expect(a?.sample).toBeGreaterThan(5000);
    const p = estimateLevel(sampleForLevel(bodyText(peter)), enRanks, 'en');
    expect(p?.level).toBe('B1');
  });

  it('texte trop court : pas d’estimation ; comparaison des niveaux', () => {
    expect(estimateLevel('Hello there.', enRanks, 'en')).toBeNull();
    expect(withinLevel('B1', 'B2')).toBe(true);
    expect(withinLevel('C1', 'B2')).toBe(false);
    expect(splitChapterTitle('CHAPTER II. The Pool of Tears')).toEqual({ label: 'CHAPTER II', name: 'The Pool of Tears' });
    expect(splitChapterTitle('Chapter 12')).toEqual({ label: 'Chapter 12', name: '' });
    expect(splitChapterTitle('1 — The Old Sea-dog')).toEqual({ label: '1', name: 'The Old Sea-dog' });
  });

  it('chinois : estimation par caractères', () => {
    const zh = ranksFromList(readFileSync(new URL('../../../public/reading/freq/zh.txt', import.meta.url), 'utf8'));
    const easy = '我是学生。你好吗？我很好。我们去学校。他的朋友在家。今天天气很好。'.repeat(40);
    const est = estimateLevel(easy, zh, 'zh');
    expect(est?.level).toMatch(/^A/);
  });
});

describe('sélection dans un livre', () => {
  const para =
    "There was nothing so VERY remarkable in that; nor did Alice think it so VERY much out of the way to hear the Rabbit say to itself, 'Oh dear! Oh dear! I shall be late!' Mr. Bennet replied that he had not. Suddenly she ran.";
  const at = (s: string) => [para.indexOf(s), para.indexOf(s) + s.length] as const;

  it('extrait la phrase du livre qui contient la sélection', () => {
    expect(sentenceAround(para, ...at('remarkable'))).toBe(
      "There was nothing so VERY remarkable in that; nor did Alice think it so VERY much out of the way to hear the Rabbit say to itself, 'Oh dear! Oh dear! I shall be late!'",
    );
    expect(sentenceAround(`"I can't," said Tom. "It's late!" He left.`, 13, 16)).toBe(`"I can't," said Tom.`);
    expect(sentenceAround(`He said “Go home!” and left. Then it rained.`, 3, 7)).toBe('He said “Go home!” and left.');
    expect(sentenceAround(para, ...at('replied'))).toBe('Mr. Bennet replied that he had not.');
    expect(sentenceAround(para, ...at('ran'))).toBe('Suddenly she ran.');
    expect(sentenceAround('我是学生。你好吗？我很好。', 6, 7)).toBe('你好吗？');
  });

  it('phrase trop longue : la proposition autour de la sélection', () => {
    const long = `${'Lorem ipsum dolor sit amet, '.repeat(6)}the big brown fox jumped over the fence, ${'consectetur adipiscing elit, '.repeat(6)}end.`;
    const s = sentenceAround(long, long.indexOf('jumped'), long.indexOf('jumped') + 6);
    expect(s.length).toBeLessThan(200);
    expect(s).toContain('jumped over the fence');
    expect(s.startsWith('…')).toBe(true);
  });

  it('nettoie la sélection', () => {
    expect(cleanSelection(' "Suddenly, ', 'en', true)).toEqual({ expression: 'suddenly' });
    expect(cleanSelection('VERY', 'en', false)).toEqual({ expression: 'very' });
    expect(cleanSelection('I shall', 'en', true)).toEqual({ expression: 'I shall' });
    expect(cleanSelection('Haus', 'de', true)).toEqual({ expression: 'Haus' });
    expect(cleanSelection('take for granted.', 'en', false)).toEqual({ expression: 'take for granted' });
    expect(cleanSelection('a b c d e f g h i', 'en', false).error).toMatch(/trop longue/);
    expect(cleanSelection('…', 'en', false).error).toBeTruthy();
    expect(startsSentence(para, para.indexOf('Suddenly'))).toBe(true);
    expect(startsSentence(para, para.indexOf('Bennet'))).toBe(false);
    expect(startsSentence(para, para.indexOf('Oh dear! I') + 9)).toBe(true);
  });

  it('mention de la source', () => {
    expect(sourceNote("Alice's Adventures in Wonderland", 'Lewis Carroll', 'CHAPTER I. Down the Rabbit-Hole')).toBe(
      "Lu dans « Alice's Adventures in Wonderland » (Lewis Carroll), CHAPTER I. Down the Rabbit-Hole.",
    );
  });
});
