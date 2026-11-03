import { Link } from 'react-router-dom';
import type { Meeting } from '../model/racecard';
import { raceGoing } from '../model/racecard';
import { formatDate, formatDistance, formatPercent, formatPrize } from '../lib/format';
import { activeRunners, marketView } from '../lib/market';
import { GOING_EXPLAINED } from '../lib/going';
import { Term } from '../components/Term';
import { useAsync } from '../useAsync';
import { getMeetings } from '../data/repository';

export function RaceListPage() {
  const meetings = useAsync(getMeetings, []);
  if (!meetings) return <p className="muted">Loading…</p>;
  if (!meetings.length) return <p>No racecards yet. Add a JSON file to <code>data/racecards/</code>.</p>;

  return (
    <div className="stack">
      <h1>Racecards</h1>
      {meetings.map((m) => (
        <MeetingCard key={m.id} meeting={m} />
      ))}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    <section className="card meeting">
      <header className="meeting-head">
        <div>
          <h2>{meeting.course}</h2>
          <p className="muted">
            {formatDate(meeting.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {meeting.surface === 'AW' ? 'All-weather' : 'Turf'}
          </p>
        </div>
        <div className="meeting-tags">
          <Term text={GOING_EXPLAINED[meeting.going]}>
            <span className="tag tag-going">{meeting.goingDetail ?? meeting.going}</span>
          </Term>
          {meeting.source.kind === 'fictional-sample' && (
            <span className="tag tag-sample" title={meeting.source.note}>
              Sample data
            </span>
          )}
        </div>
      </header>
      <ul className="race-list">
        {meeting.races.map((race) => {
          const runners = activeRunners(race);
          const market = marketView(race);
          const favId = market.order[0];
          const fav = runners.find((r) => r.id === favId);
          const going = raceGoing(meeting, race);
          return (
            <li key={race.id}>
              <Link to={`/race/${race.id}`} className="race-link">
                <span className="race-time">{race.offTime}</span>
                <span className="race-main">
                  <strong>{race.name}</strong>
                  <span className="muted">
                    {race.raceType} · Class {race.raceClass} · {formatDistance(race.distanceYards)}
                    {going !== meeting.going ? ` · ${going}` : ''} · {runners.length} runners
                    {race.prizeGbp ? ` · ${formatPrize(race.prizeGbp)}` : ''}
                  </span>
                </span>
                {fav && (
                  <span className="race-fav">
                    <span className="muted">Favourite</span>
                    <span>
                      {fav.name} <strong>{formatPercent(market.chance.get(fav.id) ?? 0)}</strong>
                    </span>
                  </span>
                )}
                <span className="chev" aria-hidden="true">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
