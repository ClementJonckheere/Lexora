import { describe, expect, it } from 'vitest';
import { defaultLeaderboardName, ordinal, rankLeaderboard } from './leaderboard';

const row = (userId: string, name: string, xp: number, level: number) => ({ userId, language: 'en', name, xp, level, updatedAt: '' });

describe('classement', () => {
  it('trie par XP, ex æquo à la même position, ma ligne repérée', () => {
    const e = rankLeaderboard([row('a', 'Ana', 500, 4), row('b', 'Bob', 1200, 8), row('c', 'Cléo', 500, 4), row('d', 'Dan', 90, 1)], 'c');
    expect(e.map((x) => [x.name, x.position])).toEqual([['Bob', 1], ['Ana', 2], ['Cléo', 2], ['Dan', 4]]);
    expect(e.find((x) => x.me)?.name).toBe('Cléo');
    expect(e[0].rankName).toBe('Bronze');
  });
  it('ordinal et pseudo par défaut', () => {
    expect([ordinal(1), ordinal(2), ordinal(3)]).toEqual(['1er', '2e', '3e']);
    expect(defaultLeaderboardName('Clément Dupont', 'c@x.fr')).toBe('Clément');
    expect(defaultLeaderboardName('c@x.fr', 'clem@x.fr')).toBe('clem');
  });
});
