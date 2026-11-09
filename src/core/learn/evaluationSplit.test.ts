import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVALUATION_SHARE, isEvaluationSentence, tatoebaSentenceId } from './evaluationSplit';

const DIR = 'public/grammar/en';
const bankFiles = (sub: string) =>
  existsSync(`${DIR}/${sub}`) ? readdirSync(`${DIR}/${sub}`).filter((f) => f.endsWith('.json') && !['index.json', 'excluded.json'].includes(f)) : [];
const items = (file: string) => (JSON.parse(readFileSync(file, 'utf8')).items ?? []) as { id: string; evidenceId?: string }[];
/** Phrases Tatoeba d'un ensemble de banques, avec un exemple d'exercice qui les emploie. */
function sentences(files: string[], idOf: (i: { id: string; evidenceId?: string }) => string = (i) => i.id): Map<number, string> {
  const out = new Map<number, string>();
  for (const f of files)
    for (const i of items(f)) {
      const n = tatoebaSentenceId(idOf(i));
      if (n !== null && !out.has(n)) out.set(n, `${f.replace(`${DIR}/`, '')} ${i.id}`);
    }
  return out;
}

describe('séparation entraînement / évaluation', () => {
  it('stable et proportionnée : une phrase sur cinq, toujours la même', () => {
    let n = 0;
    for (let id = 1; id <= 100_000; id++) if (isEvaluationSentence(id)) n++;
    expect(n / 100_000).toBeGreaterThan(1 / EVALUATION_SHARE - 0.01);
    expect(n / 100_000).toBeLessThan(1 / EVALUATION_SHARE + 0.01);
    expect(isEvaluationSentence(255914)).toBe(isEvaluationSentence(255914));
  });

  it('identifiant de phrase : exercices, questions, preuves ; rien pour une phrase rédigée', () => {
    expect(tatoebaSentenceId('present-perfect:1234')).toBe(1234);
    expect(tatoebaSentenceId('placement:be:be:255914')).toBe(255914);
    expect(tatoebaSentenceId('tatoeba:42')).toBe(42);
    expect(tatoebaSentenceId('placement:adjectives:written:adjectives:1')).toBeNull();
    expect(tatoebaSentenceId('written:mixed-conditionals:3')).toBeNull();
  });
});

describe('banques livrées : aucune phrase partagée entre exercices et évaluation', () => {
  const training = sentences(bankFiles('exercises').map((f) => `${DIR}/exercises/${f}`));
  const evaluation = new Map([
    ...sentences([...bankFiles('evaluation').map((f) => `${DIR}/evaluation/${f}`), ...bankFiles('placement').map((f) => `${DIR}/placement/${f}`)]),
    ...sentences([`${DIR}/placement.json`], (i) => i.evidenceId ?? i.id),
  ]);

  it('les exercices n’emploient que des phrases d’entraînement', () => {
    expect([...training].filter(([n]) => isEvaluationSentence(n)).map(([, where]) => where).slice(0, 20)).toEqual([]);
  });

  it('placement, mini-tests et banques d’évaluation n’emploient que des phrases d’évaluation', () => {
    expect([...evaluation].filter(([n]) => !isEvaluationSentence(n)).map(([, where]) => where).slice(0, 20)).toEqual([]);
  });

  it('aucune phrase dans les deux ensembles', () => {
    expect([...training.keys()].filter((n) => evaluation.has(n)).map((n) => `${n} : ${training.get(n)} / ${evaluation.get(n)}`).slice(0, 20)).toEqual([]);
    expect(training.size).toBeGreaterThan(1000);
    expect(evaluation.size).toBeGreaterThan(100);
  });
});
