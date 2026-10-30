import { rankFor } from './xp';

/**
 * Classement (page Statistiques) : chaque participant publie, par langue, son XP, son niveau et son rang (table
 * Supabase `leaderboard`, lisible par tous les comptes connectés, chacun n'écrivant que ses lignes). La participation
 * est volontaire et le nom affiché est un pseudo choisi.
 */

export interface LeaderboardRow {
  userId: string;
  language: string;
  name: string;
  xp: number;
  level: number;
  updatedAt: string;
}

export interface LeaderboardEntry extends LeaderboardRow {
  /** Position (1 = premier) ; les ex æquo partagent la même. */
  position: number;
  rankName: string;
  rankId: string;
  me: boolean;
}

/** Trie par XP et numérote : deux XP égales ont la même position (1, 2, 2, 4). */
export function rankLeaderboard(rows: readonly LeaderboardRow[], myId: string | null): LeaderboardEntry[] {
  const sorted = [...rows].sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, 'fr'));
  let position = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.xp !== sorted[i - 1].xp) position = i + 1;
    const rank = rankFor(r.level);
    return { ...r, position, rankName: rank.name, rankId: rank.id, me: r.userId === myId };
  });
}

/** « 1er », « 2e », « 3e »… */
export function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`;
}

/** Pseudo par défaut : le prénom du compte Google, sinon le début de l'adresse. */
export function defaultLeaderboardName(accountName: string, email: string): string {
  const first = accountName.trim().split(/\s+/)[0];
  return (first && !first.includes('@') ? first : email.split('@')[0]).slice(0, 30);
}
