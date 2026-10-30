import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCorrect } from './exercises';
import { writtenItem, type WrittenQuestion } from './placementBank';

const written = JSON.parse(readFileSync('public/grammar/en/placement-written.json', 'utf8')).items as WrittenQuestion[];
const points = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8')).points as { id: string }[];

describe('questions rédigées du placement', () => {
  it('chaque question vise un point du parcours, se tape (indice) ou propose 2 ou 3 choix distincts dont la réponse', () => {
    const ids = new Set(points.map((p) => p.id));
    for (const q of written) {
      expect(ids.has(q.targetId), q.id).toBe(true);
      expect(q.fr.trim(), q.id).not.toBe('');
      expect(q.form, q.id).toBeTruthy();
      // La traduction ne dicte pas la forme continue : c'est le contexte anglais qui tranche.
      expect(q.fr, q.id).not.toMatch(/en train d(?:e\b|')/);
      expect(`${q.before}${q.after}${q.fr}`, q.id).not.toMatch(/—/);
      if (q.hint) expect(q.options, q.id).toBeUndefined();
      else {
        expect(q.options?.length, q.id).toBeGreaterThanOrEqual(2);
        expect(new Set(q.options).size, q.id).toBe(q.options!.length);
        expect(q.options, q.id).toContain(q.answer);
      }
    }
  });

  it('identifiants uniques, au moins 6 questions par point, réponse tapée reconnue (contractions comprises)', () => {
    expect(new Set(written.map((q) => q.id)).size).toBe(written.length);
    const per = new Map<string, number>();
    for (const q of written) per.set(q.targetId, (per.get(q.targetId) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBeGreaterThanOrEqual(6);
    const ok = (answer: string, typed: string, accept?: string[]) => isCorrect({ id: '', en: '', fr: '', before: '', after: '', answer, accept }, typed);
    expect(ok('will be flying', "'ll be flying")).toBe(true);
    expect(ok('would be', "'d be")).toBe(true);
    expect(ok('is snowing', "'s snowing")).toBe(true);
    const eaten = written.find((q) => q.answer === 'will have eaten')!;
    expect(ok(eaten.answer, 'will already have eaten', eaten.accept)).toBe(true);
  });

  it('une règle superficielle ne suffit pas : les points à alternative mêlent les natures de réponse', () => {
    for (const id of ['subject-questions', 'purpose-to', 'make-let', 'phrasal-verbs', 'simple-vs-continuous', 'have-something-done', 'preposition-ing']) {
      const forms = written.filter((q) => q.targetId === id).map((q) => q.form);
      const top = Math.max(...[...new Set(forms)].map((f) => forms.filter((x) => x === f).length));
      expect(top / forms.length, id).toBeLessThanOrEqual(2 / 3);
    }
  });

  it('les propositions tournent : la réponse ne reste pas toujours en premier', () => {
    const items = written.filter((q) => q.targetId === 'inversion').map((q, i) => writtenItem(q, i));
    expect(new Set(items.map((q) => q.options!.indexOf(q.answer))).size).toBeGreaterThan(1);
  });
});
