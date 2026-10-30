import irregular from './irregular-verbs.json';

/**
 * Motifs de repérage des points de grammaire anglaise dans un texte (sans IA : expressions régulières et listes de
 * mots). Chaque motif a une précision mesurée par annotation (voir points.json, champ detect) : on ne surligne dans
 * le lecteur qu'au-dessus de 90 % ; en dessous, le motif sert seulement à trouver des phrases d'exercice.
 */

export interface PatternMatch {
  start: number;
  end: number;
}

/* ------------------------------------------------------- listes de mots --- */

const verbs = (irregular as { verbs: { base: string; past: string[]; participle: string[] }[] }).verbs;
/** Prétérits irréguliers distincts de la base (« went », pas « put » ni « read »). */
const IRREGULAR_PAST = [...new Set(verbs.flatMap((v) => v.past.filter((p) => p !== v.base && !p.includes('/'))))].filter((p) => p !== 'was' && p !== 'were');
const IRREGULAR_PARTICIPLES = [...new Set(verbs.flatMap((v) => v.participle))].filter((p) => p !== 'got');

/** Mots en -ing qui ne sont pas des formes verbales. */
const NOT_ING = [
  'thing',
  'things',
  'nothing',
  'something',
  'anything',
  'everything',
  'king',
  'kings',
  'ring',
  'rings',
  'sing',
  'bring',
  'spring',
  'string',
  'sting',
  'swing',
  'wing',
  'wings',
  'morning',
  'mornings',
  'evening',
  'evenings',
  'during',
  'ceiling',
  'pudding',
  'wedding',
  'building',
  'darling',
  'stocking',
  'stockings',
  'shilling',
  'shillings',
  'cunning',
  'lightning',
  'sterling',
  'farthing',
  'herring',
  'awning',
  'icing',
  'nothing',
  'clothing',
  'bedding',
  'feeling',
  'meaning',
  'beginning',
  'cling',
  'fling',
  'sling',
  'wring',
  'ping',
  'ding',
  'bling',
  'viking',
];
const ING = `(?!(?:${NOT_ING.join('|')})\\b)[a-z]{2,}ing`;
const PARTICIPLE = `(?:[a-z]{2,}ed|${IRREGULAR_PARTICIPLES.join('|')})`;
const PAST = `(?:[a-z]{2,}ed|${IRREGULAR_PAST.join('|')})`;
const SUBJECT = '(?:i|you|he|she|it|we|they)';
const OBJECT = '(?:me|him|her|us|them|it|you)';
const BE_PRESENT = "(?:am|is|are|'m|'re)";
const MODAL = '(?:can|could|must|should|will|would|may|might)';
const DAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
const NUMBER = '(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty|a few|several|many)';
const DETERMINER = '(?:the|a|an|my|your|his|her|its|our|their|this|that|these|those)';

