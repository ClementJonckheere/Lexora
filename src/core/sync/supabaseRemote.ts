import type { SupabaseClient } from '@supabase/supabase-js';
import type { Remote } from './engine';
import type { RemoteRow, SyncTable } from './tables';

/**
 * Serveur Supabase (PostgreSQL + Row Level Security).
 * Chaque utilisateur ne voit et n'écrit que ses lignes (politiques RLS sur user_id = auth.uid()).
 */
export class SupabaseRemote implements Remote {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}

  async push(table: SyncTable, rows: RemoteRow[]): Promise<void> {
    const payload = rows.map((r) => ({ ...r, user_id: this.userId }));
    const onConflict = table.key === 'id' ? 'id' : `user_id,${table.key}`;
    const { error } = await this.client.from(table.name).upsert(payload, { onConflict });
    if (error) throw new Error(`Envoi (${table.name}) : ${error.message}`);
  }

  async pull(table: SyncTable, since: number, afterKey: string, limit: number): Promise<RemoteRow[]> {
    let query = this.client
      .from(table.name)
      .select([...table.columns, 'server_updated_at'].join(','))
      .eq('user_id', this.userId)
      .order('server_updated_at', { ascending: true })
      .order(table.key, { ascending: true })
      .limit(limit);
    // Pagination par jeu de clés : (server_updated_at, clé) > (since, afterKey).
    query = afterKey
      ? query.or(`server_updated_at.gt.${since},and(server_updated_at.eq.${since},${table.key}.gt.${afterKey})`)
      : query.gt('server_updated_at', since);
    const { data, error } = await query;
    if (error) throw new Error(`Réception (${table.name}) : ${error.message}`);
    return (data ?? []) as unknown as RemoteRow[];
  }
}
