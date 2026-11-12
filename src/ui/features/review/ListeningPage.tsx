import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Ear, Loader2, Mic, Play, RefreshCw, Repeat, Square } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { assetUrl } from '@/core/platform/env';
import { openExternal } from '@/core/platform/desktop';
import { tatoebaCode } from '@/core/translate/examples';
import { assessPronunciation, wordLevel, type PronunciationScore } from '@/core/speech/pronunciation';
import { languageInfo } from '@/core/domain/languages';
import { toWav16k } from '@/ui/audio';
import { dictationDiff, parseBank, pickListening, type ListeningBankFile, type ListeningItem, type ListeningSentence } from '@/core/srs/listening';
import { Button, EmptyState, Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { useRecorder } from '@/ui/hooks/useRecorder';

/**
 * « Écoute et shadowing » (src/core/srs/listening.ts) : cinq phrases enregistrées, chacune en quatre temps :
 * écouter sans texte, dire ce qu'on a compris, répéter au micro en comparant à l'oreille, redire l'idée autrement.
 */

const banks = new Map<string, Promise<ListeningSentence[] | null>>();

/** Banque d'écoute de la langue (public/listening/<langue>), null si elle n'existe pas encore. */
export function loadListeningBank(language: string): Promise<ListeningSentence[] | null> {
  let p = banks.get(language);
  if (!p) {
    p = (async () => {
      const code = tatoebaCode(language);
      if (!code) return null;
      try {
        const res = await fetch(assetUrl(`listening/${language}/sentences.json`));
        if (!res.ok || (res.headers.get('content-type') ?? '').includes('html')) return null;
        return parseBank((await res.json()) as ListeningBankFile, code);
      } catch {
        return null;
      }
    })();
    banks.set(language, p);
    p.then((b) => b === null && banks.delete(language));
  }
  return p;
}

export function ListeningPage() {
  const language = useApp((s) => s.universe?.language ?? 'en');
  const [items, setItems] = useState<ListeningItem[] | null | 'none'>(null);
  const close = () => useApp.getState().navigate({ name: 'review' });

  useEffect(() => {
    if (items) return;
    let cancelled = false;
    void loadListeningBank(language).then((bank) => {
      if (cancelled) return;
      if (!bank?.length) return setItems('none');
      const { notes, listeningAnswers, settings } = useApp.getState();
      setItems(pickListening(bank, notes, listeningAnswers, settings, language));
    });
    return () => {
      cancelled = true;
    };
  }, [items, language]);

  if (items === null)
    return (
      <div className="page">
        <p className="muted row">
          <Loader2 size={16} className="spin" /> Chargement des phrases…
        </p>
      </div>
    );
  if (items === 'none' || !items.length)
    return (
      <div className="page">
        <EmptyState title="Écoute pas encore disponible pour cette langue">
          <p>Les phrases enregistrées (Tatoeba, avec traduction française) n'ont pas encore été préparées pour cette langue.</p>
          <Button onClick={close}>Retour à Réviser</Button>
        </EmptyState>
      </div>
    );
  return <ListeningSession key={items.map((i) => i.sentence.id).join()} items={items} language={language} onAgain={() => setItems(null)} onClose={close} />;
}

type Phase = 'listen' | 'check' | 'shadow' | 'reformulate';

const PHASES: { id: Phase; label: string }[] = [
  { id: 'listen', label: 'Écouter' },
  { id: 'check', label: 'Comprendre' },
  { id: 'shadow', label: 'Répéter' },
  { id: 'reformulate', label: 'Redire' },
];

const COMPREHENSION: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Pas compris' },
  { value: 2, label: 'En partie' },
  { value: 3, label: 'Compris' },
];

