import { useMemo } from 'react';
import { useApp } from '@/app/store';
import type { GrammarAnswer } from '@/core/learn/progress';
import { lessonReview, type LessonReview } from '@/core/learn/review';

/** Réponses de chaque leçon. */
export function answersByLesson(answers: GrammarAnswer[]): Map<string, GrammarAnswer[]> {
  const by = new Map<string, GrammarAnswer[]>();
  for (const a of answers) by.set(a.lessonId, [...(by.get(a.lessonId) ?? []), a]);
  return by;
}

/** État de révision de chaque leçon commencée, et les leçons à réviser maintenant. */
export function useLessonReviews(): { of: (lessonId: string) => LessonReview; due: string[] } {
  const answers = useApp((s) => s.grammarAnswers);
  return useMemo(() => {
    const now = Date.now();
    const reviews = new Map<string, LessonReview>();
    for (const [id, list] of answersByLesson(answers)) reviews.set(id, lessonReview(list, now));
    const empty = lessonReview([], now);
    return {
      of: (id: string) => reviews.get(id) ?? empty,
      due: [...reviews].filter(([, r]) => r.due).map(([id]) => id),
    };
  }, [answers]);
}
