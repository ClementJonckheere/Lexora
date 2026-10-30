import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PlacementModel, type PlacementQuestion, type PlacementTarget } from './placement';
import { placementRng, referencePlacementProfiles, simulatePlacement } from './placementSimulation';

const data = JSON.parse(readFileSync('public/grammar/en/points.json', 'utf8')) as { points: PlacementTarget[] };
const targets: PlacementTarget[] = data.points.map((p) => ({ ...p, kind: 'point' }));
const profiles = referencePlacementProfiles(targets);
const questions = (mode: 'typed' | 'choice'): PlacementQuestion[] => targets.flatMap((t) => Array.from({ length: 12 }, (_, i) => ({
  id: `${t.id}:${i}`, targetId: t.id, mode, ...(mode === 'choice' ? { choices: 2 } : {}),
})));
const noise = { slip: 0.1, typedChance: 0.05, unknownShare: 0.35 };

describe('simulation permanente du placement sur les 79 points', () => {
  it('la vérité respecte requires et contient des acquis qui ne respectent pas after', () => {
    expect(targets).toHaveLength(79);
    for (const p of profiles) {
      const truth = p.knowledge(placementRng(93));
      for (const t of targets) if (truth[t.id]) expect(t.requires.every((id) => truth[id])).toBe(true);
    }
    const uneven = profiles.find((p) => p.name === 'Avancé avec lacunes hors after')!.knowledge(placementRng(1));
    expect(uneven['subjunctive']).toBe(true);
    expect(uneven['reported-questions']).toBe(false);
    expect(uneven['be-used-to']).toBe(true);
    expect(uneven['used-to']).toBe(false);
  });

  it('sans bruit, aucune classification fausse, y compris sur les profils irreguliers', () => {
    const model = new PlacementModel(targets, questions('typed'));
    const rows = simulatePlacement(model, profiles, 10, 20261029, { slip: 0, typedChance: 0, unknownShare: 0.5 });
    for (const r of rows) {
      expect(r.classifiedErrorRate, r.profile).toBe(0);
      expect(r.meanQuestions).toBeLessThanOrEqual(40);
      expect(r.classifiedRate, r.profile).toBeGreaterThan(0.25);
      expect(r.uncertainRate).toBeGreaterThan(0); // 40 questions ne justifient pas un classement integral
      expect(r.stops['bank-exhausted']).toBe(0);
    }
  }, 20000);

  it.each(['typed', 'choice'] as const)('avec bruit %s : erreur conditionnelle sous 15 %% et couverture explicite', (mode) => {
    const model = new PlacementModel(targets, questions(mode));
    const rows = simulatePlacement(model, profiles, 100, 20261029, noise);
    for (const r of rows) {
      expect(r.classifiedErrorRate, r.profile).toBeLessThan(1 - model.config.confidence);
      // Un choix binaire demande quatre reussites pour 85 %, contre deux réponses tapees.
      // Le minimum de couverture est donc distingue ; l'exigence de precision reste identique.
      expect(r.classifiedRate, r.profile).toBeGreaterThan(mode === 'typed' ? 0.2 : 0.08);
      expect(r.meanQuestions).toBeLessThanOrEqual(model.config.maxQuestions);
      expect(r.classifiedRate + r.uncertainRate).toBeCloseTo(1);
      expect(r.misclassifiedAllRate).toBeCloseTo(r.classifiedRate * r.classifiedErrorRate);
      expect(r.brier, r.profile).toBeLessThan(0.25); // reference : p = 0.5 sur tous les points
      expect(r.stops['bank-exhausted']).toBe(0);
    }
  }, 20000);

  it('mesure aussi le coût d\'un bruit sous-estimé et du classement forcé des incertains', () => {
    const model = new PlacementModel(targets, questions('typed'));
    const stress = simulatePlacement(model, profiles, 100, 20261029, { slip: 0.2, typedChance: 0.15, unknownShare: 0.35 });
    const beginner = stress[0];
    expect(beginner.forcedErrorRate).toBeGreaterThan(beginner.misclassifiedAllRate);
    for (const r of stress) {
      expect(Number.isFinite(r.classifiedErrorRate)).toBe(true);
      expect(r.classifiedErrorRate, r.profile).toBeLessThan(1 - model.config.confidence);
      expect(r.meanQuestions).toBeLessThanOrEqual(40);
      expect(r.uncertainRate).toBeGreaterThan(0);
    }
  }, 20000);

  it('est reproductible et ne transforme pas les metadonnees after en preuves', () => {
    const bank = questions('typed');
    const model = new PlacementModel(targets, bank);
    const changed = new PlacementModel(targets.map((t) => ({ ...t, after: ['arbitrary'] })), bank);
    const original = simulatePlacement(model, profiles.slice(6), 5, 318, noise);
    expect(simulatePlacement(model, profiles.slice(6), 5, 318, noise)).toEqual(original);
    expect(simulatePlacement(changed, profiles.slice(6), 5, 318, noise)).toEqual(original);
  }, 20000);
});
