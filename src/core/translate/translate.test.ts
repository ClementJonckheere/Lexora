import { describe, expect, it } from 'vitest';
import { deeplEndpoint, deeplError, deeplRequest, deeplSupports, myMemoryUrl, parseMyMemory, tidy, TranslationError } from './translate';
import { parseTatoeba, rankExamples, tatoebaUrl } from './examples';

describe('traduction (MyMemory)', () => {
  it('adresse de la requête', () => {
    const url = new URL(myMemoryUrl('fellow-passenger', 'en'));
    expect(url.host).toBe('api.mymemory.translated.net');
    expect(url.searchParams.get('q')).toBe('fellow-passenger');
    expect(url.searchParams.get('langpair')).toBe('en|fr');
    expect(new URL(myMemoryUrl('你好', 'zh')).searchParams.get('langpair')).toBe('zh-CN|fr');
  });

  it('traduction principale, variantes sans doublon, casse du texte d’origine', () => {
    const r = parseMyMemory(
      {
        responseStatus: 200,
        responseData: { translatedText: 'Compagnon de voyage', match: 0.99 },
        matches: [
          { translation: 'Compagnon de voyage', quality: '74' },
          { translation: 'compagnon de route', quality: '80' },
          { translation: 'fellow-passenger', quality: '70' },
          { translation: 'passager', quality: '0' },
          { translation: 'co-voyageur.', quality: '60' },
        ],
      },
      'fellow-passenger',
    );
    expect(r).toEqual({ text: 'compagnon de voyage', alternatives: ['compagnon de route', 'co-voyageur'], provider: 'mymemory' });
  });

  it('quota atteint ou langue non prise en charge : message clair', () => {
    expect(() =>
      parseMyMemory({ responseStatus: 429, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } }, 'x'),
    ).toThrow(/Quota/);
    expect(() => parseMyMemory({ responseStatus: '403', responseData: { translatedText: "'XX' IS AN INVALID TARGET LANGUAGE" } }, 'x')).toThrow(TranslationError);
  });
});

describe('fiabilité des traductions', () => {
  it('retire la ponctuation parasite (« anxieux.) »)', () => {
    expect(tidy('anxieux.)', 'anxiously')).toBe('anxieux');
    expect(tidy('« bonjour »', 'hello')).toBe('bonjour');
    expect(tidy('Quoi ?', 'What?')).toBe('Quoi ?');
  });

  it('écarte une entrée de mémoire qui ne correspond pas au texte demandé, préfère la traduction automatique', () => {
    const r = parseMyMemory(
      {
        responseStatus: 200,
        responseData: { translatedText: 'anxieux.)' },
        matches: [
          { segment: 'anxious.)', translation: 'anxieux.)', quality: '74', 'created-by': 'Anonymous' },
          { segment: 'anxiously', translation: 'anxieusement', quality: '70', 'created-by': 'MT!' },
        ],
      },
      'anxiously',
    );
    expect(r.text).toBe('anxieusement');
  });

  it('garde une entrée de mémoire exacte et de bonne qualité', () => {
    const r = parseMyMemory(
      {
        responseStatus: 200,
        responseData: { translatedText: 'x' },
        matches: [
          { segment: 'Take for granted', translation: 'considérer comme acquis', quality: '90', 'created-by': 'Translator' },
          { segment: 'take for granted', translation: 'prendre pour accordé', quality: '70', 'created-by': 'MT!' },
        ],
      },
      'take for granted',
    );
    expect(r.text).toBe('considérer comme acquis');
  });

  it('DeepL : serveur selon la clé, contexte de la phrase, erreurs lisibles', () => {
    expect(deeplEndpoint('abc:fx', 'translate')).toBe('https://api-free.deepl.com/v2/translate');
    expect(deeplEndpoint('abc', 'usage')).toBe('https://api.deepl.com/v2/usage');
    expect(deeplRequest('last turned sulky', 'en', 'fr', 'she had quite a long argument with the Lory, who at last turned sulky')).toEqual({
      text: ['last turned sulky'],
      source_lang: 'EN',
      target_lang: 'FR',
      context: 'she had quite a long argument with the Lory, who at last turned sulky',
    });
    expect(deeplRequest('hello', 'en', 'fr', 'hello')).not.toHaveProperty('context');
    expect(deeplSupports('zh')).toBe(true);
    expect(deeplSupports('xx')).toBe(false);
    expect(deeplError(456)).toMatch(/quota/);
    expect(deeplError(403)).toMatch(/clé/);
  });
});

describe('exemples (Tatoeba)', () => {
  const response = {
    paging: { Sentences: { count: 3 } },
    results: [
      {
        id: 1,
        text: 'Never take your health for granted.',
        lang: 'eng',
        translations: [[{ id: 2, text: 'Ne considère jamais ta santé comme acquise.', lang: 'fra' }], []],
      },
      { id: 3, text: 'We took it for granted that he would come.', lang: 'eng', translations: [[], [{ id: 4, text: 'Wir nahmen es als selbstverständlich.', lang: 'deu' }]] },
      { id: 5, text: 'Granted.', lang: 'eng', translations: [] },
      { id: 6, text: 'This sentence does not contain the expression at all, really.', lang: 'eng', translations: [] },
    ],
  };

  it('lit les phrases et leur traduction française', () => {
    const list = parseTatoeba(response);
    expect(list[0]).toEqual({ text: 'Never take your health for granted.', translation: 'Ne considère jamais ta santé comme acquise.' });
    expect(list[1].translation).toBeNull();
    expect(parseTatoeba({ data: [{ text: 'Hi.', translations: [{ text: 'Salut.', lang: 'fra' }] }] })).toEqual([{ text: 'Hi.', translation: 'Salut.' }]);
    expect(parseTatoeba(null)).toEqual([]);
  });

  it('ne garde que les phrases contenant l’expression (formes conjuguées comprises)', () => {
    const ranked = rankExamples(parseTatoeba(response), 'to take for granted', 'en');
    expect(ranked.map((s) => s.text)).toEqual(['Never take your health for granted.', 'We took it for granted that he would come.']);
  });

  it('adresse : expression exacte, langue en ISO 639-3', () => {
    const url = new URL(tatoebaUrl('take for granted', 'en', true)!);
    expect(url.searchParams.get('from')).toBe('eng');
    expect(url.searchParams.get('to')).toBe('fra');
    expect(url.searchParams.get('query')).toBe('="take for granted"');
    expect(tatoebaUrl('x', 'xx', false)).toBeNull();
  });
});
