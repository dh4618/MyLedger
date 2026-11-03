/**
 * Evidence: plain-English facts derived from the racecard, one small rule each.
 *
 * Facts serve two purposes:
 *   1. the scannable chips on each runner ("Won on soft ground", "First-time blinkers"),
 *   2. the grounded evidence handed to the AI in step 4, so every conclusion it
 *      draws can be traced back to something on the card.
 *
 * Every fact carries its `detail` — the evidence in a full sentence — so nothing is
 * a black box.
 */
import type { FactorKey } from '../model/analysis';
import { raceGoing, type Meeting, type PastRun, type Race, type Runner } from '../model/racecard';
import {
  daysBetween,
  describeFinish,
  formatDistance,
  formatFurlongs,
  headgearName,
  impliedProbability,
  formatDate,
} from './format';
import { groundPhrase, isSimilarGoing } from './going';
import { activeRunners, favourites } from './market';

export type Tone = 'good' | 'bad' | 'neutral' | 'unknown';

export interface Fact {
  factor: FactorKey;
  /** -2 … +2, as in the analysis model. */
  score: number;
  /** good / bad / neutral (informational) / unknown (untested — a question mark, not a negative). */
  tone: Tone;
  /** Short chip text. Written so it still reads well with a lowercase first letter. */
  label: string;
  /** The evidence, as a sentence. */
  detail: string;
}

const fact = (factor: FactorKey, score: number, label: string, detail: string, tone?: Tone): Fact => ({
  factor,
  score,
  label,
  detail,
  tone: tone ?? (score > 0 ? 'good' : score < 0 ? 'bad' : 'neutral'),
});

const isWin = (r: PastRun) => r.position === 1;
const isPlace = (r: PastRun) => typeof r.position === 'number' && r.position <= 3;
const finished = (r: PastRun) => typeof r.position === 'number';

function runSummary(r: PastRun): string {
  return `${describeFinish(r)} at ${r.course}, ${formatDistance(r.distanceYards)} on ${r.going.toLowerCase()} (${formatDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' })})`;
}

/** How close a past trip must be to count as "today's trip". Jumps distances vary more. */
function tripTolerance(race: Race): number {
  return race.raceType === 'Flat' ? 110 : 330;
}

function list(runs: PastRun[], max = 2): string {
  const shown = runs.slice(0, max).map(runSummary).join('; ');
  return runs.length > max ? `${shown}; +${runs.length - max} more` : shown;
}

// ─── individual rules ────────────────────────────────────────────────────────

function formFacts(runner: Runner): Fact[] {
  const last3 = runner.form.slice(0, 3);
  if (!last3.length) return [fact('form', 0, 'Debut', 'Has not run before, so there is no form to judge.', 'unknown')];

  const last = last3[0];
  const figs = last3.map((r) => r.position).join(', ');
  const out: Fact[] = [];
  const wins = last3.filter(isWin).length;
  const places = last3.filter(isPlace).length;

  if (isWin(last)) {
    out.push(fact('form', wins >= 2 ? 2 : 1, wins >= 2 ? `${wins} wins in last 3` : 'Won last time', `Last run: ${runSummary(last)}.`));
  } else if (!finished(last)) {
    out.push(fact('form', -1, `${describeFinish(last)} last time`, `Last run: ${runSummary(last)}.`));
  } else if (places >= 2) {
    out.push(fact('form', 1, 'Consistent', `Placed in ${places} of the last ${last3.length} runs (most recent first: ${figs}).`));
  } else if (last3.length >= 3 && !last3.some((r) => typeof r.position === 'number' && r.position <= 4)) {
    out.push(fact('form', -1, 'Out of form', `No top-four finish in the last 3 runs (most recent first: ${figs}).`));
  } else {
    out.push(fact('form', 0, 'Mixed recent form', `Last 3 runs, most recent first: ${figs}.`));
  }
  return out;
}

