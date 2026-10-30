import { supabase } from '@/core/platform/auth';
import { defaultLeaderboardName } from '@/core/progress/leaderboard';
import { computeXp, levelFor } from '@/core/progress/xp';
import { loadGrammarAnswers } from '@/core/repo/learnRepo';
import { loadXpEvents } from '@/core/repo/xpRepo';
import { leaveLeaderboard, publishLeaderboard } from '@/core/sync/leaderboardRemote';
import { useApp } from './store';

/** Une publication au plus toutes les 5 minutes après une synchronisation (sauf demande explicite). */
const PUBLISH_EVERY_MS = 5 * 60_000;
let lastPublished = 0;

/** XP par langue (plusieurs univers d'une même langue s'additionnent), et le niveau correspondant. */
async function xpByLanguage(): Promise<{ language: string; xp: number; level: number }[]> {
  const { db, universes } = useApp.getState();
  if (!db) return [];
  const sums = new Map<string, number>();
  for (const u of universes) {
    const xp = computeXp(await loadXpEvents(db, u.id, await loadGrammarAnswers(db, u.id))).total;
    sums.set(u.language, (sums.get(u.language) ?? 0) + xp);
  }
  return [...sums].map(([language, xp]) => ({ language, xp, level: levelFor(xp).level }));
}

/** Pseudo publié : celui choisi, sinon le prénom du compte. */
export function leaderboardName(): string {
  const { settings, auth } = useApp.getState();
  return settings.leaderboard.name || (auth.user ? defaultLeaderboardName(auth.user.name, auth.user.email) : '');
}

/** Publie son XP si l'on participe au classement ; `force` ignore l'intervalle minimal. */
export async function publishMyScores(force = false): Promise<void> {
  const { auth, settings } = useApp.getState();
  if (!auth.user || !settings.leaderboard.enabled) return;
  if (!force && Date.now() - lastPublished < PUBLISH_EVERY_MS) return;
  const name = leaderboardName();
  if (!name) return;
  const rows = (await xpByLanguage()).filter((r) => r.xp > 0).map((r) => ({ ...r, name }));
  await publishLeaderboard(supabase(), auth.user.id, rows);
  lastPublished = Date.now();
}

/** Rejoint ou quitte le classement ; quitter retire aussitôt ses lignes. */
export async function setLeaderboard(enabled: boolean, name: string): Promise<void> {
  const { updateSettings, auth } = useApp.getState();
  await updateSettings({ leaderboard: { enabled, name: name.trim().slice(0, 30) } });
  if (!auth.user) return;
  if (enabled) await publishMyScores(true);
  else await leaveLeaderboard(supabase(), auth.user.id);
}
