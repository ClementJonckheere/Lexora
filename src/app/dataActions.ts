import { useApp, errorMessage } from './store';
import { dayKey } from '@/core/domain/dates';
import { pickFile, saveTextFile, backupDbFile, restoreDbFile } from '@/core/platform/files';
import { isTauri } from '@/core/platform/env';
import { loadSettings } from '@/core/repo/settingsRepo';
import { createScheduler } from '@/core/srs/scheduler';
import {
  exportBackup,
  exportCsv,
  exportNotesJson,
  importNotes,
  isBackup,
  parseCsvNotes,
  parseJsonNotes,
  restoreBackup,
  type ImportCandidate,
  type ImportReport,
} from '@/core/repo/transfer';
import { confirm } from '@/ui/components/Confirm';

const stamp = () => dayKey(Date.now());

function state() {
  const s = useApp.getState();
  if (!s.db) throw new Error('Base de données non initialisée');
  return { ...s, db: s.db };
}

export function describeReport(r: ImportReport): string {
  const parts = [`${r.imported} expression${r.imported > 1 ? 's' : ''} importée${r.imported > 1 ? 's' : ''}`];
  if (r.duplicates) parts.push(`${r.duplicates} doublon${r.duplicates > 1 ? 's' : ''} ignoré${r.duplicates > 1 ? 's' : ''}`);
  if (r.invalid.length) parts.push(`${r.invalid.length} ligne${r.invalid.length > 1 ? 's' : ''} invalide${r.invalid.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

export async function importCandidates(candidates: ImportCandidate[]): Promise<ImportReport> {
  const s = state();
  const report = await importNotes(s.db, candidates, s.notes);
  await s.refresh();
  return report;
}

/** Import d'un fichier CSV ou JSON (notes ou sauvegarde complète). */
export async function importFromFile(): Promise<void> {
  const { toast } = useApp.getState();
  try {
    const file = await pickFile([{ name: 'Vocabulaire (CSV, JSON)', extensions: ['csv', 'tsv', 'txt', 'json'] }]);
    if (!file) return;
    const text = await file.text();
    if (/\.json$/i.test(file.name)) {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Fichier JSON illisible.');
      }
      if (isBackup(data)) {
        await restoreFromBackupData(data);
        return;
      }
      const report = await importCandidates(parseJsonNotes(data));
      toast('success', describeReport(report));
    } else {
      const candidates = parseCsvNotes(text);
      if (!candidates.length) throw new Error('Aucune ligne trouvée dans ce fichier.');
      const report = await importCandidates(candidates);
      toast(report.imported ? 'success' : 'info', describeReport(report));
    }
  } catch (err) {
    toast('error', errorMessage(err));
  }
}

export async function exportToCsv(): Promise<void> {
  const s = useApp.getState();
  try {
    const path = await saveTextFile(`lexora-vocabulaire-${stamp()}.csv`, exportCsv(s.notes, s.collections, s.settings), [
      { name: 'CSV', extensions: ['csv'] },
    ]);
    if (path) s.toast('success', `${s.notes.length} expressions exportées en CSV`);
  } catch (err) {
    s.toast('error', errorMessage(err));
  }
}

export async function exportToJson(): Promise<void> {
  const s = useApp.getState();
  try {
    const path = await saveTextFile(`lexora-vocabulaire-${stamp()}.json`, JSON.stringify(exportNotesJson(s.notes, s.collections), null, 2), [
      { name: 'JSON', extensions: ['json'] },
    ]);
    if (path) s.toast('success', `${s.notes.length} expressions exportées en JSON`);
  } catch (err) {
    s.toast('error', errorMessage(err));
  }
}

/** Sauvegarde complète (notes, fiches FSRS, historique, réglages) en JSON. */
export async function backupToFile(): Promise<void> {
  const s = state();
  try {
    const data = await exportBackup(s.db);
    const path = await saveTextFile(`lexora-sauvegarde-${stamp()}.json`, JSON.stringify(data), [{ name: 'Sauvegarde Lexora', extensions: ['json'] }]);
    if (path) s.toast('success', 'Sauvegarde complète enregistrée');
  } catch (err) {
    s.toast('error', errorMessage(err));
  }
}

async function reloadAll() {
  const s = state();
  const settings = await loadSettings(s.db);
  useApp.setState({ settings, scheduler: createScheduler(settings) });
  await s.refresh();
}

async function restoreFromBackupData(data: Parameters<typeof restoreBackup>[1]) {
  const s = state();
  const count = data.tables.notes?.length ?? 0;
  const ok = await confirm({
    title: 'Restaurer cette sauvegarde ?',
    message: `Vos données actuelles (${s.notes.length} expressions) seront remplacées par celles de la sauvegarde (${count} expressions, historique compris).`,
    confirmLabel: 'Restaurer',
    danger: true,
  });
  if (!ok) return;
  if (isTauri()) await backupDbFile(); // filet de sécurité
  await restoreBackup(s.db, data);
  await reloadAll();
  s.toast('success', 'Sauvegarde restaurée');
}

/** Restauration depuis une sauvegarde JSON ou un fichier .db (sauvegardes automatiques). */
export async function restoreFromFile(): Promise<void> {
  const { toast } = useApp.getState();
  try {
    const file = await pickFile([{ name: 'Sauvegarde Lexora', extensions: isTauri() ? ['json', 'db'] : ['json'] }]);
    if (!file) return;
    if (/\.db$/i.test(file.name) && file.path) {
      const ok = await confirm({
        title: 'Restaurer cette base ?',
        message: 'Vos données actuelles seront remplacées. Une copie de sécurité est créée automatiquement avant.',
        confirmLabel: 'Restaurer',
        danger: true,
      });
      if (!ok) return;
      await restoreDbFile(file.path);
      await reloadAll();
      toast('success', 'Base restaurée');
      return;
    }
    const data = JSON.parse(await file.text());
    if (!isBackup(data)) throw new Error("Ce fichier n'est pas une sauvegarde complète Lexora (utilisez « Importer » pour un fichier de notes).");
    await restoreFromBackupData(data);
  } catch (err) {
    toast('error', errorMessage(err));
  }
}

export async function backupNowToAppFolder(): Promise<void> {
  const { toast } = useApp.getState();
  try {
    const path = await backupDbFile();
    toast('success', `Copie enregistrée : ${path.split(/[\\/]/).pop()}`);
  } catch (err) {
    toast('error', errorMessage(err));
  }
}