function goingFacts(runner: Runner, race: Race, meeting: Meeting): Fact[] {
  const going = raceGoing(meeting, race);
  const phrase = groundPhrase(going, meeting.surface);
  const similar = runner.form.filter((r) => isSimilarGoing(going, meeting.surface, r.going, r.surface));
  const wins = similar.filter(isWin);
  const places = similar.filter(isPlace);

  if (!runner.form.length) return [];
  if (!similar.length) return [fact('going', 0, `Unproven on ${phrase}`, `No previous runs on ${phrase} (today: ${going}).`, 'unknown')];
  if (wins.length) {
    return [fact('going', wins.length >= 2 ? 2 : 1, `Won on ${phrase}`, `${wins.length} win${wins.length > 1 ? 's' : ''} from ${similar.length} runs on similar ground: ${list(wins)}.`)];
  }
  if (places.length) return [fact('going', 0, `Placed on ${phrase}`, `Placed ${places.length} times from ${similar.length} runs on similar ground, but no wins.`)];
  if (similar.length >= 2) return [fact('going', -1, `Below par on ${phrase}`, `No wins or places from ${similar.length} runs on similar ground.`)];
  return [fact('going', 0, `Unproven on ${phrase}`, `Only one run on similar ground: ${list(similar)}.`, 'unknown')];
}

function distanceFacts(runner: Runner, race: Race): Fact[] {
  if (!runner.form.length) return [];
  const tol = tripTolerance(race);
  const atTrip = runner.form.filter((r) => Math.abs(r.distanceYards - race.distanceYards) <= tol);
  const trip = formatDistance(race.distanceYards);
  const wins = atTrip.filter(isWin);
  if (wins.length) {
    return [fact('distance', wins.length >= 2 ? 2 : 1, 'Won over this trip', `${wins.length} win${wins.length > 1 ? 's' : ''} at around ${trip}: ${list(wins)}.`)];
  }
  if (atTrip.some(isPlace)) return [fact('distance', 1, 'Placed over this trip', `Placed at around ${trip}, but yet to win at it.`)];
  if (atTrip.length >= 2) return [fact('distance', -1, 'Yet to place at this trip', `${atTrip.length} runs at around ${trip} without making the frame.`)];
  if (atTrip.length === 1) return [fact('distance', 0, 'Lightly tried at this trip', `Only one run at around ${trip}: ${list(atTrip)}.`, 'unknown')];

  const longest = Math.max(...runner.form.map((r) => r.distanceYards));
  const shortest = Math.min(...runner.form.map((r) => r.distanceYards));
  if (race.distanceYards > longest + tol) {
    return [fact('distance', 0, 'Untried at this trip', `Never run as far as ${trip}; the longest so far is ${formatDistance(longest)}. Stamina is unproven.`, 'unknown')];
  }
  if (race.distanceYards < shortest - tol) {
    return [fact('distance', 0, 'Shortest trip yet', `Never run as short as ${trip}; the shortest so far is ${formatDistance(shortest)}. May lack the speed.`, 'unknown')];
  }
  return [fact('distance', 0, 'Unproven at this exact trip', `No runs at around ${trip}, though it has run either side of it.`, 'unknown')];
}

function courseFacts(runner: Runner, race: Race, meeting: Meeting): Fact[] {
  const here = runner.form.filter((r) => r.course === meeting.course);
  const wins = here.filter(isWin);
  const cdWins = wins.filter((r) => Math.abs(r.distanceYards - race.distanceYards) <= tripTolerance(race));
  if (cdWins.length) {
    return [fact('course', 2, 'Course & distance winner', `Has won at ${meeting.course} over this trip: ${list(cdWins)}.`)];
  }
  if (wins.length) return [fact('course', 1, 'Course winner', `Has won at ${meeting.course} before: ${list(wins)}.`)];
  if (here.length >= 2 && !here.some(isPlace)) {
    return [fact('course', -1, 'Poor record here', `${here.length} runs at ${meeting.course} without a placing.`)];
  }
  if (here.length) return [fact('course', 0, 'Has run here', `Previous runs at ${meeting.course}: ${list(here)}.`)];
  return [];
}