/** Motifs par point (null : pas de repérage possible sans analyse grammaticale). `^` = début de phrase. */
const SOURCES: Record<string, string[] | null> = {
  be: ['\\b(?:am|is|are)\\b', "\\b(?:i'm|you're|we're|they're)\\b"],
  'was-were': ['\\b(?:was|were)\\b'],
  'subject-object-pronouns': ['\\b(?:me|him|us|them)\\b'],
  'possessive-adjectives': ['\\b(?:my|your|his|its|our|their|mine|yours|ours|theirs)\\b'],
  articles: ['\\b(?:a|an|the)\\b'],
  'plural-forms': ['\\b(?:children|men|women|people|feet|teeth|mice|geese|[a-z]{3,}ies)\\b'],
  'this-that': ['\\b(?:this|these|those)\\b'],
  adjectives: null,
  'present-simple': [`\\b(?:he|she|it)\\s+(?!(?:is|was|has|does|always|never|often|also)\\b)[a-z]+[^s\\W]s\\b`],
  'do-questions': ['^\\s*(?:do|does)\\b', "\\b(?:don't|doesn't|do not|does not)\\b"],
  'wh-questions': ['^\\s*(?:what|where|when|why|how|who|which)\\b(?=[^?]*\\?\\s*$)'],
  'there-is': ["\\bthere\\s+(?:is|are|was|were|'s)\\b"],
  'have-got': ["\\b(?:have|has|'ve)\\s+got\\b"],
  can: ["\\b(?:can|can't|cannot)\\b"],
  imperative: ["^\\s*(?:don't|do not|please|let's)\\b"],
  'prepositions-time-place': [
    `\\b(?:at|on|in)\\s+(?:the\\s+)?(?:morning|afternoon|evening|night|weekend|christmas|${DAYS}|${MONTHS}|\\d{4}|\\d{1,2}(?::\\d\\d)?\\s?(?:am|pm|o'clock))\\b`,
  ],
  'frequency-adverbs': ['\\b(?:always|usually|often|sometimes|rarely|seldom|never|generally|frequently)\\b'],
  'present-continuous': [`\\b${BE_PRESENT}\\s+(?:not\\s+)?${ING}\\b`, `\\b(?:he|she|it|that|there|who)'s\\s+(?:not\\s+)?${ING}\\b`],
  'simple-vs-continuous': null,
  'past-simple-regular': [`\\b${SUBJECT}\\s+[a-z]{2,}ed\\b`],
  'past-simple-irregular': [`\\b${SUBJECT}\\s+(?:${IRREGULAR_PAST.join('|')})\\b`],
  'past-participle': [`\\b(?:have|has|had|'ve|been|being)\\s+(?:not\\s+|never\\s+|just\\s+|already\\s+)?${PARTICIPLE}\\b`],
  'past-questions': ['^\\s*did\\b', "\\b(?:didn't|did not)\\b"],
  'past-continuous': [`\\b(?:was|were)\\s+(?:not\\s+)?${ING}\\b`],
  uncountables: ['\\b(?:advice|information|furniture|news|luggage|baggage|equipment|knowledge|homework|research|evidence|progress|traffic)\\b'],
  countables: ['\\b(?:much|many|a lot of|lots of)\\b'],
  comparatives: ['\\b[a-z]+er\\s+than\\b', '\\bmore\\s+[a-z]+\\s+than\\b', '\\bthe\\s+(?:most\\s+[a-z]+|[a-z]{2,}est)\\b', '\\b(?:better|worse)\\b'],
  'possessive-s': [
    `\\b(?!(?:he|she|it|that|what|there|who|let|here|where|how)'s)[a-z]+'s\\s+(?!(?:been|got|not|a|an|the|going|gone|no|very|so|just)\\b)[a-z]+`,
  ],
  'going-to': [`\\b(?:am|is|are|was|were|'m|'re|'s)\\s+going\\s+to\\s+(?!${DETERMINER}\\b)[a-z]+`],
  will: ["\\b(?:will|won't|'ll)\\b"],
  'must-have-to': ['\\bmust\\b', '\\b(?:have|has|had)\\s+to\\s+[a-z]+', "\\b(?:don't|doesn't|didn't)\\s+have\\s+to\\b"],
  should: ["\\bshould(?:n't)?\\b"],
  'adverbs-manner': [
    '\\b(?!(?:only|family|early|likely|lovely|friendly|ugly|holy|daily|reply|supply|apply|july|italy|belly|jelly|silly|rely|ally|lonely|lily|holly|folly|bully|melancholy|monopoly|curly|jolly|homely|comely|surly|wily|unlikely|weekly|monthly|yearly|nightly|costly|deadly|elderly|kindly|lively|orderly|sickly|stately|timely|worldly|fly|imply|reply|multiply)\\b)[a-z]{3,}ly\\b',
  ],
  'verb-patterns': [
    '\\b(?:want|wants|wanted|need|needs|needed|decide|decided|hope|hoped|plan|planned|refuse|refused|promise|promised)\\s+(?:to\\s+[a-z]+|(?:me|him|her|us|them|you)\\s+to\\s+[a-z]+)',
    `\\b(?:enjoy|enjoys|enjoyed|avoid|avoided|finish|finished|mind|minded|keep|kept|suggest|suggested|imagine|imagined)\\s+${ING}\\b`,
  ],
  // Pas après un modal (« would have said » : conditionnel passé, « must have gone » : déduction).
  'present-perfect': [`(?<!\\b(?:would|could|should|might|must|may|will|can't|couldn't|wouldn't|shouldn't|to)\\s+)\\b(?:have|has|'ve|haven't|hasn't)\\s+(?:not\\s+|never\\s+|ever\\s+|just\\s+|already\\s+|always\\s+)?${PARTICIPLE}\\b`],
  'perfect-vs-past': null,
  'for-since': [
    `\\bsince\\s+(?:\\d{4}|last|yesterday|then|childhood|${DAYS}|${MONTHS})\\b`,
    `\\bfor\\s+${NUMBER}\\s+(?:years|months|weeks|days|hours|minutes|year|month|week|day|hour)\\b`,
  ],
  'perfect-continuous': [`\\b(?:have|has|'ve|'s)\\s+(?:not\\s+)?been\\s+${ING}\\b`],
  'past-perfect': [`\\b(?:had|'d)\\s+(?:not\\s+|never\\s+|already\\s+|just\\s+)?(?!better\\b)${PARTICIPLE}\\b`],
  'used-to': ['\\b(?<!\\b(?:am|is|are|was|were|be|been|get|got|getting)\\s)used\\s+to\\s+(?!(?:the|a|an|it|that|this)\\b)[a-z]+'],
  'first-conditional': ["\\bif\\b[^.?!;]*,\\s*[^.?!;]*?\\b(?:will|won't|'ll)\\b", "\\b(?:will|won't|'ll)\\b[^.?!;]*\\bif\\b"],
  'time-clauses': [
    `\\b(?:when|as soon as|until)\\s+${SUBJECT}\\s+(?!(?:was|were|had|did|would|could|should|might|must|${PAST})\\b)[a-z]+\\b`,
    "\\b(?:when|as soon as|until|before|after)\\b[^.?!;,]*,\\s*[^.?!;]*?\\b(?:will|'ll|won't)\\b",
    "\\b(?:will|'ll|won't)\\b[^.?!;]*\\b(?:when|as soon as|until)\\b",
  ],
  'second-conditional': ["\\bif\\b[^.?!;]*\\b(?:would|wouldn't|'d)\\s+(?!have\\b)[a-z]+", "\\b(?:would|wouldn't|'d)\\s+(?!have\\b)[a-z]+[^.?!;]*\\bif\\b"],
  passive: [`\\b(?:is|are|was|were|am)\\s+(?:not\\s+)?${PARTICIPLE}\\b`],
  'relatives-defining': ['\\b(?:the|a|an)\\s+[a-z]+\\s+(?:who|which|whom)\\s+[a-z]+'],
  'deduction-present': ["\\b(?:must|might|may|can't|cannot|could)\\s+be\\b"],
  'reported-statements': [`\\b(?:said|explained|replied|answered|told\\s+${OBJECT})\\s+(?:that\\s+)?${SUBJECT}\\s+(?:was|were|had|would|could|${PAST})\\b`],
  quantifiers: ['\\b(?:a few|a little|few|every|each)\\b'],
  'say-tell': ['\\b(?:say|says|said|saying|tell|tells|told|telling)\\b'],
  'gerund-infinitive-meaning': [`\\b(?:stop|stopped|stops|remember|remembered|forget|forgot|try|tried|regret|regretted)\\s+(?:to\\s+[a-z]+|${ING})\\b`],
  'subject-questions': [`^\\s*(?:who|what)\\s+(?!(?:did|does|do|is|are|was|were)\\b)(?:${PAST}|[a-z]+s|has)\\b(?=[^?]*\\?\\s*$)`],
  'purpose-to': [
    '\\b(?:in order to|so as to)\\s+[a-z]+',
    '\\b(?:came|went|stopped|called|ran|hurried|returned)\\s+(?:here\\s+|there\\s+|back\\s+)?to\\s+(?!(?:the|a|an|my|his|her|their|our|your|bed|school|church|town)\\b)[a-z]+',
  ],
  'preposition-ing': [`\\b(?:before|after|without|by|of|about|for|instead of|despite|on|at|in)\\s+${ING}\\b`],
  'indirect-questions': ['\\b(?:know|tell me|wonder|wondered|explain|understand|remember)\\s+(?:where|what|when|why|how|who|whether)\\b'],
  'too-enough': [
    '\\btoo\\s+(?!(?:much|many|late|soon)\\b)[a-z]+\\b(?!\\s*[.,!?]\\s*$)',
    '\\b[a-z]+\\s+enough\\b',
    '\\bsuch\\s+(?:a|an)\\s+[a-z]+',
    '\\bso\\s+[a-z]+\\s+that\\b',
  ],
  'make-let': [`\\b(?:make|makes|made|let|lets)\\s+${OBJECT}\\s+(?!(?:a|an|the|to)\\b)[a-z]+\\b`],
  'phrasal-verbs': [`\\b[a-z]+\\s+(?:it|them|him|her|me|us)\\s+(?:up|down|out|off|away|back|over)\\b`],
  'question-tags': [
    `,\\s*(?:isn't|aren't|wasn't|weren't|don't|doesn't|didn't|won't|wouldn't|can't|couldn't|haven't|hasn't|is|are|do|does|did|will|can)\\s+(?:it|he|she|they|you|we|i|there)\\s*\\?`,
    '\\b(?:so|neither|nor)\\s+(?:do|does|did|am|is|are|have|has|can|will|was|were)\\s+(?:i|we|they|he|she|you)\\b',
  ],
  'third-conditional': [
    `\\bif\\b[^.?!;]*\\bhad\\b[^.?!;]*\\b(?:would|could|might|'d)\\s+(?:not\\s+)?have\\s+${PARTICIPLE}\\b`,
    `\\b(?:would|could|might)\\s+(?:not\\s+)?have\\s+${PARTICIPLE}\\b[^.?!;]*\\bif\\b[^.?!;]*\\bhad\\b`,
  ],
  'mixed-conditionals': [`\\bif\\b[^.?!;]*\\bhad\\s+${PARTICIPLE}\\b[^.?!;]*\\b(?:would|'d)\\s+(?!have\\b)[a-z]+`],
  wish: ['\\b(?:wish|wishes|wished)\\s+(?:that\\s+)?(?:i|you|he|she|it|we|they)\\b', '\\bif only\\b'],
  'passive-modals': [`\\b${MODAL}\\s+(?:not\\s+)?be\\s+${PARTICIPLE}\\b`],
  'have-something-done': [`\\b(?:have|has|had|having|get|got)\\s+(?:my|his|her|their|our|your|the|a|its)\\s+[a-z]+\\s+${PARTICIPLE}\\b`],
  'relatives-non-defining': [',\\s*(?:who|which|whose|whom)\\b'],
  'deduction-past': [`\\b(?:must|might|may|could|can't|couldn't)\\s+(?:not\\s+)?have\\s+${PARTICIPLE}\\b`],
  'reported-questions': [
    '\\b(?:asked|wondered|wanted to know)\\s+(?:[a-z]+\\s+)?(?:where|what|when|why|how|who|whether|if)\\b',
    `\\b(?:told|asked|ordered|begged)\\s+${OBJECT}\\s+(?:not\\s+)?to\\s+[a-z]+`,
  ],
  'future-continuous': [`\\b(?:will|'ll|won't)\\s+(?:not\\s+)?be\\s+${ING}\\b`],
  'future-perfect': [`\\b(?:will|'ll|won't)\\s+(?:not\\s+)?have\\s+${PARTICIPLE}\\b`],
  'be-used-to': ["\\b(?:am|is|are|was|were|be|been|get|got|getting|'m|'re)\\s+(?:not\\s+)?used\\s+to\\b"],
  inversion: [
    '^\\s*(?:never|rarely|seldom|hardly|scarcely|little|not only|no sooner|under no circumstances|only then|nowhere)\\s+(?:have|has|had|do|does|did|was|were|is|are|will|would|can|could|should)\\b',
  ],
  'cleft-sentences': ['^\\s*what\\s+[a-z]+(?:\\s+[a-z]+)?\\s+(?:is|was)\\b', '^\\s*it\\s+(?:is|was)\\s+(?:[a-z]+\\s+){1,3}(?:who|that)\\s+[a-z]+'],
  // En début de phrase, suivi d'une virgule : « Having finished, », « Walking home, », « Built in 1890, ».
  // Un participe seul doit être suivi d'une préposition (sinon « Thought Alice » passerait pour une participiale).
  'participle-clauses': [`^\\s*(?:having\\s+${PARTICIPLE}|${ING}|${PARTICIPLE}\\s+(?:in|by|at|on|from|with|for|into))\\b[^,.!?'"]{0,50},`],
  subjunctive: [
    '\\b(?:suggest|suggested|insist|insisted|recommend|recommended|demand|demanded|propose|proposed|require|required)\\s+that\\s+[a-z]+\\s+(?:be|go|have|do|come|take|make|leave|stay|see|not)\\b',
  ],
  'emphatic-do': [
    `\\b${SUBJECT}\\s+(?:do|does|did)\\s+(?!(?:not|so|it|this|that|the|a|an|nothing|something|anything|everything|what|me|him|her|us|them|you|my|his|their|our|your|either|too|now|then|well|again|indeed|there|here|all|both|as|when|if|but|and|or)\\b)[a-z]+\\b`,
  ],
  'conditional-inversion': [`^\\s*(?:had\\s+${SUBJECT}\\s+(?:not\\s+)?${PARTICIPLE}|were\\s+${SUBJECT}\\s+(?:not\\s+)?(?:to\\s+)?[a-z]+|should\\s+${SUBJECT}\\s+(?:not\\s+)?[a-z]+)\\b[^,.!?]{0,60},`],
  'impersonal-passive': [
    '\\b(?:is|are|was|were)\\s+(?:said|believed|thought|known|reported|expected|supposed|considered|rumou?red|alleged|claimed)\\s+to\\s+(?:have\\s+|be\\s+)?[a-z]+\\b',
    '\\bit\\s+(?:is|was)\\s+(?:said|believed|thought|reported|expected|rumou?red|alleged)\\s+that\\b',
  ],
  'unreal-past': [
    `\\bit(?:'s|\\s+is)\\s+(?:high\\s+|about\\s+)?time\\s+${SUBJECT}\\s+(?:${PAST}|were|didn't)\\b`,
    `\\b(?:'d|would)\\s+rather\\s+${SUBJECT}\\s+(?:${PAST}|were|didn't)\\b`,
  ],
  'past-modals': [`\\b(?:should|shouldn't|could|couldn't|needn't|need not)\\s+have\\s+${PARTICIPLE}\\b`],
  'wh-ever': ['\\b(?:whatever|whoever|wherever|whenever|however\\s+(?:hard|much|many|long|often|fast|good|bad|difficult))\\b'],
};

