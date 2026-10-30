import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GraduationCap, Loader2, RotateCcw } from 'lucide-react';
import { useApp } from '@/app/store';
import { lessonProgress, MASTERY_TARGET, MASTERY_WINDOW, type LessonProgress } from '@/core/learn/progress';
import { dueLabel, REVIEW_SIZE } from '@/core/learn/review';
import { Button, EmptyState } from '@/ui/components/ui';
import { useGrammarData, type GrammarPoint } from './grammarData';
import { useLessonReviews } from './reviews';
import { placementSummary, pointState, STATE_LABEL, suggestedLesson } from '@/core/learn/placementResults';
import { verbSummary } from '@/core/learn/irregularVerbs';
import { loadVerbAnswers } from '@/core/repo/learnRepo';

/** « Plus tard » : la proposition du test revient à la prochaine ouverture de l'application. */
let placementLater = false;

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Barre de progression d'une leçon : bonnes réponses parmi les 20 dernières (objectif 18). */
export function LessonBar({ progress, large = false }: { progress: LessonProgress; large?: boolean }) {
  const pct = Math.round(progress.ratio * 100);
  const target = (MASTERY_TARGET / MASTERY_WINDOW) * 100;
  return (
    <div className={`lesson-bar ${large ? 'lesson-bar--large' : ''} ${progress.state === 'mastered' ? 'lesson-bar--done' : ''}`} aria-label={`${progress.correct} bonnes réponses sur les ${MASTERY_WINDOW} dernières`}>
      <span className="lesson-bar-fill" style={{ width: `${pct}%` }} />
      <span className="lesson-bar-target" style={{ left: `${target}%` }} title={`Objectif : ${MASTERY_TARGET} sur ${MASTERY_WINDOW}`} />
    </div>
  );
}

export function progressLabel(p: LessonProgress): string {
  if (p.state === 'mastered') return 'Acquise';
  if (p.state === 'new') return 'À commencer';
  return `${p.correct} / ${MASTERY_WINDOW} justes (objectif ${MASTERY_TARGET})`;
}

