/**
 * Langues des univers. La langue maternelle (interface, traductions) est le français ;
 * chaque univers porte une langue cible.
 */
export interface LanguageInfo {
  code: string;
  name: string;
  /** Langue BCP 47 pour la synthèse vocale. */
  speech: string;
  /** Couleur de la pastille (les drapeaux emoji ne s'affichent pas sous Windows). */
  color: string;
  /** Écriture sans espaces entre les mots (repérage par sous-chaîne). */
  noSpaces?: boolean;
  /** Le champ « prononciation » (pinyin, romanisation…) est affiché par défaut. */
  transcription?: string;
  /** Exemple affiché dans le formulaire. */
  placeholder: { expression: string; translation: string; example: string };
}

export const LANGUAGES: LanguageInfo[] = [
  {
    code: 'en',
    name: 'Anglais',
    speech: 'en-US',
    color: '#4f46e5',
    placeholder: { expression: 'To tackle an issue', translation: "S'attaquer à un problème", example: 'We need to tackle this issue before it gets worse.' },
  },
  {
    code: 'es',
    name: 'Espagnol',
    speech: 'es-ES',
    color: '#dc2626',
    placeholder: { expression: 'Echar de menos', translation: 'Regretter, manquer', example: 'Echo de menos a mi familia.' },
  },
  {
    code: 'pt',
    name: 'Portugais',
    speech: 'pt-PT',
    color: '#059669',
    placeholder: { expression: 'Dar conta de', translation: 'Se rendre compte de', example: 'Não dei conta do tempo a passar.' },
  },
  {
    code: 'de',
    name: 'Allemand',
    speech: 'de-DE',
    color: '#ca8a04',
    placeholder: { expression: 'Bescheid sagen', translation: 'Prévenir, tenir au courant', example: 'Sag mir bitte Bescheid, wenn du ankommst.' },
  },
  {
    code: 'it',
    name: 'Italien',
    speech: 'it-IT',
    color: '#16a34a',
    placeholder: { expression: 'Fare la spesa', translation: 'Faire les courses', example: 'Devo fare la spesa stasera.' },
  },
  {
    code: 'ru',
    name: 'Russe',
    speech: 'ru-RU',
    color: '#2563eb',
    transcription: 'Translittération / accent tonique',
    placeholder: { expression: 'Обращать внимание', translation: 'Prêter attention', example: 'Обрати внимание на этот знак.' },
  },
  {
    code: 'zh',
    name: 'Chinois',
    speech: 'zh-CN',
    color: '#e11d48',
    noSpaces: true,
    transcription: 'Pinyin',
    placeholder: { expression: '马马虎虎', translation: 'Comme ci comme ça', example: '我的中文马马虎虎。' },
  },
  {
    code: 'ja',
    name: 'Japonais',
    speech: 'ja-JP',
    color: '#be123c',
    noSpaces: true,
    transcription: 'Lecture (kana / rōmaji)',
    placeholder: { expression: 'よろしくお願いします', translation: "Enchanté / merci d'avance", example: 'これからよろしくお願いします。' },
  },
  {
    code: 'ko',
    name: 'Coréen',
    speech: 'ko-KR',
    color: '#0891b2',
    transcription: 'Romanisation',
    placeholder: { expression: '수고하셨습니다', translation: 'Merci pour votre travail', example: '오늘 정말 수고하셨습니다.' },
  },
  {
    code: 'ar',
    name: 'Arabe',
    speech: 'ar-SA',
    color: '#0d9488',
    transcription: 'Translittération',
    placeholder: { expression: 'إن شاء الله', translation: 'Si Dieu le veut', example: 'سأراك غداً إن شاء الله.' },
  },
  {
    code: 'nl',
    name: 'Néerlandais',
    speech: 'nl-NL',
    color: '#ea580c',
    placeholder: { expression: 'Gezellig', translation: 'Convivial, agréable', example: 'Het was een gezellige avond.' },
  },
];

const GENERIC: LanguageInfo = {
  code: 'xx',
  name: 'Langue',
  speech: '',
  color: '#57534e',
  placeholder: { expression: 'Expression', translation: 'Traduction', example: "Phrase d'exemple" },
};

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? { ...GENERIC, code, speech: code };
}

/** Pastille courte : « EN », « ZH »… */
export function languageBadge(code: string): string {
  return code.slice(0, 2).toUpperCase();
}
