/**
 * Data access. Pages only talk to these async functions, so swapping the hand-curated
 * JSON files for a licensed feed (e.g. The Racing API) — or for a small backend that
 * caches AI analyses — means changing this file, not the UI.
 */
import { buildBaselineAnalysis } from '../lib/baseline';
import { RaceAnalysis } from '../model/analysis';
import { Meeting, type RaceWithMeeting } from '../model/racecard';

// Every *.json file in data/racecards is one meeting. Validated on load.
const files = import.meta.glob('/data/racecards/*.json', { eager: true, import: 'default' });

function loadMeetings(): Meeting[] {
  return Object.entries(files)
    .map(([path, json]) => {
      const parsed = Meeting.safeParse(json);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`Invalid racecard ${path}:\n${issues}`);
      }
      return parsed.data;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.course.localeCompare(b.course));
}

const meetings = loadMeetings();

export async function getMeetings(): Promise<Meeting[]> {
  return meetings;
}

export async function getRace(raceId: string): Promise<RaceWithMeeting | undefined> {
  for (const meeting of meetings) {
    const race = meeting.races.find((r) => r.id === raceId);
    if (race) return { meeting, race };
  }
  return undefined;
}

/**
 * The outcome for a race. Today: the market + rules baseline, computed on the fly.
 * Step 4: look up a cached AI analysis first (validated with RaceAnalysis.parse),
 * falling back to the baseline when none exists yet.
 */
export async function getAnalysis({ meeting, race }: RaceWithMeeting): Promise<RaceAnalysis> {
  return RaceAnalysis.parse(buildBaselineAnalysis(race, meeting));
}
