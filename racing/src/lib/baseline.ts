/**
 * A non-AI baseline that produces a full `RaceAnalysis`:
 *   - win chance = the market's fair probability (odds with the bookmaker margin removed),
 *   - factor scores = the rule-based facts, summed per factor,
 *   - verdict/summary = templated from the strongest positive and biggest concern.
 *
 * It exists so the outcome display (step 5) is real from day one, and it stays useful
 * afterwards as the yardstick the AI must beat in backtesting.
 */
import { FactorKey, type FactorScore, type RaceAnalysis, type RunnerAnalysis } from '../model/analysis';
import type { Meeting, Race } from '../model/racecard';
import { lowerFirst } from './format';
import { raceFacts, type Fact } from './facts';
import { activeRunners, favourites, marketView } from './market';

const clamp = (n: number) => Math.max(-2, Math.min(2, n));

function factorScores(facts: Fact[]): FactorScore[] {
  return FactorKey.options
    .map((factor) => {
      const fs = facts.filter((f) => f.factor === factor);
      if (!fs.length) return null;
      return { factor, score: clamp(fs.reduce((a, f) => a + f.score, 0)), evidence: fs.map((f) => f.detail).join(' ') };
    })
    .filter((x): x is FactorScore => x !== null);
}

/** Strongest point in the horse's favour, ignoring the market (the verdict already leads with it). */
export function bestPositive(facts: Fact[]): Fact | undefined {
  return [...facts].filter((f) => f.tone === 'good' && f.factor !== 'market').sort((a, b) => b.score - a.score)[0];
}

/** The biggest question mark: a negative first, otherwise an untested area. */
export function biggestConcern(facts: Fact[]): Fact | undefined {
  const bad = [...facts].filter((f) => f.tone === 'bad').sort((a, b) => a.score - b.score)[0];
  if (bad) return bad;
  const order: FactorKey[] = ['going', 'distance', 'changes', 'fitness', 'form'];
  return facts.filter((f) => f.tone === 'unknown').sort((a, b) => order.indexOf(a.factor) - order.indexOf(b.factor))[0];
}

function lead(rank: number, chance: number, isFav: boolean, jointFav: boolean): string {
  if (isFav) return jointFav ? 'Joint favourite' : 'Favourite';
  if (rank <= 3) return 'Leading contender';
  if (chance >= 8) return 'Has a chance';
  if (chance >= 3) return 'Outsider';
  return 'Long shot';
}

export function composeVerdict(leadText: string, facts: Fact[]): string {
  const pos = bestPositive(facts);
  const neg = biggestConcern(facts);
  let s = leadText;
  if (pos) s += ` — ${lowerFirst(pos.label)}`;
  if (neg) s += pos ? `, but ${lowerFirst(neg.label)}` : `; ${lowerFirst(neg.label)}`;
  return `${s}.`;
}

export function buildBaselineAnalysis(race: Race, meeting: Meeting, now = new Date()): RaceAnalysis {
  const market = marketView(race);
  const facts = raceFacts(race, meeting);
  const favs = favourites(race);

  const runners: RunnerAnalysis[] = market.order.map((id, i) => {
    const fs = facts.get(id) ?? [];
    const chance = market.chance.get(id) ?? 0;
    return {
      runnerId: id,
      winChance: chance,
      rank: i + 1,
      verdict: composeVerdict(lead(i + 1, chance, favs.includes(id), favs.length > 1), fs),
      factors: factorScores(fs),
    };
  });

  return {
    raceId: race.id,
    source: 'baseline',
    method: 'Market odds + rule-based evidence',
    generatedAt: now.toISOString(),
    summary: summarise(race, runners, facts),
    runners,
  };
}

function summarise(race: Race, runners: RunnerAnalysis[], facts: Map<string, Fact[]>): string {
  const byId = new Map(activeRunners(race).map((r) => [r.id, r]));
  const [top, second] = runners;
  if (!top) return 'No declared runners.';
  const fav = byId.get(top.runnerId)!;
  const topThree = runners.slice(0, 3).reduce((a, r) => a + r.winChance, 0);

  const shape =
    top.winChance >= 40
      ? `${fav.name} is a strong favourite with a ${Math.round(top.winChance)}% chance.`
      : top.winChance <= 22
        ? `An open race: ${fav.name} tops the market but only at ${Math.round(top.winChance)}%.`
        : `${fav.name} heads the market with a ${Math.round(top.winChance)}% chance${second ? `, ahead of ${byId.get(second.runnerId)!.name} (${Math.round(second.winChance)}%)` : ''}.`;

  const concern = biggestConcern(facts.get(top.runnerId) ?? []);
  const doubt = concern ? ` The main doubt about the favourite: ${concern.detail}` : '';
  const spread = runners.length > 3 ? ` The top three account for ${Math.round(topThree)}% of the win chance across ${runners.length} runners.` : '';
  return `${shape}${doubt}${spread}`;
}
