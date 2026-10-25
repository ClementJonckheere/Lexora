import { describe, expect, it } from 'vitest';
import { buildCloze, checkCloze } from './cloze';
import { categorize } from './categorize';
import { expressionKey, normalizeSearch } from './text';
import { parseBulk } from './bulkParse';
import { parseCsv, toCsv } from './csv';
import { validateNote, ValidationError } from './validation';
import { formatInterval, startOfStudyDay } from './dates';
import { sanitizeSettings } from './settings';

const blanked = (expr: string, sentence: string) =>
  buildCloze(expr, sentence)
    ?.parts.map((p) => (p.blank ? '___' : p.text))
    .join('');

describe('normalisation et doublons', () => {
  it('ignore casse, accents, « to » initial et ponctuation', () => {
    expect(expressionKey('To tackle an issue')).toBe('tackle an issue');
    expect(expressionKey('  tackle   an Issue. ')).toBe('tackle an issue');
    expect(expressionKey('To take for granted')).toBe(expressionKey('take for granted'));
    expect(normalizeSearch("S’attaquer à un problème")).toBe("s'attaquer a un probleme");
  });
});

describe('catégorisation automatique', () => {
  it.each([
    ['To tackle an issue', 'Expression verbale'],
    ['To figure out', 'Phrasal verb'],
    ['figure sth out', 'Phrasal verb'],
    ['To take for granted', 'Expression verbale'],
    ['To procrastinate', 'Verbe'],
    ['Serendipity', 'Mot'],
    ['In the long run', 'Expression'],
  ])('%s → %s', (expr, cat) => expect(categorize(expr)).toBe(cat));
});

describe('phrases à trous', () => {
  it("masque l'expression dans la phrase de l'utilisateur", () => {
    expect(blanked('To tackle an issue', 'We need to tackle this issue before it gets worse.')).toBe(
      'We need to ___ this ___ before it gets worse.',
    );
  });
  it('gère les formes fléchies et irrégulières', () => {
    expect(blanked('To figure out', "She finally figured it out.")).toBe('She finally ___ it ___.');
    expect(blanked('To take for granted', 'He took her support for granted.')).toBe('He ___ her support ___ ___.');
    expect(blanked('To tackle', 'They are tackling the backlog.')).toBe('They are ___ the backlog.');
  });
  it('se replie sur le mot principal', () => {
    expect(blanked('To tackle an issue', 'Tackle it now.')).toBe('___ it now.');
  });
  it("renvoie null si l'expression est absente", () => {
    expect(buildCloze('To tackle an issue', 'Nothing relevant here.')).toBeNull();
  });
  it('vérifie la réponse avec tolérance de forme', () => {
    const c = buildCloze('To tackle', 'We tackled it.')!;
    expect(checkCloze(c, 'tackled')).toBe('exact');
    expect(checkCloze(c, 'Tackle')).toBe('close');
    expect(checkCloze(c, 'solve')).toBe('wrong');
    const c2 = buildCloze('To figure out', 'I figured it out.')!;
    expect(checkCloze(c2, 'figured … out')).toBe('exact');
  });
});

describe('import par collage', () => {
  it('reconnaît plusieurs séparateurs', () => {
    const lines = parseBulk(
      [
        "To tackle an issue ; S'attaquer à un problème ; We need to tackle this issue.",
        'To figure out\tComprendre / trouver',
        'well-known - bien connu',
        'To take for granted = Considérer comme acquis',
        '# commentaire ignoré',
        'seulement un mot',
      ].join('\n'),
    );
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatchObject({ expression: 'To tackle an issue', translation: "S'attaquer à un problème", examples: ['We need to tackle this issue.'] });
    expect(lines[1]).toMatchObject({ expression: 'To figure out', translation: 'Comprendre / trouver' });
    expect(lines[2]).toMatchObject({ expression: 'well-known', translation: 'bien connu' });
    expect(lines[3].translation).toBe('Considérer comme acquis');
    expect(lines[4].error).toBeTruthy();
  });
});