/** Onglet Apprendre : index des leçons de grammaire, par niveau, avec leur progression. */
export function LearnPage() {
  const language = useApp((s) => s.universe?.language ?? 'en');
  const answers = useApp((s) => s.grammarAnswers);
  const { navigate } = useApp.getState();
  const data = useGrammarData();
  const reviews = useLessonReviews();
  const universe = useApp((s) => s.universe);
  const placementAll = useApp((s) => s.settings.placement);
  const placement = universe ? placementAll[universe.id] : undefined;
  const [later, setLater] = useState(placementLater);
  const verbs = useVerbSummary();

  const progressOf = useMemo(() => {
    const byLesson = new Map<string, typeof answers>();
    for (const a of answers) byLesson.set(a.lessonId, [...(byLesson.get(a.lessonId) ?? []), a]);
    return (id: string) => lessonProgress(byLesson.get(id) ?? []);
  }, [answers]);

  if (language !== 'en') {
    return (
      <div className="page">
        <h1 className="page-title">Apprendre</h1>
        <div className="card">
          <EmptyState icon={<GraduationCap size={36} />} title="Disponible en anglais pour l'instant">
            <p>Les leçons de grammaire arrivent d'abord pour l'anglais. Passez à votre univers Anglais pour les suivre.</p>
          </EmptyState>
        </div>
      </div>
    );
  }
  if (data === undefined)
    return (
      <div className="page">
        <p className="muted row">
          <Loader2 size={16} className="spin" /> Chargement des leçons…
        </p>
      </div>
    );
  if (!data) return <div className="page">Leçons indisponibles.</div>;

  const available = new Set(data.lessons.map((l) => l.id));
  const lessons = data.points.filter((p) => available.has(p.id));
  const mastered = lessons.filter((p) => progressOf(p.id).state === 'mastered').length;

  const dueLessons = lessons.filter((p) => reviews.due.includes(p.id));
  const done = placement?.status === 'done' ? placement : null;
  const suggested = done ? suggestedLesson(done, lessons.map((p) => p.id), (id) => progressOf(id).state === 'mastered') : null;
  const suggestedPoint = lessons.find((p) => p.id === suggested);
  const skip = () => universe && void useApp.getState().updateSettings({ placement: { ...placementAll, [universe.id]: { status: 'skipped', at: Date.now() } } });

  const card = (p: GrammarPoint) => {
    const prog = progressOf(p.id);
    const review = reviews.of(p.id);
    return (
      <button key={p.id} className={`lesson-card lesson-card--${prog.state} ${review.due ? 'lesson-card--due' : ''}`} onClick={() => navigate({ name: 'lesson', id: p.id })}>
        <span className="row row--between">
          <span className="chip">{p.level}</span>
          {review.due ? (
            <span className="chip chip--due">
              <RotateCcw size={12} /> À réviser
            </span>
          ) : prog.state === 'mastered' ? (
            <CheckCircle2 size={16} color="var(--mastered)" />
          ) : (
            done &&
            prog.state === 'new' &&
            pointState(done, p.id) &&
            pointState(done, p.id) !== 'learn' && <span className={`chip chip--placement-${pointState(done, p.id)}`}>{STATE_LABEL[pointState(done, p.id)!]} au test</span>
          )}
        </span>
        <strong className="lesson-card-title">{p.title}</strong>
        <span className="muted small lesson-card-example" lang="en">
          {p.example}
        </span>
        <LessonBar progress={prog} />
        <span className="small">
          {progressLabel(prog)}
          {review.scheduled && !review.due && review.dueAt && <span className="muted"> · révision {dueLabel(review.dueAt)}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="page page--wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Apprendre</h1>
          <p className="page-subtitle">
            Grammaire anglaise : une explication courte avec plusieurs exemples, puis des exercices sur de vraies phrases, tirées au hasard. Une leçon est
            acquise à {MASTERY_TARGET} bonnes réponses sur les {MASTERY_WINDOW} dernières, puis revient en révision à intervalles croissants (3 jours,
            une semaine, deux semaines…).
          </p>
        </div>
      </div>

      <section className="card card-pad learn-overview">
        <div className="row row--between">
          <strong>
            {mastered} leçon{mastered > 1 ? 's' : ''} acquise{mastered > 1 ? 's' : ''} sur {lessons.length}
          </strong>
          <span className="muted small">Parcours complet : {data.points.length} points de A1 à C1, les autres leçons arrivent au fur et à mesure</span>
        </div>
        <div className="lesson-bar lesson-bar--large">
          <span className="lesson-bar-fill" style={{ width: `${lessons.length ? (mastered / lessons.length) * 100 : 0}%` }} />
        </div>
      </section>

      {!placement && !later && (
        <section className="card card-pad placement-offer">
          <div>
            <strong>Où en êtes-vous en grammaire ?</strong>
            <p className="muted small" style={{ margin: '4px 0 0' }}>
              Un test de 40 questions au plus (10 à 15 minutes) situe votre niveau sur les leçons disponibles et ce qu'elles supposent de connaître, et
              vous dit par quelle leçon commencer. Vous pourrez le refaire et corriger ses résultats.
            </p>
          </div>
          <div className="row">
            <Button variant="primary" onClick={() => navigate({ name: 'placement' })}>
              Faire le test
            </Button>
            <Button onClick={skip}>Commencer au début</Button>
            <Button
              variant="ghost"
              onClick={() => {
                placementLater = true;
                setLater(true);
              }}
            >
              Plus tard
            </Button>
          </div>
        </section>
      )}

      {done && (
        <section className="card card-pad placement-summary">
          <div className="row row--between row--wrap">
            <span>
              <strong>Test de placement</strong>{' '}
              <span className="muted small">
                · {placementSummary(done).mastered} points acquis, {placementSummary(done).consolidate} à consolider, {placementSummary(done).learn} à apprendre
              </span>
            </span>
            <span className="row">
              <button className="link small" onClick={() => navigate({ name: 'placement' })}>
                Voir les résultats
              </button>
              <button className="link small" onClick={() => navigate({ name: 'placement', retake: true })}>
                Refaire le test
              </button>
            </span>
          </div>
          {suggestedPoint && (
            <div className="row row--between" style={{ marginTop: 10 }}>
              <span className="small">
                Pour commencer : <strong>{suggestedPoint.title}</strong> <span className="muted">({suggestedPoint.level})</span>
              </span>
              <Button variant="primary" size="sm" onClick={() => navigate({ name: 'lesson', id: suggestedPoint.id })}>
                Ouvrir la leçon
              </Button>
            </div>
          )}
        </section>
      )}

      {placement?.status === 'skipped' && (
        <p className="muted small" style={{ margin: '0 0 16px' }}>
          Envie de savoir où vous en êtes ?{' '}
          <button className="link small" onClick={() => navigate({ name: 'placement' })}>
            Faire le test de placement
          </button>
        </p>
      )}

      {verbs && (
        <section className="card card-pad learn-verbs">
          <div className="row row--between row--wrap">
            <span>
              <strong>Verbes irréguliers</strong>{' '}
              <span className="muted small">
                · {verbs.mastered} maîtrisés sur {verbs.total}
                {verbs.due > 0 && `, ${verbs.due} à revoir`}
              </span>
            </span>
            <Button variant={verbs.due > 0 ? 'primary' : 'secondary'} size="sm" onClick={() => navigate({ name: 'verbs' })}>
              {verbs.seen ? "S'entraîner" : 'Découvrir'}
            </Button>
          </div>
        </section>
      )}

      {dueLessons.length > 0 && (
        <section className="card card-pad learn-due">
          <div className="row row--between">
            <div>
              <strong>
                {dueLessons.length} leçon{dueLessons.length > 1 ? 's' : ''} à réviser
              </strong>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Une règle acquise s'oublie si on ne la revoit pas : {REVIEW_SIZE} exercices suffisent pour la garder.
              </p>
            </div>
            <Button variant="primary" onClick={() => navigate({ name: 'lesson', id: dueLessons[0].id, review: true })}>
              <RotateCcw size={15} /> Réviser « {dueLessons[0].title} »
            </Button>
          </div>
          {dueLessons.length > 1 && (
            <p className="small" style={{ margin: '10px 0 0' }}>
              Ensuite : {dueLessons.slice(1).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ' · '}
                  <button className="link small" onClick={() => navigate({ name: 'lesson', id: p.id, review: true })}>
                    {p.title}
                  </button>
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      {LEVELS.filter((level) => lessons.some((p) => p.level === level)).map((level) => (
        <section key={level} className="learn-level">
          <h2 className="section-title">{level}</h2>
          <div className="lesson-grid">{lessons.filter((p) => p.level === level).map(card)}</div>
        </section>
      ))}

      <details className="card card-pad learn-later">
        <summary>
          Le parcours complet : {data.points.length - lessons.length} autres leçons à venir, de A1 à C1
        </summary>
        {LEVELS.map((level) => {
          const later = data.points.filter((p) => p.level === level && !available.has(p.id));
          return later.length ? (
            <p key={level} className="small" style={{ margin: '10px 0 0' }}>
              <strong>{level}</strong> <span className="muted">· {later.map((p) => p.title).join(' · ')}</span>
            </p>
          ) : null;
        })}
      </details>

      <p className="muted small" style={{ marginTop: 24 }}>
        Outil avancé :{' '}
        <button className="link small" onClick={() => navigate({ name: 'grammar-annotate' })}>
          mesurer le repérage de la grammaire dans vos livres
        </button>{' '}
        (sert à décider quels points pourront être surlignés en lisant).
      </p>
    </div>
  );
}

/** Bilan des verbes irréguliers de l'univers (maîtrisés, à revoir), relu après chaque séance. */
function useVerbSummary() {
  const db = useApp((s) => s.db);
  const universe = useApp((s) => s.universe);
  const revision = useApp((s) => s.revision);
  const [summary, setSummary] = useState<ReturnType<typeof verbSummary> | null>(null);
  useEffect(() => {
    if (!db || !universe) return;
    let alive = true;
    void loadVerbAnswers(db, universe.id)
      .then((a) => alive && setSummary(verbSummary(a)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [db, universe, revision]);
  return summary;
}
