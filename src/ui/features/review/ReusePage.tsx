import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Lightbulb, Loader2, Mic, RefreshCw, Volume2, XCircle } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { languageInfo } from '@/core/domain/languages';
import { checkSentence, markIssues, type GrammarIssue } from '@/core/grammar/languageTool';
import { ServiceUnavailable } from '@/core/platform/serverCheck';
import { classifyAnswer, expressionVariants, type AnswerFeedback } from '@/core/domain/errorKind';
import { ErrorFeedback } from '@/ui/components/ErrorFeedback';
import { findReuseSentences } from '@/core/translate/examples';
import {
  acceptedVariants,
  checkReuseSentence,
  checkReuseTyped,
  pickReuseNotes,
  reuseItem,
  STAGE_LABELS,
  usableSentences,
  type ReuseItem,
  type ReuseRating,
  type ReuseVerdict,
} from '@/core/srs/reuse';
import { Button, EmptyState, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { speakText } from '@/ui/speech';

/**
 * « Réutiliser mes expressions » (src/core/srs/reuse.ts) : une courte séance sur des expressions déjà retenues en
 * révision, à l'étape où en est chacune. Sans effet sur la planification.
 */
export function ReusePage({ limit }: { limit: number }) {
  const notes = useApp((s) => s.notes);
  const settings = useApp((s) => s.settings);
  const language = useApp((s) => s.universe?.language ?? 'en');
  const [items, setItems] = useState<ReuseItem[] | null>(null);
  const close = () => useApp.getState().navigate({ name: 'review' });

  useEffect(() => {
    if (items) return;
    // Une séance par ouverture : les réponses enregistrées ensuite ne la recomposent pas.
    const { reuseAnswers } = useApp.getState();
    const picked = pickReuseNotes(notes, reuseAnswers, settings, Date.now(), limit);
    // La recherche (mise en cache, partagée) n'est pas annulée : seul son résultat est ignoré si la page change.
    let cancelled = false;
    void Promise.all(
      picked.map(async ({ note, stage }) => {
        if (stage === 3) return reuseItem(note, 3, []);
        const found = await findReuseSentences(note.expression, language).catch(() => []);
        const used = new Set(reuseAnswers.filter((a) => a.noteId === note.id && a.sentenceId).map((a) => a.sentenceId));
        return reuseItem(note, stage, usableSentences(note, found, language, used));
      }),
    ).then((list) => !cancelled && setItems(list));
    return () => {
      cancelled = true;
    };
  }, [items, notes, settings, language, limit]);

  if (!items)
    return (
      <div className="page">
        <p className="muted row">
          <Loader2 size={16} className="spin" /> Recherche de phrases…
        </p>
      </div>
    );
  if (!items.length)
    return (
      <div className="page">
        <EmptyState title="Rien à réutiliser pour le moment">
          <p>L'entraînement porte sur les expressions que vous retrouvez déjà en révision ; chacune revient au plus tous les deux jours.</p>
          <Button onClick={close}>Retour à Réviser</Button>
        </EmptyState>
      </div>
    );
  return <ReuseSession key={items.map((i) => i.note.id).join()} items={items} language={language} onAgain={() => setItems(null)} onClose={close} />;
}

interface Result {
  given: string;
  verdict: ReuseVerdict;
  /** Note proposée (Entrée l'accepte) ; null : à choisir. */
  suggested: ReuseRating | null;
}

const RATINGS: { value: ReuseRating; label: string }[] = [
  { value: 1, label: 'À revoir' },
  { value: 2, label: 'À peu près' },
  { value: 3, label: 'Juste' },
];

function ReuseSession({ items, language, onAgain, onClose }: { items: ReuseItem[]; language: string; onAgain: () => void; onClose: () => void }) {
  const { answerReuse, saveNote, toast } = useApp.getState();
  const universeId = useApp((s) => s.universe?.id);
  const reuseAnswers = useApp((s) => s.reuseAnswers);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [grammar, setGrammar] = useState<GrammarState>(null);
  /** Numéro de la vérification en cours : une réponse arrivée après « suivant » est ignorée. */
  const grammarRequest = useRef(0);
  const [hint, setHint] = useState(false);
  const [keep, setKeep] = useState(false);
  const [ratings, setRatings] = useState<ReuseRating[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const item = items[index];
  const finished = index >= items.length;
  const accepted = useMemo(() => (item?.stage === 2 && item.sentence ? acceptedVariants(item.sentence, reuseAnswers) : []), [item, reuseAnswers]);

  useEffect(() => {
    if (!result) input.current?.focus();
  }, [index, result]);

  const submit = (spoken = false) => {
    if (!item || result) return;
    if (spoken) return setResult({ given: '', verdict: 'spoken', suggested: null });
    if (!typed.trim()) return;
    if (item.stage === 1) {
      const { verdict, rating } = checkReuseTyped(item, typed, language);
      if (verdict !== 'exact' && item.sentence) {
        const expected = [item.sentence.cloze.answers.join(' '), ...expressionVariants(item.note.expression)];
        const fb = classifyAnswer(expected, typed, language);
        setFeedback(fb);
        if (fb) useApp.getState().recordError({ source: 'reuse', itemId: item.note.id, kind: fb.kind, expected: expected[0], given: typed, createdAt: Date.now() });
      }
      return setResult({ given: typed, verdict, suggested: rating });
    }
    const { verdict, suggested } = checkReuseSentence(item.note, typed, language, accepted);
    setResult({ given: typed, verdict, suggested });
    // Phrase écrite : LanguageTool (serveur de l'utilisateur) signale les fautes possibles ; absent, rien ne change.
    const text = typed.trim();
    const request = ++grammarRequest.current;
    const show = (state: GrammarState) => request === grammarRequest.current && setGrammar(state);
    setGrammar('busy');
    checkSentence(text, language)
      .then((issues) => show(issues ? { text, issues } : null))
      .catch((err) => show(err instanceof ServiceUnavailable && err.silent ? null : { error: err instanceof Error ? err.message : String(err) }));
  };

  const rate = (rating: ReuseRating) => {
    if (!item || !result) return;
    setRatings((r) => [...r, rating]);
    void answerReuse({
      noteId: item.note.id,
      stage: item.stage,
      sentenceId: item.sentence?.id ?? 0,
      given: result.given,
      verdict: result.verdict,
      rating,
      createdAt: Date.now(),
    }).catch((err) => toast('error', errorMessage(err)));
    // Phrase personnelle gardée comme exemple : elle servira aussi aux phrases à trous des révisions.
    if (keep && item.stage === 3 && result.verdict === 'present' && rating === 3) {
      const n = item.note;
      void saveNote(
        {
          expression: n.expression,
          translation: n.translation,
          pronunciation: n.pronunciation,
          examples: [...n.examples, result.given.trim()],
          comment: n.comment,
          category: n.categoryAuto ? '' : n.category,
          tags: n.tags,
          collectionIds: n.collectionIds,
          isFavorite: n.isFavorite,
        },
        n.id,
      ).catch((err) => toast('error', errorMessage(err)));
    }
    setResult(null);
    setFeedback(null);
    grammarRequest.current++;
    setGrammar(null);
    setTyped('');
    setHint(false);
    setKeep(false);
    setIndex((i) => i + 1);
  };

  useHotkeys(
    {
      enter: () => (finished ? onAgain() : result?.suggested ? rate(result.suggested) : undefined),
      '1': () => result && rate(1),
      '2': () => result && rate(2),
      '3': () => result && rate(3),
      escape: onClose,
    },
    { allowInInputs: ['escape'] },
  );

  const speak = (text: string) => speakText(text, universeId);

  return (
    <div className="session">
      <div className="session-top">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft size={16} /> Réutiliser mes expressions <Kbd>Échap</Kbd>
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
              {ratings.filter((r) => r === 3).length} / {ratings.length} justes
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              Chaque expression réussie passe à l'étape suivante : une autre phrase, puis une intention, puis une phrase à vous. Ces réponses ne
              changent pas la planification des révisions.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <Button variant="primary" onClick={onAgain} shortcut="Entrée">
                <RefreshCw size={15} /> Nouvelle séance
              </Button>
              <Button onClick={onClose}>Retour à Réviser</Button>
            </div>
          </div>
        ) : (
          <div className="card flashcard exercise-card reuse-card">
            <div className="flashcard-meta">
              <span>
                Étape {item.stage} · {STAGE_LABELS[item.stage]}
              </span>
            </div>

            {item.stage === 1 && item.sentence && (
              <>
                <p className="cloze-sentence" lang={language}>
                  {item.sentence.cloze.parts.map((p, i) =>
                    p.blank ? (
                      <span key={i} className={`cloze-blank ${result ? 'cloze-blank--revealed' : ''}`}>
                        {result ? p.text : ' '.repeat(Math.max(6, p.text.length))}
                      </span>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </p>
                <p className="exercise-translation" lang="fr">
                  <span className="muted small">Traduction : </span>
                  {item.sentence.translation}
                </p>
              </>
            )}

            {item.stage === 2 && item.sentence && (
              <>
                <p className="muted small">Dites-le en {languageInfo(language).name.toLowerCase()}, en employant votre expression :</p>
                <p className="reuse-intention" lang="fr">
                  {item.sentence.translation}
                </p>
                <p className="muted small" lang="fr">
                  Avec : <strong className="text-2">{item.note.translation}</strong>
                  {hint || result ? (
                    <>
                      {' '}
                      (<span lang={language}>{item.note.expression}</span>)
                    </>
                  ) : (
                    <button className="link small" onClick={() => setHint(true)} style={{ marginLeft: 8 }}>
                      <Lightbulb size={12} /> Indice
                    </button>
                  )}
                </p>
              </>
            )}

            {item.stage === 3 && (
              <>
                <p className="reuse-intention" lang={language}>
                  {item.note.expression}
                </p>
                <p className="muted" lang="fr">
                  {item.note.translation}
                </p>
                <p className="muted small">Une phrase à vous : votre travail, vos projets, votre journée. Écrivez-la, ou dites-la à voix haute.</p>
              </>
            )}

            {!result ? (
              <div className="stack stack--sm" style={{ alignItems: 'stretch', marginTop: 12 }}>
                <input
                  ref={input}
                  className="input input--lg"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={
                    item.stage === 1
                      ? item.sentence && item.sentence.cloze.answers.length > 1
                        ? `${item.sentence.cloze.answers.length} mots, séparés par des espaces`
                        : 'Le mot manquant'
                      : 'Votre phrase'
                  }
                  autoComplete="off"
                  spellCheck={false}
                  lang={language}
                  aria-label="Votre réponse"
                />
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Button variant="primary" onClick={() => submit()} disabled={!typed.trim()} shortcut="Entrée">
                    Vérifier
                  </Button>
                  {item.stage === 3 && (
                    <Button onClick={() => submit(true)}>
                      <Mic size={15} /> Je l'ai dite à voix haute
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="stack stack--sm" style={{ marginTop: 12 }}>
                <Feedback item={item} result={result} language={language} onSpeak={speak} />
                <ErrorFeedback feedback={feedback} />
                <GrammarCheck state={grammar} language={language} />
                {item.stage === 3 && result.verdict === 'present' && (
                  <label className="row small" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={keep}
                      onChange={(e) => {
                        setKeep(e.target.checked);
                        // Les touches 1 à 3 et Entrée restent actives après avoir coché.
                        e.target.blur();
                      }}
                    />
                    Si elle est juste, l'ajouter aux exemples de la note
                  </label>
                )}
                <div className="row row--wrap" style={{ justifyContent: 'center', gap: 8 }}>
                  {RATINGS.map((r) => (
                    <Button key={r.value} variant={result.suggested === r.value ? 'primary' : 'secondary'} onClick={() => rate(r.value)}>
                      {r.label} <Kbd>{result.suggested === r.value ? `${r.value} · Entrée` : String(r.value)}</Kbd>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Feedback({ item, result, language, onSpeak }: { item: ReuseItem; result: Result; language: string; onSpeak: (text: string) => void }) {
  const ok = result.verdict === 'exact' || result.verdict === 'reference' || result.verdict === 'present';
  const reference = item.sentence?.text;
  const examples = item.stage === 3 ? item.note.examples.slice(0, 3) : [];
  return (
    <>
      {result.verdict !== 'spoken' && (
        <div className={`verdict ${ok ? 'verdict--ok' : 'verdict--ko'}`}>
          {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {result.verdict === 'exact' && 'Exact'}
          {result.verdict === 'close' && `Presque : ${item.sentence?.cloze.answers.join(' … ')}`}
          {result.verdict === 'wrong' && `Réponse : ${item.sentence?.cloze.answers.join(' … ')}`}
          {result.verdict === 'reference' && 'Phrase acceptée'}
          {result.verdict === 'present' && 'L’expression est bien employée. Le reste de la phrase est à juger par vous.'}
          {result.verdict === 'absent' && 'L’expression n’apparaît pas dans votre phrase (ou sous une forme non reconnue).'}
        </div>
      )}
      {item.stage > 1 && result.given && (
        <p lang={language}>
          <span className="muted small">Vous : </span>
          {result.given}
        </p>
      )}
      {item.stage === 2 && reference && (
        <p lang={language}>
          <span className="muted small">Une réponse possible : </span>
          {reference}{' '}
          <button className="link small" onClick={() => onSpeak(reference)} aria-label="Écouter">
            <Volume2 size={12} />
          </button>
        </p>
      )}
      {item.stage === 1 && item.sentence && (
        <p className="muted small" lang={language}>
          <strong className="text-2">{item.note.expression}</strong> : {item.note.translation}
        </p>
      )}
      {examples.length > 0 && (
        <div className="small" lang={language}>
          <span className="muted">Pour comparer, vos exemples :</span>
          <ul style={{ margin: '4px 0 0 18px' }}>
            {examples.map((ex) => (
              <li key={ex}>{ex}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">
        {item.stage === 1
          ? 'Note proposée d’après votre réponse : Entrée l’accepte, 1 à 3 la change.'
          : 'Jugez votre phrase : sens voulu, expression bien employée, phrase correcte.'}
      </p>
    </>
  );
}

type GrammarState = null | 'busy' | { text: string; issues: GrammarIssue[] } | { error: string };

/** Signalements de LanguageTool : passages soulignés, explication et corrections proposées. */
function GrammarCheck({ state, language }: { state: GrammarState; language: string }) {
  if (!state) return null;
  if (state === 'busy')
    return (
      <p className="muted small row">
        <Loader2 size={14} className="spin" /> Vérification par LanguageTool…
      </p>
    );
  if ('error' in state) return <p className="muted small">LanguageTool : {state.error}.</p>;
  if (!state.issues.length) return <p className="muted small">LanguageTool ne signale rien. Il ne vérifie pas que la phrase dit ce que vous vouliez dire.</p>;
  return (
    <div className="grammar-check" role="note">
      <p lang={language}>
        {markIssues(state.text, state.issues).map((part, i) =>
          part.issue ? (
            <mark key={i} className={`grammar-issue grammar-issue--${part.issue.type || 'other'}`} title={part.issue.message}>
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      <ul>
        {state.issues.map((issue, i) => (
          <li key={i}>
            <strong lang={language}>{state.text.slice(issue.offset, issue.offset + issue.length)}</strong>
            {issue.replacements.length > 0 && (
              <>
                {' '}→ <span lang={language}>{issue.replacements.join(' / ')}</span>
              </>
            )}{' '}
            <span className="muted" lang={language}>
              ({issue.message})
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">Signalé par LanguageTool : des fautes possibles, pas une note. Le sens reste à juger par vous.</p>
    </div>
  );
}

