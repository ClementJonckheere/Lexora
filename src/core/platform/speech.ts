import { languageInfo } from '../domain/languages';

/**
 * Prononciation via la synthèse vocale du système (Web Speech API).
 * Sous Windows, WebView2 utilise les voix installées localement (Paramètres Windows →
 * Heure et langue → Voix) : aucune connexion n'est nécessaire.
 *
 * Une voix de la langue de l'univers est toujours choisie explicitement : sans elle, Windows
 * lirait le texte avec sa voix par défaut (française ou anglaise), donc avec le mauvais accent.
 */

/** Sous-ensemble de SpeechSynthesisVoice utilisé pour le choix (testable sans navigateur). */
export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

export type SpeakResult = 'ok' | 'no-voice' | 'unsupported';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

const norm = (lang: string) => lang.toLowerCase().replace('_', '-');
const base = (lang: string) => norm(lang).split('-')[0];

/** Code de base de la langue d'un univers : « zh » pour zh, « pt » pour pt… */
function targetBase(language: string): string {
  return base(languageInfo(language).speech || language);
}

export function voicesFor<T extends VoiceLike>(voices: T[], language: string): T[] {
  const target = targetBase(language);
  return voices.filter((v) => base(v.lang) === target);
}

/**
 * Choix de la voix : celle choisie dans les réglages, sinon une voix « Natural », sinon la variante régionale attendue
 * (es-ES, pt-PT, zh-CN…) en local, sinon toute voix locale de la langue, sinon toute voix de la langue.
 * Jamais une voix d'une autre langue.
 */
export function chooseVoice<T extends VoiceLike>(voices: T[], language: string, preferred = ''): T | undefined {
  const candidates = voicesFor(voices, language);
  const exact = norm(languageInfo(language).speech || language);
  const natural = (v: T) => /natural/i.test(v.name);
  return (
    candidates.find((v) => v.voiceURI === preferred) ??
    // Voix neuronales de Windows / Edge (« … Online (Natural) ») : bien plus fluides, quand elles existent.
    candidates.find((v) => natural(v) && norm(v.lang) === exact) ??
    candidates.find(natural) ??
    candidates.find((v) => v.localService && norm(v.lang) === exact) ??
    candidates.find((v) => norm(v.lang) === exact) ??
    candidates.find((v) => v.localService) ??
    candidates[0]
  );
}

/** Liste des voix du système, en attendant leur chargement (asynchrone sous Windows et Chromium). */
export function systemVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    setTimeout(finish, 1500);
  });
}

/** Voix disponibles pour une langue. */
export async function loadVoices(language: string): Promise<SpeechSynthesisVoice[]> {
  return voicesFor(await systemVoices(), language);
}

/** Retire les marqueurs « sth », « sb » qui ne se prononcent pas naturellement. */
export function speakableText(expression: string): string {
  return expression
    .replace(/\bsth\b/gi, 'something')
    .replace(/\bsb\b/gi, 'somebody')
    .replace(/[()[\]/]/g, ' ');
}

export async function speak(text: string, opts: { language: string; voice?: string; rate?: number }): Promise<SpeakResult> {
  if (!speechSupported() || !text.trim()) return 'unsupported';
  const voice = chooseVoice(await systemVoices(), opts.language, opts.voice ?? '');
  if (!voice) return 'no-voice';
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(opts.language === 'en' ? speakableText(text) : text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = opts.rate ?? 0.95;
  speechSynthesis.speak(u);
  return 'ok';
}
