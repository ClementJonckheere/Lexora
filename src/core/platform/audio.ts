/** Lecture d'un fichier audio (prononciation enregistrée). Résout `false` si la lecture échoue. */
let current: HTMLAudioElement | null = null;

export function playUrl(url: string, rate = 1): Promise<boolean> {
  return new Promise((resolve) => {
    current?.pause();
    const audio = new Audio(url);
    current = audio;
    audio.playbackRate = rate;
    const done = (ok: boolean) => {
      audio.onended = audio.onerror = null;
      resolve(ok);
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    audio.play().catch(() => done(false));
  });
}
