/** Plain-English explanations for every term the UI shows. Rendered as tooltips by <Term>. */
export const GLOSSARY = {
  OR: 'Official Rating: the handicapper’s measure of a horse’s ability, in pounds. Higher is better. In handicaps it decides the weight carried.',
  speed: 'Speed rating: how fast the horse has run, adjusted for distance and ground. Only useful for comparing horses in the same race.',
  weight: 'Weight carried, in stones and pounds (11-7 = 11 stone 7 pounds), including the saddle. In handicaps, better horses carry more.',
  draw: 'Stall number in the starting gates (Flat races only). On some courses a low or high draw is an advantage.',
  form: 'Finishing positions in recent races, oldest on the left, latest on the right. 0 = 10th or worse, P = pulled up, F = fell, U = unseated rider, / = a gap of over a year.',
  class: 'Race class, from 1 (best, including Group and Grade races) to 7 (lowest). Moving down in class usually means easier opponents.',
  handicap: 'A handicap gives better horses more weight to carry, to even out everyone’s chances.',
  going: 'The state of the ground, from Heavy (very wet) to Firm (hard). Many horses only show their best on certain going.',
  odds: 'The bookmaker’s price. 5/2 means you win £5 for every £2 staked, plus your stake back.',
  marketChance: 'The chance the betting market gives the horse: the odds converted to a percentage, with the bookmaker’s built-in margin removed so the field adds up to 100%.',
  winChance: 'Estimated chance of winning. Across a race these add up to 100%. An estimate, not a guarantee.',
  headgear: 'Equipment such as blinkers or cheekpieces, used to help a horse concentrate. First-time headgear can bring improvement, but it is unproven.',
  claim: 'Less experienced jockeys can “claim” a weight allowance, so the horse carries a few pounds less.',
  nonRunner: 'Withdrawn from the race.',
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
