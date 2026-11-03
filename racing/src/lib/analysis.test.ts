import { describe, expect, it } from 'vitest';
import kempton from '../../data/racecards/kempton-2026-11-04.json';
import exeter from '../../data/racecards/exeter-2026-11-05.json';
import { Meeting } from '../model/racecard';
import { RaceAnalysis } from '../model/analysis';
import { buildBaselineAnalysis } from './baseline';
import { runnerFacts } from './facts';
import { marketView } from './market';

const k = Meeting.parse(kempton);
const e = Meeting.parse(exeter);
const race = (m: Meeting, id: string) => m.races.find((r) => r.id === id)!;
const runner = (m: Meeting, raceId: string, name: string) => race(m, raceId).runners.find((r) => r.name === name)!;
const labels = (m: Meeting, raceId: string, name: string) =>
  runnerFacts(runner(m, raceId, name), race(m, raceId), m).map((f) => f.label);

describe('market view', () => {
  it('removes the overround so chances sum to 100 and excludes non-runners', () => {
    const r = race(k, 'kempton-2026-11-04-1740');
    const mv = marketView(r);
    const total = [...mv.chance.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(mv.bookPercent).toBeGreaterThan(100);
    expect(mv.chance.has('kempton-2026-11-04-1740-10')).toBe(false); // Gilded Spur, non-runner
    expect(mv.order[0]).toBe('kempton-2026-11-04-1740-1'); // 3/1 favourite
  });
});

describe('facts', () => {
  const R1 = 'kempton-2026-11-04-1740';
  const R2 = 'kempton-2026-11-04-1910';
  const R3 = 'exeter-2026-11-05-1350';
  const R4 = 'exeter-2026-11-05-1500';

  it('spots course-and-distance winners, good draws and market support', () => {
    expect(labels(k, R1, 'Copper Lantern')).toEqual(expect.arrayContaining(['Course & distance winner', 'Good draw (2)', 'Backed (4/1 → 3/1)', 'Trainer in form']));
  });
  it('flags a poor draw, a trip change and a class drop', () => {
    expect(labels(k, R1, 'Silent Harbour')).toEqual(expect.arrayContaining(['Poor draw (9)', 'Up 1f in trip', 'Down in class', 'Jockey claims 3lb', 'Lightly tried at this trip']));
  });
  it('flags turf horses on the all-weather, and untried trips', () => {
    expect(labels(k, R2, 'Ivory Signal')).toEqual(expect.arrayContaining(['Unproven on the all-weather', 'Untried at this trip']));
    expect(labels(k, R1, 'Saffron Mile')).toContain('Unproven on the all-weather');
  });
  it('flags out-of-form horses, drifters, trainer changes and long absences', () => {
    expect(labels(k, R1, 'Lady Marchbank')).toEqual(expect.arrayContaining(['Out of form', 'Drifting (14/1 → 20/1)']));
    expect(labels(k, R1, 'Hollow Bay')).toContain('First run for new trainer');
    expect(labels(k, R2, 'Tide Reader')).toContain('Off 311 days');
  });
  it('handles jumps specifics: first time over obstacles, falls, debutants, soft-ground form', () => {
    expect(labels(e, R3, 'Red Fern Lane')).toEqual(expect.arrayContaining(['First run over hurdles', 'Unproven on soft ground']));
    expect(labels(e, R3, 'Ashgrove Belle')[0]).toBe('Debut');
    expect(labels(e, R3, 'Wychwood Star')).toEqual(expect.arrayContaining(['Course & distance winner', 'Won on soft ground']));
    expect(labels(e, R4, 'Blackdown Rebel')).toContain('Fell last time');
    expect(labels(e, R4, 'Fennel Brook')).toContain('First run over fences');
  });
  it('compares the handicap mark with the last winning mark', () => {
    expect(labels(e, R4, 'Gallant Oak')).toContain('Higher mark than last win');
  });
});

describe('baseline analysis', () => {
  for (const m of [k, e]) {
    for (const r of m.races) {
      it(`produces a valid, ranked analysis for ${r.id}`, () => {
        const a = RaceAnalysis.parse(buildBaselineAnalysis(r, m, new Date('2026-11-03T12:00:00Z')));
        const total = a.runners.reduce((s, x) => s + x.winChance, 0);
        expect(total).toBeCloseTo(100, 6);
        expect(a.runners.map((x) => x.rank)).toEqual(a.runners.map((_, i) => i + 1));
        for (const x of a.runners) expect(x.verdict).toMatch(/\.$/);
        expect(a.summary.length).toBeGreaterThan(20);
      });
    }
  }
  it('writes the kind of verdict the brief asks for', () => {
    const r = race(k, 'kempton-2026-11-04-1910');
    const a = buildBaselineAnalysis(r, k);
    const fav = a.runners[0];
    expect(fav.runnerId).toBe('kempton-2026-11-04-1910-1');
    expect(fav.verdict).toMatch(/^Favourite — .+, but unproven on the all-weather\.$/);
  });
});
