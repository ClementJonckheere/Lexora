import { describe, expect, it } from 'vitest';
import { default_w } from 'ts-fsrs';
import { DEFAULT_SETTINGS, type FsrsFit } from '@/core/domain/settings';
import { createScheduler } from '@/core/srs/scheduler';
import type { Universe } from '@/core/domain/types';
import { useApp } from './store';

const fit = (shift: number): FsrsFit => ({
  w: default_w.map((x, i) => (i < 4 ? x * shift : x)),
  at: 1,
  applied: true,
  reviews: 1000,
  before: { logLoss: 0.5, rmse: 0.07, reviews: 200 },
  after: { logLoss: 0.45, rmse: 0.03, reviews: 200 },
});

describe('changement de langue', () => {
  it('le planificateur prend les paramètres FSRS de la nouvelle langue', async () => {
    const en = { id: 'en-id', name: 'Anglais', language: 'en', position: 0, newPerDay: null } as unknown as Universe;
    const es = { id: 'es-id', name: 'Espagnol', language: 'es', position: 1, newPerDay: null } as unknown as Universe;
    const settings = { ...DEFAULT_SETTINGS, fsrsParams: { [en.id]: fit(2), [es.id]: fit(0.5) } };
    // Rechargement des données hors sujet ici (base locale) : neutralisé.
    useApp.setState({ universes: [en, es], universe: en, settings, scheduler: createScheduler(settings, en.id), refresh: async () => {} });
    expect(useApp.getState().scheduler.parameters.w).toEqual(fit(2).w);

    await useApp.getState().setUniverse(es.id);
    expect(useApp.getState().scheduler.parameters.w).toEqual(fit(0.5).w);
    await useApp.getState().setUniverse(en.id);
    expect(useApp.getState().scheduler.parameters.w).toEqual(fit(2).w);
  });
});
