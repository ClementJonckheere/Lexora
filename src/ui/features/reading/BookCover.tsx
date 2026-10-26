import { useState } from 'react';
import type { Level } from '@/core/reading/level';
import { LEVEL_LABEL } from '@/core/reading/level';

/** Couleur de couverture de secours, stable pour un même titre. */
function hue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Couverture du livre ; à défaut, une couverture sobre avec le titre et l'auteur. */
export function BookCover({ src, title, author, size = 'md' }: { src: string | null | undefined; title: string; author?: string; size?: 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <div className={`book-cover book-cover--${size}`}>
        <img src={src} alt={`Couverture de « ${title} »`} loading="lazy" onError={() => setFailed(true)} draggable={false} />
      </div>
    );
  }
  const h = hue(title);
  return (
    <div
      className={`book-cover book-cover--${size} book-cover--generated`}
      style={{ background: `linear-gradient(160deg, hsl(${h} 38% 34%), hsl(${(h + 30) % 360} 42% 22%))` }}
      role="img"
      aria-label={`Couverture de « ${title} »`}
    >
      <span className="book-cover-title">{title}</span>
      {author && <span className="book-cover-author">{author}</span>}
    </div>
  );
}

export function LevelBadge({ level, pending, title }: { level: Level | null | undefined; pending?: boolean; title?: string }) {
  if (pending) {
    return (
      <span className="level-badge level-badge--pending" title="Estimation du niveau en cours">
        …
      </span>
    );
  }
  if (!level) {
    return (
      <span className="level-badge level-badge--unknown" title={title ?? 'Niveau non estimé'}>
        ?
      </span>
    );
  }
  return (
    <span className={`level-badge level-badge--${level[0].toLowerCase()}`} title={title ?? `Niveau estimé : ${level} (${LEVEL_LABEL[level].toLowerCase()})`}>
      {level}
    </span>
  );
}
