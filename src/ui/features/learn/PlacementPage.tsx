import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import type { PlacementState } from '@/core/domain/settings';
import { isCorrect } from '@/core/learn/exercises';
import { DEFAULT_PLACEMENT_CONFIG, PlacementModel, type PlacementAnswer, type PlacementResponse } from '@/core/learn/placement';
import type { PlacementItem } from '@/core/learn/placementBank';
import {
  evidenceLabel,
  PLACEMENT_APP_CONFIG,
  placementRecord,
  placementScope,
  placementSummary,
  pointState,
  STATE_LABEL,
  type DoneRecord,
} from '@/core/learn/placementResults';
import { Button, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { loadPlacementItems, useGrammarData, type GrammarPoint } from './grammarData';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Test de placement : au plus 40 questions, puis l'état de chaque point du parcours, corrigeable. */
export function PlacementPage({ retake = false }: { retake?: boolean }) {
  const universe = useApp((s) => s.universe);
  const record = useApp((s) => (universe ? s.settings.placement[universe.id] : undefined));
  const [testing, setTesting] = useState(retake || record?.status !== 'done');
  if (!universe) return null;
  return testing || record?.status !== 'done' ? <PlacementTest onDone={() => setTesting(false)} /> : <PlacementResults record={record} onRetake={() => setTesting(true)} />;
}

function PlacementTest({ onDone }: { onDone: () => void }) {
  const data = useGrammarData();
  const universe = useApp((s) => s.universe)!;
  const placement = useApp((s) => s.settings.placement);
  const { navigate, updateSettings, toast } = useApp.getState();
  const [items, setItems] = useState<PlacementItem[] | null>(null);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadPlacementItems().then(setItems);
  }, []);

  const model = useMemo(() => {
    if (!data || !items?.length) return null;
    // Leçons existantes et leurs prérequis ; les autres points n'ont pas encore de leçon où servir le résultat.
    const scope = placementScope(data.points, data.lessons.map((l) => l.id));
    const ids = new Set(scope.map((p) => p.id));
    const targets = scope.map((p) => ({ id: p.id, kind: 'point' as const, requires: (p.requires ?? []).filter((r) => ids.has(r)), level: p.level }));
    return new PlacementModel(targets, items.filter((q) => ids.has(q.targetId)), PLACEMENT_APP_CONFIG);
  }, [data, items]);
  const byId = useMemo(() => new Map((items ?? []).map((q) => [q.id, q])), [items]);
  const decision = model && started ? model.next(answers) : null;
  const item = decision?.question ? byId.get(decision.question.id) ?? null : null;

  useEffect(() => {
    if (item?.mode === 'typed') input.current?.focus();
  }, [item?.id, item?.mode]);

  // Fin du test (confiance atteinte, 40 questions, ou plus de question utile) : enregistrement des résultats.
  useEffect(() => {
    if (!model || !started || !decision || decision.question) return;
    const rec = placementRecord(model.estimate(answers));
    void updateSettings({ placement: { ...placement, [universe.id]: rec } })
      .then(onDone)
      .catch((err) => toast('error', errorMessage(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision?.question, started]);

  const respond = (response: PlacementResponse) => {
    if (!model || !item) return;
    setAnswers((a) => model.answer(a, item.id, response));
    setTyped('');
  };
  const submitTyped = () => {
    if (!item || !typed.trim()) return;
    const ok = isCorrect({ id: item.id, en: '', fr: '', before: item.before, after: item.after, answer: item.answer, accept: item.accept }, typed);
    respond(ok ? 'correct' : 'incorrect');
  };
  const choose = (option: string) => respond(option === item?.answer ? 'correct' : 'incorrect');

  useHotkeys(
    {
      enter: () => (!started ? model && setStarted(true) : item?.mode === 'typed' ? submitTyped() : undefined),
      '1': () => item?.options?.[0] && choose(item.options[0]),
      '2': () => item?.options?.[1] && choose(item.options[1]),
      '3': () => item?.options?.[2] && choose(item.options[2]),
      '4': () => item?.options?.[3] && choose(item.options[3]),
      'mod+enter': () => item && respond('unknown'),
      escape: () => navigate({ name: 'learn' }),
    },
    { allowInInputs: ['enter', 'mod+enter', 'escape'] },
  );

  const max = DEFAULT_PLACEMENT_CONFIG.maxQuestions;
  const top = (
    <div className="session-top">
      <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'learn' })} title="Quitter le test (Échap) : rien n'est enregistré">
        <ArrowLeft size={16} /> Quitter <Kbd>Échap</Kbd>
      </Button>
      <div className="session-progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={answers.length}>
        <span style={{ width: `${(answers.length / max) * 100}%` }} />
      </div>
      <span className="session-count">{started ? `${answers.length + (item ? 1 : 0)} / ${max} au plus` : ''}</span>
    </div>
  );

  if (!model)
    return (
      <div className="session">
        {top}
        <div className="session-stage">
          <p className="muted row">
            <Loader2 size={16} className="spin" /> Préparation du test…
          </p>
        </div>
      </div>
    );

  if (!started)
    return (
      <div className="session">
        {top}
        <div className="session-stage">
          <div className="card summary placement-intro">
            <div className="summary-title">Test de placement</div>
            <p className="muted">
              {max} questions au plus, 10 à 15 minutes, sur les leçons disponibles et ce qu'elles supposent de connaître. Les questions s'adaptent à vos
              réponses, et ce que vous savez permet d'en déduire d'autres. Répondez sans chercher : « Je ne sais pas » vaut mieux qu'une réponse au hasard. Aucune correction pendant le
              test, les résultats arrivent à la fin, et vous pourrez les corriger.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => setStarted(true)} shortcut="Entrée">
                Commencer
              </Button>
            </div>
          </div>
        </div>
      </div>
    );

  if (!item)
    return (
      <div className="session">
        {top}
        <div className="session-stage">
          <p className="muted row">
            <Loader2 size={16} className="spin" /> Calcul des résultats…
          </p>
        </div>
      </div>
    );

  return (
    <div className="session">
      {top}
      <div className="session-stage">
        <div className="card flashcard exercise-card">
          <div className="flashcard-meta">
            <span>{item.mode === 'choice' ? 'Choisissez la bonne forme' : `Complétez avec « ${item.hint} »`}</span>
          </div>
          <p className="exercise-sentence" lang="en">
            {item.before}
            {item.mode === 'typed' ? (
              <input
                ref={input}
                className="exercise-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                size={Math.max(8, item.answer.length + 2)}
                autoComplete="off"
                spellCheck={false}
                lang="en"
                aria-label="Votre réponse"
              />
            ) : (
              <span className="exercise-blank">{' '.repeat(8)}</span>
            )}
            {item.mode === 'typed' && <span className="exercise-hint"> ({item.hint})</span>}
            {item.after}
          </p>
          <p className="exercise-translation">
            <span className="muted small">Traduction : </span>
            {item.fr}
          </p>
          {item.mode === 'choice' ? (
            <div className="row row--wrap" style={{ justifyContent: 'center', gap: 10 }}>
              {item.options!.map((o, i) => (
                <Button key={o} className="exercise-choice" onClick={() => choose(o)}>
                  {o} <Kbd>{String(i + 1)}</Kbd>
                </Button>
              ))}
            </div>
          ) : (
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={submitTyped} disabled={!typed.trim()} shortcut="Entrée">
                Valider
              </Button>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="link small" onClick={() => respond('unknown')}>
              Je ne sais pas <Kbd>Ctrl Entrée</Kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Résultats : chaque point du parcours par niveau, avec la nature de la preuve ; un clic corrige l'état. */
function PlacementResults({ record, onRetake }: { record: DoneRecord; onRetake: () => void }) {
  const data = useGrammarData();
  const universe = useApp((s) => s.universe)!;
  const placement = useApp((s) => s.settings.placement);
  const { navigate, updateSettings } = useApp.getState();
  const summary = placementSummary(record);
  const results = new Map(record.results.map((r) => [r.id, r]));

  const correct = (id: string, state: PlacementState) => {
    const estimated = results.get(id)?.state;
    const overrides = { ...record.overrides };
    if (state === estimated) delete overrides[id];
    else overrides[id] = state;
    void updateSettings({ placement: { ...placement, [universe.id]: { ...record, overrides } } });
  };

  const row = (p: GrammarPoint) => {
    const r = results.get(p.id);
    const state = pointState(record, p.id) ?? 'learn';
    const corrected = p.id in record.overrides;
    return (
      <div key={p.id} className={`placement-row placement-row--${state}`}>
        <span className="placement-row-title">{p.title}</span>
        <span className="muted small">{corrected ? 'corrigé par vous' : r ? evidenceLabel(r.evidence) : 'non testé'}</span>
        <select className="select placement-select" value={state} onChange={(e) => correct(p.id, e.target.value as PlacementState)} aria-label={`État de « ${p.title} »`}>
          {(['mastered', 'consolidate', 'learn'] as const).map((s) => (
            <option key={s} value={s}>
              {STATE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="page placement-results">
      <div className="page-header">
        <div>
          <h1 className="page-title">Test de placement</h1>
          <p className="page-subtitle">
            {summary.mastered} acquis · {summary.consolidate} à consolider · {summary.learn} à apprendre. Un point « déduit » ne vient pas d'une question
            posée : il découle d'un autre (connaître un point suppose ses prérequis) ou de votre niveau général. Corrigez librement un état qui ne vous ressemble pas.
          </p>
        </div>
        <div className="row">
          <Button onClick={onRetake}>Refaire le test</Button>
          <Button variant="primary" onClick={() => navigate({ name: 'learn' })}>
            Voir les leçons
          </Button>
        </div>
      </div>
      {data &&
        LEVELS.filter((level) => data.points.some((p) => p.level === level && results.has(p.id))).map((level) => (
          <section key={level} className="learn-level">
            <h2 className="section-title">{level}</h2>
            <div className="placement-list">{data.points.filter((p) => p.level === level && results.has(p.id)).map(row)}</div>
          </section>
        ))}
    </div>
  );
}
