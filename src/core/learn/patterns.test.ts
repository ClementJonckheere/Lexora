import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasPattern, matchSentence, matchText, PATTERN_IDS, sentences } from './patterns';

const data = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8')) as { points: { id: string; example: string }[] };
const found = (id: string, s: string) => matchSentence(id, s).map((m) => s.slice(m.start, m.end));

describe('motifs de repérage', () => {
  it('chaque point a un motif, sauf ceux qui demandent une analyse grammaticale', () => {
    const without = data.points.filter((p) => !hasPattern(p.id)).map((p) => p.id);
    expect(without.sort()).toEqual(['adjectives', 'perfect-vs-past', 'simple-vs-continuous']);
    expect(PATTERN_IDS.length).toBe(data.points.length - 3);
  });

  it.each(data.points.filter((p) => hasPattern(p.id)).map((p) => [p.id, p.example]))('%s trouve son exemple : %s', (id, example) => {
    expect(matchText(id, example).length).toBeGreaterThan(0);
  });

  it('formes en -ing qui ne sont pas des verbes', () => {
    expect(found('present-continuous', 'He is reading.')).toEqual(['is reading']);
    expect(found('present-continuous', 'It is nothing. She is a darling.')).toEqual([]);
    expect(found('preposition-ing', 'In the morning, before leaving, he ate.')).toEqual(['before leaving']);
  });

  it('used to (habitude) ≠ be used to', () => {
    expect(found('used-to', 'I used to smoke.')).toEqual(['used to smoke']);
    expect(found('used-to', 'It was used to open the door. I am used to it.')).toEqual([]);
    expect(found('be-used-to', "I'm not used to it.")).toEqual(["'m not used to"]);
  });

  it("génitif : 's ≠ is / has", () => {
    expect(found('possessive-s', "My sister's room is big.")).toEqual(["sister's room"]);
    expect(found('possessive-s', "He's gone. It's late. That's true.")).toEqual([]);
  });

  it('going to + verbe, pas going to + lieu', () => {
    expect(found('going-to', "It's going to rain.")).toEqual(["'s going to rain"]);
    expect(found('going-to', "I'm going to the station.")).toEqual([]);
  });

  it('propositions participiales en début de phrase seulement', () => {
    expect(found('participle-clauses', 'Having finished, she left.')).toEqual(['Having finished,']);
    expect(found('participle-clauses', 'Built in 1890, the house still stands.')).toEqual(['Built in 1890,']);
    expect(found('participle-clauses', 'Thought Alice, it is late.')).toEqual([]);
  });

  it('positions dans le texte, phrase par phrase (motifs ancrés en début de phrase)', () => {
    const text = 'He was late. Did you see him? Never have I seen such a thing.';
    expect(sentences(text).map((s) => s.text.trim())).toEqual(['He was late.', 'Did you see him?', 'Never have I seen such a thing.']);
    const [m] = matchText('inversion', text);
    expect(text.slice(m.start, m.end)).toBe('Never have');
    expect(text.slice(...(() => { const [d] = matchText('past-questions', text); return [d.start, d.end] as const; })())).toBe('Did');
  });

  it('apostrophe typographique', () => {
    expect(found('will', 'I’ll call you.')).toEqual(['’ll']);
  });
});
