import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Flag, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import type { Exercise } from '@/core/learn/exercises';
import { explanation, MIX_GROUPS, mixedSession, mixLessonId, startedLessons, type MixedItem } from '@/core/learn/mixedPractice';
import { Button, EmptyState, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { FocusFooter, useFocusMeter } from '@/ui/features/progress/FocusFooter';
import { loadExercises, useGrammarData } from './grammarData';

/**
 * Révision mélangée d'un groupe de contrastes (src/core/learn/mixedPractice.ts) : la leçon d'origine n'est pas dite
 * avant la réponse ; après, une explication dit pourquoi cette forme convient.
 */
export function MixedPracticePage({ groupId }: { groupId: string }) {
  const group = MIX_GROUPS.find((g) => g.id === groupId);
  const answers = useApp((s) => s.grammarAnswers);
  const data = useGrammarData();
  const { navigate } = useApp.getState();
  const [banks, setBanks] = useState<Record<string, Exercise[]> | null>(null);
  const [session, setSession] = useState<MixedItem[] | null>(null);
  const lessons = group ? startedLessons(group, answers) : [];
  const lessonKey = lessons.join();

  useEffect(() => {
    void Promise.all(lessonKey.split(',').filter(Boolean).map(async (id) => [id, await loadExercises(id)] as const)).then((entries) => setBanks(Object.fromEntries(entries)));
  }, [lessonKey]);
  useEffect(() => {
    // Une séance par ouverture : les réponses enregistrées ensuite ne la recomposent pas.
    if (banks && !session) setSession(mixedSession(banks, Object.keys(banks), useApp.getState().grammarAnswers));
  }, [banks, session]);

  if (!group) return null;
  const close = () => navigate({ name: 'learn' });
  if (lessons.length < 2)
    return (
      <div className="page">
        <EmptyState title="Révision mélangée pas encore disponible">
          <p>Faites d'abord au moins 10 exercices dans deux leçons de ce groupe.</p>
          <Button onClick={close}>Retour à Apprendre</Button>
        </EmptyState>
      </div>
    );
  if (!session || !data)
    return (
      <div className="page">
        <p className="muted row">
          <Loader2 size={16} className="spin" /> Chargement…
        </p>
      </div>
    );
  const titles = new Map(data.points.map((p) => [p.id, p.title]));
  return (
    <MixedSession
      key={session.map((s) => s.ex.id).join()}
      groupId={group.id}
      title={group.title}
      items={session}
      lessonTitle={(id) => titles.get(id) ?? id}
      onAgain={() => setSession(mixedSession(banks!, Object.keys(banks!), useApp.getState().grammarAnswers))}
      onClose={close}
    />
  );
}

function MixedSession({
  groupId,
  title,
  items,
  lessonTitle,
  onAgain,
  onClose,
}: {
  groupId: string;
  title: string;
  items: MixedItem[];
  lessonTitle: (id: string) => string;
  onAgain: () => void;
  onClose: () => void;
}) {
  const { answerGrammar, reportGrammar, toast } = useApp.getState();
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ correct: boolean; given: string } | null>(null);
  const [score, setScore] = useState({ right: 0, done: 0 });
  const focus = useFocusMeter();
  const item = items[index];
  const finished = index >= items.length;

  const submit = (given: string) => {
    if (!item || result) return;
    const correct = given === item.ex.answer;
    setResult({ correct, given });
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), done: s.done + 1 }));
    focus.add({ kind: 'grammar', at: Date.now(), itemId: item.ex.id, correct, typed: false });
    // Enregistrée à part (mix:<groupe>) : la progression des leçons n'en dépend pas, la mesure du mélange si.
    void answerGrammar({ lessonId: mixLessonId(groupId), itemId: item.ex.id, correct, reported: false, createdAt: Date.now() }).catch((err) =>
      toast('error', errorMessage(err)),
    );
  };
  const next = () => {
    setResult(null);
    setIndex((i) => i + 1);
  };
  const report = () => {
    if (!item) return;
    // Signalée dans sa leçon d'origine : retirée de la leçon, du mélange et des banques à la génération suivante.
    void reportGrammar(item.lessonId, item.ex.id).catch((err) => toast('error', errorMessage(err)));
    if (result) setScore((s) => ({ right: s.right - (result.correct ? 1 : 0), done: s.done - 1 }));
    toast('info', 'Phrase retirée. Merci : cela améliore les exercices.');
    next();
  };

  const choices = item?.ex.choices ?? [];
  useHotkeys(
    {
      enter: () => (finished ? onAgain() : result ? next() : undefined),
      '1': () => choices[0] && !result && submit(choices[0]),
      '2': () => choices[1] && !result && submit(choices[1]),
      '3': () => choices[2] && !result && submit(choices[2]),
      escape: onClose,
    },
    { allowInInputs: ['escape'] },
  );

  return (
    <div className="session">
      <div className="session-top">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft size={16} /> Révision mélangée · {title} <Kbd>Échap</Kbd>
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
              Les exercices venaient de plusieurs leçons : il fallait reconnaître la règle d'après le contexte. Ces réponses ne changent pas la
              progression des leçons.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <Button variant="primary" onClick={onAgain} shortcut="Entrée">
                <RefreshCw size={15} /> Nouvelle séance
              </Button>
              <Button onClick={onClose}>Retour à Apprendre</Button>
            </div>
          </div>
        ) : (
          <div className="card flashcard exercise-card">
            <div className="flashcard-meta">
              <span>Choisissez la bonne forme</span>
            </div>
            <p className="exercise-sentence" lang="en">
              {item.ex.before}
              {result ? (
                <span className={`exercise-blank exercise-blank--${result.correct ? 'ok' : 'ko'}`}>{item.ex.answer}</span>
              ) : (
                <span className="exercise-blank">{' '.repeat(8)}</span>
              )}
              {item.ex.after}
            </p>
            <p className="exercise-translation">
              <span className="muted small">Traduction : </span>
              {item.ex.fr}
            </p>
            {!result ? (
              <div className="row row--wrap" style={{ justifyContent: 'center', gap: 10 }}>
                {choices.map((c, i) => (
                  <Button key={c} className="exercise-choice" onClick={() => submit(c)}>
                    {c} <Kbd>{String(i + 1)}</Kbd>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="stack stack--sm" style={{ alignItems: 'center' }}>
                <div className={`verdict ${result.correct ? 'verdict--ok' : 'verdict--ko'}`}>
                  {result.correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {result.correct ? 'Juste' : `Réponse : ${item.ex.answer} (vous : ${result.given})`}
                </div>
                <p className="mixed-explanation">
                  <span className="muted small">{lessonTitle(item.lessonId)} · </span>
                  {explanation(item.lessonId, item.ex.form) ?? ''}
                </p>
                <Button variant="primary" onClick={next} shortcut="Entrée">
                  {index + 1 < items.length ? 'Suivant' : 'Voir le bilan'}
                </Button>
              </div>
            )}
            <button className="link small exercise-report" onClick={report} title="La réponse attendue est discutable, ou une autre proposition convient aussi">
              <Flag size={12} /> Cette phrase pose problème
            </button>
          </div>
        )}
      </div>
      <FocusFooter state={focus.state} />
    </div>
  );
}
