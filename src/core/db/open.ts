import { createDatabase } from './database';
import { migrate } from './migrations';
import type { Database, Driver, ExecResult, SqlValue } from './types';
import { isTauri } from '../platform/env';

function createTauriDriver(): Driver {
  // Import dynamique : l'API Tauri n'existe pas dans l'aperçu navigateur.
  const invokeP = import('@tauri-apps/api/core').then((m) => m.invoke);
  return {
    kind: 'tauri',
    async select(sql: string, params: SqlValue[]) {
      const invoke = await invokeP;
      return invoke<Record<string, unknown>[]>('db_select', { sql, params });
    },
    async execute(sql: string, params: SqlValue[]) {
      const invoke = await invokeP;
      return invoke<ExecResult>('db_execute', { sql, params });
    },
  };
}

const IDB_NAME = 'lexora-preview';
const IDB_STORE = 'db';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get('main');
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(data: Uint8Array): Promise<void> {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, 'main');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Aperçu navigateur (npm run dev) : SQLite WebAssembly persisté dans IndexedDB. */
async function createBrowserDriver(): Promise<Driver> {
  const [{ default: initSqlJs }, { default: wasmUrl }, { createSqlJsDriver }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
    import('./sqljsDriver'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await idbGet().catch(() => null);
  const db = saved ? new SQL.Database(saved) : new SQL.Database();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      idbPut(db.export()).catch((err) => console.error('Persistance IndexedDB impossible', err));
    }, 250);
  };
  window.addEventListener('beforeunload', () => {
    clearTimeout(timer);
    void idbPut(db.export());
  });
  return createSqlJsDriver(db, 'browser', persist);
}

/** Ouvre la base de l'environnement courant et applique les migrations. */
export async function openDatabase(): Promise<Database> {
  const driver = isTauri() ? createTauriDriver() : await createBrowserDriver();
  const db = createDatabase(driver);
  await migrate(db);
  return db;
}
