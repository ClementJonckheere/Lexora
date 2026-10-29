import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Flag, Loader2, RefreshCw, RotateCcw, Volume2, XCircle } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { FocusFooter, useFocusMeter } from '@/ui/features/progress/FocusFooter';
import { isCorrect, type Exercise } from '@/core/learn/exercises';
import { lessonProgress, MASTERY_TARGET, MASTERY_WINDOW, pickSession, SESSION_SIZE } from '@/core/learn/progress';
import { dueLabel, lessonReview, REVIEW_PASS, REVIEW_SIZE } from '@/core/learn/review';
import { Button, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { speakText } from '@/ui/speech';
import { LessonBar, progressLabel } from './LearnPage';
import { loadExercises, loadPlacementItems, useGrammarData } from './grammarData';
import type { PlacementState } from '@/core/domain/settings';
import type { PlacementResponse } from '@/core/learn/placement';
import type { PlacementItem } from '@/core/learn/placementBank';
import { checkItems, checkResult, needsCheck } from '@/core/learn/placementResults';

/** Une leçon : l'explication et ses exemples, puis des séances d'exercices tirées au hasard. */
export function LessonPage({ id, startReview = false }: { id: string; startReview?: boolean }) {
  const data = useGrammarData();
  const answers = useApp((s) => s.grammarAnswers);
  const universeId = useApp((s) => s.universe?.id);
  const { navigate } = useApp.getState();
  const [bank, setBank] = useState<Exercise[] | null>(null);
  const [session, setSession] = useState<{ items: Exercise[]; review: boolean } | null>(null);
  const placement = useApp((s) => (universeId ? s.settings.placement[universeId] : undefined));
  // Mini-test proposé tant que la leçon n'est pas commencée ; son verdict reste affiché après coup.
  const [checkVerdict, setCheckVerdict] = useState<PlacementState | null>(null);

  useEffect(() => {
    void loadExercises(id).then(setBank);
  }, [id]);

  const mine = useMemo(() => answers.filter((a) => a.lessonId === id), [answers, id]);
  const progress = lessonProgress(mine);
  const review = lessonReview(mine);
  const point = data?.points.find((p) => p.id === id);
  const lesson = data?.lessons.find((l) => l.id === id);
  const traps = data?.traps.filter((t) => lesson?.traps.includes(t.id)) ?? [];

  /** Séance d'entraînement (10 exercices) ou de révision (5). */
  const start = (asReview = false) =>
    bank &&
    setSession({
      items: pickSession(bank, useApp.getState().grammarAnswers.filter((a) => a.lessonId === id), Math.random, asReview ? REVIEW_SIZE : SESSION_SIZE),
      review: asReview,
    });

  // Arrivée depuis « Réviser » (index Apprendre) : la révision démarre dès que la banque est chargée.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (startReview && bank?.length && review.due && !autoStarted.current) {
      autoStarted.current = true;
      start(true);
    }
  });

  if (data === undefined) return null;
  if (!point || !lesson) return <div className="page">Leçon introuvable.</div>;

  if (session)
    return (
      <ExerciseSession
        key={session.items.map((e) => e.id).join()}
        lessonId={id}
        title={point.title}
        items={session.items}
        review={session.review}
        onAgain={() => start(false)}
        onClose={() => setSession(null)}
      />
    );

  return (
    <div className="page lesson-page">
      <button className="link small" onClick={() => navigate({ name: 'learn' })}>
        <ArrowLeft size={14} /> Apprendre
      </button>
      <div className="page-header" style={{ marginTop: 8 }}>
        <div>
          <span className="chip">{point.level}</span>
          <h1 className="page-title" style={{ marginTop: 6 }}>
            {point.title}
          </h1>
          <p className="page-subtitle">{lesson.summary}</p>
        </div>
      </div>

      {placement?.status === 'done' && progress.state === 'new' && needsCheck(placement, id) && !checkVerdict && (
        <LessonCheck id={id} onDone={setCheckVerdict} />
      )}
      {checkVerdict && (
        <section className={`card card-pad lesson-check lesson-check--${checkVerdict}`}>
          <strong>
            {checkVerdict === 'mastered'
              ? 'Point acquis : vous pouvez passer directement aux exercices.'
              : checkVerdict === 'learn'
                ? 'Mieux vaut lire la leçon avant les exercices.'
                : 'Encore incertain : un coup d’œil à la règle, puis les exercices trancheront.'}
          </strong>
          {checkVerdict === 'mastered' && bank && bank.length > 0 && (
            <Button variant="primary" onClick={() => start(false)}>
              Commencer les exercices ({SESSION_SIZE})
            </Button>
          )}
        </section>
      )}

      <section className="card card-pad stack stack--sm">
        <div className="row row--between">
          <strong>{progressLabel(progress)}</strong>
          <span className="muted small">
            Acquise à {MASTERY_TARGET} bonnes réponses sur les {MASTERY_WINDOW} dernières
          </span>
        </div>
        <LessonBar progress={progress} large />
        <div className="row" style={{ marginTop: 6 }}>
          {bank === null ? (
            <span className="muted row">
              <Loader2 size={14} className="spin" /> Préparation des exercices…
            </span>
          ) : bank.length && review.due ? (
            <>
              <Button variant="primary" onClick={() => start(true)} shortcut="Entrée">
                <RotateCcw size={15} /> Réviser la leçon ({REVIEW_SIZE})
              </Button>
              <Button onClick={() => start(false)}>S'entraîner ({SESSION_SIZE})</Button>
            </>
          ) : bank.length ? (
            <Button variant="primary" onClick={() => start(false)} shortcut="Entrée">
              {progress.state === 'mastered' ? "S'entraîner encore" : progress.state === 'new' ? 'Commencer les exercices' : 'Continuer les exercices'} ({SESSION_SIZE})
            </Button>
          ) : (
            <span className="muted small">Exercices en préparation : la banque de phrases de cette leçon arrive avec la prochaine mise à jour.</span>
          )}
          {bank && bank.length > 0 && <span className="muted small">{bank.length} phrases réelles, tirées au hasard à chaque séance</span>}
        </div>
        <div className="muted small">
          {review.due
            ? review.lapsed
              ? 'À retravailler : la dernière révision a été manquée.'
              : `À réviser : ${REVIEW_SIZE} exercices, ${REVIEW_PASS} justes pour la valider.`
            : review.dueAt
              ? `Prochaine révision ${dueLabel(review.dueAt)}.`
              : `Une fois acquise, la leçon reviendra en révision 3 jours plus tard, puis à intervalles croissants.`}
        </div>
      </section>

      <section className="card card-pad lesson-section">
        <h2 className="card-title">La règle</h2>
        <ul className="lesson-rules">
          {lesson.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="card card-pad lesson-section">
        <h2 className="card-title">Exemples</h2>
        <ul className="lesson-examples">
          {lesson.examples.map((ex) => (
            <li key={ex.en}>
              <button className="icon-btn" title="Écouter" onClick={() => speakText(ex.en, universeId)}>
                <Volume2 size={15} />
              </button>
              <span>
                <span lang="en" className="lesson-example-en">
                  {ex.en}
                </span>
                <span className="muted small">{ex.fr}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {traps.length > 0 && (
        <section className="card card-pad lesson-section">
          <h2 className="card-title">Pièges à éviter</h2>
          <ul className="lesson-traps">
            {traps.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong>
                <span>
                  <s className="trap-wrong" lang="en">
                    {t.wrong}
                  </s>{' '}
                  → <span lang="en">{t.right}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <StartOnEnter enabled={!!bank?.length} onStart={() => start(review.due)} />
    </div>
  );
}

function StartOnEnter({ enabled, onStart }: { enabled: boolean; onStart: () => void }) {
  useHotkeys({ enter: onStart }, { enabled });
  return null;
}

type Result = { correct: boolean; given: string };

/** Séance de 10 exercices : réponse, correction immédiate, bilan, « Nouvelles phrases ». */
function ExerciseSession({
  lessonId,
  title,
  items,
  review = false,
  onAgain,
  onClose,
}: {
  lessonId: string;
  title: string;
  items: Exercise[];
  review?: boolean;
  onAgain: () => void;
  onClose: () => void;
}) {
  const { answerGrammar, reportGrammar, toast } = useApp.getState();
  const answers = useApp((s) => s.grammarAnswers);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [score, setScore] = useState({ right: 0, done: 0, reported: 0 });
  const input = useRef<HTMLInputElement>(null);
  const ex = items[index];
  const finished = index >= items.length;
  const progress = lessonProgress(answers.filter((a) => a.lessonId === lessonId));
  const reviewState = lessonReview(answers.filter((a) => a.lessonId === lessonId));

  useEffect(() => {
    if (!result) input.current?.focus();
  }, [index, result]);

  const focus = useFocusMeter();
  const submit = (given: string) => {
    if (!ex || result || !given.trim()) return;
    const correct = ex.choices ? given === ex.answer : isCorrect(ex, given);
    setResult({ correct, given });
    setScore((s) => ({ ...s, right: s.right + (correct ? 1 : 0), done: s.done + 1 }));
    focus.add({ kind: 'grammar', at: Date.now(), itemId: ex.id, correct, typed: !ex.choices });
    void answerGrammar({ lessonId, itemId: ex.id, correct, reported: false, createdAt: Date.now() }).catch((err) => toast('error', errorMessage(err)));
  };

  const next = () => {
    setResult(null);
    setTyped('');
    setIndex((i) => i + 1);
  };

  /** La phrase n'illustre pas la leçon : retirée, la réponse ne compte pas. */
  const report = () => {
    if (!ex) return;
    void reportGrammar(lessonId, ex.id).catch((err) => toast('error', errorMessage(err)));
    if (result) setScore((s) => ({ right: s.right - (result.correct ? 1 : 0), done: s.done - 1, reported: s.reported + 1 }));
    else setScore((s) => ({ ...s, reported: s.reported + 1 }));
    toast('info', 'Phrase retirée de la leçon. Merci : cela améliore les exercices.');
    next();
  };

  useHotkeys(
    {
      enter: () => (finished ? (review ? onClose() : onAgain()) : result ? next() : ex?.choices ? undefined : submit(typed)),
      '1': () => ex?.choices && !result && submit(ex.choices[0]),
      '2': () => ex?.choices && !result && submit(ex.choices[1]),
      escape: onClose,
    },
    { allowInInputs: ['enter', 'escape'] },
  );

  return (
    <div className="session">
      <div className="session-top">
        <Button variant="ghost" size="sm" onClick={onClose} title="Retour à la leçon (Échap)">
          <ArrowLeft size={16} /> {title} <Kbd>Échap</Kbd>
        </Button>
        <div className="session-progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={index}>
          <span style={{ width: `${(Math.min(index, items.length) / items.length) * 100}%` }} />
        </div>
        <span className="session-count">
          {Math.min(index + (finished ? 0 : 1), items.length)} / {items.length}
        </span>
      </div>
      <div className="session-stage">
        {finished ? (
          <div className="card summary">
            <div className="summary-title">
              {score.right} / {score.done} justes
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {review
                ? reviewState.due
                  ? `Révision incomplète (une phrase signalée ne compte pas) : elle reste à faire.`
                  : reviewState.lapsed
                    ? `Révision manquée : il fallait ${REVIEW_PASS} bonnes réponses sur ${REVIEW_SIZE}. La leçon revient demain ; relisez la règle d'ici là.`
                    : `Révision réussie : prochaine révision ${reviewState.dueAt ? dueLabel(reviewState.dueAt) : ''}.`
                : progress.state === 'mastered'
                ? `Leçon acquise : au moins ${MASTERY_TARGET} bonnes réponses sur les ${MASTERY_WINDOW} dernières. Vous pouvez continuer à vous entraîner.`
                : `Leçon : ${progress.correct} bonnes réponses sur les ${MASTERY_WINDOW} dernières (objectif ${MASTERY_TARGET}).`}
              {score.reported > 0 && ` ${score.reported} phrase${score.reported > 1 ? 's' : ''} signalée${score.reported > 1 ? 's' : ''}, non comptée${score.reported > 1 ? 's' : ''}.`}
            </p>
            <div style={{ margin: '16px 0' }}>
              <LessonBar progress={progress} large />
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              {review ? (
                <>
                  <Button variant="primary" onClick={onClose} shortcut="Entrée">
                    Revoir la leçon
                  </Button>
                  <Button onClick={onAgain}>
                    <RefreshCw size={15} /> S'entraîner ({SESSION_SIZE})
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="primary" onClick={onAgain} shortcut="Entrée">
                    <RefreshCw size={15} /> Nouvelles phrases
                  </Button>
                  <Button onClick={onClose}>Revoir la leçon</Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="card flashcard exercise-card">
            <div className="flashcard-meta">
              <span>{ex.choices ? 'Choisissez la bonne forme' : `Complétez avec le verbe ${ex.hint ? `« ${ex.hint} »` : ''}`.trim()}</span>
            </div>
            <p className="exercise-sentence" lang="en">
              {ex.before}
              {result ? (
                <span className={`exercise-blank exercise-blank--${result.correct ? 'ok' : 'ko'}`}>{ex.answer}</span>
              ) : ex.choices ? (
                <span className="exercise-blank">{' '.repeat(8)}</span>
              ) : (
                <input
                  ref={input}
                  className="exercise-input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  size={Math.max(8, ex.answer.length + 2)}
                  autoComplete="off"
                  spellCheck={false}
                  lang="en"
                  aria-label="Votre réponse"
                />
              )}
              {!result && ex.hint && !ex.choices && <span className="exercise-hint"> ({ex.hint})</span>}
              {ex.after}
            </p>
            <p className="exercise-translation">
              <span className="muted small">Traduction : </span>
              {ex.fr}
            </p>
            {!result && ex.choices && (
              <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
                {ex.choices.map((c, i) => (
                  <Button key={c} className="exercise-choice" onClick={() => submit(c)}>
                    {c} <Kbd>{String(i + 1)}</Kbd>
                  </Button>
                ))}
              </div>
            )}
            {!result && !ex.choices && (
              <div className="row" style={{ justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => submit(typed)} disabled={!typed.trim()} shortcut="Entrée">
                  Vérifier
                </Button>
              </div>
            )}
            {result && (
              <div className="stack stack--sm" style={{ alignItems: 'center' }}>
                <div className={`verdict ${result.correct ? 'verdict--ok' : 'verdict--ko'}`}>
                  {result.correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {result.correct
                    ? ex.choices || isCorrect({ ...ex, accept: undefined }, result.given)
                      ? 'Juste'
                      : `Juste. Ici « ${result.given.trim()} » convient aussi ; forme attendue : ${ex.answer}`
                    : `Réponse : ${ex.answer}${result.given ? ` (vous : ${result.given})` : ''}`}
                </div>
                <Button variant="primary" onClick={next} shortcut="Entrée">
                  {index + 1 < items.length ? 'Suivant' : 'Voir le bilan'}
                </Button>
              </div>
            )}
            <button className="link small exercise-report" onClick={report} title="La phrase n'illustre pas la leçon, ou la réponse attendue est discutable">
              <Flag size={12} /> Cette phrase ne correspond pas à la leçon
            </button>
          </div>
        )}
      </div>
      <FocusFooter state={focus.state} />
    </div>
  );
}

/**
 * Mini-test au début d'une leçon : le test de placement n'a pas tranché ce point (« à consolider »). Trois questions
 * de la banque du placement disent s'il est acquis (on peut passer aux exercices) ou à apprendre (lire la leçon).
 */
function LessonCheck({ id, onDone }: { id: string; onDone: (state: PlacementState) => void }) {
  const universe = useApp((s) => s.universe);
  const placement = useApp((s) => s.settings.placement);
  const record = universe ? placement[universe.id] : undefined;
  const { updateSettings, toast } = useApp.getState();
  const [items, setItems] = useState<PlacementItem[] | null>(null);
  const [started, setStarted] = useState(false);
  const [responses, setResponses] = useState<{ response: PlacementResponse; mode: 'typed' | 'choice'; choices?: number }[]>([]);
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadPlacementItems().then((bank) => setItems(checkItems(bank, id)));
  }, [id]);
  const item = items?.[responses.length];
  useEffect(() => {
    if (started && item?.mode === 'typed') input.current?.focus();
  }, [started, item?.id, item?.mode]);

  if (!record || record.status !== 'done' || !items || items.length < 2) return null;

  const respond = (response: PlacementResponse) => {
    if (!item) return;
    const next = [...responses, { response, mode: item.mode, choices: item.choices }];
    setResponses(next);
    setTyped('');
    if (next.length < items.length) return;
    const prior = record.results.find((r) => r.id === id)?.probability ?? 0.5;
    const check = checkResult(prior, next);
    void updateSettings({ placement: { ...placement, [universe!.id]: { ...record, checks: { ...record.checks, [id]: check } } } })
      .then(() => onDone(check.state))
      .catch((err) => toast('error', errorMessage(err)));
  };
  const submitTyped = () =>
    item && typed.trim() && respond(isCorrect({ id: item.id, en: '', fr: '', before: item.before, after: item.after, answer: item.answer, accept: item.accept }, typed) ? 'correct' : 'incorrect');

  if (!started)
    return (
      <section className="card card-pad lesson-check">
        <div>
          <strong>Le test de placement n'a pas tranché pour ce point.</strong>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            {items.length} questions pour savoir si vous pouvez passer directement aux exercices, ou s'il vaut mieux lire la leçon d'abord.
          </p>
        </div>
        <Button variant="primary" onClick={() => setStarted(true)}>
          Faire les {items.length} questions
        </Button>
      </section>
    );
  if (!item) return null;
  return (
    <section className="card card-pad lesson-check lesson-check--running">
      <span className="muted small">
        Question {responses.length + 1} sur {items.length} · {item.mode === 'choice' ? 'choisissez la bonne forme' : `complétez avec « ${item.hint} »`}
      </span>
      <p className="exercise-sentence" lang="en">
        {item.before}
        {item.mode === 'typed' ? (
          <input
            ref={input}
            className="exercise-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitTyped()}
            size={Math.max(8, item.answer.length + 2)}
            autoComplete="off"
            spellCheck={false}
            lang="en"
            aria-label="Votre réponse"
          />
        ) : (
          <span className="exercise-blank">{' '.repeat(8)}</span>
        )}
        {item.after}
      </p>
      <p className="exercise-translation">
        <span className="muted small">Traduction : </span>
        {item.fr}
      </p>
      <div className="row row--wrap" style={{ justifyContent: 'center', gap: 10 }}>
        {item.mode === 'choice' ? (
          item.options!.map((o) => (
            <Button key={o} className="exercise-choice" onClick={() => respond(o === item.answer ? 'correct' : 'incorrect')}>
              {o}
            </Button>
          ))
        ) : (
          <Button variant="primary" onClick={submitTyped} disabled={!typed.trim()}>
            Valider
          </Button>
        )}
        <button className="link small" onClick={() => respond('unknown')}>
          Je ne sais pas
        </button>
      </div>
    </section>
  );
}
