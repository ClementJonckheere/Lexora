import { useMemo } from 'react';
import { buildCloze } from '@/core/domain/cloze';

/** Phrase d'exemple avec l'expression mise en évidence (formes fléchies incluses). */
export function Example({ sentence, expression, language }: { sentence: string; expression: string; language: string }) {
  const cloze = useMemo(() => buildCloze(expression, sentence, language), [expression, sentence, language]);
  return (
    <p className="example" lang={language}>
      {cloze ? cloze.parts.map((p, i) => (p.blank ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>)) : sentence}
    </p>
  );
}
