/**
 * Mise en forme d'un texte brut de Project Gutenberg pour la lecture :
 * retrait des mentions légales, paragraphes, vers, chapitres.
 */

export type BlockKind = 'p' | 'verse';

export interface Block {
  kind: BlockKind;
  text: string;
}

export interface Chapter {
  title: string;
  blocks: Block[];
}

export interface ParsedBook {
  chapters: Chapter[];
}

const START = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK.*$/im;
const END = /^\s*\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK.*$/im;
const OLD_END = /^\s*(?:End of (?:the )?Project Gutenberg'?s?|\*\*\*\s*END OF THE PROJECT GUTENBERG|End of this Project Gutenberg)/im;

/** Texte de l'œuvre, sans l'en-tête ni la licence de Project Gutenberg. */
export function stripBoilerplate(raw: string): string {
  let text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const start = START.exec(text);
  if (start) text = text.slice(start.index + start[0].length);
  // La première des mentions de fin (« End of Project Gutenberg's… » précède souvent « *** END OF … »).
  const ends = [END.exec(text), OLD_END.exec(text)].filter((m): m is RegExpExecArray => m !== null);
  if (ends.length) text = text.slice(0, Math.min(...ends.map((m) => m.index)));
  // « Produced by … » juste après le début.
  text = text.replace(/^\s*(?:Produced by|This e-?text was produced by|E-text prepared by|Transcribed from)[^\n]*(?:\n[^\n]+)*\n/i, '');
  return text.trim();
}

const HEADING = new RegExp(
  [
    '^(?:chapter|chap\\.|book|part|stave|letter|volume|act|scene)\\s+[\\divxlcdm]+\\b',
    '^(?:chapter|book|part)\\s+(?:the\\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten)\\b',
    '^(?:chapitre|livre|partie|tome)\\s+[\\divxlcdm]+\\b',
    '^(?:chapitre|livre|partie)\\s+(?:premier|première|deuxième|second|seconde|troisième)\\b',
    '^(?:cap[ií]tulo|parte|libro|tratado)\\s+[\\divxlcdm]+\\b',
    '^(?:cap[ií]tulo|parte)\\s+(?:primero|segundo|tercero|primeiro|terceiro)\\b',
    '^(?:capitolo|parte|libro)\\s+[\\divxlcdm]+\\b',
    '^(?:kapitel|buch|teil|abschnitt)\\s+[\\divxlcdm]+\\b',
    '^(?:erstes|zweites|drittes|viertes|fünftes)\\s+kapitel\\b',
    '^(?:hoofdstuk|deel)\\s+[\\divxlcdm]+\\b',
    '^(?:глава|часть|книга)\\s+[\\dIVXLCDMа-яё]+',
    '^第[一二三四五六七八九十百千\\d]+[章回卷節节]',
    '^[IVXLC]{1,7}\\.?$',
    '^\\d{1,3}\\.?$',
  ].join('|'),
  'iu',
);

/** Ligne de titre de chapitre (« CHAPTER I. Down the Rabbit-Hole », « Chapter 1 », « II. », « Глава 3 »…). */
export function isHeading(block: string): boolean {
  const line = block.trim();
  if (!line || line.includes('\n') || line.length > 90) return false;
  return HEADING.test(line);
}

/** Courte ligne de sous-titre qui suit un numéro de chapitre (« Down the Rabbit-Hole »). */
function isSubtitle(block: string): boolean {
  const line = block.trim();
  if (!line || line.includes('\n') || line.length > 70) return false;
  if (/^\[.*\]$/.test(line)) return false;
  return !/[.!?;:,»"”’'—-]$/.test(line) || line === line.toUpperCase();
}

function cleanInline(s: string): string {
  return s
    .replace(/_([^_\n]+)_/g, '$1') // _italique_
    .replace(/\s*--\s*/g, '—') // tiret cadratin des textes ASCII
    .replace(/\[(?:Illustration|Ilustración|Abbildung|Illustration:)[^\]]*\]/gi, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Vers ou texte disposé en lignes courtes : on garde les retours à la ligne. */
function isVerse(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const indented = lines.filter((l) => /^\s{2,}\S/.test(l)).length;
  const short = lines.filter((l) => l.trim().length <= 55).length;
  return short === lines.length && (lines.length >= 3 || indented > 0);
}

function toBlock(raw: string): Block | null {
  const lines = raw.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  if (isVerse(lines)) {
    const text = lines.map((l) => cleanInline(l)).filter(Boolean).join('\n');
    return text ? { kind: 'verse', text } : null;
  }
  const text = cleanInline(lines.join(' '));
  return text ? { kind: 'p', text } : null;
}

/** Longueur minimale d'un chapitre : en dessous, c'est une entrée de table des matières. */
const MIN_CHAPTER_CHARS = 400;
/** Sans chapitres repérés, le livre est découpé en parties de cette taille (en blocs). */
const SECTION_BLOCKS = 60;

function chapterLength(c: Chapter): number {
  return c.blocks.reduce((n, b) => n + b.text.length, 0);
}

export function parseGutenberg(raw: string): ParsedBook {
  const body = stripBoilerplate(raw);
  const pieces = body.split(/\n[ \t]*\n/);

  const chapters: Chapter[] = [];
  let current: Chapter = { title: '', blocks: [] };
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (isHeading(piece)) {
      chapters.push(current);
      let title = cleanInline(piece);
      // « CHAPTER I. » suivi d'une ligne de titre.
      const next = pieces[i + 1];
      if (next !== undefined && isSubtitle(next) && !isHeading(next) && title.length < 30) {
        title = `${title.replace(/\.$/, '')} — ${cleanInline(next)}`;
        i++;
      }
      current = { title, blocks: [] };
      continue;
    }
    const block = toBlock(piece);
    if (block) current.blocks.push(block);
  }
  chapters.push(current);

  // Avant-propos (titre, mentions) gardé seulement s'il est conséquent.
  const [front, ...rest] = chapters;
  // Les entrées de table des matières forment des chapitres quasi vides : on les écarte.
  const real = rest.filter((c) => chapterLength(c) >= MIN_CHAPTER_CHARS);

  if (real.length < 2) {
    const blocks = chapters.flatMap((c) => (c.title && c.blocks.length ? [{ kind: 'p' as const, text: c.title }, ...c.blocks] : c.blocks));
    return { chapters: splitSections(blocks) };
  }
  const out = chapterLength(front) >= 1500 ? [{ ...front, title: 'Début' }, ...real] : real;
  return { chapters: out };
}

function splitSections(blocks: Block[]): Chapter[] {
  if (blocks.length <= SECTION_BLOCKS * 1.5) return [{ title: '', blocks }];
  const out: Chapter[] = [];
  for (let i = 0; i < blocks.length; i += SECTION_BLOCKS) {
    out.push({ title: `Partie ${out.length + 1}`, blocks: blocks.slice(i, i + SECTION_BLOCKS) });
  }
  return out;
}

/** « CHAPTER I. Down the Rabbit-Hole » → libellé « CHAPTER I » + titre « Down the Rabbit-Hole ». */
export function splitChapterTitle(title: string): { label: string; name: string } {
  const m = /^(.*?\b(?:[IVXLCDM]+|\d+)\b)\.?\s*(?:[—–-]\s*)?(\S.*)$/u.exec(title);
  if (m && m[1].length <= 30 && !/^[IVXLCDM\d]+$/.test(m[2])) return { label: m[1], name: m[2] };
  return { label: title, name: '' };
}

/** Nombre total de blocs (sert au pourcentage de progression). */
export function blockCount(book: ParsedBook): number {
  return book.chapters.reduce((n, c) => n + c.blocks.length, 0);
}

/** Progression (0–1) à partir d'une position (chapitre, bloc). */
export function progressAt(book: ParsedBook, chapter: number, block: number): number {
  const total = blockCount(book);
  if (!total) return 0;
  let before = 0;
  for (let i = 0; i < Math.min(chapter, book.chapters.length); i++) before += book.chapters[i].blocks.length;
  return Math.min(1, (before + block) / total);
}

/** Décode un fichier texte : UTF-8, ou Windows-1252 pour les anciens fichiers Latin-1. */
export function decodeText(bytes: ArrayBuffer | Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const bad = (utf8.match(/�/g) ?? []).length;
  if (bad > 0 && bad / Math.max(1, utf8.length) > 0.0005) return new TextDecoder('windows-1252').decode(bytes);
  return utf8;
}
