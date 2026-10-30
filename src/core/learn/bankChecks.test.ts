import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkBank } from './bankChecks';
import type { Exercise } from './exercises';

const ex = (o: Partial<Exercise>): Exercise => ({ id: 'x:1', en: 'I have seen it.', fr: 'Je l’ai vu.', before: 'I ', after: ' seen it.', answer: 'have', choices: ['have', 'had'], form: 'a', ...o });

describe('contrôles des banques : règles', () => {
  it('repère les exercices incohérents', () => {
    const msgs = (items: Exercise[], id = 'x') => checkBank(id, items).filter((i) => i.level === 'error').map((i) => i.message);
    expect(msgs([ex({ choices: ['had', 'has'] })])).toContainEqual(expect.stringMatching(/absente/));
    expect(msgs([ex({ choices: ['have', 'Have'] })])).toContainEqual(expect.stringMatching(/double/));
    expect(msgs([ex({ after: ' seen them.' })])).toContainEqual(expect.stringMatching(/redonne/));
    expect(msgs([ex({ en: 'I have seen it yesterday.', after: ' seen it yesterday.' })], 'present-perfect')).toContainEqual(expect.stringMatching(/passé/));
    expect(msgs([ex({ en: 'I have known her since 2010.', after: ' known her since 2010.' })], 'present-perfect')).toEqual([]);
  });
  it('variété : une nature de réponse au-delà de 60 % bloque', () => {
    const items = Array.from({ length: 30 }, (_, i) => ex({ id: `x:${i}`, form: i < 20 ? 'a' : 'b' }));
    expect(checkBank('x', items).some((i) => /nature « a »/.test(i.message))).toBe(true);
    const balanced = Array.from({ length: 30 }, (_, i) => ex({ id: `x:${i}`, form: i % 2 ? 'a' : 'b' }));
    expect(checkBank('x', balanced).filter((i) => i.level === 'error')).toEqual([]);
  });
});

const DIR = 'public/grammar/en';
const blocklist = readFileSync('scripts/grammar-blocklist.txt', 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => new RegExp(l, 'i'));

describe('contrôles des banques livrées', () => {
  const lessons = (JSON.parse(readFileSync(`${DIR}/lessons.json`, 'utf8')).lessons as { id: string }[]).map((l) => l.id);
  it.each(lessons)('leçon %s', (id) => {
    const file = `${DIR}/exercises/${id}.json`;
    if (!existsSync(file)) return; // banque pas encore générée par la CI
    const items = JSON.parse(readFileSync(file, 'utf8')).items as Exercise[];
    const errors = checkBank(id, items, blocklist).filter((i) => i.level === 'error');
    expect(errors.map((e) => `${e.id} : ${e.message}`)).toEqual([]);
  });
  it('banques du placement', () => {
    const errors: string[] = [];
    for (const f of readdirSync(`${DIR}/placement`).filter((f) => f !== 'index.json')) {
      const items = JSON.parse(readFileSync(`${DIR}/placement/${f}`, 'utf8')).items as Exercise[];
      // Petites banques à une nature dominante par construction : seule la cohérence des exercices est contrôlée ici.
      errors.push(...checkBank(f, items, blocklist).filter((i) => i.level === 'error' && !/nature/.test(i.message)).map((e) => `${f} ${e.id} : ${e.message}`));
    }
    expect(errors).toEqual([]);
  });
});
