import { describe, expect, it, vi } from 'vitest';

// MyMemory simulé (aucun accès réseau pendant les tests).
vi.mock('../platform/http', () => ({
  HttpError: class extends Error {
    status = 0;
  },
  httpGetJson: vi.fn(async () => ({ responseStatus: 200, responseData: { translatedText: 'mymemory' }, matches: [] })),
}));

const { translate } = await import('./translate');
const { SharedUnavailable } = await import('./shared');

describe('choix du service de traduction', () => {
  it('DeepL partagé, avec la phrase en contexte', async () => {
    const shared = vi.fn(async () => 'a fini par bouder');
    const r = await translate('last turned sulky', 'en', 'fr', { shared, context: 'the Lory, who at last turned sulky' });
    expect(r).toMatchObject({ text: 'a fini par bouder', provider: 'deepl-shared' });
    expect(shared).toHaveBeenCalledWith({ text: 'last turned sulky', source_lang: 'EN', target_lang: 'FR', context: 'the Lory, who at last turned sulky' });
  });

  it('service partagé absent : MyMemory, sans avertissement ; quota atteint : avertissement', async () => {
    const absent = vi.fn(async () => {
      throw new SharedUnavailable('fonction « translate » non déployée', true);
    });
    expect(await translate('anxiously', 'en', 'fr', { shared: absent })).toMatchObject({ text: 'mymemory', provider: 'mymemory', fallbackReason: undefined });
    const quota = vi.fn(async () => {
      throw new SharedUnavailable('quota DeepL du mois atteint');
    });
    expect(await translate('sulky', 'en', 'fr', { shared: quota })).toMatchObject({ provider: 'mymemory', fallbackReason: 'quota DeepL du mois atteint' });
  });

  it('langue non prise en charge par DeepL : MyMemory directement', async () => {
    const shared = vi.fn(async () => 'x');
    expect(await translate('hola', 'xx', 'fr', { shared })).toMatchObject({ provider: 'mymemory' });
    expect(shared).not.toHaveBeenCalled();
  });
});
