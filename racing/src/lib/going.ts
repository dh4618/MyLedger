/** Going (ground conditions) — ordering, similarity and plain-English descriptions. */
import type { Going, Surface } from '../model/racecard';

/** Wettest → driest, separately for turf and all-weather. */
const TURF_SCALE: Partial<Record<Going, number>> = {
  Heavy: 0,
  Soft: 1,
  'Good to Soft': 2,
  Good: 3,
  'Good to Firm': 4,
  Firm: 5,
};
const AW_SCALE: Partial<Record<Going, number>> = {
  Slow: 0,
  'Standard to Slow': 1,
  Standard: 2,
  'Standard to Fast': 3,
  Fast: 4,
};

export function isAllWeatherGoing(g: Going): boolean {
  return g in AW_SCALE;
}

/**
 * Whether a past run was on ground comparable to today's.
 * On turf: within one step (Soft counts as similar to Heavy and Good to Soft).
 * On the all-weather the surface itself matters far more than the going, so any AW run counts.
 */
export function isSimilarGoing(today: Going, todaySurface: Surface, past: Going, pastSurface: Surface): boolean {
  if (todaySurface !== pastSurface) return false;
  if (todaySurface === 'AW') return true;
  const a = TURF_SCALE[today];
  const b = TURF_SCALE[past];
  return a !== undefined && b !== undefined && Math.abs(a - b) <= 1;
}

/** "soft ground", "fast ground", "the all-weather" — for verdict sentences. */
export function groundPhrase(g: Going, surface: Surface): string {
  if (surface === 'AW') return 'the all-weather';
  switch (g) {
    case 'Heavy':
      return 'heavy ground';
    case 'Soft':
    case 'Good to Soft':
      return 'soft ground';
    case 'Good':
      return 'good ground';
    default:
      return 'fast ground';
  }
}

export const GOING_EXPLAINED: Record<Going, string> = {
  Heavy: 'Very wet, deep ground. Races are run slowly and stamina matters most; some horses love it, many hate it.',
  Soft: 'Wet ground that horses sink into. Favours horses with proven form on soft and plenty of stamina.',
  'Good to Soft': 'Slightly on the soft side of ideal. Most horses handle it.',
  Good: 'Ideal, neutral ground. Few horses have a problem with it.',
  'Good to Firm': 'Fast, dry ground. Suits speedy types; some horses with joint issues are not risked.',
  Firm: 'Hard, very fast ground. Rare in Britain; fields often shrink.',
  Slow: 'All-weather surface riding slower than usual (often after rain or frost).',
  'Standard to Slow': 'All-weather surface riding a little slower than usual.',
  Standard: 'All-weather surface riding normally.',
  'Standard to Fast': 'All-weather surface riding a little quicker than usual.',
  Fast: 'All-weather surface riding quick.',
};
