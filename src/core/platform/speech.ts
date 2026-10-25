import { languageInfo } from '../domain/languages';

/**
 * Prononciation via la synthèse vocale du système (Web Speech API).
 * Sous Windows, WebView2 utilise les voix installées localement (Paramètres Windows →
 * Heure et langue → Voix) : aucune connexion n'est nécessaire.
 */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

const prefixOf = (language: string) => languageInfo(language).speech.split('-')[0].toLowerCase() || language;
const matchesLang = (v: SpeechSynthesisVoice, language: string) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === prefixOf(language);

/** Voix disponibles pour une langue. */
export function loadVoices(language: string): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const read = () => speechSynthesis.getVoices().filter((v) => matchesLang(v, language));
  if (speechSynthesis.getVoices().length) return Promise.resolve(read());
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(read());
    };
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    setTimeout(finish, 1500);
  });
}

function pickVoice(language: string, preferred: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((v) => matchesLang(v, language));
  const exact = languageInfo(language).speech.toLowerCase();
  return (
    voices.find((v) => v.voiceURI === preferred) ??
    voices.find((v) => v.localService && v.lang.toLowerCase().replace('_', '-') === exact) ??
    voices.find((v) => v.localService) ??
    voices[0]
  );
}

/** Retire les marqueurs « sth », « sb » qui ne se prononcent pas naturellement. */
export function speakableText(expression: string): string {
  return expression
    .replace(/\bsth\b/gi, 'something')
    .replace(/\bsb\b/gi, 'somebody')
    .replace(/[()[\]/]/g, ' ');
}

export function speak(text: string, opts: { language: string; voice?: string; rate?: number }): boolean {
  if (!speechSupported() || !text.trim()) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(opts.language === 'en' ? speakableText(text) : text);
  const voice = pickVoice(opts.language, opts.voice ?? '');
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else u.lang = languageInfo(opts.language).speech || opts.language;
  u.rate = opts.rate ?? 0.95;
  speechSynthesis.speak(u);
  return true;
}
