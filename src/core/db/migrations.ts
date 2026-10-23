import type { Database } from './types';

/**
 * Migrations versionnées. La version courante est stockée dans
 * `PRAGMA user_version`. Une migration publiée ne doit JAMAIS être modifiée :
 * toute évolution du schéma passe par une nouvelle entrée.
 *
 * Conventions : dates en millisecondes epoch (INTEGER), booléens 0/1.
 */
export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'schéma initial',
    statements: [
      `CREATE TABLE notes (
        id              INTEGER PRIMARY KEY,
        expression      TEXT    NOT NULL CHECK (length(trim(expression)) > 0),
        translation     TEXT    NOT NULL CHECK (length(trim(translation)) > 0),
        expression_key  TEXT    NOT NULL,
        comment         TEXT    NOT NULL DEFAULT '',
        category        TEXT    NOT NULL DEFAULT '',
        category_auto   INTEGER NOT NULL DEFAULT 1,
        is_favorite     INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_notes_key ON notes(expression_key)`,
      `CREATE INDEX idx_notes_created ON notes(created_at)`,

      `CREATE TABLE examples (
        id        INTEGER PRIMARY KEY,
        note_id   INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        sentence  TEXT    NOT NULL,
        position  INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX idx_examples_note ON examples(note_id, position)`,

      `CREATE TABLE tags (
        id    INTEGER PRIMARY KEY,
        name  TEXT NOT NULL UNIQUE COLLATE NOCASE
      )`,
      `CREATE TABLE note_tags (
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        PRIMARY KEY (note_id, tag_id)
      )`,
      `CREATE INDEX idx_note_tags_tag ON note_tags(tag_id)`,

      `CREATE TABLE collections (
        id           INTEGER PRIMARY KEY,
        name         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        description  TEXT    NOT NULL DEFAULT '',
        created_at   INTEGER NOT NULL
      )`,
      `CREATE TABLE collection_notes (
        collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        note_id       INTEGER NOT NULL REFERENCES notes(id)       ON DELETE CASCADE,
        added_at      INTEGER NOT NULL,
        PRIMARY KEY (collection_id, note_id)
      )`,
      `CREATE INDEX idx_collection_notes_note ON collection_notes(note_id)`,

      // Une fiche de mémorisation par note et par direction. Champs = carte FSRS.
      `CREATE TABLE cards (
        id              INTEGER PRIMARY KEY,
        note_id         INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        direction       TEXT    NOT NULL CHECK (direction IN ('fr_en', 'en_fr')),
        state           INTEGER NOT NULL DEFAULT 0,
        due             INTEGER NOT NULL,
        stability       REAL    NOT NULL DEFAULT 0,
        difficulty      REAL    NOT NULL DEFAULT 0,
        elapsed_days    INTEGER NOT NULL DEFAULT 0,
        scheduled_days  INTEGER NOT NULL DEFAULT 0,
        learning_steps  INTEGER NOT NULL DEFAULT 0,
        reps            INTEGER NOT NULL DEFAULT 0,
        lapses          INTEGER NOT NULL DEFAULT 0,
        last_review     INTEGER,
        UNIQUE (note_id, direction)
      )`,
      `CREATE INDEX idx_cards_due ON cards(state, due)`,

      // Historique des révisions validées (planifiées par FSRS). État AVANT la réponse.
      `CREATE TABLE review_logs (
        id                 INTEGER PRIMARY KEY,
        card_id            INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        rating             INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
        state              INTEGER NOT NULL,
        due                INTEGER NOT NULL,
        stability          REAL    NOT NULL,
        difficulty         REAL    NOT NULL,
        elapsed_days       INTEGER NOT NULL,
        last_elapsed_days  INTEGER NOT NULL,
        scheduled_days     INTEGER NOT NULL,
        learning_steps     INTEGER NOT NULL,
        reviewed_at        INTEGER NOT NULL,
        duration_ms        INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX idx_review_logs_card ON review_logs(card_id, reviewed_at)`,
      `CREATE INDEX idx_review_logs_time ON review_logs(reviewed_at)`,

      // Entraînement libre (phrases à trous, aléatoire, difficiles) : n'affecte jamais la planification.
      `CREATE TABLE practice_logs (
        id          INTEGER PRIMARY KEY,
        note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        mode        TEXT    NOT NULL CHECK (mode IN ('cloze', 'random', 'difficult')),
        rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
        created_at  INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_practice_logs_note ON practice_logs(note_id)`,

      `CREATE TABLE settings (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
      )`,
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function getSchemaVersion(db: Database): Promise<number> {
  const rows = await db.select<{ user_version: number }>('PRAGMA user_version');
  return Number(rows[0]?.user_version ?? 0);
}

/** Applique les migrations manquantes, chacune dans sa propre transaction. */
export async function migrate(db: Database, migrations: Migration[] = MIGRATIONS): Promise<number> {
  let current = await getSchemaVersion(db);
  if (current > migrations[migrations.length - 1].version) {
    throw new Error(
      `La base de données (v${current}) provient d'une version plus récente de Lexora. Mettez l'application à jour.`,
    );
  }
  for (const m of migrations) {
    if (m.version <= current) continue;
    await db.transaction(async (tx) => {
      for (const sql of m.statements) await tx.execute(sql);
      await tx.execute(`PRAGMA user_version = ${m.version}`);
    });
    current = m.version;
  }
  return current;
}
