import data from './irregular-verbs.json';
import { dayKey } from '../domain/dates';

/**
 * Verbes irréguliers : on donne la base et sa traduction, on tape le prétérit et le participe passé. Chaque verbe a sa
 * propre répétition espacée, déduite de l'historique des réponses (table `verb_answers`) : 1, 3, 7, 21 puis 60 jours
 * après une série de réponses justes, à revoir tout de suite après une erreur. Un verbe est maîtrisé après 3 réponses
 * justes de suite, données sur 3 jours différents (titre « Dompteur d'irréguliers » : 100 verbes).
 */

export interface IrregularVerb {
  base: string;
  past: string[];
  participle: string[];
  fr: string;
  /** 1 : les plus courants (appris d'abord) ; 3 : les plus rares. */
  tier: number;
}

export const IRREGULAR_VERBS: readonly IrregularVerb[] = (data as { verbs: IrregularVerb[] }).verbs;

export interface VerbAnswer {
  verb: string;
  pastOk: boolean;
  participleOk: boolean;
  at: number;
}

const DAY = 86_400_000;
/** Délai avant la prochaine question, selon la série de réponses justes (en jours). */
export const VERB_INTERVALS = [0, 1, 3, 7, 21, 60];
export const VERB_MASTERED_STREAK = 3;
export const VERB_SESSION_SIZE = 10;
/** Verbes nouveaux par séance au plus, pour ne pas en découvrir trop à la fois. */
export const VERB_NEW_PER_SESSION = 6;

const normalize = (s: string) => s.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ');

/**
 * Une forme tapée est juste si chacune des formes données (séparées par « / », « , » ou « or ») est admise :
 * « burnt », « burned » et « burnt/burned » le sont toutes ; « was » ou « were » pour be.
 */
export function formOk(given: string, accepted: readonly string[]): boolean {
  const parts = normalize(given)
    .split(/\s*(?:\/|,|\bor\b|\bou\b)\s*/)
    .filter(Boolean);
  const ok = new Set(accepted.map(normalize));
  return parts.length > 0 && parts.every((p) => ok.has(p));
}

export function checkVerb(verb: IrregularVerb, past: string, participle: string): { pastOk: boolean; participleOk: boolean } {
  return { pastOk: formOk(past, verb.past), participleOk: formOk(participle, verb.participle) };
}

export interface VerbState {
  base: string;
  answers: number;
  /** Réponses justes (les deux formes) à la suite, en partant de la dernière. */
  streak: number;
  mastered: boolean;
  /** Prochaine question (null : jamais vu). */
  due: number | null;
}

export function verbState(base: string, answers: readonly VerbAnswer[]): VerbState {
  const list = answers.filter((a) => a.verb === base).sort((a, b) => a.at - b.at);
  if (!list.length) return { base, answers: 0, streak: 0, mastered: false, due: null };
  let streak = 0;
  const days = new Set<string>();
  for (let i = list.length - 1; i >= 0 && list[i].pastOk && list[i].participleOk; i--) {
    streak++;
    days.add(dayKey(list[i].at));
  }
  const last = list[list.length - 1].at;
  const interval = VERB_INTERVALS[Math.min(streak, VERB_INTERVALS.length - 1)];
  return { base, answers: list.length, streak, mastered: streak >= VERB_MASTERED_STREAK && days.size >= VERB_MASTERED_STREAK, due: last + interval * DAY };
}

export function verbStates(answers: readonly VerbAnswer[]): VerbState[] {
  return IRREGULAR_VERBS.map((v) => verbState(v.base, answers));
}

/** Nombre de verbes maîtrisés. */
export function masteredVerbs(answers: readonly VerbAnswer[]): number {
  return verbStates(answers).filter((s) => s.mastered).length;
}

/**
 * Verbes d'une séance : ceux à revoir (les plus en retard d'abord), puis des verbes nouveaux, les plus courants
 * d'abord (6 au plus, ou toute la séance si rien n'est à revoir).
 */
export function pickVerbs(answers: readonly VerbAnswer[], now = Date.now(), size = VERB_SESSION_SIZE): IrregularVerb[] {
  const states = new Map(verbStates(answers).map((s) => [s.base, s]));
  const due = IRREGULAR_VERBS.filter((v) => {
    const s = states.get(v.base)!;
    return s.due !== null && s.due <= now;
  }).sort((a, b) => states.get(a.base)!.due! - states.get(b.base)!.due!);
  const fresh = IRREGULAR_VERBS.filter((v) => states.get(v.base)!.due === null).sort((a, b) => a.tier - b.tier);
  const chosen = due.slice(0, size);
  const room = Math.min(size - chosen.length, chosen.length ? VERB_NEW_PER_SESSION : size);
  return [...chosen, ...fresh.slice(0, Math.max(0, room))];
}

/** Bilan : verbes vus, maîtrisés, à revoir maintenant. */
export function verbSummary(answers: readonly VerbAnswer[], now = Date.now()): { seen: number; mastered: number; due: number; total: number } {
  const states = verbStates(answers);
  return {
    seen: states.filter((s) => s.answers > 0).length,
    mastered: states.filter((s) => s.mastered).length,
    due: states.filter((s) => s.due !== null && s.due <= now).length,
    total: states.length,
  };
}
