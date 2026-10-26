import { useEffect, useState, type ReactNode } from 'react';
import { Database, Download, FileUp, HardDriveDownload, RotateCcw, Upload, Volume2 } from 'lucide-react';
import { attempt, useApp } from '@/app/store';
import { backupNowToAppFolder, backupToFile, exportToCsv, exportToJson, importFromFile, restoreFromFile } from '@/app/dataActions';
import type { DirectionMode, Settings } from '@/core/domain/settings';
import { getAppInfo, type AppInfo } from '@/core/platform/files';
import { isTauri } from '@/core/platform/env';
import { loadVoices, speechSupported } from '@/core/platform/speech';
import { speakText } from '@/ui/speech';
import { languageInfo } from '@/core/domain/languages';
import { Button, Switch } from '@/ui/components/ui';
import { AccountSection } from '@/ui/features/account/AccountSection';
import { checkUpdates } from '@/app/desktop';
import { getAutostart, openExternal, setAutostart } from '@/core/platform/desktop';
import { deeplUsage } from '@/core/translate/translate';
import { sharedDeeplUsage } from '@/core/translate/shared';
import { authConfigured } from '@/core/platform/auth';

function Setting({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div>
        <div className="setting-title">{title}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Champ numérique validé à la sortie du champ (évite d'enregistrer à chaque frappe). */
function NumberInput({ value, min, max, step = 1, onCommit }: { value: number; min: number; max: number; step?: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft.replace(',', '.'));
    if (Number.isFinite(v) && v !== value) onCommit(Math.min(max, Math.max(min, v)));
    else setDraft(String(value));
  };
  return (
    <input
      className="input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const notes = useApp((s) => s.notes);
  const db = useApp((s) => s.db);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const universe = useApp((s) => s.universe);
  const language = universe?.language ?? 'en';
  const lang = languageInfo(language);

  useEffect(() => {
    getAppInfo().then(setInfo).catch(() => setInfo(null));
  }, []);
  useEffect(() => {
    loadVoices(language).then(setVoices);
  }, [language]);

  const update = (patch: Partial<Settings>) => attempt(() => useApp.getState().updateSettings(patch), 'Réglage enregistré');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-subtitle">Tout est enregistré localement sur cet ordinateur.</p>
        </div>
      </div>

      <div className="stack">
        <AccountSection />
        <section className="card settings-section">
          <div className="card-header">
            <h2 className="card-title">Mémorisation</h2>
          </div>
          <Setting title="Objectif du jour" desc="Nombre de réponses par jour, toutes langues confondues : affiché sur l'accueil avec votre série de jours consécutifs.">
            <NumberInput value={settings.dailyGoal} min={5} max={500} onCommit={(v) => update({ dailyGoal: Math.round(v) })} />
          </Setting>
          <Setting title="Nouveaux mots par jour" desc="Plafond par défaut, pour chaque univers. Les autres mots attendent leur tour.">
            <NumberInput value={settings.newPerDay} min={0} max={200} onCommit={(v) => update({ newPerDay: Math.round(v) })} />
          </Setting>
          {universe && (
            <Setting
              title={`Nouveaux mots par jour · ${universe.name}`}
              desc="Plafond propre à cet univers (par exemple moins de nouveaux mots en chinois). Vide = réglage par défaut."
            >
              <OptionalNumberInput
                value={universe.newPerDay}
                placeholder={`Défaut (${settings.newPerDay})`}
                onCommit={(v) => void attempt(() => useApp.getState().setUniverseNewPerDay(universe.id, v), 'Réglage enregistré')}
              />
            </Setting>
          )}
          <Setting
            title="Taper la réponse (français → langue)"
            desc="Avant de dévoiler, vous tapez l'expression : Lexora vérifie (formes conjuguées tolérées) et propose la note. Plus exigeant, idéal pour l'expression orale."
          >
            <Switch label="Taper la réponse" checked={settings.typeAnswer} onChange={(v) => update({ typeAnswer: v })} />
          </Setting>
          <Setting
            title="Traduction automatique"
            desc="Quand vous sélectionnez un mot dans un livre (ou faites un ajout rapide), la traduction française est proposée automatiquement (MyMemory, gratuit). Désactivé : utilisez le bouton « Traduire » de la fiche. Les mots sont envoyés à ce service."
          >
            <Switch label="Traduction automatique" checked={settings.autoTranslate} onChange={(v) => update({ autoTranslate: v })} />
          </Setting>
          {authConfigured && <SharedDeeplStatus />}
          <DeeplSetting value={settings.deeplKey} onSave={(v) => update({ deeplKey: v })} />
          <Setting title="Directions révisées" desc="Chaque direction est suivie séparément. Français → langue entraîne la production orale.">
            <select className="select" value={settings.directions} onChange={(e) => update({ directions: e.target.value as DirectionMode })}>
              <option value="both">Les deux</option>
              <option value="fr_en">Français → langue uniquement</option>
              <option value="en_fr">Langue → français uniquement</option>
            </select>
          </Setting>
          <Setting
            title="Rétention visée"
            desc="Probabilité de se souvenir au moment de la révision (FSRS). Plus haut = révisions plus fréquentes. 90 % est recommandé."
          >
            <select className="select" value={String(settings.desiredRetention)} onChange={(e) => update({ desiredRetention: Number(e.target.value) })}>
              {[0.8, 0.85, 0.88, 0.9, 0.92, 0.95].map((r) => (
                <option key={r} value={String(r)}>
                  {Math.round(r * 100)} %
                </option>
              ))}
            </select>
          </Setting>
          <Setting title="Seuil de maîtrise" desc="Stabilité FSRS (en jours) à partir de laquelle une fiche est considérée comme maîtrisée.">
            <NumberInput value={settings.masteryThresholdDays} min={7} max={365} onCommit={(v) => update({ masteryThresholdDays: Math.round(v) })} />
          </Setting>
          <Setting title="Intervalle maximal (jours)" desc="Délai maximum entre deux révisions d'une même fiche.">
            <NumberInput value={settings.maximumInterval} min={30} max={36500} onCommit={(v) => update({ maximumInterval: Math.round(v) })} />
          </Setting>
          <Setting title="Début de journée" desc="Heure à laquelle les révisions du jour sont renouvelées.">
            <select className="select" value={settings.dayStartHour} onChange={(e) => update({ dayStartHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')} h
                </option>
              ))}
            </select>
          </Setting>
          <Setting title="Variation des intervalles" desc="Légère variation aléatoire pour étaler la charge de révision.">
            <Switch label="Variation des intervalles" checked={settings.enableFuzz} onChange={(v) => update({ enableFuzz: v })} />
          </Setting>
        </section>

        <section className="card settings-section">
          <div className="card-header">
            <h2 className="card-title">Prononciation & raccourcis</h2>
          </div>
          {speechSupported() ? (
            <>
              <Setting
                title={`Voix · ${lang.name}`}
                desc={
                  voices.length
                    ? 'Voix installées sur cet appareil (fonctionnent hors ligne). Réglage propre à chaque langue.'
                    : `Aucune voix ${lang.name.toLowerCase()} installée. Windows : Paramètres → Heure et langue → Voix → Ajouter des voix.`
                }
              >
                <div className="row">
                  <select
                    className="select"
                    value={settings.ttsVoices[language] ?? ''}
                    onChange={(e) => update({ ttsVoices: { ...settings.ttsVoices, [language]: e.target.value } })}
                  >
                    <option value="">Automatique</option>
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                  <Button icon variant="ghost" title="Tester" onClick={() => speakText(lang.placeholder.example)}>
                    <Volume2 size={16} />
                  </Button>
                </div>
              </Setting>
              <Setting title="Vitesse de lecture">
                <select className="select" value={String(settings.ttsRate)} onChange={(e) => update({ ttsRate: Number(e.target.value) })}>
                  {[0.7, 0.85, 0.95, 1, 1.15].map((r) => (
                    <option key={r} value={String(r)}>
                      × {r}
                    </option>
                  ))}
                </select>
              </Setting>
              <Setting title="Lecture automatique" desc="Prononcer l'expression dès que la réponse est affichée.">
                <Switch label="Lecture automatique" checked={settings.autoSpeak} onChange={(v) => update({ autoSpeak: v })} />
              </Setting>
            </>
          ) : (
            <Setting title="Prononciation" desc="La synthèse vocale n'est pas disponible dans cet environnement.">
              <span />
            </Setting>
          )}
          <Setting
            title="Raccourci global d'ajout"
            desc={
              isTauri()
                ? "Ouvre l'ajout rapide depuis n'importe quelle application, tant que Lexora est lancé. Exemple : Alt+Shift+L. Vide = désactivé."
                : 'Disponible dans l’application de bureau.'
            }
          >
            <ShortcutInput value={settings.globalShortcut} disabled={!isTauri()} onCommit={(v) => update({ globalShortcut: v })} />
          </Setting>
          <Setting
            title="Pré-remplir avec le texte copié"
            desc="Copiez un mot dans un article ou une vidéo sous-titrée, appuyez sur le raccourci : l'expression est déjà saisie."
          >
            <Switch label="Pré-remplir avec le texte copié" checked={settings.clipboardPrefill} onChange={(v) => update({ clipboardPrefill: v })} />
          </Setting>
        </section>

        <DesktopSection />

        <section className="card settings-section">
          <div className="card-header">
            <h2 className="card-title">Données</h2>
          </div>
          <Setting
            title={`Importer dans « ${universe?.name ?? ''} »`}
            desc="CSV (Excel, Anki, Quizlet…) ou JSON. Les doublons sont ignorés automatiquement."
          >
            <Button onClick={importFromFile}>
              <FileUp size={15} /> Importer
            </Button>
          </Setting>
          <Setting
            title={`Exporter « ${universe?.name ?? ''} »`}
            desc={`${notes.length} expressions, avec exemples, tags et collections.`}
          >
            <div className="row">
              <Button onClick={exportToCsv}>
                <Download size={15} /> CSV
              </Button>
              <Button onClick={exportToJson}>
                <Download size={15} /> JSON
              </Button>
            </div>
          </Setting>
          <Setting
            title="Sauvegarde complète"
            desc="Fichier unique, tous univers : notes, fiches de mémorisation, historique des révisions et réglages."
          >
            <Button variant="primary" onClick={backupToFile}>
              <HardDriveDownload size={15} /> Sauvegarder
            </Button>
          </Setting>
          <Setting
            title="Restaurer une sauvegarde"
            desc="Remplace toutes les données (tous univers) par celles de la sauvegarde, y compris sur vos autres appareils synchronisés."
          >
            <Button onClick={restoreFromFile}>
              <RotateCcw size={15} /> Restaurer
            </Button>
          </Setting>
          {isTauri() && info && (
            <>
              <Setting
                title="Sauvegardes automatiques"
                desc={
                  <>
                    Une copie de la base est créée chaque jour au démarrage (10 conservées) dans <span className="code">{info.backupDir}</span>
                  </>
                }
              >
                <Button onClick={backupNowToAppFolder}>
                  <Upload size={15} /> Copier maintenant
                </Button>
              </Setting>
              <Setting
                title="Emplacement de la base"
                desc={
                  <>
                    <Database size={12} style={{ verticalAlign: -1 }} /> <span className="code">{info.dbPath}</span>
                  </>
                }
              >
                <span className="muted small">v{info.version}</span>
              </Setting>
            </>
          )}
          {db?.kind === 'browser' && (
            <div className="setting">
              <div className="notice notice--info">
                Aperçu navigateur : les données sont stockées dans ce navigateur (IndexedDB). Installez l'application Windows pour un stockage SQLite
                local avec sauvegardes automatiques.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ShortcutInput({ value, disabled, onCommit }: { value: string; disabled?: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="input"
      value={draft}
      disabled={disabled}
      placeholder="Désactivé"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function OptionalNumberInput({ value, placeholder, onCommit }: { value: number | null; placeholder: string; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => setDraft(value == null ? '' : String(value)), [value]);
  const commit = () => {
    const t = draft.trim();
    const v = t === '' ? null : Math.round(Number(t));
    if (v !== null && (!Number.isFinite(v) || v < 0)) return setDraft(value == null ? '' : String(value));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      className="input"
      type="number"
      min={0}
      max={200}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Intégration à Windows : démarrage, zone de notification, rappel, mises à jour. */
function DesktopSection() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.update);
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const save = (patch: Partial<Settings>) => attempt(() => useApp.getState().updateSettings(patch), 'Réglage enregistré');

  useEffect(() => {
    getAutostart().then(setAutostartState).catch(() => setAutostartState(null));
    getAppInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  if (!isTauri()) return null;

  return (
    <section className="card settings-section">
      <div className="card-header">
        <h2 className="card-title">Windows</h2>
      </div>
      <Setting title="Lancer Lexora au démarrage de Windows" desc="Démarre discrètement dans la zone de notification : le raccourci d'ajout et le rappel sont toujours actifs.">
        <Switch
          label="Lancer au démarrage"
          checked={!!autostart}
          onChange={(v) =>
            void attempt(async () => {
              await setAutostart(v);
              setAutostartState(v);
            }, v ? 'Lexora démarrera avec Windows' : 'Démarrage automatique désactivé')
          }
        />
      </Setting>
      <Setting title="Fermer la fenêtre = réduire dans la zone de notification" desc="Lexora reste actif près de l'horloge. Pour quitter : clic droit sur l'icône → Quitter.">
        <Switch label="Réduire à la fermeture" checked={settings.closeToTray} onChange={(v) => void save({ closeToTray: v })} />
      </Setting>
      <Setting title="Rappel quotidien" desc="Notification Windows à l'heure choisie, seulement s'il reste des révisions (une fois par jour).">
        <div className="row">
          <input
            className="input"
            type="time"
            style={{ width: 110 }}
            value={settings.reminderTime}
            disabled={!settings.reminderEnabled}
            onChange={(e) => e.target.value && void save({ reminderTime: e.target.value })}
          />
          <Switch label="Rappel quotidien" checked={settings.reminderEnabled} onChange={(v) => void save({ reminderEnabled: v })} />
        </div>
      </Setting>
      <Setting
        title="Mises à jour"
        desc={update ? `Version ${update.version} disponible : utilisez le bouton « Installer » en bas de la barre latérale.` : `Version installée : ${info?.version ?? '…'}. Les mises à jour sont vérifiées automatiquement.`}
      >
        <Button
          disabled={checking}
          onClick={() => {
            setChecking(true);
            void checkUpdates(true).finally(() => setChecking(false));
          }}
        >
          {checking ? 'Vérification…' : 'Rechercher'}
        </Button>
      </Setting>
    </section>
  );
}

/** Clé DeepL facultative : enregistrée sur cet appareil uniquement (ni synchronisée, ni dans les sauvegardes). */
function DeeplSetting({ value, onSave }: { value: string; onSave: (v: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(value), [value]);

  const check = async (key: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const u = await deeplUsage(key);
      const fmt = (n: number) => n.toLocaleString('fr-FR');
      setStatus({ ok: true, text: `Clé valide · ${fmt(u.used)} / ${fmt(u.limit)} caractères utilisés ce mois-ci.` });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const key = draft.trim();
    await onSave(key);
    if (key) await check(key);
    else setStatus(null);
  };

  return (
    <Setting
      title="Clé DeepL personnelle (facultatif)"
      desc={
        <>
          Inutile si la traduction DeepL partagée est active. Sinon, clé gratuite (500 000 caractères par mois) à créer sur{' '}
          <button type="button" className="link" onClick={() => void openExternal('https://www.deepl.com/fr/pro-api')}>
            deepl.com/pro-api
          </button>{' '}
          (offre « DeepL API Free »). Enregistrée sur cet appareil uniquement ; prioritaire sur la clé partagée.
          {status && <div className={status.ok ? 'small' : 'field-error'} style={status.ok ? { color: 'var(--mastered)', marginTop: 4 } : { marginTop: 4 }}>{status.text}</div>}
        </>
      }
    >
      <div className="stack stack--sm" style={{ alignItems: 'flex-end' }}>
        <input
          className="input"
          style={{ width: 260 }}
          type={show ? 'text' : 'password'}
          value={draft}
          placeholder="xxxxxxxx-xxxx-…:fx"
          autoComplete="off"
          spellCheck={false}
          aria-label="Clé DeepL"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <div className="row">
          <button type="button" className="link small" onClick={() => setShow(!show)}>
            {show ? 'Masquer' : 'Afficher'}
          </button>
          {value && draft.trim() === value && (
            <Button size="sm" onClick={() => void check(value)} disabled={busy}>
              Vérifier
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={busy || draft.trim() === value}>
            {draft.trim() || !value ? 'Enregistrer' : 'Retirer la clé'}
          </Button>
        </div>
      </div>
    </Setting>
  );
}

/** État de la traduction DeepL partagée (clé détenue par le serveur Supabase). */
function SharedDeeplStatus() {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const u = await sharedDeeplUsage();
      const fmt = (n: number) => n.toLocaleString('fr-FR');
      setState({ ok: true, text: `Active · ${fmt(u.used)} / ${fmt(u.limit)} caractères utilisés ce mois-ci (tous les utilisateurs).` });
    } catch (err) {
      setState({ ok: false, text: `Non disponible : ${err instanceof Error ? err.message : String(err)}. Les traductions passent par MyMemory.` });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void check();
  }, []);
  return (
    <Setting
      title="Traduction DeepL partagée"
      desc={
        <>
          Traduction fiable qui tient compte de la phrase (« at last turned sulky » → « a fini par bouder »), sans clé à créer : la clé est gardée sur le serveur
          Lexora et réservée aux comptes connectés.
          {state && (
            <div className={state.ok ? 'small' : 'field-error'} style={state.ok ? { color: 'var(--mastered)', marginTop: 4 } : { marginTop: 4 }}>
              {state.text}
            </div>
          )}
        </>
      }
    >
      <Button size="sm" onClick={() => void check()} disabled={busy}>
        {busy ? 'Vérification…' : 'Vérifier'}
      </Button>
    </Setting>
  );
}
