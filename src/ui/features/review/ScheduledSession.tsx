import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { State } from 'ts-fsrs';
import { attempt, errorMessage, useApp, type SessionConfig } from '@/app/store';
import { formatInterval } from '@/core/domain/dates';
import { languageInfo } from '@/core/domain/languages';
import type { CardRecord } from '@/core/domain/types';
import { directionLabel } from '@/core/domain/types';
import { recordReview, undoReview } from '@/core/repo/reviewRepo';
import { buildQueue, type QueueItem } from '@/core/srs/queue';
import { settingsFor } from '@/core/domain/settings';
import { checkAnswer, type AnswerVerdict } from '@/core/domain/answer';
import { GRADES, previewIntervals, review, type Grade } from '@/core/srs/scheduler';
import { SessionQueue } from '@/core/srs/session';
import { Button, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { Flashcard, speakNote } from './Flashcard';
import { SessionFrame, SessionSummary, type Tally } from './SessionFrame';
import { useDueCounts } from './ReviewPage';

const KIND_LABEL = { new: 'Nouveau', learning: 'En apprentissage', review: 'Révision' } as const;
const GRADE_CLASS: Record<Grade, string> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

interface UndoEntry {
  before: CardRecord;
  logId: string;
  grade: Grade;
}

/** Révision planifiée (FSRS) : chaque réponse met à jour la fiche et l'historique. */
export function ScheduledSession({ config }: { config: Extract<SessionConfig, { kind: 'scheduled' }> }) {
  const db = useApp((s) => s.db)!;
  const notesById = useApp((s) => s.notesById);
  const language = useApp((s) => s.universe?.language ?? 'en');
  const languageName = languageInfo(language).name.toLowerCase();
  const scheduler = useApp((s) => s.scheduler);
  const settings = useApp((s) => s.settings);
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen);
  const { navigate, openEditor, toast, refresh, setSuspended } = useApp.getState();

  // File figée au démarrage ; l'état des fiches est suivi localement pendant la session.
  const [session] = useState(() => {
    const s = useApp.getState();
    const noteIds = config.collectionId != null ? new Set(s.notes.filter((n) => n.collectionIds.includes(config.collectionId!)).map((n) => n.id)) : null;
    const items = buildQueue(s.notes, {
      now: Date.now(),
      settings: settingsFor(s.settings, s.universe),
      scheduler: s.scheduler,
      newIntroducedToday: s.newIntroducedToday,
      limit: config.limit,
      direction: config.direction,
      noteIds,
    });
    const cards = new Map<string, CardRecord>();
    for (const n of s.notes) for (const c of Object.values(n.cards)) if (c) cards.set(c.id, c);
    return { queue: new SessionQueue<QueueItem>(items), cards, startedAt: Date.now() };
  });

  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | 'skipped' | null>(null);
  const tally = useRef<Tally>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const undoStack = useRef<UndoEntry[]>([]);
  const shownAt = useRef(Date.now());

  const item = session.queue.current;
  const note = item ? notesById.get(item.noteId) : undefined;
  const card = item ? session.cards.get(item.cardId) : undefined;
  // « Taper la réponse » : uniquement dans le sens français → langue étudiée.
  const typing = settings.typeAnswer && item?.direction === 'fr_en';
  const suggested: Grade = verdict === 'exact' ? 3 : verdict === 'close' ? 2 : verdict ? 1 : 3;

  // Note supprimée pendant la session : on passe.
  useEffect(() => {
    if (item && (!note || !card)) {
      session.queue.advance();
      rerender();
    }
  });

  // Données globales rafraîchies en fin de session (et en quittant).
  useEffect(() => () => void refresh().catch(() => undefined), [refresh]);

  const reveal = useCallback(() => {
    if (!note || revealed) return;
    setRevealed(true);
    if (settings.autoSpeak) speakNote(note);
  }, [note, revealed, settings.autoSpeak]);

  const submitTyped = () => {
    if (!note) return;
    setVerdict(typed.trim() ? checkAnswer(note.expression, typed, language) : 'skipped');
    reveal();
  };

  const onTypedKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submitTyped();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const resetCard = () => {
    setRevealed(false);
    setTyped('');
    setVerdict(null);
    shownAt.current = Date.now();
  };

  const rate = async (grade: Grade) => {
    if (!item || !card || !revealed || busy) return;
    setBusy(true);
    const now = Date.now();
    try {
      const out = review(scheduler, card, grade, now);
      const logId = await recordReview(db, out.card, out.log, now - shownAt.current);
      session.cards.set(card.id, out.card);
      undoStack.current.push({ before: card, logId, grade });
      tally.current[grade]++;
      session.queue.advance(out.card.due - now);
      resetCard();
    } catch (err) {
      toast('error', `Réponse non enregistrée : ${errorMessage(err)}`);
    } finally {
      setBusy(false);
      rerender();
    }
  };

  const undo = async () => {
    const last = undoStack.current.pop();
    if (!last || busy) return;
    setBusy(true);
    try {
      await undoReview(db, last.before, last.logId);
      session.cards.set(last.before.id, last.before);
      session.queue.undo();
      tally.current[last.grade]--;
      setRevealed(true);
      setVerdict(null);
      toast('info', 'Dernière réponse annulée');
    } catch (err) {
      undoStack.current.push(last);
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
      rerender();
    }
  };

  /** Suspend la note : elle quitte la session et les révisions futures. */
  const suspend = async () => {
    if (!note || busy) return;
    const id = note.id;
    try {
      await setSuspended([id], true);
      session.queue.remove((i) => i.noteId === id);
      resetCard();
      rerender();
      toast('info', `« ${note.expression} » suspendue`, { label: 'Annuler', run: () => void attempt(() => setSuspended([id], false), 'Révisions réactivées') });
    } catch (err) {
      toast('error', errorMessage(err));
    }
  };

  const quit = () => navigate({ name: 'review' });
  const finished = session.queue.finished;

  useHotkeys(
    {
      space: () => (revealed ? void rate(suggested) : typing ? submitTyped() : reveal()),
      enter: () => (revealed ? void rate(suggested) : typing ? submitTyped() : reveal()),
      '1': () => void rate(1),
      '2': () => void rate(2),
      '3': () => void rate(3),
      '4': () => void rate(4),
      z: () => void undo(),
      'mod+z': () => void undo(),
      backspace: () => void undo(),
      e: () => note && openEditor(note.id),
      p: () => note && speakNote(note),
      s: () => void suspend(),
      escape: quit,
    },
    { enabled: !overlay && !finished },
  );

  if (finished) {
    return <Finished tally={tally.current} startedAt={session.startedAt} config={config} canUndo={undoStack.current.length > 0} onUndo={undo} />;
  }
  if (!item || !note || !card) return null;

  const intervals = revealed ? previewIntervals(scheduler, card, Date.now()) : null;

  return (
    <SessionFrame completed={session.queue.completed} total={session.queue.total} onQuit={quit}>
      <Flashcard
        note={note}
        direction={item.direction}
        revealed={revealed}
        meta={
          <>
            <span>{directionLabel(item.direction, language)}</span>
            <span>·</span>
            <span>{card.state === State.Relearning ? 'À réapprendre' : KIND_LABEL[item.kind]}</span>
          </>
        }
      >
        {typing && !revealed && (
          <input
            className="input input--lg cloze-input"
            placeholder={`Votre réponse en ${languageName}…`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onTypedKey}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            lang={language}
            aria-label="Votre réponse"
          />
        )}
        {verdict && revealed && (
          <div className={`verdict ${verdict === 'exact' || verdict === 'close' ? 'verdict--ok' : 'verdict--ko'}`} style={{ marginTop: 14 }}>
            {verdict === 'exact' || verdict === 'close' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {verdict === 'exact' && 'Exact'}
            {verdict === 'close' && `Presque : « ${typed.trim()} »`}
            {verdict === 'wrong' && `Votre réponse : « ${typed.trim()} »`}
            {verdict === 'skipped' && 'Sans réponse'}
          </div>
        )}
      </Flashcard>
      <div className="session-actions">
        {!revealed ? (
          <Button variant="primary" className="reveal-btn" onClick={typing ? submitTyped : reveal} shortcut={typing ? 'Entrée' : 'Espace'}>
            {typing && typed.trim() ? 'Vérifier' : 'Afficher la réponse'}
          </Button>
        ) : (
          <div className="grades">
            {GRADES.map((g) => (
              <button
                key={g.grade}
                className={`grade grade--${GRADE_CLASS[g.grade]} ${verdict && g.grade === suggested ? 'grade--suggested' : ''}`}
                onClick={() => void rate(g.grade)} disabled={busy}>
                <span className="grade-label">{g.label}</span>
                <span className="grade-sub">
                  <Kbd>{g.key}</Kbd> {intervals ? formatInterval(intervals[g.grade]) : ''}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="session-hints">
          <span>
            <Kbd>Espace</Kbd> {revealed ? GRADES.find((g) => g.grade === suggested)?.label : typing ? 'vérifier' : 'afficher'}
          </span>
          <span>
            <Kbd>Z</Kbd> annuler
          </span>
          <span>
            <Kbd>E</Kbd> modifier
          </span>
          <span>
            <Kbd>P</Kbd> prononcer
          </span>
          <span>
            <Kbd>S</Kbd> suspendre
          </span>
        </div>
      </div>
    </SessionFrame>
  );
}

function Finished({
  tally,
  startedAt,
  config,
  canUndo,
  onUndo,
}: {
  tally: Tally;
  startedAt: number;
  config: Extract<SessionConfig, { kind: 'scheduled' }>;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { navigate, refresh } = useApp.getState();
  useEffect(() => void refresh().catch(() => undefined), [refresh]);
  const due = useDueCounts(config.collectionId ?? null, config.direction ?? null);
  const more = due.total;
  const again = () => navigate({ name: 'session', config: { ...config, limit: config.limit ?? null } });

  useHotkeys({
    enter: () => (more > 0 ? again() : navigate({ name: 'home' })),
    escape: () => navigate({ name: 'home' }),
    z: () => canUndo && onUndo(),
  });

  return (
    <SessionFrame completed={1} total={1} onQuit={() => navigate({ name: 'home' })}>
      <SessionSummary
        title={more > 0 ? 'Session terminée' : 'Tout est révisé pour aujourd’hui'}
        tally={tally}
        startedAt={startedAt}
        note={more > 0 ? `Encore ${more} fiche${more > 1 ? 's' : ''} à réviser aujourd'hui.` : 'Les prochaines révisions sont planifiées automatiquement.'}
      >
        {more > 0 && (
          <Button variant="primary" onClick={again} shortcut="Entrée">
            Continuer ({config.limit ? Math.min(config.limit, more) : more})
          </Button>
        )}
        <Button variant={more > 0 ? 'secondary' : 'primary'} onClick={() => navigate({ name: 'home' })} shortcut={more > 0 ? undefined : 'Entrée'}>
          Accueil
        </Button>
      </SessionSummary>
    </SessionFrame>
  );
}
