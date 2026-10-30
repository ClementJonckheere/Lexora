import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCloze, clozeKeywords } from '../domain/cloze';
import { expressionKey } from '../domain/text';
import { validateNote } from '../domain/validation';
import { READY_COLLECTIONS, readyCandidates, type ReadyCollection } from './readyCollections';

const load = (id: string) => JSON.parse(readFileSync(`public/grammar/en/collections/${id}.json`, 'utf8')) as ReadyCollection;

describe('collections prêtes à importer', () => {
  const all = READY_COLLECTIONS.map(load);

  it('notes valides, sans doublon, sans tiret long', () => {
    const keys = new Set<string>();
    for (const c of all) {
      expect(c.notes.length).toBeGreaterThanOrEqual(30);
      for (const cand of readyCandidates(c)) {
        expect(() => validateNote(cand)).not.toThrow();
        const key = expressionKey(cand.expression, 'en');
        expect(keys.has(key), cand.expression).toBe(false);
        keys.add(key);
        expect(JSON.stringify(cand)).not.toMatch(/[—–]/);
      }
    }
  });

  it('chaque exemple donne une phrase à trous avec tous les mots de l’expression, préposition comprise', () => {
    for (const c of all)
      for (const n of c.notes) {
        const cloze = buildCloze(n.expression, n.examples[0], 'en');
        expect(cloze?.keywords, `${n.expression} | ${n.examples[0]}`).toEqual(clozeKeywords(n.expression, 'en'));
      }
  });

  it('la préposition to est à retrouver, pas le to de l’infinitif', () => {
    expect(clozeKeywords('To listen to sb', 'en')).toEqual(['listen', 'to']);
    expect(clozeKeywords('To tackle an issue', 'en')).toEqual(['tackle', 'issue']);
  });
});
