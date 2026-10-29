import { describe, expect, it } from 'vitest';
import type { Exercise } from './exercises';
import { ITEMS_PER_POINT, placementItem, placementItems } from './placementBank';

const ex = (id: number, en: string, rest: Partial<Exercise>): Exercise => ({ id: `x:${id}`, en, fr: 'traduction', before: '', after: '', answer: '', ...rest });

describe('banque du placement', () => {
  it('verbe en indice : réponse tapée, sans propositions', () => {
    const q = placementItem(
      'first-conditional',
      ex(1, 'If it rains tomorrow, we will stay at home.', { answer: 'rains', hint: 'rain', choices: ['rains', 'will rain'] }),
    )!;
    expect(q).toMatchObject({ mode: 'typed', answer: 'rains', hint: 'rain', targetId: 'first-conditional', evidenceId: 'tatoeba:1', status: 'généré' });
    expect(q.options).toBeUndefined();
  });

  it('mots-outils : choix élargi par un distracteur sûrement faux', () => {
    const q = placementItem('for-since', ex(2, 'We have been here for three weeks.', { answer: 'for', choices: ['for', 'since'] }))!;
    expect(q).toMatchObject({ mode: 'choice', choices: 3 });
    expect(q.options?.sort()).toEqual(['during', 'for', 'since']);
    expect(placementItem('quantifiers', ex(3, 'I have only a few friends here.', { answer: 'a few', choices: ['a few', 'a little'] }))!.choices).toBe(4);
    expect(placementItem('deduction-present', ex(4, 'You must be very tired after that.', { answer: 'must', choices: ['must', "can't"] }))!.options).toContain(
      "mustn't",
    );
  });

  it('écarte les phrases sans contexte, les réponses multiples et ce qui teste un autre point', () => {
    expect(placementItem('present-perfect', ex(5, 'We have read.', { answer: 'have read', hint: 'read' }))).toBeNull();
    expect(placementItem('present-perfect', ex(6, 'I have seen that film with my brother.', { answer: 'have seen', hint: 'see', accept: ['saw'] }))).toBeNull();
    expect(
      placementItem('third-conditional', ex(7, 'If I knew his number, I would call him.', { answer: 'knew', hint: 'know', form: 'present-unreal' })),
    ).toBeNull();
    expect(placementItem('perfect-continuous', ex(8, 'I have been working in the garden.', { answer: 'have been working', hint: 'work' }))).toBeNull();
    expect(placementItem('perfect-continuous', ex(9, 'I have been working here since May.', { answer: 'have been working', hint: 'work' }))).not.toBeNull();
  });

  it('au plus 8 questions par point, natures alternées, déterministe', () => {
    const bank = Array.from({ length: 30 }, (_, i) =>
      ex(100 + i, `If it rains number ${i} we will stay at home tonight.`, {
        answer: i % 3 ? 'rains' : 'will stay',
        hint: 'rain',
        form: i % 3 ? 'present' : 'will',
      }),
    );
    const items = placementItems('first-conditional', bank);
    expect(items).toHaveLength(ITEMS_PER_POINT);
    expect(items.filter((q) => q.answer === 'will stay').length).toBe(4);
    expect(placementItems('first-conditional', bank)).toEqual(items);
    expect(placementItems('first-conditional', bank, new Set(items.map((q) => q.id.replace(/^placement:first-conditional:/, ''))))).not.toContainEqual(
      items[0],
    );
  });
});
