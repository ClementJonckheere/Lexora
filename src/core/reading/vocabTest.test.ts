import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyzeText, BAND_EDGES, bandOf, buildVocabBank, caseStats, coverageFromProfile, noteForms, textProfile, type Knowledge } from './coverage';
import { buildVocabTest, decreasing, pseudoword, scoreVocabTest } from './vocabTest';
import type { Note } from '../domain/types';

/** Générateur pseudo-aléatoire reproductible. */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

/** Vraie liste de fréquence anglaise (fournie avec l'application). */
const listText = readFileSync('public/reading/freq/en.txt', 'utf8');
const list = listText
  .split('\n')
  .map((w) => w.trim())
  .filter(Boolean);

describe('test de vocabulaire', () => {
  it('mélange des mots de chaque tranche et des mots inventés absents de la liste', () => {
    const items = buildVocabTest(list, rng(1));
    const real = items.filter((i) => i.real);
    const fake = items.filter((i) => !i.real);
    expect(new Set(real.map((r) => r.band)).size).toBe(BAND_EDGES.length);
    expect(fake.length).toBeGreaterThanOrEqual(15);
    const lexicon = new Set(list);
    expect(fake.every((f) => !lexicon.has(f.word))).toBe(true);
    expect(items.slice(0, 3).every((i) => i.real && i.band === 0)).toBe(true);
  });

  it('un mot inventé ne reprend jamais un vrai mot', () => {
    const lexicon = new Set(['garden', 'gardon', 'gerden', 'girden', 'gorden', 'gurden', 'gardan', 'gardin', 'gardun']);
    expect(pseudoword('garden', lexicon, rng(3))).toBeNull();
  });

  it('régression isotone : la part connue ne remonte pas dans les tranches rares', () => {
    expect(decreasing([1, 0.6, 0.8, 0.2], [1, 1, 1, 1])).toEqual([1, 0.7, 0.7, 0.2]);
  });
});

/**
 * Apprenants simulés sur des données réelles : vraie liste de fréquence anglaise et histogramme des rangs de
 * trois livres (Alice, Pride and Prejudice, Moby Dick ; noms propres exclus). Un apprenant connaît un mot de rang r
 * avec la probabilité 1 / (1 + (r / K)^2,5) et répond parfois « je connais » au hasard. On compare la couverture
 * estimée (profil du livre + test) à la couverture réelle : l'erreur doit rester petite devant la zone 95–98 %.
 */
describe('précision du test (apprenants simulés)', () => {
  const ranks = new Map(list.map((w, i) => [w, i + 1]));
  const books = Object.values(
    JSON.parse(readFileSync('src/core/reading/fixtures/rank-histograms.json', 'utf8')) as Record<string, { buckets: number[]; unranked: number }>,
  );

  it.each([
    [2000, 0.05],
    [5000, 0.1],
    [10000, 0.1],
    [20000, 0.05],
  ])('vocabulaire %i, %f de réponses au hasard', (K, bluff) => {
    const know = (r: number) => 1 / (1 + Math.pow(r / K, 2.5));
    const errors: number[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed * 7919);
      const items = buildVocabTest(list, r);
      const answers = items.map((it) => (!it.real ? r() < bluff : r() < know(ranks.get(it.word)!) || r() < bluff));
      const { bands } = scoreVocabTest(items, answers);
      for (const b of books) {
        const total = b.buckets.reduce((a, c) => a + c, 0) + b.unranked;
        const truth = b.buckets.reduce((a, c, i) => a + c * know(i * 50 + 25), 0) / total;
        const profile = BAND_EDGES.map(() => 0);
        b.buckets.forEach((c, i) => (profile[bandOf(i * 50 + 25)] += c / total));
        errors.push(coverageFromProfile(profile, bands) - truth);
      }
    }
    errors.sort((a, b) => a - b);
    const q = (p: number) => errors[Math.floor(p * (errors.length - 1))];
    expect(Math.abs(q(0.5))).toBeLessThan(0.01); // pas de biais
    expect(q(0.1)).toBeGreaterThan(-0.03); // 80 % des estimations à ±3 points
    expect(q(0.9)).toBeLessThan(0.03);
  });
});

