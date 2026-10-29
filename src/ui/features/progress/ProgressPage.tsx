import { useApp } from '@/app/store';
import { FOCUS_STEPS, NOTE_XP_PER_DAY, RANKS, type XpSummary } from '@/core/progress/xp';
import { Ornament } from './Ornament';
import { useXp } from './useXp';

const nf = new Intl.NumberFormat('fr-FR');
const fmt = (n: number) => nf.format(n);
const mult = (m: number) => `×${String(m).replace('.', ',')}`;

/** Barre d'XP du niveau en cours (or : la progression). */
export function XpBar({ xp, width }: { xp: XpSummary; width?: number }) {
  return (
    <div className="xp-bar" style={width ? { width } : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={xp.needed} aria-valuenow={xp.into}>
      <span style={{ width: `${(xp.into / xp.needed) * 100}%` }} />
    </div>
  );
}

/** Rang de l'accueil : ornement, rang, barre et XP restante ; ouvre la page Progression. */
export function RankBadge({ xp }: { xp: XpSummary | null }) {
  const { navigate } = useApp.getState();
  if (!xp) return <div className="rank-badge rank-badge--empty" aria-hidden="true" />;
  return (
    <button className="rank-badge" onClick={() => navigate({ name: 'progress' })} aria-label={`Rang ${xp.rank.name}, niveau ${xp.level}, voir la progression`}>
      <Ornament rank={xp.rank} size={112} level={xp.level} />
      <span className="rank-badge-name">{xp.rank.name}</span>
      <XpBar xp={xp} width={220} />
      <span className="rank-badge-left">
        {fmt(xp.needed - xp.into)} XP avant le niveau {xp.level + 1}
      </span>
    </button>
  );
}

const SCALE: { label: string; value: string; accent?: boolean }[] = [
  { label: 'Rappel tapé', value: '4 XP × ancienneté' },
  { label: 'Rappel aux boutons', value: '2 XP × ancienneté' },
  { label: 'Fiche oubliée (l’effort compte)', value: '1 XP' },
  { label: 'Exercice de grammaire tapé juste', value: '5 XP' },
  { label: 'Exercice à choix juste', value: '2 XP' },
  { label: 'Leçon acquise · révisée', value: '60 · 25 XP' },
  { label: 'Nouveau mot avec exemple · sans', value: `3 · 1 XP, ${NOTE_XP_PER_DAY} par jour` },
  { label: 'Entraînement libre', value: '1 XP' },
  {
    label: 'Concentration sans pause',
    value: [...FOCUS_STEPS].reverse().map((s) => `${mult(s.multiplier)} à ${s.afterMin} min`).join(' · '),
    accent: true,
  },
  { label: 'Même fiche, même jour', value: '÷ 2 à chaque fois' },
];

export function ProgressPage() {
  const xp = useXp();
  const universe = useApp((s) => s.universe);
  if (!xp) return <div className="page" />;
  const { rank, next } = xp;

  return (
    <div className="page progress-page">
      <span className="eyebrow">Progression{universe ? ` · ${universe.name}` : ''}</span>

      <section className="rank-current" aria-label="Rang actuel">
        <Ornament rank={rank} size={168} level={xp.level} />
        <div className="rank-current-body">
          <span className="eyebrow">Niveau {xp.level}</span>
          <h1 className="rank-current-title">{rank.name}</h1>
          <div className="rank-current-bar">
            <XpBar xp={xp} />
            <span className="mono muted">
              {fmt(xp.into)} / {fmt(xp.needed)} XP{next ? ` · ${next.name} au niveau ${next.from}` : ''}
            </span>
          </div>
          <span className="muted">{fmt(xp.total)} XP en tout</span>
        </div>
      </section>

      <section className="progress-section" aria-label="Aujourd'hui">
        <h2 className="progress-h2">Aujourd'hui</h2>
        <div className="progress-today">
          <Fact label="XP gagnée" value={`+ ${fmt(xp.today)}`} gold />
          <Fact label="Plus longue séance sans pause" value={`${xp.todayFocusMinutes} min`} />
          <Fact label="Gagnée en concentration" value={`${Math.round(xp.todayFocusShare * 100)} %`} />
        </div>
      </section>

      <section className="progress-section" aria-label="Rangs">
        <h2 className="progress-h2">Rangs et ornements</h2>
        <div className="rank-row">
          {RANKS.map((r, i) => {
            const until = RANKS[i + 1]?.from;
            const reached = xp.level >= r.from;
            return (
              <div key={r.id} className={`rank-tier${r.id === rank.id ? ' rank-tier--current' : ''}`}>
                <Ornament rank={r} size={64} dim={!reached} />
                <span className={reached ? '' : 'muted'}>{r.name}</span>
                <span className="mono muted small">{until ? `niv. ${r.from} à ${until - 1}` : `${r.from} et plus`}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="progress-section" aria-label="Répartition">
        <h2 className="progress-h2">D'où vient votre XP</h2>
        <div className="progress-today">
          <Fact label="Vocabulaire" value={`${fmt(xp.bySource.vocabulary)} XP`} />
          <Fact label="Grammaire" value={`${fmt(xp.bySource.grammar)} XP`} />
          <Fact label="Leçons" value={`${fmt(xp.bySource.lessons)} XP`} />
          <Fact label="Mots ajoutés" value={`${fmt(xp.bySource.words)} XP`} />
        </div>
      </section>

      <section className="progress-section" aria-label="Barème">
        <h2 className="progress-h2">Ce qui rapporte de l'XP</h2>
        <div className="xp-scale">
          {SCALE.map((s) => (
            <div key={s.label} className={`xp-scale-row${s.accent ? ' xp-scale-row--accent' : ''}`}>
              <span>{s.label}</span>
              <span className="mono">{s.value}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          L'ancienneté va de ×1 pour une fiche revue le jour même à ×2 pour une fiche revue après six mois : se souvenir d'un mot
          ancien demande plus d'effort. Tout se recalcule à partir de votre historique.
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="progress-fact">
      <span className="hero-fact-label">{label}</span>
      <span className={gold ? 'gold' : ''}>{value}</span>
    </div>
  );
}
