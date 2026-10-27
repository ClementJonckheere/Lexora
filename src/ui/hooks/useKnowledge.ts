import { useMemo } from 'react';
import { useApp } from '@/app/store';
import { noteForms, supportsCoverage, type Knowledge } from '@/core/reading/coverage';
import type { FrequencyRanks } from '@/core/reading/level';

/**
 * Ce que vous connaissez du vocabulaire de la langue courante : test, marques, mots de vos notes.
 * `knowledge` est null tant que le test n'a pas été fait (ou pour le chinois et le japonais).
 */
export function useKnowledge(): {
  knowledge: Knowledge | null;
  ranks: FrequencyRanks | null;
  language: string;
} {
  const language = useApp((s) => s.universe?.language ?? 'en');
  const test = useApp((s) => s.vocabTest);
  const marks = useApp((s) => s.wordMarks);
  const notes = useApp((s) => s.notes);
  const freq = useApp((s) => s.frequencyRanks);
  const forms = useMemo(() => noteForms(notes, language), [notes, language]);
  const knowledge = useMemo(() => (test && supportsCoverage(language) ? { bands: test.bands, marks, noteForms: forms } : null), [test, marks, forms, language]);
  return {
    knowledge,
    ranks: freq?.language === language ? freq.ranks : null,
    language,
  };
}
