import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import type { Driver, ExecResult, SqlValue } from './types';

/** Pilote sql.js (SQLite compilé en WebAssembly) : aperçu navigateur et tests. */
export function createSqlJsDriver(
  db: SqlJsDatabase,
  kind: 'browser' | 'memory',
  afterCommit?: () => void,
): Driver {
  db.run('PRAGMA foreign_keys = ON');
  return {
    kind,
    afterCommit,
    async select(sql: string, params: SqlValue[]) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    async execute(sql: string, params: SqlValue[]): Promise<ExecResult> {
      db.run(sql, params);
      const rowsAffected = db.getRowsModified();
      const res = db.exec('SELECT last_insert_rowid()');
      const lastInsertId = Number(res[0]?.values[0]?.[0] ?? 0);
      return { rowsAffected, lastInsertId };
    },
  };
}

export type { SqlJsStatic };
