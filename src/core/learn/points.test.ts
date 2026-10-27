import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Le parcours de grammaire doit rester un graphe de prérequis cohérent. */
const data = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8')) as {
  points: { id: string; level: string; title: string; requires: string[]; detect: string }[];
};
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const byId = new Map(data.points.map((p) => [p.id, p]));

describe('parcours de grammaire anglaise', () => {
  it('identifiants uniques, niveaux et repérage valides', () => {
    expect(byId.size).toBe(data.points.length);
    for (const p of data.points) {
      expect(LEVELS).toContain(p.level);
      expect(['yes', 'partial', 'no']).toContain(p.detect);
    }
  });

  it('prérequis existants, jamais d’un niveau supérieur, sans cycle', () => {
    for (const p of data.points)
      for (const r of p.requires) {
        expect(byId.has(r), `${p.id} → ${r}`).toBe(true);
        expect(LEVELS.indexOf(byId.get(r)!.level)).toBeLessThanOrEqual(LEVELS.indexOf(p.level));
      }
    const done = new Set<string>();
    const visit = (id: string, path: string[]) => {
      expect(path, `cycle : ${[...path, id].join(' → ')}`).not.toContain(id);
      if (done.has(id)) return;
      for (const r of byId.get(id)!.requires) visit(r, [...path, id]);
      done.add(id);
    };
    for (const p of data.points) visit(p.id, []);
  });
});
