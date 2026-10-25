/**
 * Prononciation via la synthèse vocale du système (Web Speech API).
 * Sous Windows, WebView2 utilise les voix installées localement (Microsoft David, Zira, Aria…) :
 * aucune connexion n'est nécessaire.
 */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const read = () => speechSynthesis.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
  const now = read();
  if (now.length) {
    cachedVoices = now;
    return Promise.resolve(now);
  }
  return new Promise((resolve) => {
    const done = () => {
      cachedVoices = read();
      resolve(cachedVoices);
    };
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

function pickVoice(preferred: string): SpeechSynthesisVoice | undefined {
  const voices = cachedVoices.length ? cachedVoices : speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  return (
    voices.find((v) => v.voiceURI === preferred) ??
    voices.find((v) => v.localService && /en[-_]US/i.test(v.lang)) ??
    voices.find((v) => v.localService) ??
    voices[0]
  );
}

/** Retire les marqueurs « to », « sth », « sb » qui ne se prononcent pas naturellement. */
export function speakableText(expression: string): string {
  return expression
    .replace(/\bsth\b/gi, 'something')
    .replace(/\bsb\b/gi, 'somebody')
    .replace(/[()[\]/]/g, ' ');
}

export function speak(text: string, opts: { voice?: string; rate?: number } = {}): boolean {
  if (!speechSupported() || !text.trim()) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakableText(text));
  const voice = pickVoice(opts.voice ?? '');
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else u.lang = 'en-US';
  u.rate = opts.rate ?? 0.95;
  speechSynthesis.speak(u);
  return true;
}
