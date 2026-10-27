/**
 * Tables synchronisées, dans l'ordre de dépendance (univers avant notes, notes avant fiches…).
 * Les colonnes listées sont celles échangées avec le serveur (hors user_id et server_updated_at).
 */
export interface SyncTable {
  name: string;
  key: string;
  columns: string[];
  /** Colonnes stockées en JSON texte localement, en jsonb côté serveur. */
  json?: string[];
  /** La table n'a pas de colonne « deleted » (réglages). */
  noTombstone?: boolean;
  /**
   * Table ajoutée après coup : si le serveur ne la connaît pas encore (schema.sql pas relancé),
   * elle est ignorée (les données restent sur l'appareil) au lieu de bloquer toute la synchronisation.
   */
  optional?: boolean;
}

const SYNC = ['updated_at', 'deleted'];

export const SYNC_TABLES: SyncTable[] = [
  { name: 'universes', key: 'id', columns: ['id', 'name', 'language', 'position', 'new_per_day', 'created_at', ...SYNC] },
  { name: 'collections', key: 'id', columns: ['id', 'universe_id', 'name', 'description', 'created_at', ...SYNC] },
  {
    name: 'notes',
    key: 'id',
    columns: [
      'id', 'universe_id', 'expression', 'translation', 'pronunciation', 'expression_key', 'comment', 'category',
      'category_auto', 'is_favorite', 'suspended', 'examples', 'tags', 'collection_ids', 'created_at', ...SYNC,
    ],
    json: ['examples', 'tags', 'collection_ids'],
  },
  {
    name: 'cards',
    key: 'id',
    columns: [
      'id', 'note_id', 'direction', 'state', 'due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days',
      'learning_steps', 'reps', 'lapses', 'last_review', ...SYNC,
    ],
  },
  {
    name: 'review_logs',
    key: 'id',
    columns: [
      'id', 'card_id', 'rating', 'state', 'due', 'stability', 'difficulty', 'elapsed_days', 'last_elapsed_days',
      'scheduled_days', 'learning_steps', 'reviewed_at', 'duration_ms', ...SYNC,
    ],
  },
  { name: 'practice_logs', key: 'id', columns: ['id', 'note_id', 'mode', 'rating', 'created_at', ...SYNC] },
  {
    name: 'books',
    key: 'book_key',
    columns: [
      'book_key', 'universe_id', 'title', 'authors', 'language', 'cover_url', 'text_url', 'level', 'chapter', 'block',
      'progress', 'added_at', 'last_read_at', ...SYNC,
    ],
    json: ['authors'],
  },
  { name: 'settings', key: 'key', columns: ['key', 'value', 'updated_at'], noTombstone: true },
  { name: 'word_marks', key: 'mark_key', columns: ['mark_key', 'universe_id', 'word', 'known', ...SYNC], optional: true },
  {
    name: 'vocab_tests',
    key: 'universe_id',
    columns: ['universe_id', 'bands', 'vocab_size', 'false_alarm', 'taken_at', ...SYNC],
    json: ['bands'],
    optional: true,
  },
];

export type RemoteRow = Record<string, unknown> & { server_updated_at?: number };
