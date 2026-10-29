import type { Database, Queryable } from './types';
import { MIGRATION_V2 } from './migrationV2';

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
  /** Transformation de données éventuelle, exécutée après les instructions, dans la même transaction. */
  run?: (tx: Queryable) => Promise<void>;
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

MIGRATIONS.push(MIGRATION_V2, {
  version: 3,
  name: 'suspension des notes, plafond de nouveaux mots par univers',
  statements: [
    'ALTER TABLE notes ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE universes ADD COLUMN new_per_day INTEGER',
  ],
}, {
  version: 4,
  name: 'espace lecture : livres, textes téléchargés, niveaux estimés',
  statements: [
    // Livres de l'utilisateur et position de lecture (synchronisés).
    `CREATE TABLE books (
      book_key      TEXT PRIMARY KEY,
      universe_id   TEXT    NOT NULL,
      title         TEXT    NOT NULL,
      authors       TEXT    NOT NULL DEFAULT '[]',
      language      TEXT    NOT NULL,
      cover_url     TEXT    NOT NULL DEFAULT '',
      text_url      TEXT    NOT NULL,
      level         TEXT    NOT NULL DEFAULT '',
      chapter       INTEGER NOT NULL DEFAULT 0,
      block         INTEGER NOT NULL DEFAULT 0,
      progress      REAL    NOT NULL DEFAULT 0,
      added_at      INTEGER NOT NULL,
      last_read_at  INTEGER,
      updated_at    INTEGER NOT NULL,
      deleted       INTEGER NOT NULL DEFAULT 0,
      dirty         INTEGER NOT NULL DEFAULT 1
    )`,
    'CREATE INDEX idx_books_universe ON books(universe_id, deleted)',
    // Texte mis en forme et couverture, propres à cet appareil (re-téléchargeables).
    `CREATE TABLE book_texts (
      book_key    TEXT PRIMARY KEY,
      content     TEXT    NOT NULL,
      cover       TEXT    NOT NULL DEFAULT '',
      fetched_at  INTEGER NOT NULL
    )`,
    // Niveaux estimés des livres du catalogue (cache local).
    `CREATE TABLE book_levels (
      book_key         TEXT PRIMARY KEY,
      level            TEXT    NOT NULL,
      vocab_rank       INTEGER NOT NULL DEFAULT 0,
      sentence_length  REAL    NOT NULL DEFAULT 0,
      computed_at      INTEGER NOT NULL
    )`,
  ],
}, {
  version: 5,
  name: 'temps de saisie des réponses tapées',
  statements: [
    // Propres à l'appareil (vitesse de frappe, clavier) : jamais synchronisés.
    'ALTER TABLE review_logs ADD COLUMN typed_ms INTEGER',
    'ALTER TABLE review_logs ADD COLUMN typed_chars INTEGER',
  ],
}, {
  version: 6,
  name: 'mots connus et test de vocabulaire',
  statements: [
    // Mot marqué « connu » (ou « inconnu ») par l'utilisateur, par univers ; clé « univers|mot ».
    `CREATE TABLE word_marks (
      mark_key     TEXT PRIMARY KEY,
      universe_id  TEXT    NOT NULL,
      word         TEXT    NOT NULL,
      known        INTEGER NOT NULL DEFAULT 1,
      updated_at   INTEGER NOT NULL,
      deleted      INTEGER NOT NULL DEFAULT 0,
      dirty        INTEGER NOT NULL DEFAULT 1
    )`,
    'CREATE INDEX idx_word_marks_universe ON word_marks(universe_id, deleted)',
    // Dernier test de vocabulaire de chaque univers : part de mots connus par tranche de fréquence.
    // Les réponses brutes (mot, réponse, temps) permettent de recalculer le résultat sans refaire le test.
    `CREATE TABLE vocab_tests (
      universe_id  TEXT PRIMARY KEY,
      bands        TEXT    NOT NULL DEFAULT '[]',
      vocab_size   INTEGER NOT NULL DEFAULT 0,
      false_alarm  REAL    NOT NULL DEFAULT 0,
      answers      TEXT    NOT NULL DEFAULT '[]',
      taken_at     INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      deleted      INTEGER NOT NULL DEFAULT 0,
      dirty        INTEGER NOT NULL DEFAULT 1
    )`,
    // Observations en lisant (recalage du test) : décision dans « Mots du chapitre », mot sélectionné,
    // mot rencontré dans un chapitre ouvert. Clé « univers|source|mot » : un mot compte une fois par source.
    `CREATE TABLE vocab_observations (
      obs_key      TEXT PRIMARY KEY,
      universe_id  TEXT    NOT NULL,
      source       TEXT    NOT NULL CHECK (source IN ('chapter', 'select', 'exposure')),
      word         TEXT    NOT NULL,
      rank         INTEGER,
      known        INTEGER NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      deleted      INTEGER NOT NULL DEFAULT 0,
      dirty        INTEGER NOT NULL DEFAULT 1
    )`,
    'CREATE INDEX idx_vocab_observations_universe ON vocab_observations(universe_id, deleted)',
  ],
}, {
  version: 7,
  name: 'onglet Apprendre : réponses aux exercices de grammaire',
  statements: [
    // Une ligne par réponse : progression d'une leçon (20 dernières réponses) et phrases signalées.
    `CREATE TABLE grammar_answers (
      id           TEXT PRIMARY KEY,
      universe_id  TEXT    NOT NULL,
      lesson_id    TEXT    NOT NULL,
      item_id      TEXT    NOT NULL,
      correct      INTEGER NOT NULL,
      reported     INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      deleted      INTEGER NOT NULL DEFAULT 0,
      dirty        INTEGER NOT NULL DEFAULT 1
    )`,
    'CREATE INDEX idx_grammar_answers_lesson ON grammar_answers(universe_id, lesson_id, created_at)',
  ],
}, {
  version: 8,
  name: 'progression : durée de saisie des mots ajoutés',
  statements: [
    // Une ligne par mot ajouté depuis le formulaire : temps entre l'ouverture et l'enregistrement (titre « Archiviste »).
    `CREATE TABLE note_entries (
      id           TEXT PRIMARY KEY,
      universe_id  TEXT    NOT NULL,
      note_id      TEXT    NOT NULL,
      duration_ms  INTEGER NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      deleted      INTEGER NOT NULL DEFAULT 0,
      dirty        INTEGER NOT NULL DEFAULT 1
    )`,
    'CREATE INDEX idx_note_entries_universe ON note_entries(universe_id, deleted)',
  ],
}, {
  version: 9,
  name: 'progression : réponses tapées en révision',
  statements: [
    // Une ligne par révision dont la réponse a été tapée (toutes fiches), synchronisée : l'XP d'une réponse tapée
    // est la même sur tous les appareils (review_logs.typed_ms, propre à l'appareil, ne sert qu'à la vitesse).
    `CREATE TABLE typed_answers (
      log_id       TEXT PRIMARY KEY,
      universe_id  TEXT    NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      deleted      INTEGER NOT NULL DEFAULT 0,
      dirty        INTEGER NOT NULL DEFAULT 1
    )`,
    'CREATE INDEX idx_typed_answers_universe ON typed_answers(universe_id, deleted)',
  ],
});

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
      await m.run?.(tx);
      await tx.execute(`PRAGMA user_version = ${m.version}`);
    });
    current = m.version;
  }
  return current;
}
