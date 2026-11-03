import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { raceGoing } from '../model/racecard';
import { formatDate, formatDistance, formatPrize } from '../lib/format';
import { GOING_EXPLAINED } from '../lib/going';
import { raceFacts } from '../lib/facts';
import { activeRunners } from '../lib/market';
import { getAnalysis, getRace } from '../data/repository';
import { useAsync } from '../useAsync';
import { OutcomePanel } from '../components/OutcomePanel';
import { RunnerCard } from '../components/RunnerCard';
import { Term } from '../components/Term';

type SortMode = 'chance' | 'card';

export function RacePage() {
  const { raceId = '' } = useParams();
  const data = useAsync(async () => {
    const rm = await getRace(raceId);
    return rm ? { ...rm, analysis: await getAnalysis(rm) } : null;
  }, [raceId]);
  const [sort, setSort] = useState<SortMode>('chance');

  if (data === undefined) return <p className="muted">Loading…</p>;
  if (data === null)
    return (
      <p>
        Race not found. <Link to="/">Back to racecards</Link>
      </p>
    );

  const { meeting, race, analysis } = data;
  const going = raceGoing(meeting, race);
  const facts = raceFacts(race, meeting);
  const byRunner = new Map(analysis.runners.map((r) => [r.runnerId, r]));
  const runners = activeRunners(race).sort((a, b) =>
    sort === 'card' ? a.number - b.number : (byRunner.get(a.id)?.rank ?? 99) - (byRunner.get(b.id)?.rank ?? 99),
  );
  const nonRunners = race.runners.filter((r) => r.nonRunner);

  return (
    <div className="stack">
      <nav className="crumbs">
        <Link to="/">‹ All racecards</Link>
      </nav>

      <header className="race-head">
        <p className="race-when">
          <strong>{race.offTime}</strong> {meeting.course} · {formatDate(meeting.date, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1>{race.name}</h1>
        <ul className="conditions">
          <li>
            <Term text={GOING_EXPLAINED[going]}>
              <span className="tag tag-going">Going: {race.going ? going : meeting.goingDetail ?? going}</span>
            </Term>
          </li>
          <li className="tag">{formatDistance(race.distanceYards)}</li>
          <li className="tag">{race.raceType}</li>
          <li>
            <Term k="class">
              <span className="tag">Class {race.raceClass}</span>
            </Term>
          </li>
          {race.isHandicap && (
            <li>
              <Term k="handicap">
                <span className="tag">Handicap</span>
              </Term>
            </li>
          )}
          {race.ageRestriction && <li className="tag">{race.ageRestriction}</li>}
          <li className="tag">{activeRunners(race).length} runners</li>
          {race.prizeGbp && <li className="tag">{formatPrize(race.prizeGbp)} to the winner</li>}
          {meeting.source.kind === 'fictional-sample' && <li className="tag tag-sample">Sample data</li>}
        </ul>
      </header>

      <OutcomePanel race={race} analysis={analysis} />

      <section className="stack" aria-labelledby="runners-title">
        <div className="section-head">
          <h2 id="runners-title">Runner by runner</h2>
          <div className="segmented" role="group" aria-label="Sort runners">
            <button aria-pressed={sort === 'chance'} onClick={() => setSort('chance')}>
              By chance
            </button>
            <button aria-pressed={sort === 'card'} onClick={() => setSort('card')}>
              Card order
            </button>
          </div>
        </div>
        {runners.map((r) => (
          <RunnerCard key={r.id} runner={r} race={race} meeting={meeting} facts={facts.get(r.id) ?? []} analysis={byRunner.get(r.id)} />
        ))}
        {nonRunners.length > 0 && (
          <p className="muted">
            <Term k="nonRunner">Non-runners</Term>: {nonRunners.map((r) => `${r.number}. ${r.name}`).join(', ')}
          </p>
        )}
      </section>
    </div>
  );
}
