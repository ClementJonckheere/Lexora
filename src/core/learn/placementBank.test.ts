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
      // Phrases sans suite de trois mots commune : deux questions d'un point ne répètent pas la même phrase-type.
      ex(100 + i, `Z${String.fromCharCode(97 + i)}q y${String.fromCharCode(97 + i)}w rains x${String.fromCharCode(97 + i)}v t${String.fromCharCode(97 + i)}u tonight.`, {
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

  it('relecture : repères exigés, try écarté, until + nom refusé, was admis à côté de were, débuts de phrase variés', () => {
    expect(placementItem('present-perfect', ex(1, 'Mary has arrived on time today.', { answer: 'has arrived', hint: 'arrive' }))).toBeNull();
    expect(placementItem('present-perfect', ex(2, 'Mary has already arrived at work.', { answer: 'has arrived', hint: 'arrive' }))).not.toBeNull();
    expect(placementItem('perfect-vs-past', ex(3, 'He has come home just now.', { answer: 'has come', choices: ['has come', 'came'] }))).toBeNull();
    expect(placementItem('past-perfect', ex(4, 'No one had seen anything at all.', { answer: 'had seen', hint: 'see' }))).toBeNull();
    expect(placementItem('past-perfect', ex(5, 'When we arrived, the film had started.', { answer: 'had started', hint: 'start' }))).not.toBeNull();
    expect(placementItem('perfect-continuous', ex(6, 'Tom has been watching TV all day long.', { answer: 'has been watching', hint: 'watch' }))).toBeNull();
    expect(placementItem('gerund-infinitive-meaning', ex(7, 'We tried to cheer him up after that.', { answer: 'to cheer', choices: ['to cheer', 'cheering'] }))).toBeNull();
    expect(placementItem('first-conditional', ex(8, "I'll see if I can find a map for you.", { answer: 'will see', choices: ['will see', 'see'] }))).toBeNull();
    expect(placementItem('time-clauses', ex(9, 'We will stay here until the end of it.', { answer: 'will stay', choices: ['will stay', 'stay'] }))).toBeNull();
    expect(placementItem('time-clauses', ex(10, 'Do you know when it shuts on Sundays?', { answer: 'shuts', choices: ['shuts', 'will shut'] }))).toBeNull();
    expect(placementItem('countables', ex(11, 'Does it snow much here in winter?', { before: 'Does it snow ', after: ' here in winter?', answer: 'much', choices: ['much', 'many'] }))).toBeNull();
    const wish = placementItem('wish', ex(12, 'I wish it were that easy for me.', { before: 'I wish it ', after: ' that easy for me.', answer: 'were', hint: 'be' }));
    expect(wish?.accept).toEqual(['was']);
    // « If I were you » une seule fois tant que la banque offre d'autres phrases.
    const ifYou = Array.from({ length: 6 }, (_, i) => ex(200 + i, `If I were you, I would wait for ${'abcdef'[i]}x.`, { answer: 'would wait', hint: 'wait', form: 'would' }));
    const others = Array.from({ length: 8 }, (_, i) => ex(300 + i, `Q${'abcdefgh'[i]} w${'abcdefgh'[i]} would go if r${'abcdefgh'[i]} came.`, { answer: 'would go', hint: 'go', form: 'would' }));
    const chosen = placementItems('second-conditional', [...ifYou, ...others]);
    expect(chosen.filter((q) => Number(q.evidenceId!.split(':')[1]) < 300)).toHaveLength(1);
  });
});
