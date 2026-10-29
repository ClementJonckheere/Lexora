import { useId, type ReactNode } from 'react';
import type { Rank } from '@/core/progress/xp';

/** Dégradés métalliques de chaque rang (du coin haut gauche au coin bas droit). */
const GRADIENTS: Record<Rank['id'], [number, string][]> = {
  iron: [[0, '#9aa0a6'], [1, '#4f5358']],
  bronze: [[0, '#e3ad78'], [0.6, '#94592c'], [1, '#c98b55']],
  silver: [[0, '#eef1f4'], [0.55, '#a7adb4'], [1, '#dfe3e7']],
  gold: [[0, '#f7dc95'], [0.55, '#a87b2a'], [1, '#e9c46f']],
  platinum: [[0, '#f1f7f9'], [0.55, '#8ea2ac'], [1, '#d9e5ea']],
  diamond: [[0, '#ffffff'], [0.5, '#8fd0f5'], [1, '#e6f6ff']],
  emerald: [[0, '#7fe0b4'], [0.55, '#0f6e50'], [1, '#3fbf8a']],
  master: [[0, '#d9c4ff'], [0.55, '#5b33a6'], [1, '#a27ef0']],
  grandmaster: [[0, '#fff2c4'], [0.5, '#b3842a'], [1, '#f4d88a']],
};

/** Tracé de chaque rang : un anneau, puis des filets, branches et pierres de plus en plus travaillés. */
function shapes(id: Rank['id'], s: string): ReactNode {
  const ring = (r: number, w: number) => <circle cx="32" cy="32" r={r} fill="none" stroke={s} strokeWidth={w} />;
  const path = (d: string, w: number) => <path d={d} fill="none" stroke={s} strokeWidth={w} />;
  const cross = 'M32 2v6M32 56v6M2 32h6M56 32h6';
  switch (id) {
    case 'iron':
      return ring(26, 2);
    case 'bronze':
      return <>{ring(26, 2)}{ring(21, 0.8)}</>;
    case 'silver':
      return <>{ring(26, 2)}{ring(21, 0.8)}{path(cross, 1.4)}</>;
    case 'gold':
      return <>{ring(26, 2)}{ring(21, 0.8)}{path(`${cross}M10.8 10.8l4.2 4.2M49 49l4.2 4.2M10.8 53.2 15 49M49 15l4.2-4.2`, 1.4)}</>;
    case 'platinum':
      return <>{ring(27, 1.2)}{path('M32 8 52.8 20v24L32 56 11.2 44V20z', 2)}</>;
    case 'diamond':
      return <>{ring(27, 1.2)}{path('M32 9 52 32 32 55 12 32z', 2)}{path('M12 32h40M32 9 24 32l8 23 8-23z', 0.8)}</>;
    case 'emerald':
      return <>{ring(27, 1.2)}{path('M24 12h16l10 10v20L40 52H24L14 42V22z', 2)}{path('M27 18h10l7 7v14l-7 7H27l-7-7V25z', 0.8)}</>;
    case 'master':
      return (
        <>
          <circle cx="32" cy="32" r="28" fill="none" stroke={s} strokeWidth="5" strokeDasharray="0.9 6.4" />
          {ring(22, 2)}
          {ring(17, 0.8)}
        </>
      );
    case 'grandmaster':
      return (
        <>
          <circle cx="32" cy="32" r="28.5" fill="none" stroke={s} strokeWidth="5" strokeDasharray="0.9 4.1" />
          {ring(23, 2)}
          {path('M32 13l4.4 13.6H50.6L39.1 35l4.4 13.6L32 40.2 20.5 48.6 24.9 35 13.4 26.6h14.2z', 1.2)}
        </>
      );
  }
}

/** Ornement d'un rang, avec le niveau au centre si on le donne. */
export function Ornament({ rank, size = 64, level, dim = false }: { rank: Rank; size?: number; level?: number; dim?: boolean }) {
  const gid = `orn-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={`ornament${dim ? ' ornament--dim' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={level ? `Rang ${rank.name}, niveau ${level}` : `Rang ${rank.name}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          {GRADIENTS[rank.id].map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      {shapes(rank.id, `url(#${gid})`)}
      {level !== undefined && (
        <text x="32" y="37" textAnchor="middle" className="ornament-level">
          {level}
        </text>
      )}
    </svg>
  );
}
