/**
 * What the betting market thinks. Bookmaker prices add up to more than 100%
 * (the "overround" — their margin). Dividing each implied probability by the total
 * removes it, giving the market's fair estimate of each horse's chance.
 */
import type { Race, Runner } from '../model/racecard';
import { impliedProbability } from './format';

export interface MarketView {
  /** Fair win chance per runner id, 0–100, summing to 100 across priced runners. */
  chance: Map<string, number>;
  /** Total implied probability before normalising, e.g. 118 (= 18% margin). */
  bookPercent: number;
  /** Runner ids in market order, shortest price first. */
  order: string[];
}

export function activeRunners(race: Race): Runner[] {
  return race.runners.filter((r) => !r.nonRunner);
}

export function marketView(race: Race): MarketView {
  const runners = activeRunners(race);
  const raw = new Map<string, number>();
  for (const r of runners) if (r.odds) raw.set(r.id, impliedProbability(r.odds.current));

  // Unpriced runners are treated as joint-longest in the field so they still get a share.
  const longest = raw.size ? Math.min(...raw.values()) : 1 / Math.max(runners.length, 1);
  for (const r of runners) if (!raw.has(r.id)) raw.set(r.id, longest);

  const total = [...raw.values()].reduce((a, b) => a + b, 0);
  const chance = new Map([...raw].map(([id, p]) => [id, (p / total) * 100]));
  const order = [...chance.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const pricedTotal = runners.filter((r) => r.odds).reduce((a, r) => a + impliedProbability(r.odds!.current), 0);
  return { chance, bookPercent: pricedTotal * 100, order };
}

/** Ids of the market favourite(s) — joint favourites share the shortest price. */
export function favourites(race: Race): string[] {
  const priced = activeRunners(race).filter((r) => r.odds);
  if (!priced.length) return [];
  const best = Math.max(...priced.map((r) => impliedProbability(r.odds!.current)));
  return priced.filter((r) => Math.abs(impliedProbability(r.odds!.current) - best) < 1e-9).map((r) => r.id);
}
