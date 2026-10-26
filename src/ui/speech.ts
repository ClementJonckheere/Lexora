import { useApp } from '@/app/store';
import { languageInfo } from '@/core/domain/languages';
import type { Note } from '@/core/domain/types';
import { speak } from '@/core/platform/speech';
import { playUrl } from '@/core/platform/audio';
import { findRecording } from '@/core/dictionary/wiktionary';

/** Au-delà, on n'attend plus l'enregistrement : voix de synthèse. */
const RECORDING_WAIT_MS = 2500;
/** Expressions longues : les enregistrements n'existent que pour des mots et locutions courtes. */
const MAX_RECORDED_WORDS = 4;

const warned = new Set<string>();

/** « l'espagnol », « le chinois ». */
const withArticle = (name: string) => {
  const n = name.toLowerCase();
  return /^[aeiouyéèêh]/.test(n) ? `l'${n}` : `le ${n}`;
};

export interface SpeakOptions {
  /** Plus lentement (mode écoute). */
  slow?: boolean;
  /** Voix de synthèse uniquement (phrases d'exemple). */
  synthOnly?: boolean;
}

/** Enregistrement humain (Wiktionnaire) s'il existe et arrive vite, sinon null. */
async function recordingFor(text: string, language: string): Promise<string | null> {
  if (text.trim().split(/\s+/).length > MAX_RECORDED_WORDS) return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), RECORDING_WAIT_MS));
  return Promise.race([findRecording(text, language).catch(() => null), timeout]);
}

/**
 * Prononce un texte dans la langue d'un univers (celui de la note, sinon l'univers courant) :
 * enregistrement d'une vraie personne quand il existe (réglage « Prononciation enregistrée »), sinon voix de synthèse.
 */
export function speakText(text: string, universeId?: string, opts: SpeakOptions = {}): void {
  void speakTextAsync(text, universeId, opts);
}

export async function speakTextAsync(text: string, universeId?: string, opts: SpeakOptions = {}): Promise<void> {
  const { settings, universes, universe } = useApp.getState();
  const language = universes.find((u) => u.id === universeId)?.language ?? universe?.language ?? 'en';
  if (settings.recordedVoice && !opts.synthOnly) {
    const url = await recordingFor(text, language);
    if (url && (await playUrl(url, opts.slow ? 0.75 : 1))) return;
  }
  synth(text, language, opts.slow);
}

function synth(text: string, language: string, slow?: boolean): void {
  const { settings, toast } = useApp.getState();
  void speak(text, { language, voice: settings.ttsVoices[language], rate: settings.ttsRate * (slow ? 0.75 : 1) }).then((result) => {
    if (result !== 'no-voice' || warned.has(language)) return;
    warned.add(language);
    toast(
      'error',
      `Aucune voix pour ${withArticle(languageInfo(language).name)} n'est installée sur cet ordinateur. Windows : Paramètres → Heure et langue → Voix → Ajouter des voix, puis redémarrez Lexora.`,
    );
  });
}

export function speakNote(note: Note, opts: SpeakOptions = {}): void {
  speakText(note.expression, note.universeId, opts);
}
