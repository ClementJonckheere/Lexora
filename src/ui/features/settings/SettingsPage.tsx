import { useEffect, useState, type ReactNode } from 'react';
import { Database, Download, FileUp, HardDriveDownload, RotateCcw, Upload, Volume2 } from 'lucide-react';
import { attempt, useApp } from '@/app/store';
import { backupNowToAppFolder, backupToFile, exportToCsv, exportToJson, importFromFile, restoreFromFile } from '@/app/dataActions';
import type { DirectionMode, Settings } from '@/core/domain/settings';
import { getAppInfo, type AppInfo } from '@/core/platform/files';
import { isTauri } from '@/core/platform/env';
import { loadVoices, speak, speechSupported } from '@/core/platform/speech';
import { languageInfo } from '@/core/domain/languages';
import { Button, Switch } from '@/ui/components/ui';
import { AccountSection } from '@/ui/features/account/AccountSection';

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
          <Setting title="Nouveaux mots par jour" desc="Plafond de mots introduits chaque jour en révision. Les autres attendent leur tour.">
            <NumberInput value={settings.newPerDay} min={0} max={200} onCommit={(v) => update({ newPerDay: Math.round(v) })} />
          </Setting>
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
                  <Button icon variant="ghost" title="Tester" onClick={() => speak(lang.placeholder.example, { language, voice: settings.ttsVoices[language], rate: settings.ttsRate })}>
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
        </section>

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
