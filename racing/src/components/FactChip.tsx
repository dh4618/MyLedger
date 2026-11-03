import type { Fact, Tone } from '../lib/facts';

const ICON: Record<Tone, string> = { good: '✓', bad: '✕', unknown: '?', neutral: '•' };
const TONE_NAME: Record<Tone, string> = { good: 'Positive', bad: 'Negative', unknown: 'Unproven', neutral: 'Note' };

/** One piece of evidence. Tone is shown by icon + colour, and the full sentence is on hover/focus. */
export function FactChip({ fact }: { fact: Fact }) {
  return (
    <span className={`chip chip-${fact.tone}`} tabIndex={0} data-tip={fact.detail} aria-label={`${TONE_NAME[fact.tone]}: ${fact.label}. ${fact.detail}`}>
      <span className="chip-icon" aria-hidden="true">{ICON[fact.tone]}</span>
      {fact.label}
    </span>
  );
}

const TONE_ORDER: Record<Tone, number> = { good: 0, bad: 1, unknown: 2, neutral: 3 };

/** Positives (strongest first), then negatives (worst first), then question marks, then notes. */
export function sortFacts(facts: Fact[]): Fact[] {
  return [...facts].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || Math.abs(b.score) - Math.abs(a.score));
}
