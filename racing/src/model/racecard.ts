/**
 * The racecard data model: Meeting → Race → Runner (→ past runs).
 *
 * The Zod schemas are the single source of truth: TypeScript types are inferred
 * from them, and every JSON file is validated against them when it is loaded, so a
 * typo in hand-curated data fails loudly instead of rendering nonsense.
 *
 * Units are chosen to make comparisons easy rather than to match how a racecard
 * prints them; formatting back to "2m 4½f" or "11-7" lives in src/lib.
 *   - distances in yards (1 furlong = 220y, 1 mile = 1760y)
 *   - weights in pounds (11-7 = 161lb)
 *   - odds as fractional strings ("5/2", "Evs"), exactly as quoted by bookmakers
 */
import { z } from 'zod';

export const Surface = z.enum(['Turf', 'AW']);
export type Surface = z.infer<typeof Surface>;

export const RaceType = z.enum(['Flat', 'Hurdle', 'Chase', 'NH Flat']);
export type RaceType = z.infer<typeof RaceType>;

/** Official going descriptions. "Soft (Heavy in places)" etc. are written in `goingDetail`. */
export const Going = z.enum([
  'Heavy',
  'Soft',
  'Good to Soft',
  'Good',
  'Good to Firm',
  'Firm',
  // All-weather
  'Slow',
  'Standard to Slow',
  'Standard',
  'Standard to Fast',
  'Fast',
]);
export type Going = z.infer<typeof Going>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const fractionalOdds = z
  .string()
  .regex(/^(\d+\/\d+|Evs|Evens)$/i, 'expected fractional odds like "5/2" or "Evs"');

/** Finishing position, or a code for not finishing. */
export const Position = z.union([
  z.number().int().positive(),
  z.enum(['F', 'PU', 'UR', 'BD', 'SU', 'RO', 'RR', 'REF', 'DSQ', 'CO']),
]);
export type Position = z.infer<typeof Position>;

export const PastRun = z.object({
  date: isoDate,
  course: z.string(),
  raceType: RaceType,
  surface: Surface,
  distanceYards: z.number().int().positive(),
  going: Going,
  raceClass: z.number().int().min(1).max(7),
  position: Position,
  ran: z.number().int().positive(),
  /** Lengths behind the winner; for a winner, lengths it won by (optional). */
  beatenLengths: z.number().nonnegative().optional(),
  wonByLengths: z.number().nonnegative().optional(),
  /** Official rating the horse ran off that day (handicaps). */
  officialRating: z.number().int().optional(),
  isHandicap: z.boolean().default(false),
  /** Only needed when the horse was with a different trainer at the time. */
  trainer: z.string().optional(),
  headgear: z.string().optional(),
  /** Short in-running comment, written in your own words. */
  comment: z.string().optional(),
});
export type PastRun = z.infer<typeof PastRun>;

export const Connection = z.object({
  name: z.string(),
  /** Recent form, e.g. last 14 days: { runs: 20, wins: 4 }. */
  recent: z
    .object({ runs: z.number().int().nonnegative(), wins: z.number().int().nonnegative(), days: z.number().int().positive().default(14) })
    .optional(),
  /** Record at today's course over the last few seasons. */
  course: z.object({ runs: z.number().int().nonnegative(), wins: z.number().int().nonnegative() }).optional(),
});
export type Connection = z.infer<typeof Connection>;

export const Headgear = z.object({
  /** Racecard code: b blinkers, v visor, p cheekpieces, t tongue strap, h hood, e/s eyeshield. */
  code: z.string(),
  firstTime: z.boolean().default(false),
});
export type Headgear = z.infer<typeof Headgear>;

export const Runner = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  draw: z.number().int().positive().optional(),
  name: z.string(),
  age: z.number().int().positive(),
  sex: z.enum(['g', 'c', 'h', 'f', 'm', 'r']),
  weightLbs: z.number().int().positive(),
  officialRating: z.number().int().optional(),
  /** A speed figure on whatever scale your source uses — only compared within a race. */
  speedRating: z.number().int().optional(),
  headgear: Headgear.optional(),
  trainer: Connection,
  jockey: Connection.extend({ claimLbs: z.number().int().nonnegative().optional() }),
  /** Most recent first. */
  form: z.array(PastRun).default([]),
  odds: z
    .object({
      current: fractionalOdds,
      /** Earliest price you saw (morning/overnight) — used to show market moves. */
      opening: fractionalOdds.optional(),
    })
    .optional(),
  /** Two colours for a simple silks swatch. */
  silks: z.tuple([z.string(), z.string()]).optional(),
  nonRunner: z.boolean().default(false),
});
export type Runner = z.infer<typeof Runner>;

export const Race = z.object({
  id: z.string(),
  offTime: z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM (24h, UK time)'),
  name: z.string(),
  raceType: RaceType,
  raceClass: z.number().int().min(1).max(7),
  isHandicap: z.boolean().default(false),
  distanceYards: z.number().int().positive(),
  /** Overrides the meeting going if it changed or differs on a course (e.g. chase vs hurdle). */
  going: Going.optional(),
  ageRestriction: z.string().optional(),
  prizeGbp: z.number().nonnegative().optional(),
  /** Hand-curated draw note for this course/trip, if you know of a bias. */
  drawBias: z.enum(['low', 'high', 'none']).optional(),
  runners: z.array(Runner).min(1),
});
export type Race = z.infer<typeof Race>;

export const Meeting = z.object({
  id: z.string(),
  course: z.string(),
  date: isoDate,
  country: z.string().default('GB'),
  surface: Surface,
  going: Going,
  /** Free text as declared, e.g. "Soft, Heavy in places". */
  goingDetail: z.string().optional(),
  /** Where this data came from. Keeps sample/hand-curated/licensed data distinguishable. */
  source: z.object({
    kind: z.enum(['fictional-sample', 'hand-curated', 'racing-api', 'other']),
    note: z.string().optional(),
  }),
  races: z.array(Race).min(1),
});
export type Meeting = z.infer<typeof Meeting>;

/** A race together with the meeting it belongs to — what a race page needs. */
export interface RaceWithMeeting {
  meeting: Meeting;
  race: Race;
}

/** The going that applies to a race (race override, else the meeting's). */
export function raceGoing(meeting: Meeting, race: Race): Going {
  return race.going ?? meeting.going;
}
