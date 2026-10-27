import { describe, expect, it } from 'vitest';
import { chooseVoice, voicesFor, type VoiceLike } from './speech';

const v = (name: string, lang: string, localService = true): VoiceLike => ({ voiceURI: name, name, lang, localService });

// Voix typiques d'un Windows français avec quelques langues ajoutées.
const voices = [
  v('Microsoft Hortense', 'fr-FR'),
  v('Microsoft Zira', 'en-US'),
  v('Microsoft Hazel', 'en-GB'),
  v('Microsoft Sabina', 'es-MX'),
  v('Microsoft Helena', 'es-ES'),
  v('Microsoft Huihui', 'zh-CN'),
  v('Google español', 'es-ES', false),
  v('Microsoft Irina', 'ru_RU'),
];

describe('choix de la voix selon la langue de l’univers', () => {
  it('prend la variante régionale attendue en local', () => {
    expect(chooseVoice(voices, 'es')?.name).toBe('Microsoft Helena');
    expect(chooseVoice(voices, 'en')?.name).toBe('Microsoft Zira');
    expect(chooseVoice(voices, 'zh')?.name).toBe('Microsoft Huihui');
    expect(chooseVoice(voices, 'ru')?.name).toBe('Microsoft Irina');
  });
  it('respecte la voix choisie dans les réglages, si elle est de la bonne langue', () => {
    expect(chooseVoice(voices, 'es', 'Microsoft Sabina')?.name).toBe('Microsoft Sabina');
    expect(chooseVoice(voices, 'es', 'Microsoft Zira')?.name).toBe('Microsoft Helena');
  });
  it("n'utilise jamais une voix d'une autre langue", () => {
    expect(chooseVoice(voices, 'de')).toBeUndefined();
    expect(chooseVoice(voices, 'pt')).toBeUndefined();
    expect(voicesFor(voices, 'ja')).toEqual([]);
  });
  it('préfère une voix neuronale « Natural » quand il y en a une', () => {
    const withNatural = [...voices, v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false)];
    expect(chooseVoice(withNatural, 'en')?.name).toMatch(/Aria Online \(Natural\)/);
    expect(chooseVoice(withNatural, 'en', 'Microsoft Zira')?.name).toBe('Microsoft Zira');
  });
});
