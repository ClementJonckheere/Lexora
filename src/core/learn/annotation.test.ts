import { describe, expect, it } from 'vitest';
import { collectCandidates, exportAnnotations, precisionOf, TARGET_ANNOTATIONS, type Verdict } from './annotation';

const verdicts = (ok: number, ko: number): Record<string, Verdict> =>
  Object.fromEntries([...Array(ok + ko).keys()].map((i) => [`k${i}`, { v: i < ok ? 1 : 0, s: 's', m: [0, 1] } as Verdict]));

describe('annotation du repérage', () => {
  const paragraphs = ['She was tired. He was reading. They were reading too.', 'It was interesting. We were reading.', 'She was tired.'];

  it('correspondances sans doublon, phrase par phrase, positions dans la phrase', () => {
    const c = collectCandidates('past-continuous', paragraphs);
    expect(c.map((x) => x.sentence.slice(x.start, x.end)).sort()).toEqual(['was interesting', 'was reading', 'were reading', 'were reading']); // « was interesting » : faux positif à juger
    expect(new Set(c.map((x) => x.key)).size).toBe(c.length);
  });

  it('ordre aléatoire mais reproductible', () => {
    expect(collectCandidates('was-were', paragraphs)).toEqual(collectCandidates('was-were', paragraphs));
  });

  it('précision, borne basse, et surlignage seulement avec assez de jugements au-dessus de 90 %', () => {
    expect(precisionOf(undefined)).toMatchObject({ n: 0, precision: null, highlight: false });
    expect(precisionOf(verdicts(10, 0))).toMatchObject({ precision: 1, enough: false, highlight: false });
    const good = precisionOf(verdicts(TARGET_ANNOTATIONS - 2, 2));
    expect(good.enough && good.highlight).toBe(true);
    expect(good.lower!).toBeLessThan(good.precision!);
    expect(precisionOf(verdicts(40, 10)).highlight).toBe(false);
  });

  it('export : précision par point et jugements bruts', () => {
    const e = exportAnnotations({ passive: verdicts(3, 1) }, 'en', 0);
    expect(e.points.passive).toMatchObject({ n: 4, correct: 3, precision: 0.75 });
    expect(Object.keys(e.annotations.passive)).toHaveLength(4);
  });
});
