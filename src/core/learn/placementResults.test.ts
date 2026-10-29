import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../domain/settings';
import { placementRecord, placementSummary, pointState, suggestedLesson } from './placementResults';
import type { PlacementEstimate } from './placement';

const est = (id: string, state: PlacementEstimate['state'], evidence: PlacementEstimate['evidence'] = 'direct'): PlacementEstimate => ({
  id,
  kind: 'point',
  probability: state === 'mastered' ? 0.97 : 0.2,
  directProbability: 0.5,
  answered: 2,
  unknown: 0,
  state,
  evidence,
  sources: [],
});

describe('résultats du placement', () => {
  const rec = placementRecord([est('be', 'mastered'), est('can', 'mastered', 'requires'), est('present-perfect', 'learn'), est('passive', 'consolidate')], 1000);

  it('les corrections de l’utilisateur l’emportent sur le test', () => {
    expect(pointState(rec, 'present-perfect')).toBe('learn');
    const corrected = { ...rec, overrides: { 'present-perfect': 'mastered' as const } };
    expect(pointState(corrected, 'present-perfect')).toBe('mastered');
    expect(placementSummary(corrected)).toEqual({ mastered: 3, consolidate: 1, learn: 0 });
  });

  it('leçon conseillée : la première ni acquise au test ni déjà acquise en exercices', () => {
    expect(suggestedLesson(rec, ['be', 'present-perfect', 'passive'], () => false)).toBe('present-perfect');
    expect(suggestedLesson(rec, ['be', 'present-perfect', 'passive'], (id) => id === 'present-perfect')).toBe('passive');
  });

  it('enregistré dans les réglages synchronisés, relu sans perte et assaini', () => {
    const s = sanitizeSettings({ placement: { u1: rec, u2: { status: 'skipped', at: 5 }, u3: { status: 'done' }, u4: 'x' } });
    expect(s.placement.u1).toEqual(rec);
    expect(s.placement.u2).toEqual({ status: 'skipped', at: 5 });
    expect(s.placement.u3).toBeUndefined();
    expect(s.placement.u4).toBeUndefined();
  });
});
