import { DatabaseError, type Database, type Driver, type ExecResult, type Queryable, type SqlValue } from './types';

/** Verrou asynchrone FIFO. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function wrapError(err: unknown, sql: string): DatabaseError {
  if (err instanceof DatabaseError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new DatabaseError(message, sql, { cause: err });
}

const WRITE_RE = /^\s*(insert|update|delete|replace|create|drop|alter|pragma\s+\w+\s*=)/i;

/** Construit une `Database` sérialisée et transactionnelle au-dessus d'un pilote. */
export function createDatabase(driver: Driver): Database {
  const mutex = new Mutex();

  const raw: Queryable = {
    async select<T>(sql: string, params: SqlValue[] = []) {
      try {
        return (await driver.select(sql, params)) as T[];
      } catch (err) {
        throw wrapError(err, sql);
      }
    },
    async execute(sql: string, params: SqlValue[] = []): Promise<ExecResult> {
      try {
        return await driver.execute(sql, params);
      } catch (err) {
        throw wrapError(err, sql);
      }
    },
  };

  return {
    kind: driver.kind,
    select<T>(sql: string, params?: SqlValue[]) {
      return mutex.run(() => raw.select<T>(sql, params));
    },
    execute(sql: string, params?: SqlValue[]) {
      return mutex.run(async () => {
        const res = await raw.execute(sql, params);
        if (WRITE_RE.test(sql)) driver.afterCommit?.();
        return res;
      });
    },
    transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return mutex.run(async () => {
        await raw.execute('BEGIN IMMEDIATE');
        try {
          const value = await fn(raw);
          await raw.execute('COMMIT');
          driver.afterCommit?.();
          return value;
        } catch (err) {
          try {
            await raw.execute('ROLLBACK');
          } catch {
            /* la transaction a pu être annulée par SQLite lui-même */
          }
          throw err;
        }
      });
    },
  };
}