describe('CSV', () => {
  it('aller-retour avec guillemets, séparateurs et retours ligne', () => {
    const rows = [
      ['a', 'b;c', 'd "quoted"'],
      ['multi\nline', '', 'é'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('détecte la virgule', () => {
    expect(parseCsv('x,y\n"1,5",2')).toEqual([
      ['x', 'y'],
      ['1,5', '2'],
    ]);
  });
});

describe('validation', () => {
  it('exige expression et traduction', () => {
    expect(() => validateNote({ expression: ' ', translation: 'x' })).toThrow(ValidationError);
    expect(() => validateNote({ expression: 'x', translation: '' })).toThrow(/traduction/);
  });
  it('nettoie exemples et tags', () => {
    const v = validateNote({ expression: ' To  go ', translation: 'aller', examples: ['', ' I go. ', 'I go.'], tags: ['A', 'a', ' b '] });
    expect(v).toMatchObject({ expression: 'To go', examples: ['I go.'], tags: ['A', 'b'] });
  });
});

describe('dates et réglages', () => {
  it('journée de révision basculant à 4 h', () => {
    const at3 = new Date(2026, 4, 10, 3, 0).getTime();
    const at5 = new Date(2026, 4, 10, 5, 0).getTime();
    expect(startOfStudyDay(at3, 4)).toBe(new Date(2026, 4, 9, 4).getTime());
    expect(startOfStudyDay(at5, 4)).toBe(new Date(2026, 4, 10, 4).getTime());
  });
  it('formate les intervalles', () => {
    expect(formatInterval(60_000)).toBe('1 min');
    expect(formatInterval(10 * 60_000)).toBe('10 min');
    expect(formatInterval(3 * 86_400_000)).toBe('3 j');
    expect(formatInterval(75 * 86_400_000)).toBe('2,5 mois');
  });
  it('borne les réglages invalides', () => {
    const s = sanitizeSettings({ newPerDay: -5, desiredRetention: 2, directions: 'xx' as never });
    expect(s.newPerDay).toBe(0);
    expect(s.desiredRetention).toBe(0.97);
    expect(s.directions).toBe('both');
  });
});

describe('univers multilingues', () => {
  const b = (expr: string, sentence: string, lang: string) =>
    buildCloze(expr, sentence, lang)
      ?.parts.map((p) => (p.blank ? '___' : p.text))
      .join('');
  it('phrases à trous : espagnol, allemand, russe (formes conjuguées)', () => {
    expect(b('Echar de menos', 'Echo de menos a mi familia.', 'es')).toBe('___ ___ ___ a mi familia.');
    expect(b('Bescheid sagen', 'Sag mir bitte Bescheid.', 'de')).toBe('Sag mir bitte ___.');
    expect(b('Обращать внимание', 'Обрати внимание на этот знак.', 'ru')).toBe('___ ___ на этот знак.');
  });
  it('phrases à trous : chinois et japonais (sans espaces)', () => {
    expect(b('马马虎虎', '我的中文马马虎虎。', 'zh')).toBe('我的中文___。');
    const c = buildCloze('马马虎虎', '我的中文马马虎虎。', 'zh')!;
    expect(checkCloze(c, '马马虎虎', 'zh')).toBe('exact');
    expect(checkCloze(c, '马虎', 'zh')).toBe('wrong');
  });
  it('catégorie et doublons selon la langue', () => {
    expect(categorize('马马虎虎', 'zh')).toBe('Expression');
    expect(categorize('猫', 'zh')).toBe('Mot');
    expect(categorize('Echar de menos', 'es')).toBe('Expression');
    expect(expressionKey('To go', 'es')).toBe('to go');
    expect(expressionKey('Año', 'es')).not.toBe(expressionKey('ano', 'es'));
  });
});
