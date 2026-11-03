import { describe, expect, it } from 'vitest';
import { getAnalysis, getMeetings, getRace } from './repository';

describe('repository', () => {
  it('loads and validates every racecard file', async () => {
    const meetings = await getMeetings();
    expect(meetings.length).toBeGreaterThan(0);
    const ids = meetings.flatMap((m) => m.races.flatMap((r) => [r.id, ...r.runners.map((x) => x.id)]));
    expect(new Set(ids).size).toBe(ids.length); // ids are unique across all files
  });
  it('finds a race and analyses it', async () => {
    const rm = await getRace('exeter-2026-11-05-1500');
    expect(rm?.meeting.course).toBe('Exeter');
    const a = await getAnalysis(rm!);
    expect(a.runners).toHaveLength(8);
  });
});
