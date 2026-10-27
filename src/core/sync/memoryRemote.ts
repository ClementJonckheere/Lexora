import type { Remote } from './engine';
import type { RemoteRow, SyncTable } from './tables';

/**
 * Serveur simulé en mémoire, avec les mêmes règles que le schéma PostgreSQL :
 * « la plus récente gagne » (updated_at) et horodatage serveur strictement croissant.
 * Sert aux tests du moteur de synchronisation.
 */
export class MemoryRemote implements Remote {
  private tables = new Map<string, Map<string, RemoteRow>>();
  private clock = 1_000_000;

  private table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  rows(name: string): RemoteRow[] {
    return [...this.table(name).values()];
  }

  async push(table: SyncTable, rows: RemoteRow[]): Promise<void> {
    const t = this.table(table.name);
    for (const r of rows) {
      const key = String(r[table.key]);
      const old = t.get(key);
      if (old && Number(old.updated_at) > Number(r.updated_at)) continue;
      t.set(key, { ...structuredClone(r), server_updated_at: ++this.clock });
    }
  }

  async pull(table: SyncTable, since: number, afterKey: string, limit: number): Promise<RemoteRow[]> {
    return this.rows(table.name)
      .filter((r) => {
        const ts = Number(r.server_updated_at);
        return ts > since || (ts === since && String(r[table.key]) > afterKey);
      })
      .sort((a, b) => Number(a.server_updated_at) - Number(b.server_updated_at) || (String(a[table.key]) < String(b[table.key]) ? -1 : 1))
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }
}
