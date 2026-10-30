import type { Exercise } from './exercises';

/**
 * Contrôles systématiques des banques d'exercices livrées (public/grammar/en/exercises, placement) : ce que les tests
 * des générateurs ne voient pas, parce qu'ils portent sur quelques phrases choisies. Lancés par `npm test` (donc la CI)
 * sur chaque banque ; une erreur bloque, un avertissement signale.
 */

export interface BankIssue {
  level: 'error' | 'warning';
  id: string;
  message: string;
}

/** Part maximale d'une nature de réponse quand une leçon en a plusieurs : au-delà, répondre toujours pareil suffit. */
export const MAX_FORM_SHARE = 0.6;
/** Une banque plus petite ne permet pas les 20 réponses du seuil d'acquisition sans répétition. */
export const MIN_BANK_SIZE = 20;

/** Repères d'un moment passé, incompatibles avec un present perfect (hors « since », qui en introduit l'origine). */
const PAST_MARKER = /\b(?:yesterday|ago|last (?:night|week|month|year|summer|winter|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in (?:1[89]|20)\d\d)\b/i;
/** Verbe au passé (régulier ou courant) : il ouvre une autre proposition. */
const PAST_VERB = /\b(?:[a-z]+ed|said|told|did|was|were|saw|met|went|came|gave|took|made|got|left|bought|knew|thought|wrote|found)\b/i;

/**
 * Forme canonique pour comparer la phrase et le trou rempli : les générateurs développent ou contractent exprès
 * (I've → I have, must not → mustn't). 'd valant had ou would, les deux sont confondus ici, comme 's (is, has).
 */
const normalize = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b(?:cannot|can't)\b/g, 'can not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/\bshan't\b/g, 'shall not')
    .replace(/n't\b/g, ' not')
    .replace(/'ll\b/g, ' will')
    .replace(/'ve\b/g, ' have')
    .replace(/'re\b/g, ' are')
    .replace(/'m\b/g, ' am')
    .replace(/'d\b|\bhad\b/g, ' would')
    .replace(/\b(he|she|it|that|there|what|who|where|how|here)'s\b/g, '$1 is')
    .replace(/'s\s+(been|got|gone|done|had|never|already|just)\b/g, ' is $1')
    .replace(/\bhas\b/g, 'is')
    .replace(/\s+/g, ' ')
    .trim();

/** Futur ou conditionnel dans la traduction, attendu avec une réponse en will / 'll. */
const FR_FUTURE = /(?<![a-zà-ÿ])[a-zàâçéèêëîïôûù]{2,}r(?:ai|as|a|ons|ez|ont)(?![a-zà-ÿ])|\b(?:vais|vas|va|allons|allez|vont)\s+(?:\S+\s+)?[a-zàâçéèêëîïôûù]+(?:er|ir|re|oir)\b/i;

export function checkBank(lessonId: string, items: readonly Exercise[], blocklist: readonly RegExp[] = []): BankIssue[] {
  const issues: BankIssue[] = [];
  const err = (id: string, message: string) => issues.push({ level: 'error', id, message });
  const warn = (id: string, message: string) => issues.push({ level: 'warning', id, message });
  const ids = new Set<string>();

  for (const ex of items) {
    if (ids.has(ex.id)) err(ex.id, 'identifiant en double');
    ids.add(ex.id);
    if (!ex.answer.trim()) err(ex.id, 'réponse vide');
    if (!(ex.before + ex.after).trim()) err(ex.id, 'phrase réduite au trou');
    // Le trou rempli redonne la phrase, aux apostrophes et contractions développées près (I'll → I will).
    const rebuilt = `${ex.before}${ex.answer}${ex.after}`;
    if (normalize(rebuilt) !== normalize(ex.en)) err(ex.id, `le trou rempli ne redonne pas la phrase : « ${rebuilt} »`);
    if (ex.choices) {
      if (!ex.choices.includes(ex.answer)) err(ex.id, `réponse absente des propositions (${ex.choices.join(' | ')})`);
      if (new Set(ex.choices.map((c) => c.toLowerCase())).size !== ex.choices.length) err(ex.id, `propositions en double (${ex.choices.join(' | ')})`);
      if (ex.choices.length < 2) err(ex.id, 'une seule proposition');
      if (ex.choices.some((c) => !c.trim())) err(ex.id, 'proposition vide');
    }
    for (const re of blocklist) if (re.test(ex.en) || re.test(ex.fr)) err(ex.id, `mot bloqué (${re.source})`);
    if (lessonId === 'present-perfect' && /^(?:have|has|'ve|'s)\b/i.test(ex.answer)) {
      // Le repère compte s'il porte sur le present perfect : pas après since, ni dans une autre proposition au passé
      // (« what you said last week »).
      const marker = PAST_MARKER.exec(ex.after);
      if (marker && !/\bsince\b/i.test(ex.en) && !PAST_VERB.test(ex.after.slice(0, marker.index))) err(ex.id, 'repère passé avec un present perfect');
    }
    if (/^(?:will|'ll)\b/.test(ex.answer) && ex.choices && !FR_FUTURE.test(ex.fr)) warn(ex.id, 'réponse will sans futur ni conditionnel dans la traduction');
  }

  if (items.length < MIN_BANK_SIZE) warn(lessonId, `banque de ${items.length} exercices (moins de ${MIN_BANK_SIZE})`);
  const forms = new Map<string, number>();
  for (const ex of items) forms.set(ex.form ?? '', (forms.get(ex.form ?? '') ?? 0) + 1);
  if (forms.size > 1) {
    const [form, n] = [...forms].sort((a, b) => b[1] - a[1])[0];
    if (n / items.length > MAX_FORM_SHARE)
      err(lessonId, `nature « ${form} » : ${Math.round((100 * n) / items.length)} % des réponses (plus de ${MAX_FORM_SHARE * 100} %)`);
  }
  return issues;
}
