import { describe, expect, it } from 'vitest';
import { languageToolCode, markIssues, parseLanguageTool } from './languageTool';

describe('LanguageTool', () => {
  const text = 'He go to work every days.';
  const response = {
    matches: [
      { message: 'Possible agreement error.', offset: 3, length: 2, replacements: [{ value: 'goes' }, { value: 'went' }], rule: { id: 'HE_VERB_AGR', issueType: 'grammar' } },
      { message: 'This sentence does not start with an uppercase letter.', offset: 0, length: 2, replacements: [], rule: { id: 'UPPERCASE_SENTENCE_START', issueType: 'typographical' } },
      { message: 'Use singular.', offset: 20, length: 4, replacements: [{ value: 'day' }], rule: { id: 'EVERY_NNS', issueType: 'grammar' } },
      { message: 'hors du texte', offset: 40, length: 3, replacements: [], rule: { id: 'X' } },
    ],
  };

  it('signalements lus et triés ; règles de pure présentation et positions invalides écartées', () => {
    const issues = parseLanguageTool(response, text);
    expect(issues.map((i) => [i.ruleId, i.replacements])).toEqual([
      ['HE_VERB_AGR', ['goes', 'went']],
      ['EVERY_NNS', ['day']],
    ]);
    expect(parseLanguageTool(null, text)).toEqual([]);
  });

  it('phrase découpée pour souligner les passages signalés', () => {
    const parts = markIssues(text, parseLanguageTool(response, text));
    expect(parts.map((p) => [p.text, !!p.issue])).toEqual([
      ['He ', false],
      ['go', true],
      [' to work every ', false],
      ['days', true],
      ['.', false],
    ]);
  });

  it('codes de langue', () => {
    expect(languageToolCode('en')).toBe('en-US');
    expect(languageToolCode('xx')).toBeNull();
  });
});
