import type { RaceAnalysis } from '../model/analysis';
import type { Race } from '../model/racecard';
import { formatPercent } from '../lib/format';
import { marketView } from '../lib/market';
import { Silks } from './Silks';
import { Term } from './Term';

/**
 * The answer first: every runner's estimated win chance as a ranked bar chart,
 * each with a one-line verdict, under a short race summary. Clicking a row jumps
 * to that runner's full analysis below.
 */
export function OutcomePanel({ race, analysis }: { race: Race; analysis: RaceAnalysis }) {
  const byId = new Map(race.runners.map((r) => [r.id, r]));
  const market = marketView(race);
  const ranked = [...analysis.runners].sort((a, b) => a.rank - b.rank);
  const max = Math.max(...ranked.map((r) => r.winChance), 1);
  // Scale bars to the leader (rounded up to the next 10%) so small differences stay visible.
  const scale = Math.min(100, Math.ceil(max / 10) * 10);

  return (
    <section className="card outcome" aria-labelledby="outcome-title">
      <div className="outcome-head">
        <h2 id="outcome-title">The outcome</h2>
        <SourceBadge analysis={analysis} />
      </div>
      <p className="summary">{analysis.summary}</p>

      <div className="chance-head" aria-hidden="true">
        <span />
        <span>Horse &amp; verdict</span>
        <span>
          <Term k="winChance">Win chance</Term>
        </span>
        <span>
          <Term k="odds">Odds</Term>
        </span>
      </div>
      <ol className="chance-list">
        {ranked.map((ra) => {
          const runner = byId.get(ra.runnerId)!;
          const mkt = market.chance.get(ra.runnerId);
          const tip = `${runner.name}: ${formatPercent(ra.winChance, 1)} estimated win chance${
            runner.odds ? ` · market ${runner.odds.current} (${formatPercent(mkt ?? 0, 1)})` : ''
          }`;
          return (
            <li key={ra.runnerId} className={`chance-row${ra.rank === 1 ? ' is-top' : ''}`}>
              <span className="chance-rank" aria-label={`Rank ${ra.rank}`}>{ra.rank}</span>
              <button type="button" className="chance-name" onClick={() => scrollToRunner(runner.id)}>
                <span className="chance-horse">
                  <Silks colours={runner.silks} />
                  <strong>{runner.name}</strong>
                  <span className="muted">#{runner.number}</span>
                </span>
                <span className="chance-verdict">{ra.verdict}</span>
              </button>
              <span className="bar-cell" data-tip={tip} tabIndex={0} aria-label={tip}>
                <span className="bar-track">
                  <span className="bar" style={{ width: `${(ra.winChance / scale) * 100}%` }} />
                </span>
                <span className="bar-value">{formatPercent(ra.winChance)}</span>
              </span>
              <span className="chance-odds">{runner.odds?.current ?? '–'}</span>
            </li>
          );
        })}
      </ol>
      <p className="fineprint">
        Estimates, not certainties: even a 40% chance loses more often than it wins. Percentages may not add to exactly 100 because of
        rounding.
      </p>
    </section>
  );
}

function scrollToRunner(id: string) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(`runner-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function SourceBadge({ analysis }: { analysis: RaceAnalysis }) {
  if (analysis.source === 'ai') {
    return <span className="badge badge-ai">AI analysis · {analysis.method}</span>;
  }
  return (
    <span className="badge" data-tip="Win chances here are the betting market's view with the bookmaker's margin removed; verdicts come from simple rules applied to the racecard. The AI analysis (step 4) will replace this." tabIndex={0}>
      Baseline · market odds + rules
    </span>
  );
}
