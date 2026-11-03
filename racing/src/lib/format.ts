/** Turning the model's raw units back into the way racing people read them. */
import type { PastRun, Position, Runner } from '../model/racecard';

export const YARDS_PER_FURLONG = 220;
export const YARDS_PER_MILE = 1760;

/** 4840 → "2m 6f", 1540 → "7f", 3960 → "2m 2½f". Rounded to the nearest half furlong. */
export function formatDistance(yards: number): string {
  const halfFurlongs = Math.round(yards / (YARDS_PER_FURLONG / 2));
  const miles = Math.floor(halfFurlongs / 16);
  const remHalf = halfFurlongs - miles * 16;
  const furlongs = Math.floor(remHalf / 2);
  const half = remHalf % 2 === 1;
  const parts: string[] = [];
  if (miles) parts.push(`${miles}m`);
  if (furlongs || half) parts.push(`${furlongs || ''}${half ? '½' : ''}f`);
  return parts.join(' ') || '0f';
}

/** Distance difference in furlongs, as text: 330 → "1½f". */
export function formatFurlongs(yards: number): string {
  const half = Math.round(Math.abs(yards) / (YARDS_PER_FURLONG / 2));
  const whole = Math.floor(half / 2);
  return `${whole || ''}${half % 2 ? '½' : ''}f`;
}

/** 161 → "11-7" (stones-pounds). */
export function formatWeight(lbs: number): string {
  return `${Math.floor(lbs / 14)}-${lbs % 14}`;
}

/** Fractional odds → decimal odds (stake included). "5/2" → 3.5, "Evs" → 2. */
export function decimalOdds(fractional: string): number {
  if (/^ev/i.test(fractional)) return 2;
  const [num, den] = fractional.split('/').map(Number);
  return num / den + 1;
}

/** The win probability a price implies, before removing the bookmaker's margin. */
export function impliedProbability(fractional: string): number {
  return 1 / decimalOdds(fractional);
}

export function formatPercent(p: number, digits = 0): string {
  return `${p.toFixed(digits)}%`;
}

export function formatPosition(p: Position): string {
  return typeof p === 'number' ? String(p) : p;
}

/**
 * Racecard-style form figures, oldest on the left, most recent on the right:
 * "3-21P". A "/" marks a gap of more than a year between runs.
 * Positions of 10th or worse show as "0", as on printed racecards.
 */
export function formFigures(form: PastRun[], max = 6): string {
  const runs = form.slice(0, max).reverse();
  let out = '';
  runs.forEach((run, i) => {
    if (i > 0 && daysBetween(runs[i - 1].date, run.date) > 365) out += '/';
    out += typeof run.position === 'number' ? (run.position >= 10 ? '0' : String(run.position)) : run.position[0];
  });
  return out || '–';
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function daysSinceLastRun(runner: Runner, raceDate: string): number | undefined {
  const last = runner.form[0];
  return last ? daysBetween(last.date, raceDate) : undefined;
}

const SEX: Record<Runner['sex'], string> = {
  g: 'gelding',
  c: 'colt',
  h: 'horse',
  f: 'filly',
  m: 'mare',
  r: 'rig',
};

export function describeAgeSex(runner: Runner): string {
  return `${runner.age}yo ${SEX[runner.sex]}`;
}

const HEADGEAR: Record<string, string> = {
  b: 'blinkers',
  v: 'visor',
  p: 'cheekpieces',
  t: 'tongue strap',
  h: 'hood',
  e: 'eyeshield',
  s: 'eyeshield',
  ec: 'eye cover',
};

export function headgearName(code: string): string {
  return code
    .split('')
    .map((c) => HEADGEAR[c] ?? c)
    .join(' & ');
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
}

export function formatPrize(gbp: number): string {
  return `£${gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const NON_FINISH: Record<string, string> = {
  F: 'fell',
  PU: 'pulled up',
  UR: 'unseated rider',
  BD: 'brought down',
  SU: 'slipped up',
  RO: 'ran out',
  RR: 'refused to race',
  REF: 'refused',
  DSQ: 'disqualified',
  CO: 'carried out',
};

/** "Won", "2nd of 9", "Pulled up". */
export function describeFinish(run: PastRun): string {
  if (typeof run.position === 'number') {
    return run.position === 1 ? `Won (of ${run.ran})` : `${ordinal(run.position)} of ${run.ran}`;
  }
  const s = NON_FINISH[run.position] ?? run.position;
  return s[0].toUpperCase() + s.slice(1);
}

/** Lowercase only the first letter, so "Course & distance winner" → "course & distance winner". */
export function lowerFirst(s: string): string {
  return s && /[A-Z][a-z]/.test(s.slice(0, 2)) ? s[0].toLowerCase() + s.slice(1) : s;
}
