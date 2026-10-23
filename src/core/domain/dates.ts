const DAY = 86_400_000;

/** Début de la « journée de révision » (bascule à `dayStartHour`, 4 h par défaut). */
export function startOfStudyDay(now: number, dayStartHour: number): number {
  const d = new Date(now);
  d.setHours(dayStartHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function endOfStudyDay(now: number, dayStartHour: number): number {
  const d = new Date(startOfStudyDay(now, dayStartHour));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Lundi 00:00 de la semaine courante. */
export function startOfWeek(now: number): number {
  const d = new Date(startOfLocalDay(now));
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** Clé AAAA-MM-JJ en heure locale. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Intervalle lisible : « 1 min », « 10 min », « 3 h », « 4 j », « 2,5 mois », « 1,2 an ». */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)} j`;
  if (days < 365) return `${(days / 30).toFixed(1).replace('.0', '').replace('.', ',')} mois`;
  return `${(days / 365).toFixed(1).replace('.0', '').replace('.', ',')} an${days >= 730 ? 's' : ''}`;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

export function formatDate(ts: number, now = Date.now()): string {
  const diff = startOfLocalDay(now) - startOfLocalDay(ts);
  if (diff === 0) return "Aujourd'hui";
  if (diff === DAY) return 'Hier';
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return sameYear ? fmtShort.format(ts) : fmtDate.format(ts);
}

/** « dans 3 j », « aujourd'hui », « en retard de 2 j ». */
export function formatDue(due: number, now = Date.now()): string {
  const diff = due - now;
  if (diff <= 0) {
    const late = Math.floor(-diff / DAY);
    return late >= 1 ? `en retard de ${late} j` : 'maintenant';
  }
  if (diff < DAY && startOfLocalDay(due) === startOfLocalDay(now)) return `aujourd'hui (${formatInterval(diff)})`;
  return `dans ${formatInterval(diff)}`;
}

export { DAY };
