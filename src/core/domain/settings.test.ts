import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, settingsFor } from './settings';

describe('plafond de nouveaux mots du jour', () => {
  const settings = { ...DEFAULT_SETTINGS, newPerDay: 20 };
  it('plafond de la langue, réduit par le quota du budget, jamais augmenté', () => {
    expect(settingsFor(settings, { id: 'en', newPerDay: null }).newPerDay).toBe(20);
    expect(settingsFor(settings, { id: 'en', newPerDay: 8 }).newPerDay).toBe(8);
    expect(settingsFor(settings, { id: 'en', newPerDay: 8 }, { en: 3 }).newPerDay).toBe(3);
    expect(settingsFor(settings, { id: 'en', newPerDay: 8 }, { en: 50 }).newPerDay).toBe(8);
    expect(settingsFor(settings, { id: 'es', newPerDay: null }, { en: 3 }).newPerDay).toBe(20);
  });
  it('budget désactivé par défaut, borné', () => {
    expect(DEFAULT_SETTINGS.dailyMinutes).toBe(0);
    expect(sanitizeSettings({ dailyMinutes: 999 }).dailyMinutes).toBe(240);
  });
});
