import { useMemo } from 'react';
import { useApp } from '@/app/store';
import { refineBands, type RefinedKnowledge } from '@/core/reading/calibration';
import { noteForms, supportsCoverage, type Knowledge } from '@/core/reading/coverage';
import type { FrequencyRanks } from '@/core/reading/level';

/**
 * Ce que vous connaissez du vocabulaire de la langue courante : test recalé par la lecture, marques, mots de vos notes.
 * `knowledge` est null tant que le test n'a pas été fait (ou pour le chinois et le japonais).
 */
export function useKnowledge(): { knowledge: Knowledge | null; refined: RefinedKnowledge | null; ranks: FrequencyRanks | null; language: string } {
  const language = useApp((s) => s.universe?.language ?? 'en');
  const test = useApp((s) => s.vocabTest);
  const marks = useApp((s) => s.wordMarks);
  const observations = useApp((s) => s.vocabObservations);
  const notes = useApp((s) => s.notes);
  const freq = useApp((s) => s.frequencyRanks);
  const forms = useMemo(() => noteForms(notes, language), [notes, language]);
  const refined = useMemo(() => (test ? refineBands(test.bands, test.answers, observations) : null), [test, observations]);
  const knowledge = useMemo(
    () => (refined && supportsCoverage(language) ? { bands: refined.bands, marks, noteForms: forms } : null),
    [refined, marks, forms, language],
  );
  return { knowledge, refined, ranks: freq?.language === language ? freq.ranks : null, language };
}
