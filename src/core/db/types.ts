/**
 * Abstraction minimale d'une base SQLite.
 *
 * Trois pilotes l'implémentent :
 *  - Tauri (production) : rusqlite côté Rust, une seule connexion ;
 *  - sql.js (aperçu navigateur), persistance IndexedDB ;
 *  - sql.js en mémoire (tests).
 *
 * Toutes les opérations sont sérialisées par un verrou asynchrone :
 * une transaction ouverte ne peut donc jamais être entrelacée avec
 * une autre requête.
 */

export type SqlValue = string | number | null;

export interface ExecResult {
  rowsAffected: number;
  lastInsertId: number;
}

export interface Queryable {
  select<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<ExecResult>;
}

export interface Database extends Queryable {
  readonly kind: 'tauri' | 'browser' | 'memory';
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

/** Pilote brut, non sérialisé. */
export interface Driver {
  readonly kind: Database['kind'];
  select(sql: string, params: SqlValue[]): Promise<Record<string, unknown>[]>;
  execute(sql: string, params: SqlValue[]): Promise<ExecResult>;
  /** Appelé après chaque écriture validée (persistance de l'aperçu navigateur). */
  afterCommit?(): void;
}

export class DatabaseError extends Error {
  constructor(message: string, readonly sql?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DatabaseError';
  }
}
