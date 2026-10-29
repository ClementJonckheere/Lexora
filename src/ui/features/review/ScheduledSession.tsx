import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useDailyProgress } from '@/ui/hooks/useDailyProgress';
import { cardMastery } from '@/core/srs/scheduler';
import { State } from 'ts-fsrs';
import { attempt, errorMessage, useApp, type SessionConfig } from '@/app/store';
import { formatDue, formatInterval } from '@/core/domain/dates';
import { languageInfo } from '@/core/domain/languages';
import type { CardRecord } from '@/core/domain/types';
import { directionLabel } from '@/core/domain/types';
import { recordReview, typedBaseline, undoReview } from '@/core/repo/reviewRepo';
import { buildQueue, type QueueItem } from '@/core/srs/queue';
import { scopeIds } from '@/core/srs/scope';
import { settingsFor } from '@/core/domain/settings';
import type { AnswerVerdict } from '@/core/domain/answer';
import { checkTyped, clozeFront, frequencyRank, MS_PER_CHAR, suggestGrade } from '@/core/srs/typed';
import { readPref, writePref } from '@/ui/prefs';
import { GRADES, previewIntervals, review, type Grade } from '@/core/srs/scheduler';
import { SessionQueue } from '@/core/srs/session';
import { Button, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { Flashcard, speakNote } from './Flashcard';
import { SessionFrame, SessionSummary, type Tally } from './SessionFrame';
import { useDueCounts } from './ReviewPage';
import { FocusFooter, useFocusMeter } from '@/ui/features/progress/FocusFooter';

const KIND_LABEL = { new: 'Nouveau', learning: 'En apprentissage', review: 'Révision' } as const;
const GRADE_CLASS: Record<Grade, string> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

interface UndoEntry {
  before: CardRecord;
  after: CardRecord;
  noteId: string;
  logId: string;
  grade: Grade;
}

/** Mots oubliés au moins ce nombre de fois : signalés comme « à retravailler ». */
const LEECH_LAPSES = 4;
/** En dessous de ce nombre de réponses au total, l'explication des 4 boutons reste affichée. */
const BEGINNER_REVIEWS = 30;
const GRADE_HELP: Record<Grade, string> = {
  1: 'je ne savais pas',
  2: 'retrouvé avec effort',
  3: 'retrouvé',
  4: 'immédiat, trop facile',
};

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
    const noteIds = scopeIds(s.notes, config);
    const items = buildQueue(s.notes, {
      now: Date.now(),
      settings: settingsFor(s.settings, s.universe),
      scheduler: s.scheduler,
      newIntroducedToday: s.newIntroducedToday,
      limit: config.limit,
      direction: config.direction,
      noteIds,
      newRank: s.settings.newOrder === 'frequency' && s.frequencyRanks?.language === s.universe?.language ? frequencyRankOf(s.frequencyRanks, s.universe?.language) : null,
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
  /** Temps mis pour taper la réponse (affichage → validation). */
  const answeredIn = useRef(0);
  // Temps de réflexion habituel (réponses exactes tapées dans cet univers, sur cet appareil).
  const universeId = useApp((s) => s.universe?.id);
  const [baseline, setBaseline] = useState<number | null>(null);
  useEffect(() => {
    if (!universeId) return;
    void typedBaseline(db, universeId, MS_PER_CHAR).then(setBaseline, () => setBaseline(null));
  }, [db, universeId]);
  const [typedNotice, setTypedNotice] = useState(() => !readPref<boolean>('review.typedNotice.seen', false));
  const progress = useDailyProgress();
  const focus = useFocusMeter();

  const item = session.queue.current;
  const note = item ? notesById.get(item.noteId) : undefined;
  const card = item ? session.cards.get(item.cardId) : undefined;
  // « Taper la réponse » : uniquement dans le sens français → langue étudiée.
  const typing = settings.typeAnswer && item?.direction === 'fr_en';
  // Recto en contexte : une phrase d'exemple différente à chaque révision.
  const front = useMemo(
    () => (note && card && item?.direction === 'fr_en' && settings.clozeFront ? clozeFront(note, language, card.reps) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note, item?.cardId, settings.clozeFront, language],
  );
  const answerChars = front ? front.cloze.answers.join(' ').length : (note?.expression.length ?? 0);
  const suggested: Grade = verdict && card ? suggestGrade(verdict, answeredIn.current, answerChars, baseline, card.state) : 3;

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
    answeredIn.current = Date.now() - shownAt.current;
    setVerdict(typed.trim() ? checkTyped(note, front, typed, language) : 'skipped');
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
      // Mesure de référence : réponses exactes sur des fiches en révision (un mot frais se tape plus vite).
      const typedTiming = verdict === 'exact' && card.state === State.Review ? { ms: answeredIn.current, chars: answerChars } : null;
      const answerTyped = verdict !== null && verdict !== 'skipped';
      const logId = await recordReview(db, out.card, out.log, now - shownAt.current, now, typedTiming, answerTyped ? (universeId ?? null) : null);
      session.cards.set(card.id, out.card);
      focus.add({ kind: 'review', at: now, cardId: card.id, rating: grade, elapsedDays: out.log.elapsed_days, typed: answerTyped });
      undoStack.current.push({ before: card, after: out.card, noteId: item.noteId, logId, grade });
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
    return (
      <Finished tally={tally.current} startedAt={session.startedAt} config={config} canUndo={undoStack.current.length > 0} onUndo={undo} answers={undoStack.current} />
    );
  }
  if (!item || !note || !card) return null;

  const intervals = revealed ? previewIntervals(scheduler, card, Date.now()) : null;

  return (
    <SessionFrame completed={session.queue.completed} total={session.queue.total} onQuit={quit} footer={<FocusFooter state={focus.state} />}>
      <Flashcard
        note={note}
        direction={item.direction}
        revealed={revealed}
        front={front}
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
            placeholder={front ? "Le mot manquant (ou l'expression)…" : `Votre réponse en ${languageName}…`}
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
            <span className="verdict-grade">
              Note proposée : <strong>{GRADES.find((g) => g.grade === suggested)?.label}</strong>
              {suggested === 4 && ` (répondu en ${(answeredIn.current / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s)`}
            </span>
          </div>
        )}
        {typing && typedNotice && !revealed && (
          <div className="typed-notice">
            <span>
              Tapez la réponse : Lexora propose la note selon la justesse et la rapidité. <Kbd>Entrée</Kbd> pour l'accepter, <Kbd>1</Kbd> à <Kbd>4</Kbd> pour la
              changer. Désactivable dans les Paramètres.
            </span>
            <button
              className="link small"
              onClick={() => {
                setTypedNotice(false);
                writePref('review.typedNotice.seen', true);
              }}
            >
              Compris
            </button>
          </div>
        )}
        {revealed && card.lapses >= LEECH_LAPSES && (
          <div className="leech-hint">
            <AlertTriangle size={15} />
            <span>
              Mot difficile : oublié {card.lapses} fois. Ajoutez un exemple personnel, une astuce dans la note, ou découpez l'expression en plus petits
              morceaux.
            </span>
            <button className="link small" onClick={() => openEditor(note.id)}>
              Modifier (E)
            </button>
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
        {revealed && progress.totalReviews + undoStack.current.length < BEGINNER_REVIEWS && (
          <p className="grade-help">
            {GRADES.map((g) => (
              <span key={g.grade}>
                <strong>{g.label}</strong> : {GRADE_HELP[g.grade]}
              </span>
            ))}
            <span className="muted">La prochaine révision s'adapte à votre réponse.</span>
          </p>
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
  answers,
}: {
  tally: Tally;
  startedAt: number;
  config: Extract<SessionConfig, { kind: 'scheduled' }>;
  canUndo: boolean;
  onUndo: () => void;
  answers: UndoEntry[];
}) {
  const { navigate, refresh, showNote } = useApp.getState();
  const notesById = useApp((s) => s.notesById);
  const threshold = useApp((s) => s.settings.masteryThresholdDays);
  const report = useMemo(() => summarize(answers, threshold), [answers, threshold]);
  useEffect(() => void refresh().catch(() => undefined), [refresh]);
  const due = useDueCounts(config, config.direction ?? null);
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
        title={more > 0 ? 'Session terminée' : "Tout est révisé pour aujourd'hui"}
        tally={tally}
        startedAt={startedAt}
        details={
          <>
        {(report.mastered.length > 0 || report.toWatch.length > 0 || report.nextDue) && (
          <div className="summary-report">
            {report.mastered.length > 0 && (
              <div>
                <strong style={{ color: 'var(--mastered)' }}>Maîtrisés</strong>
                <span>
                  {report.mastered.length} mot{report.mastered.length > 1 ? 's' : ''} :{' '}
                  {report.mastered.slice(0, 5).map((id) => notesById.get(id)?.expression).filter(Boolean).join(', ')}
                  {report.mastered.length > 5 ? '…' : ''}
                </span>
              </div>
            )}
            {report.toWatch.length > 0 && (
              <div>
                <strong style={{ color: 'var(--again)' }}>À surveiller</strong>
                <span>
                  {report.toWatch.slice(0, 6).map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <button className="link" onClick={() => showNote(id)}>
                        {notesById.get(id)?.expression}
                      </button>
                    </span>
                  ))}
                  {report.toWatch.length > 6 ? '…' : '.'} Ils reviendront bientôt.
                </span>
              </div>
            )}
            {report.nextDue && (
              <div>
                <strong>Prochaine révision</strong>
                <span>{formatDue(report.nextDue)}</span>
              </div>
            )}
          </div>
        )}
          </>
        }
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

/** Bilan : mots passés « maîtrisés », mots oubliés pendant la session, prochaine échéance. */
function summarize(answers: UndoEntry[], threshold: number) {
  const first = new Map<string, UndoEntry>();
  const last = new Map<string, UndoEntry>();
  const forgot = new Set<string>();
  for (const a of answers) {
    if (!first.has(a.after.id)) first.set(a.after.id, a);
    last.set(a.after.id, a);
    if (a.grade === 1) forgot.add(a.noteId);
  }
  const mastered = new Set<string>();
  for (const [cardId, l] of last) {
    const f = first.get(cardId)!;
    if (cardMastery(l.after, threshold) === 'mastered' && cardMastery(f.before, threshold) !== 'mastered') mastered.add(l.noteId);
  }
  const now = Date.now();
  const dues = [...last.values()].map((l) => l.after.due).filter((d) => d > now);
  return { mastered: [...mastered], toWatch: [...forgot], nextDue: dues.length ? Math.min(...dues) : null };
}

/** Rang d'utilité des nouveaux mots (liste de fréquence de la langue). */
function frequencyRankOf(freq: { ranks: Map<string, number> } | null, language: string | undefined) {
  if (!freq || !language) return null;
  const cache = new Map<string, number>();
  return (note: Parameters<typeof frequencyRank>[0]) => {
    let r = cache.get(note.id);
    if (r === undefined) cache.set(note.id, (r = frequencyRank(note, freq.ranks, language)));
    return r;
  };
}