function ratingFacts(runner: Runner, race: Race): Fact[] {
  const out: Fact[] = [];
  const field = activeRunners(race);
  const ors = field.map((r) => r.officialRating).filter((x): x is number => x !== undefined);
  const speeds = field.map((r) => r.speedRating).filter((x): x is number => x !== undefined);

  if (runner.officialRating !== undefined && ors.length > 1 && runner.officialRating === Math.max(...ors)) {
    out.push(fact('ratings', 1, 'Top rated', `Highest official rating in the race (${runner.officialRating}).`));
  }
  if (runner.speedRating !== undefined && speeds.length > 1 && runner.speedRating === Math.max(...speeds)) {
    out.push(fact('ratings', 1, 'Best speed figure', `Highest speed rating in the field (${runner.speedRating}): it has run the fastest time, adjusted for conditions.`));
  }

  if (race.isHandicap && runner.officialRating !== undefined) {
    const lastWin = runner.form.find((r) => isWin(r) && r.isHandicap && r.officialRating !== undefined);
    if (lastWin) {
      const diff = runner.officialRating - lastWin.officialRating!;
      if (diff <= 0) {
        out.push(fact('ratings', 1, 'Well handicapped', `Rated ${runner.officialRating} today, ${diff === 0 ? 'the same mark' : `${-diff}lb lower than the ${lastWin.officialRating}`} it last won a handicap off.`));
      } else if (diff >= 7) {
        out.push(fact('ratings', -1, 'Higher mark than last win', `Rated ${runner.officialRating}, ${diff}lb above the ${lastWin.officialRating} it last won off; the handicapper has caught up with it.`));
      }
    }
  }
  return out;
}

function connectionFacts(runner: Runner, meeting: Meeting): Fact[] {
  const out: Fact[] = [];
  const t = runner.trainer;
  const j = runner.jockey;
  if (t.recent && t.recent.runs >= 5) {
    const sr = t.recent.wins / t.recent.runs;
    if (sr >= 0.2) out.push(fact('connections', 1, 'Trainer in form', `${t.name}: ${t.recent.wins} winners from ${t.recent.runs} runners in the last ${t.recent.days} days (${Math.round(sr * 100)}%).`));
    else if (t.recent.runs >= 10 && t.recent.wins === 0) out.push(fact('connections', -1, 'Trainer out of form', `${t.name}: no winners from ${t.recent.runs} runners in the last ${t.recent.days} days.`));
  }
  if (t.course && t.course.runs >= 5 && t.course.wins / t.course.runs >= 0.2) {
    out.push(fact('connections', 1, 'Trainer does well here', `${t.name} has ${t.course.wins} wins from ${t.course.runs} runners at ${meeting.course} (${Math.round((t.course.wins / t.course.runs) * 100)}%).`));
  }
  if (j.recent && j.recent.runs >= 5) {
    const sr = j.recent.wins / j.recent.runs;
    if (sr >= 0.2) out.push(fact('connections', 1, 'Jockey in form', `${j.name}: ${j.recent.wins} wins from ${j.recent.runs} rides in the last ${j.recent.days} days (${Math.round(sr * 100)}%).`));
    else if (j.recent.runs >= 10 && j.recent.wins === 0) out.push(fact('connections', -1, 'Jockey out of form', `${j.name}: no wins from ${j.recent.runs} rides in the last ${j.recent.days} days.`));
  }
  if (j.claimLbs) {
    out.push(fact('connections', 0, `Jockey claims ${j.claimLbs}lb`, `${j.name} is a less experienced rider, so the horse carries ${j.claimLbs}lb less than its allotted weight.`));
  }
  return out;
}

function fitnessFacts(runner: Runner, meeting: Meeting): Fact[] {
  const last = runner.form[0];
  if (!last) return [];
  const days = daysBetween(last.date, meeting.date);
  if (days > 180) return [fact('fitness', -1, `Off ${days} days`, `First run for over six months (last ran ${formatDate(last.date, { day: 'numeric', month: 'short', year: 'numeric' })}). May need the run to get fit.`, 'unknown')];
  if (days > 60) return [fact('fitness', 0, `Off ${days} days`, `Returning from a ${days}-day break. Check whether this trainer's horses usually run well fresh.`, 'unknown')];
  if (days <= 7) return [fact('fitness', 0, `Quick return (${days} days)`, `Ran only ${days} days ago: either thriving, or it may be feeling the effects.`)];
  return [fact('fitness', 0, `Last ran ${days} days ago`, `A normal gap between runs.`)];
}

