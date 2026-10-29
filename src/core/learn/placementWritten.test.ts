import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCorrect } from './exercises';
import { writtenItem, type WrittenQuestion } from './placementBank';

const written = JSON.parse(readFileSync('public/grammar/en/placement-written.json', 'utf8')).items as WrittenQuestion[];
const points = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8')).points as { id: string }[];

describe('questions rédigées du placement', () => {
  it('chaque question vise un point du parcours, se tape (indice) ou propose 3 choix distincts dont la réponse', () => {
    const ids = new Set(points.map((p) => p.id));
    for (const q of written) {
      expect(ids.has(q.targetId), q.id).toBe(true);
      expect(q.fr.trim(), q.id).not.toBe('');
      expect(`${q.before}${q.after}${q.fr}`, q.id).not.toMatch(/—/);
      if (q.hint) expect(q.options, q.id).toBeUndefined();
      else {
        expect(q.options?.length, q.id).toBeGreaterThanOrEqual(3);
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
    const typed = written.find((q) => q.answer === 'will be flying')!;
    expect(isCorrect({ id: typed.id, en: '', fr: '', before: '', after: '', answer: typed.answer }, "'ll be flying")).toBe(true);
  });

  it('les propositions tournent : la réponse ne reste pas toujours en premier', () => {
    const items = written.filter((q) => q.targetId === 'inversion').map((q, i) => writtenItem(q, i));
    expect(new Set(items.map((q) => q.options!.indexOf(q.answer))).size).toBeGreaterThan(1);
  });
});