const compiled = new Map<string, RegExp[] | null>(
  Object.entries(SOURCES).map(([id, sources]) => [id, sources ? sources.map((s) => new RegExp(s, 'gi')) : null]),
);

/** Points qui ont un motif. */
export const PATTERN_IDS = [...compiled].filter(([, r]) => r).map(([id]) => id);

export function hasPattern(pointId: string): boolean {
  return !!compiled.get(pointId);
}

/** Correspondances d'un point dans une phrase (positions dans la phrase d'origine). */
export function matchSentence(pointId: string, sentence: string): PatternMatch[] {
  const regexes = compiled.get(pointId);
  if (!regexes) return [];
  // Apostrophe typographique ramenée à l'apostrophe droite (même longueur : positions inchangées).
  const s = sentence.replace(/’/g, "'");
  const out: PatternMatch[] = [];
  for (const re of regexes) {
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      // Espaces de tête exclus du surlignage (motifs ancrés en début de phrase).
      const lead = m[0].length - m[0].trimStart().length;
      out.push({ start: m.index + lead, end: m.index + m[0].length });
    }
  }
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  return out.filter((m, i) => i === 0 || m.start >= out[i - 1].end);
}

/** Découpe un texte en phrases (positions conservées), pour les motifs ancrés en début de phrase. */
export function sentences(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const re = /[^.!?…]+(?:[.!?…]+["'”’»)]*|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[0].trim()) {
      if (re.lastIndex === m.index) re.lastIndex++;
      continue;
    }
    out.push({ start: m.index, text: m[0] });
  }
  return out;
}

/** Correspondances d'un point dans un texte (paragraphe, chapitre). */
export function matchText(pointId: string, text: string): PatternMatch[] {
  return sentences(text).flatMap((s) => matchSentence(pointId, s.text).map((m) => ({ start: s.start + m.start, end: s.start + m.end })));
}
