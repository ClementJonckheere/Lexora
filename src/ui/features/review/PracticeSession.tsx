import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { errorMessage, useApp, type SessionConfig } from '@/app/store';
import { checkCloze, clozeHint, type ClozeVerdict } from '@/core/domain/cloze';
import { directionLabel } from '@/core/domain/types';
import { recordPractice } from '@/core/repo/reviewRepo';
import { buildClozePractice, buildDifficultPractice, buildRandomPractice, type ClozeItem, type PracticeItem } from '@/core/srs/practice';
import { GRADES, type Grade } from '@/core/srs/scheduler';
import { SessionQueue } from '@/core/srs/session';
import { Button, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { Flashcard, speakNote } from './Flashcard';
import { SessionFrame, SessionSummary, type Tally } from './SessionFrame';

type PracticeConfig = Extract<SessionConfig, { kind: 'practice' }>;

const MODE_TITLE = { random: 'Révision aléatoire', difficult: 'Mots difficiles', cloze: 'Phrases à trous' } as const;
const GRADE_CLASS: Record<Grade, string> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

function scopedNotes(config: PracticeConfig) {
  const notes = useApp.getState().notes.filter((n) => !n.suspended);
  return config.collectionId != null ? notes.filter((n) => n.collectionIds.includes(config.collectionId!)) : notes;
}

function Banner() {
  return (
    <span className="practice-banner" title="Les réponses sont enregistrées dans l'historique mais ne changent pas les dates de révision.">
      Entraînement libre · planification inchangée
    </span>
  );
}

function usePracticeLog(mode: PracticeConfig['mode']) {
  const db = useApp((s) => s.db)!;
  return async (noteId: string, rating: Grade) => {
    try {
      await recordPractice(db, noteId, mode, rating);
    } catch (err) {
      useApp.getState().toast('error', errorMessage(err));
    }
  };
}

function PracticeFinished({ config, tally, startedAt }: { config: PracticeConfig; tally: Tally; startedAt: number }) {
  const { navigate, refresh } = useApp.getState();
  useEffect(() => void refresh().catch(() => undefined), [refresh]);
  const again = () => navigate({ name: 'session', config });
  useHotkeys({ enter: again, escape: () => navigate({ name: 'review' }) });
  return (
    <SessionFrame completed={1} total={1} onQuit={() => navigate({ name: 'review' })} badge={<Banner />}>
      <SessionSummary
        title={`${MODE_TITLE[config.mode]} terminé${config.mode === 'cloze' ? 'es' : 'e'}`}
        tally={tally}
        startedAt={startedAt}
        labels={config.mode === 'cloze' ? ['Ratées', '—', 'Justes', '—'] : undefined}
        note="Entraînement libre : vos dates de révision n'ont pas changé."
      >
        <Button variant="primary" onClick={again} shortcut="Entrée">
          Recommencer
        </Button>
        <Button onClick={() => navigate({ name: 'review' })}>Retour</Button>
      </SessionSummary>
    </SessionFrame>
  );
}

/* ------------------------- Aléatoire / mots difficiles ------------------------ */

export function FlashPractice({ config }: { config: PracticeConfig }) {
  const notesById = useApp((s) => s.notesById);
  const language = useApp((s) => s.universe?.language ?? 'en');
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen);
  const { navigate, openEditor } = useApp.getState();
  const log = usePracticeLog(config.mode);

  const [session] = useState(() => {
    const s = useApp.getState();
    const notes = scopedNotes(config);
    const items =
      config.mode === 'difficult'
        ? buildDifficultPractice(notes, s.forgetCounts, config.limit, config.direction)
        : buildRandomPractice(notes, s.settings, config.limit, config.direction);
    return { queue: new SessionQueue<PracticeItem>(items), startedAt: Date.now(), requeued: new Set<string>() };
  });
  const [, setTick] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const tally = useRef<Tally>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  const item = session.queue.current;
  const note = item ? notesById.get(item.noteId) : undefined;

  useEffect(() => {
    if (item && !note) {
      session.queue.advance();
      setTick((t) => t + 1);
    }
  });

  const rate = (grade: Grade) => {
    if (!item || !revealed) return;
    void log(item.noteId, grade);
    tally.current[grade]++;
    // Un mot oublié revient une fois en fin de session.
    const requeue = grade === 1 && !session.requeued.has(item.noteId);
    if (requeue) session.requeued.add(item.noteId);
    session.queue.advance(requeue ? 0 : undefined);
    setRevealed(false);
    setTick((t) => t + 1);
  };

  const reveal = () => {
    if (!note) return;
    setRevealed(true);
    if (useApp.getState().settings.autoSpeak) speakNote(note);
  };

  useHotkeys(
    {
      space: () => (revealed ? rate(3) : reveal()),
      enter: () => (revealed ? rate(3) : reveal()),
      '1': () => rate(1),
      '2': () => rate(2),
      '3': () => rate(3),
      '4': () => rate(4),
      e: () => note && openEditor(note.id),
      p: () => note && speakNote(note),
      escape: () => navigate({ name: 'review' }),
    },
    { enabled: !overlay && !session.queue.finished },
  );

  if (session.queue.finished) return <PracticeFinished config={config} tally={tally.current} startedAt={session.startedAt} />;
  if (!item || !note) return null;

  return (
    <SessionFrame completed={session.queue.completed} total={session.queue.total} onQuit={() => navigate({ name: 'review' })} badge={<Banner />}>
      <Flashcard
        note={note}
        direction={item.direction}
        revealed={revealed}
        meta={
          <>
            <span>{MODE_TITLE[config.mode]}</span>
            <span>·</span>
            <span>{directionLabel(item.direction, language)}</span>
          </>
        }
      />
      <div className="session-actions">
        {!revealed ? (
          <Button variant="primary" className="reveal-btn" onClick={reveal} shortcut="Espace">
            Afficher la réponse
          </Button>
        ) : (
          <div className="grades">
            {GRADES.map((g) => (
              <button key={g.grade} className={`grade grade--${GRADE_CLASS[g.grade]}`} onClick={() => rate(g.grade)}>
                <span className="grade-label">{g.label}</span>
                <span className="grade-sub">
                  <Kbd>{g.key}</Kbd>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="session-hints">
          <span>
            <Kbd>Espace</Kbd> {revealed ? 'Retenu' : 'afficher'}
          </span>
          <span>
            <Kbd>E</Kbd> modifier
          </span>
          <span>
            <Kbd>P</Kbd> prononcer
          </span>
        </div>
      </div>
    </SessionFrame>
  );
}

/* -------------------------------- Phrases à trous ------------------------------- */

export function ClozePractice({ config }: { config: PracticeConfig }) {
  const notesById = useApp((s) => s.notesById);
  const language = useApp((s) => s.universe?.language ?? 'en');
  const overlay = useApp((s) => !!s.editor || s.searchOpen || s.bulkOpen || s.shortcutsOpen);
  const { navigate } = useApp.getState();
  const log = usePracticeLog('cloze');

  const [session] = useState(() => ({
    queue: new SessionQueue<ClozeItem>(buildClozePractice(scopedNotes(config), config.limit, useApp.getState().universe?.language ?? 'en')),
    startedAt: Date.now(),
  }));
  const [, setTick] = useState(0);
  const [answer, setAnswer] = useState('');
  const [verdict, setVerdict] = useState<ClozeVerdict | 'skipped' | null>(null);
  const [hint, setHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tally = useRef<Tally>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  const item = session.queue.current;
  const note = item ? notesById.get(item.noteId) : undefined;

  useEffect(() => {
    inputRef.current?.focus();
  }, [item, verdict]);

  const check = () => {
    if (!item) return;
    if (!answer.trim()) setVerdict('skipped');
    else setVerdict(checkCloze(item.cloze, answer, language));
    if (note && useApp.getState().settings.autoSpeak) speakNote(note);
  };

  const next = (override?: Grade) => {
    if (!item || !verdict) return;
    const grade: Grade = override ?? (verdict === 'exact' || verdict === 'close' ? 3 : 1);
    void log(item.noteId, grade);
    tally.current[grade]++;
    session.queue.advance();
    setAnswer('');
    setVerdict(null);
    setHint(false);
    setTick((t) => t + 1);
  };

  useHotkeys(
    {
      enter: () => (verdict ? next() : check()),
      escape: () => navigate({ name: 'review' }),
      'mod+h': () => setHint(true),
      'mod+j': () => verdict === 'wrong' && next(3),
    },
    { enabled: !overlay && !session.queue.finished, allowInInputs: true },
  );

  if (session.queue.finished) return <PracticeFinished config={config} tally={tally.current} startedAt={session.startedAt} />;
  if (!item) return null;

  const ok = verdict === 'exact' || verdict === 'close';

  return (
    <SessionFrame completed={session.queue.completed} total={session.queue.total} onQuit={() => navigate({ name: 'review' })} badge={<Banner />}>
      <div className="card flashcard">
        <div className="flashcard-meta">
          <span>Phrase à trous</span>
          {note && (
            <>
              <span>·</span>
              <span style={{ textTransform: 'none', letterSpacing: 0 }}>{note.translation}</span>
            </>
          )}
        </div>
        <p className="cloze-sentence" lang={language}>
          {item.cloze.parts.map((p, i) =>
            p.blank ? (
              <span key={i} className={`cloze-blank ${verdict ? 'cloze-blank--revealed' : ''}`}>
                {verdict ? p.text : ' '.repeat(Math.max(6, p.text.length))}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>
        {hint && !verdict && <p className="muted" style={{ marginTop: 10, letterSpacing: '0.1em' }}>{clozeHint(item.cloze)}</p>}
        {!verdict ? (
          <input
            ref={inputRef}
            className="input input--lg cloze-input"
            placeholder={item.cloze.answers.length > 1 ? `${item.cloze.answers.length} mots, séparés par des espaces` : 'Le mot manquant'}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            lang={language}
          />
        ) : (
          <div>
            <div className={`verdict ${ok ? 'verdict--ok' : 'verdict--ko'}`}>
              {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {verdict === 'exact' && 'Exact'}
              {verdict === 'close' && `Juste — forme exacte : ${item.cloze.answers.join(' … ')}`}
              {verdict === 'wrong' && `Réponse : ${item.cloze.answers.join(' … ')}`}
              {verdict === 'skipped' && `Réponse : ${item.cloze.answers.join(' … ')}`}
            </div>
            {note && (
              <p className="muted" style={{ marginTop: 10 }}>
                <strong className="text-2">{note.expression}</strong> — {note.translation}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="session-actions">
        {!verdict ? (
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button onClick={() => setHint(true)} disabled={hint}>
              Indice <Kbd>Ctrl H</Kbd>
            </Button>
            <Button variant="primary" onClick={check} shortcut="Entrée">
              {answer.trim() ? 'Vérifier' : 'Afficher la réponse'}
            </Button>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'center' }}>
            {verdict === 'wrong' && (
              <Button onClick={() => next(3)}>
                J'avais juste <Kbd>Ctrl J</Kbd>
              </Button>
            )}
            <Button variant="primary" onClick={() => next()} shortcut="Entrée">
              Suivante
            </Button>
          </div>
        )}
      </div>
    </SessionFrame>
  );
}
