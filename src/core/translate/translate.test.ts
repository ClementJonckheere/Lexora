import { describe, expect, it } from 'vitest';
import { myMemoryUrl, parseMyMemory, TranslationError } from './translate';
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
    expect(r).toEqual({ text: 'compagnon de voyage', alternatives: ['compagnon de route', 'co-voyageur'] });
  });

  it('quota atteint ou langue non prise en charge : message clair', () => {
    expect(() =>
      parseMyMemory({ responseStatus: 429, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } }, 'x'),
    ).toThrow(/Quota/);
    expect(() => parseMyMemory({ responseStatus: '403', responseData: { translatedText: "'XX' IS AN INVALID TARGET LANGUAGE" } }, 'x')).toThrow(TranslationError);
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