describe('couverture', () => {
  const ranks = new Map([
    ['the', 1],
    ['cat', 500],
    ['sat', 1500],
    ['on', 5],
    ['mat', 9000],
    ['quietly', 25000],
  ]);
  const text = 'The cat sat on the mat. Tom sat quietly. The cat sat on the mat again, said Tom. '.repeat(30);
  // Tranches : …250, …500, …1000, …2000, …3000, …5000, …8000, …12000, …20000, …30000, …50000
  const k: Knowledge = { bands: [1, 1, 1, 0.9, 0.9, 0.8, 0.5, 0.2, 0.1, 0, 0], marks: new Map(), noteForms: new Set() };

  it('ignore les noms propres et repère les mots inconnus les plus fréquents', () => {
    const r = analyzeText(text, ranks, k, 'en');
    expect(r.unknown.map((u) => u.word)).toEqual(['mat', 'quietly', 'again', 'said']);
    expect(r.unknown.some((u) => u.word === 'tom')).toBe(false);
    expect(r.coverage).toBeGreaterThan(0.6);
    expect(r.coverage).toBeLessThan(0.8);
  });

  it('vos marques et vos notes priment sur le test', () => {
    const notes = [{ expression: 'mat', examples: [] } as unknown as Note];
    const k2 = {
      ...k,
      marks: new Map([
        ['quietly', true],
        ['cat', false],
      ]),
      noteForms: noteForms(notes, 'en'),
    };
    const r = analyzeText(text, ranks, k2, 'en');
    expect(r.unknown.map((u) => u.word)).toEqual(['cat', 'again', 'said']);
  });

  it('profil sans le lecteur, puis couverture avec son test', () => {
    const profile = textProfile(text, ranks, 'en')!;
    expect(profile.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    const viaProfile = coverageFromProfile(profile, k.bands);
    expect(viaProfile).toBeCloseTo(analyzeText(text, ranks, k, 'en').coverage, 2);
  });
});

describe('banque de mots et allemand', () => {
  it('écarte les mots surtout écrits avec une majuscule (prénoms, lieux)', () => {
    const stats = caseStats('Jennifer went home. jennifer? Jennifer said the house was near Chicago. The house, the house.');
    const bank = buildVocabBank(['the', 'house', 'jennifer', 'chicago', 'went'], stats, 'en', () => 0.5);
    expect(bank.bands[0]).toEqual(expect.arrayContaining(['the', 'house']));
    expect(bank.bands[0]).not.toContain('jennifer');
    expect(bank.bands[0]).not.toContain('chicago');
    expect(bank.bands[0]).not.toContain('went'); // une seule occurrence
  });

  it('allemand : les noms communs comptent, les noms propres absents de la liste non', () => {
    const de = new Map([
      ['der', 1],
      ['hund', 900],
      ['schläft', 4000],
      ['im', 10],
      ['garten', 2500],
    ]);
    const text = 'Der Hund schläft im Garten. Bello schläft im Garten. '.repeat(40);
    const r = analyzeText(text, de, { bands: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], marks: new Map(), noteForms: new Set() }, 'de');
    expect(r.words).toBe(40 * 8); // « Bello » : nom propre
    expect(r.unknown.map((u) => u.word)).toEqual(['garten', 'schläft']); // à égalité, le plus fréquent dans la langue d'abord
  });
});

describe('formes anglaises', () => {
  it('ramène une forme fléchie à sa base', async () => {
    const { englishBases } = await import('./coverage');
    expect(englishBases('replied')).toContain('reply');
    expect(englishBases('chooses')).toContain('choose');
    expect(englishBases('stopped')).toContain('stop');
    expect(englishBases('settling')).toContain('settle');
    expect(englishBases('quietly')).toContain('quiet');
    expect(englishBases('happily')).toContain('happy');
    expect(englishBases('glass')).not.toContain('glas');
  });

  it('une forme rare dont la base est courante compte comme la base', () => {
    const ranks = new Map([
      ['the', 1],
      ['she', 30],
      ['reply', 900],
      ['replied', 10_396],
    ]);
    const k: Knowledge = { bands: [1, 1, 1, 0.9, 0.8, 0.6, 0.4, 0.1, 0, 0, 0], marks: new Map(), noteForms: new Set() };
    const r = analyzeText('she replied the reply. '.repeat(100), ranks, k, 'en');
    expect(r.unknown).toEqual([]);
  });

  it('regroupe les formes inconnues sous leur base, et une marque sur la base vaut pour les formes', () => {
    const ranks = new Map([
      ['the', 1],
      ['humour', 8105],
      ['humoured', 30_000],
    ]);
    const k: Knowledge = { bands: [1, 1, 1, 1, 1, 1, 0.2, 0.1, 0, 0, 0], marks: new Map(), noteForms: new Set() };
    const text = 'the humour the humoured the humour. '.repeat(100);
    expect(analyzeText(text, ranks, k, 'en').unknown).toEqual([{ word: 'humour', count: 300, rank: 8105, forms: ['humour', 'humoured'] }]);
    expect(analyzeText(text, ranks, { ...k, marks: new Map([['humour', true]]) }, 'en').unknown).toEqual([]);
  });
});
