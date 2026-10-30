import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, Volume2, XCircle } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { scheduleSync } from '@/app/sync';
import { checkVerb, IRREGULAR_VERBS, pickVerbs, verbStates, verbSummary, type IrregularVerb, type VerbAnswer } from '@/core/learn/irregularVerbs';
import { loadVerbAnswers, recordVerbAnswer } from '@/core/repo/learnRepo';
import { Button, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { speakText } from '@/ui/speech';
import { FocusFooter, useFocusMeter } from '@/ui/features/progress/FocusFooter';

const TIER_LABEL: Record<number, string> = { 1: 'Les plus courants', 2: 'Courants', 3: 'Moins fréquents' };

/** Verbes irréguliers : séance de 10 verbes (à revoir, puis nouveaux), prétérit et participe à taper. */
export function VerbsPage() {
  const db = useApp((s) => s.db);
  const universe = useApp((s) => s.universe);
  const { navigate, toast } = useApp.getState();
  const [answers, setAnswers] = useState<VerbAnswer[] | null>(null);
  const [session, setSession] = useState<IrregularVerb[] | null>(null);

  useEffect(() => {
    if (!db || !universe) return;
    void loadVerbAnswers(db, universe.id)
      .then(setAnswers)
      .catch((err) => toast('error', errorMessage(err)));
  }, [db, universe, toast]);

  const start = () => answers && setSession(pickVerbs(answers));
  useHotkeys({ enter: () => !session && start(), escape: () => !session && navigate({ name: 'learn' }) }, { enabled: !session });

  if (!universe) return null;
  if (!answers)
    return (
      <div className="page">
        <p className="muted row">
          <Loader2 size={16} className="spin" /> Chargement…
        </p>
      </div>
    );
  if (session)
    return (
      <VerbSession
        key={session.map((v) => v.base).join()}
        verbs={session}
        onAnswer={(a) => setAnswers((list) => [...(list ?? []), a])}
        onAgain={() => setSession(pickVerbs(answers))}
        onClose={() => {
          setSession(null);
          useApp.setState((s) => ({ revision: s.revision + 1 }));
        }}
      />
    );
  return <VerbsOverview answers={answers} onStart={start} />;
}

function VerbsOverview({ answers, onStart }: { answers: VerbAnswer[]; onStart: () => void }) {
  const { navigate } = useApp.getState();
  const summary = verbSummary(answers);
  const states = useMemo(() => new Map(verbStates(answers).map((s) => [s.base, s])), [answers]);
  const next = pickVerbs(answers);
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="link small" onClick={() => navigate({ name: 'learn' })}>
            <ArrowLeft size={13} /> Apprendre
          </button>
          <h1 className="page-title">Verbes irréguliers</h1>
          <p className="page-subtitle">
            La base et sa traduction ; vous tapez le prétérit et le participe passé. Chaque verbe revient selon vos réponses (1, 3, 7, 21 puis 60 jours après
            des réponses justes, tout de suite après une erreur) ; il est maîtrisé après 3 réponses justes de suite, sur 3 jours différents.
          </p>
        </div>
        <div className="row">
          <Button variant="primary" onClick={onStart} disabled={!next.length} shortcut="Entrée">
            {summary.due ? `Réviser (${Math.min(summary.due, 10)})` : 'Commencer'}
          </Button>
        </div>
      </div>
      <div className="progress-today">
        {(
          [
            ['Maîtrisés', `${summary.mastered} / ${summary.total}`],
            ['Déjà vus', String(summary.seen)],
            ['À revoir maintenant', String(summary.due)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="progress-fact">
            <span className="hero-fact-label">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
      <details className="verb-reference">
        <summary>Liste des {summary.total} verbes</summary>
        <p className="muted small">Pour réviser hors séance : les verbes déjà maîtrisés sont marqués en vert, ceux en cours d'apprentissage en jaune.</p>
        {[1, 2, 3].map((tier) => (
          <section key={tier} className="learn-level">
            <h2 className="section-title">{TIER_LABEL[tier]}</h2>
            <div className="verb-list">
              {IRREGULAR_VERBS.filter((v) => v.tier === tier).map((v) => {
                const s = states.get(v.base)!;
                const state = s.mastered ? 'mastered' : s.answers ? 'seen' : 'new';
                return (
                  <div
                    key={v.base}
                    className={`verb-row verb-row--${state}`}
                    title={s.mastered ? 'Maîtrisé' : s.answers ? `${s.streak} réponse(s) juste(s) de suite` : 'Pas encore vu'}
                  >
                    <span lang="en">
                      <strong>{v.base}</strong> · {v.past.join(' / ')} · {v.participle.join(' / ')}
                    </span>
                    <span className="muted small">{v.fr}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </details>
    </div>
  );
}

function VerbSession({
  verbs,
  onAnswer,
  onAgain,
  onClose,
}: {
  verbs: IrregularVerb[];
  onAnswer: (a: VerbAnswer) => void;
  onAgain: () => void;
  onClose: () => void;
}) {
  const db = useApp((s) => s.db)!;
  const universe = useApp((s) => s.universe)!;
  const { toast } = useApp.getState();
  // Un verbe raté revient une fois en fin de séance.
  const [queue, setQueue] = useState(verbs);
  const [index, setIndex] = useState(0);
  const [past, setPast] = useState('');
  const [participle, setParticiple] = useState('');
  const [result, setResult] = useState<{ pastOk: boolean; participleOk: boolean } | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const pastInput = useRef<HTMLInputElement>(null);
  const participleInput = useRef<HTMLInputElement>(null);
  const focus = useFocusMeter();
  const verb = queue[index];
  const finished = index >= queue.length;

  useEffect(() => {
    if (!result) pastInput.current?.focus();
  }, [index, result]);

  const submit = () => {
    if (!verb || result || !past.trim() || !participle.trim()) return;
    const r = checkVerb(verb, past, participle);
    const at = Date.now();
    const answer: VerbAnswer = { verb: verb.base, at, ...r };
    setResult(r);
    const correct = r.pastOk && r.participleOk;
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    focus.add({ kind: 'verb', at, verb: verb.base, correct });
    onAnswer(answer);
    void recordVerbAnswer(db, universe.id, { ...answer, pastGiven: past, participleGiven: participle })
      .then(() => scheduleSync())
      .catch((err) => toast('error', errorMessage(err)));
    if (!correct && queue.slice(index + 1).every((v) => v.base !== verb.base) && queue.filter((v) => v.base === verb.base).length < 2)
      setQueue((q) => [...q, verb]);
  };
  const next = () => {
    setResult(null);
    setPast('');
    setParticiple('');
    setIndex((i) => i + 1);
  };

  useHotkeys(
    {
      enter: () => {
        if (finished) return onAgain();
        if (result) return next();
        if (document.activeElement === pastInput.current && past.trim() && !participle.trim()) return participleInput.current?.focus();
        submit();
      },
      escape: onClose,
      'mod+p': () => verb && speakText(`${verb.base}, ${verb.past[0]}, ${verb.participle[0]}`, universe.id),
    },
    { allowInInputs: ['enter', 'escape', 'mod+p'] },
  );

  const top = (
    <div className="session-top">
      <Button variant="ghost" size="sm" onClick={onClose}>
        <ArrowLeft size={16} /> Terminer <Kbd>Échap</Kbd>
      </Button>
      <div className="session-progress" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index}>
        <span style={{ width: `${(Math.min(index, queue.length) / queue.length) * 100}%` }} />
      </div>
      <span className="session-count">
        {Math.min(index + 1, queue.length)} / {queue.length}
      </span>
    </div>
  );

  if (finished)
    return (
      <div className="session">
        {top}
        <div className="session-stage">
          <div className="card summary">
            <div className="summary-title">Séance terminée</div>
            <p className="muted">
              {score.right} réponse{score.right > 1 ? 's' : ''} juste{score.right > 1 ? 's' : ''} sur {score.total}. Les verbes ratés reviendront à la prochaine
              séance.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={onAgain} shortcut="Entrée">
                <RefreshCw size={15} /> Autres verbes
              </Button>
              <Button onClick={onClose}>Retour à la liste</Button>
            </div>
          </div>
        </div>
        <FocusFooter state={focus.state} />
      </div>
    );

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    ref: React.RefObject<HTMLInputElement | null>,
    ok: boolean | undefined,
    forms: string[],
  ) => (
    <label className="verb-field">
      <span className="muted small">{label}</span>
      <input
        ref={ref}
        className={`exercise-input${ok === undefined ? '' : ok ? ' exercise-input--ok' : ' exercise-input--ko'}`}
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={!!result}
        autoComplete="off"
        spellCheck={false}
        lang="en"
        size={14}
      />
      {result && !ok && <span className="small verb-answer">{forms.join(' / ')}</span>}
    </label>
  );

  return (
    <div className="session">
      {top}
      <div className="session-stage">
        <div className="card flashcard exercise-card">
          <div className="flashcard-meta">
            <span>Prétérit et participe passé</span>
          </div>
          <p className="exercise-sentence" lang="en">
            <strong>{verb.base}</strong>{' '}
            <button className="link" onClick={() => speakText(verb.base, universe.id)} title="Écouter (Ctrl P : les trois formes)" aria-label="Écouter">
              <Volume2 size={16} />
            </button>
          </p>
          <p className="exercise-translation">{verb.fr}</p>
          <div className="row row--wrap" style={{ justifyContent: 'center', gap: 16 }}>
            {field('Prétérit', past, setPast, pastInput, result?.pastOk, verb.past)}
            {field('Participe passé', participle, setParticiple, participleInput, result?.participleOk, verb.participle)}
          </div>
          {!result ? (
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <Button variant="primary" onClick={submit} disabled={!past.trim() || !participle.trim()} shortcut="Entrée">
                Vérifier
              </Button>
            </div>
          ) : (
            <div className="stack stack--sm" style={{ alignItems: 'center', marginTop: 12 }}>
              <div className={`verdict ${result.pastOk && result.participleOk ? 'verdict--ok' : 'verdict--ko'}`}>
                {result.pastOk && result.participleOk ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                <span lang="en">
                  {verb.base} · {verb.past.join(' / ')} · {verb.participle.join(' / ')}
                </span>
              </div>
              <Button variant="primary" onClick={next} shortcut="Entrée">
                {index + 1 < queue.length ? 'Suivant' : 'Voir le bilan'}
              </Button>
            </div>
          )}
        </div>
      </div>
      <FocusFooter state={focus.state} />
    </div>
  );
}