function ListeningSession({ items, language, onAgain, onClose }: { items: ListeningItem[]; language: string; onAgain: () => void; onClose: () => void }) {
  const { answerListening, toast } = useApp.getState();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('listen');
  const [dictation, setDictation] = useState('');
  const [comprehension, setComprehension] = useState<1 | 2 | 3 | null>(null);
  const [slow, setSlow] = useState(false);
  const [shadowed, setShadowed] = useState(0);
  const [reformulated, setReformulated] = useState(false);
  const [results, setResults] = useState<(1 | 2 | 3)[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const recorder = useRecorder();
  const scoring = useApp((s) => s.settings.pronunciationScoring);
  const speechLang = useApp((s) => languageInfo(s.universe?.language ?? 'en').speech);
  const [pron, setPron] = useState<PronState>(null);

  // Notation (réglage facultatif) : chaque nouvel enregistrement de la répétition est envoyé pour la note.
  useEffect(() => {
    if (!scoring || !recorder.blob || !item) return setPron(null);
    let cancelled = false;
    const sentence = item.sentence;
    setPron('busy');
    void (async () => {
      const wav = await toWav16k(recorder.blob!);
      if (!wav) return !cancelled && setPron({ error: 'Enregistrement trop court, trop long (30 s au plus) ou illisible.' });
      try {
        const result = await assessPronunciation(wav, sentence.text, speechLang);
        if (cancelled) return;
        if (!result) return setPron({ error: 'Rien de reconnu : rapprochez-vous du micro et répétez la phrase entière.' });
        setPron(result);
        useApp.getState().recordPronunciation({ sentenceId: sentence.id, score: result.score, accuracy: result.accuracy, fluency: result.fluency, completeness: result.completeness });
      } catch (err) {
        if (!cancelled) setPron({ error: `Notation indisponible : ${err instanceof Error ? err.message : String(err)}.` });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.blob, scoring]);
  const reformulation = useRecorder();
  const item = items[index];
  const finished = index >= items.length;
  const diff = item && dictation.trim() && phase !== 'listen' ? dictationDiff(item.sentence.text, dictation) : null;

  const stopAudio = () => {
    audio.current?.pause();
    audio.current = null;
  };
  useEffect(() => stopAudio, []);

  const play = (url: string, rate = 1, then?: () => void) => {
    stopAudio();
    const a = new Audio(url);
    a.playbackRate = rate;
    a.onended = () => then?.();
    audio.current = a;
    // Une lecture interrompue par la suivante (AbortError) n'est pas une erreur.
    a.play().catch((err) => (err as Error)?.name !== 'AbortError' && toast('error', `Lecture impossible : ${errorMessage(err)}`));
  };
  const playOriginal = () => item && play(item.sentence.audioUrl, slow ? 0.75 : 1);
  // Comparer : l'original, puis votre enregistrement.
  const compare = () => item && recorder.url && play(item.sentence.audioUrl, 1, () => recorder.url && play(recorder.url));

  // Première écoute automatique à chaque phrase.
  useEffect(() => {
    if (item && phase === 'listen') playOriginal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const toggleRecord = async () => {
    if (recorder.state === 'recording') return recorder.stop();
    stopAudio();
    await recorder.start();
    setShadowed((n) => n + 1);
  };
  const toggleReformulation = async () => {
    if (reformulation.state === 'recording') return reformulation.stop();
    stopAudio();
    await reformulation.start();
    setReformulated(true);
  };

  /** Phrase suivante ; `said` : idée redite (à voix haute ou enregistrée). */
  const next = (said = reformulated) => {
    if (!item) return;
    stopAudio();
    recorder.stop();
    reformulation.stop();
    const rating = comprehension ?? 1;
    setResults((r) => [...r, rating]);
    void answerListening({
      sentenceId: item.sentence.id,
      noteId: item.note?.id ?? '',
      comprehension: rating,
      dictation,
      dictationScore: dictation.trim() ? dictationDiff(item.sentence.text, dictation).score : -1,
      shadowed,
      reformulated: said,
      createdAt: Date.now(),
    }).catch((err) => toast('error', errorMessage(err)));
    recorder.clear();
    reformulation.clear();
    setPhase('listen');
    setDictation('');
    setComprehension(null);
    setShadowed(0);
    setReformulated(false);
    setIndex((i) => i + 1);
  };

  const rate = (value: 1 | 2 | 3) => {
    setComprehension(value);
    setPhase('shadow');
  };

  useHotkeys(
    {
      space: () => !finished && playOriginal(),
      enter: () => (finished ? onAgain() : phase === 'listen' ? setPhase('check') : phase === 'shadow' ? setPhase('reformulate') : phase === 'reformulate' ? next(true) : undefined),
      '1': () => phase === 'check' && rate(1),
      '2': () => phase === 'check' && rate(2),
      '3': () => phase === 'check' && rate(3),
      r: () => (phase === 'shadow' ? void toggleRecord() : phase === 'reformulate' ? void toggleReformulation() : undefined),
      c: () => phase === 'shadow' && compare(),
      escape: onClose,
    },
    { allowInInputs: ['escape'] },
  );

  const s = item?.sentence;
  const phaseIndex = PHASES.findIndex((p) => p.id === phase);
  return (
    <div className="session">
      <div className="session-top">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft size={16} /> Écoute et shadowing <Kbd>Échap</Kbd>
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
              {results.filter((r) => r === 3).length} / {results.length} phrases comprises
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              Vos enregistrements ne sont pas gardés. Ces réponses ne changent pas la planification des révisions.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <Button variant="primary" onClick={onAgain} shortcut="Entrée">
                <RefreshCw size={15} /> Nouvelle séance
              </Button>
              <Button onClick={onClose}>Retour à Réviser</Button>
            </div>
          </div>
        ) : (
          <div className="card flashcard exercise-card listening-card">
            <ol className="listening-steps" aria-label="Étapes">
              {PHASES.map((p, i) => (
                <li key={p.id} className={i === phaseIndex ? 'is-current' : i < phaseIndex ? 'is-done' : ''}>
                  {p.label}
                </li>
              ))}
            </ol>

            <div className="row row--wrap" style={{ justifyContent: 'center', gap: 8 }}>
              <Button variant={phase === 'listen' ? 'primary' : 'secondary'} onClick={playOriginal} shortcut="Espace">
                <Play size={15} /> Écouter
              </Button>
              <label className="row small muted" style={{ gap: 6 }}>
                <input type="checkbox" checked={slow} onChange={(e) => (setSlow(e.target.checked), e.target.blur())} /> Ralenti
              </label>
            </div>

            {phase === 'listen' && (
              <div className="stack stack--sm" style={{ marginTop: 14 }}>
                <p className="muted small" style={{ textAlign: 'center' }}>
                  Sans texte : écoutez autant de fois que nécessaire.
                  {item.note && ' Elle contient une de vos expressions.'} Notez ce que vous entendez si vous voulez (facultatif).
                </p>
                <input
                  className="input"
                  value={dictation}
                  onChange={(e) => setDictation(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      setPhase('check');
                    }
                  }}
                  placeholder="Ce que vous entendez (facultatif)"
                  autoComplete="off"
                  spellCheck={false}
                  lang={language}
                  aria-label="Dictée"
                />
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Button variant="primary" onClick={() => setPhase('check')} shortcut="Entrée">
                    J'ai écouté
                  </Button>
                </div>
              </div>
            )}

            {phase === 'check' && (
              <div className="stack stack--sm" style={{ marginTop: 14, alignItems: 'center' }}>
                <p className="muted small">Le sens de la phrase :</p>
                <p className="listening-translation" lang="fr">
                  {s.fr}
                </p>
                <p className="muted small">L'aviez-vous compris ?</p>
                <div className="row row--wrap" style={{ justifyContent: 'center', gap: 8 }}>
                  {COMPREHENSION.map((c) => (
                    <Button key={c.value} onClick={() => rate(c.value)}>
                      {c.label} <Kbd>{String(c.value)}</Kbd>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {(phase === 'shadow' || phase === 'reformulate') && (
              <div className="stack stack--sm" style={{ marginTop: 14 }}>
                <p className="listening-transcript" lang={language}>
                  {diff
                    ? diff.words.map((w, i) => (
                        <Fragment key={i}>
                          <span className={w.heard ? undefined : 'listening-missed'}>{w.text}</span>{' '}
                        </Fragment>
                      ))
                    : s.text}
                </p>
                <p className="muted small" lang="fr" style={{ textAlign: 'center' }}>
                  {s.fr}
                  {diff && ` · Dictée : ${diff.score} % des mots retrouvés${diff.score < 100 ? ' (manqués soulignés)' : ''}`}
                </p>
              </div>
            )}

            {phase === 'shadow' && (
              <div className="stack stack--sm" style={{ marginTop: 6, alignItems: 'center' }}>
                <p className="muted small" style={{ textAlign: 'center' }}>
                  Répétez la phrase au micro, en imitant le rythme et l'intonation, puis comparez les deux à l'oreille. Recommencez autant que vous voulez.
                </p>
                <RecorderControls
                  rec={recorder}
                  onToggle={() => void toggleRecord()}
                  extra={
                    recorder.url && (
                      <>
                        <Button onClick={() => recorder.url && play(recorder.url)}>
                          <Ear size={15} /> Moi
                        </Button>
                        <Button onClick={compare} shortcut="C">
                          <Repeat size={15} /> Comparer
                        </Button>
                      </>
                    )
                  }
                />
                {scoring && <PronunciationResult state={pron} />}
                <Button variant={recorder.url ? 'primary' : 'ghost'} onClick={() => setPhase('reformulate')} shortcut="Entrée">
                  {recorder.url ? 'Continuer' : 'Passer cette étape'}
                </Button>
              </div>
            )}

            {phase === 'reformulate' && (
              <div className="stack stack--sm" style={{ marginTop: 6, alignItems: 'center' }}>
                <p style={{ textAlign: 'center' }}>Redites l'idée avec vos propres mots, sans reprendre la phrase : à voix haute, ou enregistrez-vous.</p>
                <RecorderControls
                  rec={reformulation}
                  onToggle={() => void toggleReformulation()}
                  extra={
                    reformulation.url && (
                      <Button onClick={() => reformulation.url && play(reformulation.url)}>
                        <Ear size={15} /> Réécouter
                      </Button>
                    )
                  }
                />
                <div className="row" style={{ gap: 8 }}>
                  <Button
                    variant="primary"
                    onClick={() => next(true)}
                    shortcut="Entrée"
                  >
                    {index + 1 < items.length ? 'Fait, phrase suivante' : 'Fait, voir le bilan'}
                  </Button>
                  <Button variant="ghost" onClick={() => next()}>
                    Passer
                  </Button>
                </div>
              </div>
            )}

            <p className="muted small listening-credit">
              Enregistrement : {s.author || 'Tatoeba'} ({s.license}), phrase{' '}
              <button className="link small" onClick={() => void openExternal(`https://tatoeba.org/sentences/show/${s.id}`)}>
                Tatoeba n° {s.id}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function RecorderControls({ rec, onToggle, extra }: { rec: ReturnType<typeof useRecorder>; onToggle: () => void; extra?: ReactNode }) {
  if (rec.state === 'unsupported') return <p className="muted small">L'enregistrement n'est pas disponible sur cet appareil : répétez à voix haute.</p>;
  return (
    <>
      {rec.state === 'denied' && <p className="muted small">Accès au micro refusé : autorisez-le dans les réglages de l'appareil, ou répétez à voix haute.</p>}
      <div className="row row--wrap" style={{ justifyContent: 'center', gap: 8 }}>
        <Button variant={rec.state === 'recording' ? 'danger' : 'secondary'} onClick={onToggle} shortcut="R">
          {rec.state === 'recording' ? (
            <>
              <Square size={15} /> Arrêter
            </>
          ) : (
            <>
              <Mic size={15} /> {rec.url ? 'Recommencer' : 'Enregistrer'}
            </>
          )}
        </Button>
        {extra}
      </div>
    </>
  );
}

type PronState = null | 'busy' | PronunciationScore | { error: string };

/** Notes d'Azure : globale et détaillée, mots colorés selon leur précision (mot oublié barré). */
function PronunciationResult({ state }: { state: PronState }) {
  if (!state) return null;
  if (state === 'busy')
    return (
      <p className="muted small row">
        <Loader2 size={14} className="spin" /> Notation de la prononciation…
      </p>
    );
  if ('error' in state) return <p className="muted small">{state.error}</p>;
  return (
    <div className="pron-result" role="note">
      <div className="pron-scores">
        <span className="pron-score-main">{state.score}</span>
        <span className="muted small">
          / 100 · précision {state.accuracy} · fluidité {state.fluency} · complétude {state.completeness}
        </span>
      </div>
      <p className="pron-words">
        {state.words.map((w, i) => (
          <Fragment key={i}>
            <span className={`pron-word pron-word--${wordLevel(w)}`} title={w.error !== 'None' ? w.error : w.accuracy !== null ? `${Math.round(w.accuracy)} / 100` : undefined}>
              {w.word}
            </span>{' '}
          </Fragment>
        ))}
      </p>
      <p className="muted small">Mots en orange ou rouge : à retravailler (mot barré : oublié). La note mesure l'écart à la phrase entendue, pas le naturel.</p>
    </div>
  );
}

