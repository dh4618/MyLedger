import { describe, expect, it } from 'vitest';
import { decimalOdds, formFigures, formatDistance, formatFurlongs, formatWeight, impliedProbability, lowerFirst } from './format';
import type { PastRun } from '../model/racecard';

describe('formatDistance', () => {
  it.each([
    [1540, '7f'],
    [1760, '1m'],
    [1650, '7½f'],
    [3740, '2m 1f'],
    [5060, '2m 7f'],
    [4070, '2m 2½f'],
    [3960, '2m 2f'],
    [5280, '3m'],
  ])('%i yards → %s', (y, s) => expect(formatDistance(y)).toBe(s));
  it('formats furlong differences', () => {
    expect(formatFurlongs(330)).toBe('1½f');
    expect(formatFurlongs(-440)).toBe('2f');
  });
});

describe('weights and odds', () => {
  it('formats stones-pounds', () => {
    expect(formatWeight(161)).toBe('11-7');
    expect(formatWeight(126)).toBe('9-0');
  });
  it('converts fractional odds', () => {
    expect(decimalOdds('5/2')).toBe(3.5);
    expect(decimalOdds('Evs')).toBe(2);
    expect(decimalOdds('4/6')).toBeCloseTo(1.667, 3);
    expect(impliedProbability('3/1')).toBe(0.25);
  });
});

describe('formFigures', () => {
  const run = (date: string, position: PastRun['position']): PastRun => ({
    date, position, course: 'X', raceType: 'Flat', surface: 'Turf', distanceYards: 1760, going: 'Good', raceClass: 5, ran: 10, isHandicap: false,
  });
  it('reads oldest → latest, marks year gaps and 10th+', () => {
    expect(formFigures([run('2026-10-01', 1), run('2026-09-01', 'PU'), run('2026-08-01', 12), run('2025-01-01', 3)])).toBe('3/0P1');
  });
  it('handles debutants', () => expect(formFigures([])).toBe('–'));
});

it('lowerFirst keeps acronyms', () => {
  expect(lowerFirst('Course & distance winner')).toBe('course & distance winner');
  expect(lowerFirst('OR top')).toBe('OR top');
});
