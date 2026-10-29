import type { Database, Queryable } from '../db/types';
import type { Observation } from '../reading/calibration';
import type { TestAnswer } from '../reading/vocabTest';

/**
 * Connaissance du vocabulaire, par univers :
 * - mots marqués « connu » (ou « inconnu ») par l'utilisateur, en lisant ;
 * - dernier test de vocabulaire (part de mots connus par tranche de fréquence).
 */

export interface VocabTestResult {
  /** Part estimée de mots connus dans chaque tranche de fréquence (voir BAND_EDGES). */
  bands: number[];
  /** Taille estimée du vocabulaire (formes de mots). */
  vocabSize: number;
  /** Taux de « je connais » répondu sur des mots inventés. */
  falseAlarm: number;
  /** Réponses brutes (vide pour un test enregistré avant la version 2.13). */
  answers: TestAnswer[];
  takenAt: number;
}

const markKey = (universeId: string, word: string) => `${universeId}|${word}`;

/** Mots marqués : mot → connu (true) ou inconnu (false). */
export async function loadMarks(db: Queryable, universeId: string): Promise<Map<string, boolean>> {
  const rows = await db.select<{ word: string; known: number }>('SELECT word, known FROM word_marks WHERE universe_id = ? AND deleted = 0', [universeId]);
  return new Map(rows.map((r) => [r.word, Number(r.known) === 1]));
}

/** Marque un mot (null : retire la marque). */
export async function setMarks(db: Database, universeId: string, words: string[], known: boolean | null, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    for (const raw of words) {
      const word = raw.trim().toLowerCase();
      if (!word) continue;
      await tx.execute(
        `INSERT INTO word_marks (mark_key, universe_id, word, known, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(mark_key) DO UPDATE SET known = excluded.known, updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 1`,
        [markKey(universeId, word), universeId, word, known === false ? 0 : 1, now, known === null ? 1 : 0],
      );
    }
  });
}

export async function loadVocabTest(db: Queryable, universeId: string): Promise<VocabTestResult | null> {
  const rows = await db.select<{ bands: string; vocab_size: number; false_alarm: number; answers: string | null; taken_at: number }>(
    'SELECT bands, vocab_size, false_alarm, answers, taken_at FROM vocab_tests WHERE universe_id = ? AND deleted = 0',
    [universeId],
  );
  const r = rows[0];
  if (!r) return null;
  let bands: number[] = [];
  try {
    const parsed = JSON.parse(r.bands);
    if (Array.isArray(parsed)) bands = parsed.map(Number).filter((n) => Number.isFinite(n));
  } catch {
    /* résultat illisible : comme sans test */
  }
  if (!bands.length) return null;
  let answers: TestAnswer[] = [];
  try {
    const parsed = JSON.parse(r.answers ?? '[]');
    if (Array.isArray(parsed)) answers = parsed.filter((a) => a && typeof a.word === 'string');
  } catch {
    /* réponses illisibles : le résultat reste utilisable */
  }
  return { bands, vocabSize: Number(r.vocab_size), falseAlarm: Number(r.false_alarm), answers, takenAt: Number(r.taken_at) };
}

export async function saveVocabTest(db: Database, universeId: string, result: VocabTestResult, now = Date.now()): Promise<void> {
  await db.execute(
    `INSERT INTO vocab_tests (universe_id, bands, vocab_size, false_alarm, answers, taken_at, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
     ON CONFLICT(universe_id) DO UPDATE SET bands = excluded.bands, vocab_size = excluded.vocab_size, false_alarm = excluded.false_alarm,
       answers = excluded.answers, taken_at = excluded.taken_at, updated_at = excluded.updated_at, deleted = 0, dirty = 1`,
    [universeId, JSON.stringify(result.bands), Math.round(result.vocabSize), result.falseAlarm, JSON.stringify(result.answers), result.takenAt, now],
  );
}

/* ------------------------------------------------ observations en lisant --- */

export async function loadObservations(db: Queryable, universeId: string): Promise<Observation[]> {
  const rows = await db.select<{ source: Observation['source']; word: string; rank: number | null; known: number }>(
    'SELECT source, word, rank, known FROM vocab_observations WHERE universe_id = ? AND deleted = 0',
    [universeId],
  );
  return rows.map((r) => ({ source: r.source, word: r.word, rank: r.rank == null ? null : Number(r.rank), known: Number(r.known) === 1 }));
}

/**
 * Enregistre des observations (un mot compte une fois par source). Une décision ou une sélection remplace la
 * précédente ; une exposition déjà enregistrée n'est pas réécrite (rien à synchroniser à chaque ouverture de chapitre).
 * Retourne les observations réellement ajoutées ou modifiées.
 */
export async function recordObservations(db: Database, universeId: string, list: Observation[], now = Date.now()): Promise<Observation[]> {
  const changed: Observation[] = [];
  await db.transaction(async (tx) => {
    for (const o of list) {
      const word = o.word.trim().toLowerCase();
      if (!word) continue;
      const conflict =
        o.source === 'exposure'
          ? 'ON CONFLICT(obs_key) DO NOTHING'
          : 'ON CONFLICT(obs_key) DO UPDATE SET known = excluded.known, rank = excluded.rank, updated_at = excluded.updated_at, deleted = 0, dirty = 1';
      const res = await tx.execute(
        `INSERT INTO vocab_observations (obs_key, universe_id, source, word, rank, known, created_at, updated_at, deleted, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1) ${conflict}`,
        [`${universeId}|${o.source}|${word}`, universeId, o.source, word, o.rank, o.known ? 1 : 0, now, now],
      );
      if (res.rowsAffected) changed.push({ ...o, word });
    }
  });
  return changed;
}
