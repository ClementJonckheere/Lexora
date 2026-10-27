import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Le parcours de grammaire doit rester cohérent : prérequis stricts, ordre conseillé, pièges à part. */
interface Point {
  id: string;
  level: string;
  title: string;
  requires: string[];
  after: string[];
  detect: number | null;
}
interface Trap {
  id: string;
  point: string;
  level: string;
  wrong: string;
  right: string;
}
const data = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8')) as { points: Point[]; traps: Trap[] };
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const byId = new Map(data.points.map((p) => [p.id, p]));

function acyclic(edges: (p: Point) => string[]) {
  const done = new Set<string>();
  const visit = (id: string, path: string[]) => {
    expect(path, `cycle : ${[...path, id].join(' → ')}`).not.toContain(id);
    if (done.has(id)) return;
    for (const r of edges(byId.get(id)!)) visit(r, [...path, id]);
    done.add(id);
  };
  for (const p of data.points) visit(p.id, []);
}

describe('parcours de grammaire anglaise', () => {
  it('identifiants uniques, niveaux valides, repérage mesuré ou à mesurer', () => {
    expect(byId.size).toBe(data.points.length);
    for (const p of data.points) {
      expect(LEVELS).toContain(p.level);
      expect(p.detect === null || (p.detect >= 0 && p.detect <= 1)).toBe(true);
      expect(p).not.toHaveProperty('frenchTrap'); // les pièges sont des entrées à part
    }
  });

  it('prérequis stricts : existants, jamais d’un niveau supérieur, sans cycle', () => {
    for (const p of data.points)
      for (const r of p.requires) {
        expect(byId.has(r), `${p.id} → ${r}`).toBe(true);
        expect(LEVELS.indexOf(byId.get(r)!.level)).toBeLessThanOrEqual(LEVELS.indexOf(p.level));
      }
    acyclic((p) => p.requires);
  });

  it('ordre conseillé : existant, sans doublon avec un prérequis, sans cycle avec eux', () => {
    for (const p of data.points)
      for (const a of p.after) {
        expect(byId.has(a), `${p.id} après ${a}`).toBe(true);
        expect(p.requires).not.toContain(a);
      }
    acyclic((p) => [...p.requires, ...p.after]);
  });

  it('pièges : identifiants uniques, rattachés à un point existant, exemple faux et corrigé', () => {
    const ids = new Set(data.traps.map((t) => t.id));
    expect(ids.size).toBe(data.traps.length);
    for (const t of data.traps) {
      expect(byId.has(t.point), `${t.id} → ${t.point}`).toBe(true);
      expect(byId.has(t.id)).toBe(false);
      expect(LEVELS).toContain(t.level);
      expect(t.wrong).not.toBe(t.right);
    }
  });
});
