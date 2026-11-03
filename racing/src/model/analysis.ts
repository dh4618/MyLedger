/**
 * The outcome of analysing one race. This is the contract between the analysis
 * layer and the UI:
 *
 *   - today it is produced by `buildBaselineAnalysis` (market odds + simple rules),
 *   - in step 4 an AI model will return exactly this shape as structured JSON,
 *     validated with this schema and cached per race.
 *
 * Because the race page only ever renders a `RaceAnalysis`, swapping the source
 * does not change the presentation.
 */
import { z } from 'zod';

/** The areas bettors look at. Each runner gets a score per factor. */
export const FactorKey = z.enum([
  'form',
  'going',
  'distance',
  'course',
  'ratings',
  'connections',
  'fitness',
  'changes',
  'draw',
  'market',
]);
export type FactorKey = z.infer<typeof FactorKey>;

export const FactorScore = z.object({
  factor: FactorKey,
  /** -2 strong negative … 0 neutral/unknown … +2 strong positive. */
  score: z.number().int().min(-2).max(2),
  /** One plain-English sentence citing the evidence ("Won twice on soft, incl. here in March"). */
  evidence: z.string(),
});
export type FactorScore = z.infer<typeof FactorScore>;

export const RunnerAnalysis = z.object({
  runnerId: z.string(),
  /** Estimated chance of winning, 0–100. Across a race these sum to ~100. */
  winChance: z.number().min(0).max(100),
  /** 1 = most likely winner. */
  rank: z.number().int().positive(),
  /** Short plain-English verdict: "Favourite, but unproven on soft ground." */
  verdict: z.string(),
  factors: z.array(FactorScore),
});
export type RunnerAnalysis = z.infer<typeof RunnerAnalysis>;

export const RaceAnalysis = z.object({
  raceId: z.string(),
  source: z.enum(['baseline', 'ai']),
  /** Model id for AI analyses; a method label for the baseline. */
  method: z.string(),
  generatedAt: z.string(),
  /** Two or three sentences on how the race is likely to unfold. */
  summary: z.string(),
  runners: z.array(RunnerAnalysis),
});
export type RaceAnalysis = z.infer<typeof RaceAnalysis>;

export const FACTOR_LABELS: Record<FactorKey, string> = {
  form: 'Form',
  going: 'Going',
  distance: 'Trip',
  course: 'Course',
  ratings: 'Ratings',
  connections: 'Trainer & jockey',
  fitness: 'Fitness',
  changes: 'Changes',
  draw: 'Draw',
  market: 'Market',
};