function changeFacts(runner: Runner, race: Race): Fact[] {
  const out: Fact[] = [];
  const last = runner.form[0];

  if (runner.headgear?.firstTime) {
    const name = headgearName(runner.headgear.code);
    out.push(fact('changes', 0, `First-time ${name}`, `Wears ${name} for the first time. Can sharpen a horse up, but the effect is unknown until it has run in them.`, 'unknown'));
  }
  if (!last) return out;

  const tripDiff = race.distanceYards - last.distanceYards;
  if (Math.abs(tripDiff) >= 220) {
    out.push(fact('changes', 0, `${tripDiff > 0 ? 'Up' : 'Down'} ${formatFurlongs(tripDiff)} in trip`, `Last ran over ${formatDistance(last.distanceYards)}; today is ${formatDistance(race.distanceYards)}.`));
  }
  if (race.raceClass > last.raceClass) {
    out.push(fact('changes', 1, 'Down in class', `Ran in Class ${last.raceClass} last time; this is an easier Class ${race.raceClass} race.`));
  } else if (race.raceClass < last.raceClass) {
    out.push(fact('changes', -1, 'Up in class', `Ran in Class ${last.raceClass} last time; this is a tougher Class ${race.raceClass} race.`));
  }
  if (last.trainer && last.trainer !== runner.trainer.name) {
    out.push(fact('changes', 0, 'First run for new trainer', `Moved from ${last.trainer} to ${runner.trainer.name} since its last run. A new yard can bring improvement.`, 'unknown'));
  }
  if (race.raceType !== 'Flat' && !runner.form.some((r) => r.raceType === race.raceType)) {
    const what = race.raceType === 'Chase' ? 'over fences' : race.raceType === 'Hurdle' ? 'over hurdles' : 'in a bumper';
    out.push(fact('changes', 0, `First run ${what}`, `Has never run ${what} before, so its jumping (or lack of it) is untested.`, 'unknown'));
  }
  return out;
}

function drawFacts(runner: Runner, race: Race): Fact[] {
  if (runner.draw === undefined) return [];
  const n = activeRunners(race).length;
  const third = runner.draw <= n / 3 ? 'low' : runner.draw > (2 * n) / 3 ? 'high' : 'middle';
  const where = `Stall ${runner.draw} of ${n}`;
  if (race.drawBias === 'low' || race.drawBias === 'high') {
    if (third === race.drawBias) return [fact('draw', 1, `Good draw (${runner.draw})`, `${where}. ${race.drawBias === 'low' ? 'Low' : 'High'} draws have an edge over this course and distance.`)];
    if (third !== 'middle') return [fact('draw', -1, `Poor draw (${runner.draw})`, `${where}. ${race.drawBias === 'low' ? 'Low' : 'High'} draws have an edge here, and this horse is on the other side.`)];
  }
  return [fact('draw', 0, `Drawn ${runner.draw}`, `${where}. No strong draw bias noted for this course and distance.`)];
}

function marketFacts(runner: Runner, race: Race): Fact[] {
  if (!runner.odds) return [fact('market', 0, 'No price yet', 'No odds recorded for this runner.', 'unknown')];
  const out: Fact[] = [];
  const favs = favourites(race);
  if (favs.includes(runner.id)) {
    out.push(fact('market', 0, favs.length > 1 ? 'Joint favourite' : 'Favourite', `Shortest price in the betting at ${runner.odds.current}.`));
  }
  const { opening, current } = runner.odds;
  if (opening) {
    const ratio = impliedProbability(current) / impliedProbability(opening);
    if (ratio >= 1.2) out.push(fact('market', 1, `Backed (${opening} → ${current})`, `The price has shortened from ${opening} to ${current}: money has come for it.`));
    else if (ratio <= 0.8) out.push(fact('market', -1, `Drifting (${opening} → ${current})`, `The price has lengthened from ${opening} to ${current}: the market has gone off it.`));
  }
  return out;
}

// ─── entry point ─────────────────────────────────────────────────────────────

export function runnerFacts(runner: Runner, race: Race, meeting: Meeting): Fact[] {
  return [
    ...formFacts(runner),
    ...goingFacts(runner, race, meeting),
    ...distanceFacts(runner, race),
    ...courseFacts(runner, race, meeting),
    ...ratingFacts(runner, race),
    ...connectionFacts(runner, meeting),
    ...fitnessFacts(runner, meeting),
    ...changeFacts(runner, race),
    ...drawFacts(runner, race),
    ...marketFacts(runner, race),
  ];
}

export function raceFacts(race: Race, meeting: Meeting): Map<string, Fact[]> {
  return new Map(activeRunners(race).map((r) => [r.id, runnerFacts(r, race, meeting)]));
}
