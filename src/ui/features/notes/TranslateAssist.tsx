import { useEffect, useRef, useState } from 'react';
import { Languages, Loader2, RefreshCw } from 'lucide-react';
import { errorMessage, useApp } from '@/app/store';
import { translate, type TranslationResult } from '@/core/translate/translate';
import { findExamples, type ExampleSentence } from '@/core/translate/examples';
import { Kbd } from '@/ui/components/ui';
import { useHotkeys } from '@/ui/hooks/useHotkeys';

/**
 * « Traduire et trouver un exemple » : traduction proposée (MyMemory) et phrases réelles (Tatoeba).
 * Ne remplit que les champs vides ; tout reste modifiable, la saisie manuelle reste possible.
 */
export function TranslateAssist({
  expression,
  language,
  translation,
  examples,
  auto,
  onTranslation,
  onExample,
}: {
  expression: string;
  language: string;
  translation: string;
  examples: string[];
  /** Lancer dès l'ouverture (expression déjà fournie, sans traduction). */
  auto: boolean;
  onTranslation: (text: string) => void;
  /** Remplace l'exemple `previous` s'il est encore présent tel quel, sinon remplit le premier champ vide. */
  onExample: (text: string, previous: string | null) => void;
}) {
  const deeplKey = useApp((s) => s.settings.deeplKey);
  const [busy, setBusy] = useState(false);
  /** Traduction de la phrase d'exemple déjà présente (phrase d'un livre, par exemple). */
  const [sentence, setSentence] = useState<{ for: string; text: string | null; busy: boolean; error?: string } | null>(null);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [found, setFound] = useState<ExampleSentence[]>([]);
  const [shown, setShown] = useState(-1);
  const [errors, setErrors] = useState<string[]>([]);
  const inserted = useRef<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const fields = useRef({ translation, examples });
  fields.current = { translation, examples };

  useEffect(() => () => ctrl.current?.abort(), []);
  // Nouvelle expression : les propositions précédentes ne valent plus.
  useEffect(() => {
    setResult(null);
    setFound([]);
    setShown(-1);
    setErrors([]);
  }, [expression]);

  const run = async () => {
    const q = expression.trim();
    if (!q || busy) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setErrors([]);
    const wantExample = fields.current.examples.every((e) => !e.trim());
    // Phrase déjà présente (livre, exemple saisi) : contexte pour choisir le bon sens.
    const context = fields.current.examples.find((e) => e.trim()) ?? '';
    const [t, ex] = await Promise.allSettled([translate(q, language, 'fr', { signal: c.signal, deeplKey, context }), findExamples(q, language, c.signal)]);
    if (c.signal.aborted) return;
    const errs: string[] = [];
    if (t.status === 'fulfilled') {
      setResult(t.value);
      if (!fields.current.translation.trim()) onTranslation(t.value.text);
      if (t.value.fallbackReason) errs.push(`DeepL indisponible (${t.value.fallbackReason}) : traduction MyMemory.`);
    } else errs.push(`Traduction : ${errorMessage(t.reason)}`);
    if (ex.status === 'fulfilled') {
      setFound(ex.value);
      if (ex.value.length && wantExample) {
        onExample(ex.value[0].text, null);
        inserted.current = ex.value[0].text;
        setShown(0);
      } else setShown(ex.value.length ? -1 : -2);
    } else errs.push(`Exemples : ${errorMessage(ex.reason)}`);
    setErrors(errs);
    setBusy(false);
  };

  useEffect(() => {
    if (auto) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useHotkeys({ 'mod+t': () => void run() }, { allowInInputs: ['mod+t'] });

  const showExample = (i: number) => {
    const s = found[i];
    if (!s) return;
    onExample(s.text, inserted.current);
    inserted.current = s.text;
    setShown(i);
  };

  const translateSentence = async (text: string) => {
    setSentence({ for: text, text: null, busy: true });
    try {
      const r = await translate(text, language, 'fr', { deeplKey });
      setSentence({ for: text, text: r.text, busy: false });
    } catch (err) {
      setSentence({ for: text, text: null, busy: false, error: errorMessage(err) });
    }
  };
  // Premier exemple sans traduction connue (pas un exemple Tatoeba) : traduction à la demande.
  const firstExample = examples.find((e) => e.trim()) ?? '';
  const exampleKnown = found.some((f) => f.text === firstExample && f.translation);

  const alternatives = result ? [result.text, ...result.alternatives].filter((a) => a !== translation.trim()) : [];
  const current = shown >= 0 ? found[shown] : null;

  return (
    <div className="assist">
      <div className="row row--wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => void run()} disabled={!expression.trim() || busy}>
          {busy ? <Loader2 size={14} className="spin" /> : <Languages size={14} />}
          {busy ? 'Recherche…' : 'Traduire et trouver un exemple'}
          <Kbd>Ctrl T</Kbd>
        </button>
        {alternatives.length > 0 && (
          <span className="assist-alts">
            <span className="muted small">{translation.trim() ? 'Autres traductions :' : 'Proposé :'}</span>
            {alternatives.map((a) => (
              <button key={a} type="button" className="chip chip--clickable" onClick={() => onTranslation(a)} title="Utiliser cette traduction">
                {a}
              </button>
            ))}
          </span>
        )}
      </div>
      {current && (
        <div className="assist-example small">
          <span className="muted">Exemple (Tatoeba)</span>
          {current.translation && <em>« {current.translation} »</em>}
          {found.length > 1 && (
            <button type="button" className="link small" onClick={() => showExample((shown + 1) % found.length)}>
              <RefreshCw size={12} style={{ verticalAlign: -1 }} /> Autre exemple ({shown + 1}/{found.length})
            </button>
          )}
        </div>
      )}
      {shown === -1 && found.length > 0 && (
        <div className="assist-example small">
          <span className="muted">Exemples trouvés :</span>
          <button type="button" className="link small" onClick={() => showExample(0)}>
            ajouter « {found[0].text.length > 60 ? `${found[0].text.slice(0, 59)}…` : found[0].text} »
          </button>
        </div>
      )}
      {shown === -2 && <div className="muted small">Aucune phrase d'exemple trouvée pour cette expression.</div>}
      {firstExample && !exampleKnown && (
        <div className="assist-example small">
          {sentence?.for === firstExample && sentence.text ? (
            <>
              <span className="muted">Phrase traduite</span>
              <em>« {sentence.text} »</em>
            </>
          ) : (
            <button type="button" className="link small" disabled={sentence?.for === firstExample && sentence.busy} onClick={() => void translateSentence(firstExample)}>
              {sentence?.for === firstExample && sentence.busy ? 'Traduction de la phrase…' : 'Traduire la phrase d’exemple (pour le contexte)'}
            </button>
          )}
          {sentence?.for === firstExample && sentence.error && <span className="field-error">{sentence.error}</span>}
        </div>
      )}
      {errors.map((e) => (
        <div key={e} className="field-error">
          {e}
        </div>
      ))}
      {(result || found.length > 0) && (
        <div className="assist-credit">
          Traduction : {result?.provider === 'deepl' ? 'DeepL (avec le contexte de la phrase)' : 'MyMemory'} · Exemples : Tatoeba (CC BY 2.0 FR) · tout reste modifiable
          {!deeplKey && ' · plus fiable avec une clé DeepL (Paramètres)'}
        </div>
      )}
    </div>
  );
}
