import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Undo2, X } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { languageInfo } from '@/core/domain/languages';
import { BAND_EDGES } from '@/core/reading/coverage';
import { loadFrequencyList, loadVocabBank } from '@/core/reading/catalog';
import { buildVocabTest, CONFIRM_BELOW_RANK, scoreVocabTest, toConfirm, type TestAnswer, type TestItem, type VocabScore } from '@/core/reading/vocabTest';
import { Button, Kbd } from '@/ui/components/ui';
import { SessionFrame } from '@/ui/features/review/SessionFrame';
import { useHotkeys } from '@/ui/hooks/useHotkeys';

const fmt = (n: number) => n.toLocaleString('fr-FR');
/** Le critère, rappelé au départ et sous chaque mot. */
const CRITERION = 'Je connais = je comprendrais ce mot dans une phrase.';
const bandLabel = (i: number) => (i === 0 ? `1 à ${fmt(BAND_EDGES[0])}` : `${fmt(BAND_EDGES[i - 1] + 1)} à ${fmt(BAND_EDGES[i])}`);

/** Test de vocabulaire oui / non (environ 110 mots, 3 à 4 minutes). */
export function VocabTestPage() {
  const universe = useApp((s) => s.universe)!;
  const previous = useApp((s) => s.vocabTest);
  const { navigate, saveVocabTest, toast } = useApp.getState();
  const languageName = languageInfo(universe.language).name.toLowerCase();
  const [items, setItems] = useState<TestItem[] | null | 'error'>(null);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [score, setScore] = useState<VocabScore | null>(null);
  /** Vérification finale : « non » sur des mots très courants (erreurs de clic), à confirmer. */
  const [checking, setChecking] = useState<number[] | null>(null);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const times = useRef<number[]>([]);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    let alive = true;
    void Promise.all([loadFrequencyList(universe.language), loadVocabBank(universe.language)]).then(([list, bank]) => {
      if (!alive) return;
      setItems(list ? buildVocabTest(list, Math.random, undefined, undefined, bank ?? undefined) : 'error');
    });
    return () => {
      alive = false;
    };
  }, [universe.language]);

  const quit = () => navigate({ name: 'reading' });
  const list = Array.isArray(items) ? items : [];
  const index = answers.length;
  const current = started && !score && !checking ? list[index] : undefined;
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index, started]);

  const finish = (final: boolean[], corrected: Set<number>) => {
    const s = scoreVocabTest(list, final);
    setScore(s);
    setChecking(null);
    const raw: TestAnswer[] = list.map((it, i) => ({
      word: it.word,
      real: it.real,
      band: it.band,
      rank: it.rank ?? null,
      yes: final[i],
      ms: Math.round(times.current[i] ?? 0),
      ...(corrected.has(i) ? { corrected: true } : {}),
    }));
    void saveVocabTest({ ...s, answers: raw, takenAt: Date.now() }).catch((err) => toast('error', `Résultat non enregistré : ${errorMessage(err)}`));
  };

  const answer = (yes: boolean) => {
    if (!current) return;
    times.current[index] = Date.now() - shownAt.current;
    const next = [...answers, yes];
    setAnswers(next);
    if (next.length === list.length) {
      const confirm = toConfirm(list, next);
      if (confirm.length) setChecking(confirm);
      else finish(next, new Set());
    }
  };
  const confirmChecks = () => {
    if (!checking) return;
    finish(
      answers.map((a, i) => (flipped.has(i) ? true : a)),
      flipped,
    );
  };
  const undo = () => !score && !checking && setAnswers((a) => a.slice(0, -1));

  useHotkeys(
    {
      arrowright: () => answer(true),
      o: () => answer(true),
      arrowleft: () => answer(false),
      n: () => answer(false),
      z: undo,
      backspace: undo,
      escape: quit,
      enter: () => (!started && list.length ? setStarted(true) : checking ? confirmChecks() : score ? quit() : undefined),
    },
    // Entrée valide aussi quand une case de la vérification a le focus.
    { enabled: true, allowInInputs: ['enter'] },
  );

  return (
    <SessionFrame completed={score ? list.length : index} total={Math.max(1, list.length)} onQuit={quit}>
      {items === null && (
        <p className="muted row">
          <Loader2 size={16} className="spin" /> Préparation du test…
        </p>
      )}
      {items === 'error' && (
        <div className="card card-pad" style={{ maxWidth: 520 }}>
          <p>Pas de liste de fréquence pour cette langue : le test n'est pas disponible.</p>
          <Button onClick={quit}>Retour</Button>
        </div>
      )}
      {!started && list.length > 0 && (
        <div className="card vocab-intro">
          <h1 className="summary-title">Test de vocabulaire</h1>
          <p>
            Environ {list.length} mots en {languageName}, 3 à 4 minutes. Pour chacun, dites seulement si vous en connaissez le sens, sans chercher.
          </p>
          <p className="vocab-criterion">{CRITERION}</p>
          <p className="muted">
            Certains mots n'existent pas. Répondre « je connais » à ces mots-là fait baisser le résultat : il vaut mieux répondre honnêtement. Le résultat sert
            à estimer, pour chaque livre, la part des mots que vous connaissez.
          </p>
          {previous && (
            <p className="muted small">
              Dernier résultat : environ {fmt(previous.vocabSize)} mots, le {new Date(previous.takenAt).toLocaleDateString('fr-FR')}. Le nouveau le remplacera.
            </p>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <Button variant="primary" onClick={() => setStarted(true)} shortcut="Entrée">
              Commencer
            </Button>
          </div>
        </div>
      )}
      {current && (
        <div className="vocab-question">
          <div className="vocab-word" lang={universe.language}>
            {current.word}
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            <Button className="vocab-btn" onClick={() => answer(false)}>
              <X size={16} /> Je ne connais pas <Kbd>←</Kbd>
            </Button>
            <Button variant="primary" className="vocab-btn" onClick={() => answer(true)}>
              <Check size={16} /> Je connais <Kbd>→</Kbd>
            </Button>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {CRITERION}
          </p>
          <button className="link small" onClick={undo} disabled={!index} style={{ marginTop: 6 }}>
            <Undo2 size={13} /> Revenir au mot précédent (Z)
          </button>
        </div>
      )}
      {checking && (
        <div className="card vocab-intro">
          <h1 className="summary-title">Vérification</h1>
          <p>
            Ces mots font partie des {fmt(CONFIRM_BELOW_RANK)} plus courants. Vraiment inconnus ? Cochez ceux que vous connaissez en fait (un clic trop rapide
            compte beaucoup ici).
          </p>
          <div className="vocab-checks">
            {checking.map((i) => (
              <label key={i} className={`vocab-check ${flipped.has(i) ? 'vocab-check--on' : ''}`} lang={universe.language}>
                <input
                  type="checkbox"
                  checked={flipped.has(i)}
                  onChange={(e) =>
                    setFlipped((f) => {
                      const n = new Set(f);
                      if (e.target.checked) n.add(i);
                      else n.delete(i);
                      return n;
                    })
                  }
                />
                {list[i].word}
              </label>
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <Button variant="primary" onClick={confirmChecks} shortcut="Entrée">
              {flipped.size ? `Valider (${flipped.size} corrigé${flipped.size > 1 ? 's' : ''})` : 'Oui, inconnus'}
            </Button>
          </div>
        </div>
      )}
      {score && <VocabResult score={score} onDone={quit} />}
    </SessionFrame>
  );
}

function VocabResult({ score, onDone }: { score: VocabScore; onDone: () => void }) {
  const bars = useMemo(() => score.bands.map((p, i) => ({ p, label: bandLabel(i) })), [score.bands]);
  return (
    <div className="card summary vocab-result">
      <div className="summary-title">Environ {fmt(score.vocabSize)} mots</div>
      <p className="muted" style={{ marginTop: 6 }}>
        Formes de mots que vous connaissez, d'après le test. Les livres de l'onglet Découvrir indiquent maintenant la part de leurs mots que vous connaissez.
      </p>
      <div className="vocab-bars" role="img" aria-label="Part de mots connus par tranche de fréquence">
        {bars.map((b) => (
          <div key={b.label} className="vocab-bar" title={`Mots les plus fréquents n° ${b.label} : ${Math.round(b.p * 100)} % connus`}>
            <span className="vocab-bar-fill" style={{ height: `${Math.max(2, b.p * 100)}%` }} />
            <small>{Math.round(b.p * 100)} %</small>
          </div>
        ))}
      </div>
      <p className="muted small">Part de mots connus, des 250 mots les plus fréquents (à gauche) aux plus rares (jusqu'au 50 000ᵉ, à droite).</p>
      {score.falseAlarm > 0.15 && (
        <p className="notice small">
          Vous avez répondu « je connais » à {Math.round(score.falseAlarm * 100)} % des mots inventés. Le résultat en tient compte, mais il est moins précis :
          refaites le test plus tard en ne répondant « je connais » que si vous êtes sûr du sens.
        </p>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        <Button variant="primary" onClick={onDone} shortcut="Entrée">
          Voir les livres
        </Button>
      </div>
    </div>
  );
}
