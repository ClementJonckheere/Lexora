import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../domain/settings';
import { checkItems, checkResult, needsCheck, placementRecord, placementSummary, pointState, suggestedLesson } from './placementResults';
import type { PlacementItem } from './placementBank';
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

describe('mini-test de leçon', () => {
  const rec = placementRecord([est('passive', 'consolidate', 'uncertain'), est('be', 'mastered')], 1000);
  const q = (id: string, form: string): PlacementItem => ({
    id,
    targetId: 'passive',
    mode: 'choice',
    choices: 2,
    before: '',
    after: '',
    fr: '',
    answer: 'a',
    options: ['a', 'b'],
    source: id,
    status: 'généré',
    form,
  });

  it('proposé pour un point « à consolider », tant qu’il n’est ni corrigé ni vérifié', () => {
    expect(needsCheck(rec, 'passive')).toBe(true);
    expect(needsCheck(rec, 'be')).toBe(false);
    expect(needsCheck({ ...rec, overrides: { passive: 'learn' } }, 'passive')).toBe(false);
    const checked = { ...rec, checks: { passive: { at: 2, probability: 0.9, state: 'mastered' as const } } };
    expect(needsCheck(checked, 'passive')).toBe(false);
    expect(pointState(checked, 'passive')).toBe('mastered');
  });

  it('questions aux natures de réponse alternées', () => {
    const bank = [q('1', 'x'), q('2', 'x'), q('3', 'x'), q('4', 'y'), q('5', 'z')];
    expect(checkItems(bank, 'passive').map((i) => i.form)).toEqual(['x', 'y', 'z']);
  });

  it('même mise à jour bayésienne et même seuil que le test : 3 choix justes sur 2 propositions → acquis, une erreur → incertain', () => {
    const choice = { mode: 'choice' as const, choices: 2 };
    expect(checkResult(0.5, [1, 2, 3].map(() => ({ ...choice, response: 'correct' as const }))).state).toBe('mastered');
    expect(checkResult(0.5, [{ ...choice, response: 'correct' }, { ...choice, response: 'incorrect' }, { ...choice, response: 'correct' }]).state).toBe('consolidate');
    expect(checkResult(0.5, [{ mode: 'typed', response: 'incorrect' }, { mode: 'typed', response: 'unknown' }]).state).toBe('learn');
  });
});
