import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaderboardRow } from '../progress/leaderboard';

/** Lecture et publication du classement (table `leaderboard`, supabase/schema.sql). */

interface Remote {
  user_id: string;
  language: string;
  display_name: string;
  xp: number;
  level: number;
  updated_at: string;
}

/** La table manque tant que supabase/schema.sql n'a pas été relancé. */
export class LeaderboardMissingError extends Error {
  constructor() {
    super('Classement indisponible : relancez supabase/schema.sql dans Supabase pour créer la table leaderboard.');
  }
}
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /leaderboard/.test(e.message ?? ''));

export async function fetchLeaderboard(client: SupabaseClient, language: string): Promise<LeaderboardRow[]> {
  const { data, error } = await client.from('leaderboard').select('user_id, language, display_name, xp, level, updated_at').eq('language', language);
  if (error) throw missing(error) ? new LeaderboardMissingError() : new Error(error.message);
  return ((data ?? []) as Remote[]).map((r) => ({ userId: r.user_id, language: r.language, name: r.display_name, xp: r.xp, level: r.level, updatedAt: r.updated_at }));
}

/** Publie ses lignes (une par langue) ; les langues absentes de `rows` sont retirées. */
export async function publishLeaderboard(client: SupabaseClient, userId: string, rows: readonly Omit<LeaderboardRow, 'userId' | 'updatedAt'>[]): Promise<void> {
  if (rows.length) {
    const { error } = await client
      .from('leaderboard')
      .upsert(rows.map((r) => ({ user_id: userId, language: r.language, display_name: r.name, xp: Math.round(r.xp), level: r.level, updated_at: new Date().toISOString() })));
    if (error) throw missing(error) ? new LeaderboardMissingError() : new Error(error.message);
  }
  const languages = rows.map((r) => r.language);
  let del = client.from('leaderboard').delete().eq('user_id', userId);
  if (languages.length) del = del.not('language', 'in', `(${languages.join(',')})`);
  const { error } = await del;
  if (error && !missing(error)) throw new Error(error.message);
}

/** Quitte le classement : supprime toutes ses lignes. */
export async function leaveLeaderboard(client: SupabaseClient, userId: string): Promise<void> {
  return publishLeaderboard(client, userId, []);
}
