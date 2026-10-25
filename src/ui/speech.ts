import { useApp } from '@/app/store';
import type { Note } from '@/core/domain/types';
import { speak } from '@/core/platform/speech';

/** Prononce un texte dans la langue d'un univers (celui de la note, sinon l'univers courant). */
export function speakText(text: string, universeId?: string): boolean {
  const { settings, universes, universe } = useApp.getState();
  const language = universes.find((u) => u.id === universeId)?.language ?? universe?.language ?? 'en';
  return speak(text, { language, voice: settings.ttsVoices[language], rate: settings.ttsRate });
}

export function speakNote(note: Note): boolean {
  return speakText(note.expression, note.universeId);
}
