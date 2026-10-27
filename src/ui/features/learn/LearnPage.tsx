import { useMemo } from 'react';
import { CheckCircle2, GraduationCap, Loader2 } from 'lucide-react';
import { useApp } from '@/app/store';
import { lessonProgress, MASTERY_TARGET, MASTERY_WINDOW, type LessonProgress } from '@/core/learn/progress';
import { EmptyState } from '@/ui/components/ui';
import { useGrammarData, type GrammarPoint } from './grammarData';

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

  const card = (p: GrammarPoint) => {
    const prog = progressOf(p.id);
    return (
      <button key={p.id} className={`lesson-card lesson-card--${prog.state}`} onClick={() => navigate({ name: 'lesson', id: p.id })}>
        <span className="row row--between">
          <span className="chip">{p.level}</span>
          {prog.state === 'mastered' && <CheckCircle2 size={16} color="var(--mastered)" />}
        </span>
        <strong className="lesson-card-title">{p.title}</strong>
        <span className="muted small lesson-card-example" lang="en">
          {p.example}
        </span>
        <LessonBar progress={prog} />
        <span className="small">{progressLabel(prog)}</span>
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
            acquise à {MASTERY_TARGET} bonnes réponses sur les {MASTERY_WINDOW} dernières.
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
