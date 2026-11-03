import { useState } from 'react';
import { FACTOR_LABELS, type RunnerAnalysis } from '../model/analysis';
import type { Meeting, Race, Runner } from '../model/racecard';
import type { Fact } from '../lib/facts';
import {
  daysSinceLastRun,
  describeAgeSex,
  describeFinish,
  formatDate,
  formatDistance,
  formatPercent,
  formatWeight,
  headgearName,
} from '../lib/format';
import { FactChip, sortFacts } from './FactChip';
import { FormPips } from './FormPips';
import { Silks } from './Silks';
import { Term } from './Term';

interface Props {
  runner: Runner;
  race: Race;
  meeting: Meeting;
  facts: Fact[];
  analysis?: RunnerAnalysis;
}

export function RunnerCard({ runner, meeting, facts, analysis }: Props) {
  const [open, setOpen] = useState(false);
  const days = daysSinceLastRun(runner, meeting.date);
  const sorted = sortFacts(facts);
  // Every positive, negative and question mark is shown, so the verdict's reasons are always on screen.
  const chips = sorted.filter((f) => f.tone !== 'neutral');
  const panelId = `detail-${runner.id}`;

  return (
    <article id={`runner-${runner.id}`} className={`card runner${analysis?.rank === 1 ? ' is-top' : ''}`}>
      <header className="runner-head">
        <div className="runner-number">
          <span className="num">{runner.number}</span>
          {runner.draw !== undefined && (
            <Term k="draw">
              <span className="draw">({runner.draw})</span>
            </Term>
          )}
        </div>
        <Silks colours={runner.silks} />
        <div className="runner-title">
          <h3>
            {runner.name}
            {runner.headgear && (
              <Term k="headgear">
                <sup className={`headgear${runner.headgear.firstTime ? ' first' : ''}`}>
                  {runner.headgear.code}
                  {runner.headgear.firstTime ? '1' : ''}
                </sup>
              </Term>
            )}
          </h3>
          <p className="muted">
            {describeAgeSex(runner)} · {days !== undefined ? `last ran ${days} days ago` : 'first run'}
          </p>
        </div>
        <div className="runner-price">
          {analysis && <span className="price-chance">{formatPercent(analysis.winChance)}</span>}
          <span className="price-odds">{runner.odds?.current ?? '–'}</span>
        </div>
      </header>

      {analysis && <p className="verdict">{analysis.verdict}</p>}

      <dl className="stats">
        <div>
          <dt>Jockey</dt>
          <dd>
            {runner.jockey.name}
            {runner.jockey.claimLbs ? (
              <Term k="claim">
                <span className="muted"> ({runner.jockey.claimLbs})</span>
              </Term>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Trainer</dt>
          <dd>{runner.trainer.name}</dd>
        </div>
        <div>
          <dt>
            <Term k="weight">Weight</Term>
          </dt>
          <dd>{formatWeight(runner.weightLbs)}</dd>
        </div>
        <div>
          <dt>
            <Term k="OR">OR</Term>
          </dt>
          <dd>{runner.officialRating ?? '–'}</dd>
        </div>
        <div>
          <dt>
            <Term k="speed">Speed</Term>
          </dt>
          <dd>{runner.speedRating ?? '–'}</dd>
        </div>
        <div>
          <dt>
            <Term k="form">Form</Term>
          </dt>
          <dd>
            <FormPips form={runner.form} />
          </dd>
        </div>
      </dl>

      {chips.length > 0 && (
        <ul className="chips" aria-label="Key evidence">
          {chips.map((f, i) => (
            <li key={i}>
              <FactChip fact={f} />
            </li>
          ))}
        </ul>
      )}

      <button className="expand" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'Show'} full analysis
      </button>

      {open && (
        <div id={panelId} className="runner-detail">
          {analysis && analysis.factors.length > 0 && (
            <>
              <h4>Factor by factor</h4>
              <table className="factors">
                <tbody>
                  {analysis.factors.map((f) => (
                    <tr key={f.factor}>
                      <th scope="row">{FACTOR_LABELS[f.factor]}</th>
                      <td>
                        <ScoreMeter score={f.score} />
                      </td>
                      <td>{f.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h4>Recent runs</h4>
          {runner.form.length ? (
            <div className="table-scroll">
              <table className="runs">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course</th>
                    <th>Race</th>
                    <th>Trip</th>
                    <th>Going</th>
                    <th>Result</th>
                    <th>
                      <Term k="OR">OR</Term>
                    </th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {runner.form.map((r, i) => (
                    <tr key={i}>
                      <td>{formatDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                      <td>{r.course}</td>
                      <td>
                        {r.raceType} C{r.raceClass}
                        {r.isHandicap ? ' hcp' : ''}
                      </td>
                      <td>{formatDistance(r.distanceYards)}</td>
                      <td>{r.going}</td>
                      <td>
                        {describeFinish(r)}
                        {r.beatenLengths !== undefined && r.position !== 1 ? `, btn ${r.beatenLengths}L` : ''}
                        {r.wonByLengths !== undefined ? ` by ${r.wonByLengths}L` : ''}
                      </td>
                      <td>{r.officialRating ?? '–'}</td>
                      <td className="muted">
                        {[r.headgear && headgearName(r.headgear), r.trainer && `trained by ${r.trainer}`, r.comment].filter(Boolean).join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No previous runs.</p>
          )}

          {sorted.some((f) => f.tone === 'neutral') && (
            <>
              <h4>Other notes</h4>
              <ul className="notes">
                {sorted
                  .filter((f) => f.tone === 'neutral')
                  .map((f, i) => (
                    <li key={i}>
                      <strong>{f.label}.</strong> {f.detail}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** −2 … +2 as five cells; filled cells show the direction and strength. Text label for screen readers. */
function ScoreMeter({ score }: { score: number }) {
  const label = score > 0 ? `Positive (+${score})` : score < 0 ? `Negative (${score})` : 'Neutral or unproven (0)';
  return (
    <span className="meter" role="img" aria-label={label} title={label}>
      {[-2, -1, 0, 1, 2].map((v) => {
        const on = v === 0 ? score === 0 : v < 0 ? score <= v : score >= v;
        const kind = v < 0 ? 'bad' : v > 0 ? 'good' : 'zero';
        return <span key={v} className={`meter-cell ${on ? `on ${kind}` : ''}`} />;
      })}
    </span>
  );
}
