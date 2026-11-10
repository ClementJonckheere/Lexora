import { describe, expect, it } from 'vitest';
import { classifyAnswer, errorTrend, typoDistance } from './errorKind';
import { sameWord } from './errorRules';

const kind = (expected: string | string[], typed: string, language = 'en') => classifyAnswer(expected, typed, language)?.kind ?? null;

describe('retour par type d’erreur', () => {
  it('juste : pas de retour (casse, ponctuation, « to » initial et « sth » ignorés)', () => {
    expect(classifyAnswer('to tackle an issue', 'Tackle an issue!')).toBeNull();
    expect(classifyAnswer('to take sth for granted', 'take for granted')).toBeNull();
    expect(classifyAnswer(['went', 'has gone'], 'has gone')).toBeNull();
  });

  it('faute de frappe : une lettre (deux pour un mot long), inversion comprise', () => {
    expect(kind('to tackle an issue', 'tackel an issue')).toBe('typo');
    expect(kind('to figure out', 'figur out')).toBe('typo');
    expect(kind('nevertheless', 'nevertheles')).toBe('typo');
    expect(typoDistance('tackle', 'tackel')).toBe(1);
    expect(classifyAnswer('to tackle an issue', 'tackel an issue')!.message).toBe('Faute de frappe : « tackle » attendu (vous : « tackel »).');
  });

  it('préposition : différente, oubliée ou en trop', () => {
    expect(kind('to depend on', 'depend of')).toBe('preposition');
    expect(kind('to listen to', 'listen')).toBe('preposition');
    expect(kind('to discuss', 'discuss about')).toBe('preposition');
    expect(classifyAnswer('to depend on', 'depend of')!.message).toBe('Préposition ou particule : « on » attendu (vous : « of »).');
    expect(kind('compter sur', 'compter de', 'fr')).toBe('preposition');
  });

  it('forme du mot : conjugaison, nombre, irrégulier régularisé', () => {
    expect(kind('has gone', 'has went')).toBe('form');
    expect(kind('took', 'take')).toBe('form');
    expect(kind('studies', 'study')).toBe('form');
    expect(kind('stopped', 'stop')).toBe('form');
    const fb = classifyAnswer('took', 'taked')!;
    expect(fb.kind).toBe('form');
    expect(fb.tip).toMatch(/irrégulier/);
    expect(kind('hablamos', 'hablo', 'es')).toBe('form');
  });

  it('article, mot oublié ou en trop, ordre des mots, autre expression', () => {
    expect(kind('to have a look', 'have look')).toBe('article');
    expect(kind('to take for granted', 'take granted')).toBe('preposition');
    expect(kind('to give up smoking', 'give smoking')).toBe('preposition');
    expect(kind('to keep track of', 'keep of')).toBe('missing');
    expect(kind('to give up', 'give up really')).toBe('extra');
    expect(kind('to look forward to', 'forward look to')).toBe('order');
    expect(kind('to tackle an issue', 'solve the problem')).toBe('other');
    expect(classifyAnswer('to tackle an issue', 'solve the problem')!.message).toBe('Autre mot : réponse « tackle an issue » (vous : « solve the problem »).');
  });

  it('plusieurs réponses acceptées : la plus proche', () => {
    expect(classifyAnswer(['to figure out', 'to work out'], 'work ot')!.message).toBe('Faute de frappe : « out » attendu (vous : « ot »).');
  });

  it('formes d’un même mot (règles par langue)', () => {
    expect(sameWord('figured', 'figure', 'en')).toBe(true);
    expect(sameWord('went', 'gone', 'en')).toBe(true);
    expect(sameWord('cat', 'cut', 'en')).toBe(false);
    expect(sameWord('mangeons', 'mangez', 'fr')).toBe(true);
  });
});

describe('erreurs par type : tendance', () => {
  it('30 derniers jours contre les 30 précédents, dernier exemple, types triés', () => {
    const now = 100 * 86_400_000;
    const e = (kind: 'typo' | 'preposition', daysAgo: number, given = 'x') => ({ kind, expected: 'on', given, createdAt: now - daysAgo * 86_400_000 });
    const t = errorTrend([e('preposition', 40), e('preposition', 45), e('preposition', 5, 'of'), e('typo', 2), e('typo', 3), e('typo', 70)], now);
    expect(t).toEqual([
      { kind: 'typo', recent: 2, previous: 0, example: { expected: 'on', given: 'x' } },
      { kind: 'preposition', recent: 1, previous: 2, example: { expected: 'on', given: 'of' } },
    ]);
  });
});
