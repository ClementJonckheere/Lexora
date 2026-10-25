import { useApp } from '@/app/store';
import { languageInfo } from '@/core/domain/languages';
import type { Note } from '@/core/domain/types';
import { speak } from '@/core/platform/speech';

const warned = new Set<string>();

/** « l'espagnol », « le chinois ». */
const withArticle = (name: string) => {
  const n = name.toLowerCase();
  return /^[aeiouyéèêh]/.test(n) ? `l'${n}` : `le ${n}`;
};

/** Prononce un texte dans la langue d'un univers (celui de la note, sinon l'univers courant). */
export function speakText(text: string, universeId?: string): void {
  const { settings, universes, universe, toast } = useApp.getState();
  const language = universes.find((u) => u.id === universeId)?.language ?? universe?.language ?? 'en';
  void speak(text, { language, voice: settings.ttsVoices[language], rate: settings.ttsRate }).then((result) => {
    if (result !== 'no-voice' || warned.has(language)) return;
    warned.add(language);
    toast(
      'error',
      `Aucune voix pour ${withArticle(languageInfo(language).name)} n'est installée sur cet ordinateur. Windows : Paramètres → Heure et langue → Voix → Ajouter des voix, puis redémarrez Lexora.`,
    );
  });
}

export function speakNote(note: Note): void {
  speakText(note.expression, note.universeId);
}
