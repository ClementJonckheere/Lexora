import { useEffect } from 'react';
import { useApp } from '@/app/store';
import { pushSupported, updatePush } from '@/core/platform/push';
import { reminderHour } from '@/core/progress/reminder';
import { readPref, writePref } from '@/ui/prefs';
import { EMPTY_PROGRESS, useDailyProgress } from './useDailyProgress';

/**
 * Version web : l'heure du rappel enregistrée dans Supabase suit l'heure habituelle (qui évolue avec vos révisions),
 * le réglage et le fuseau de l'appareil. Rien n'est écrit tant que rien ne change.
 */
export function usePushSync(): void {
  const progress = useDailyProgress();
  const settings = useApp((s) => s.settings);
  const loaded = progress !== EMPTY_PROGRESS;
  const { hour, minute } = reminderHour(settings.reminderTime, settings.reminderAuto, progress.usualHour);
  const dayStartHour = settings.dayStartHour;
  useEffect(() => {
    if (!loaded || !pushSupported()) return;
    const key = JSON.stringify([hour, minute, dayStartHour, Intl.DateTimeFormat().resolvedOptions().timeZone]);
    if (readPref<string>('push.prefs', '') === key) return;
    void updatePush({ hour, minute, dayStartHour })
      .then(() => writePref('push.prefs', key))
      .catch(() => undefined);
  }, [loaded, hour, minute, dayStartHour]);
}
