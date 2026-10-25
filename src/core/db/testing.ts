import initSqlJs from 'sql.js';
import { createDatabase } from './database';
import { migrate } from './migrations';
import { createSqlJsDriver } from './sqljsDriver';
import type { Database } from './types';

/** Base SQLite en mémoire, migrée — pour les tests. */
export async function createMemoryDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = createDatabase(createSqlJsDriver(new SQL.Database(), 'memory'));
  await migrate(db);
  return db;
}
