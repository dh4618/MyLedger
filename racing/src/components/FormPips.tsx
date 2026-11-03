import type { PastRun } from '../model/racecard';
import { describeFinish, formatDate, formatDistance } from '../lib/format';

/** Recent finishing positions as small tiles, oldest → latest, each with its details on hover. */
export function FormPips({ form, max = 6 }: { form: PastRun[]; max?: number }) {
  const runs = form.slice(0, max).reverse();
  if (!runs.length) return <span className="pips pips-empty">No runs yet</span>;
  return (
    <span className="pips" aria-label={`Form, oldest to latest: ${runs.map((r) => describeFinish(r)).join(', ')}`}>
      {runs.map((r, i) => {
        const p = r.position;
        const kind = p === 1 ? 'win' : typeof p === 'number' && p <= 3 ? 'place' : typeof p === 'number' ? 'unplaced' : 'nf';
        const label = typeof p === 'number' ? (p >= 10 ? '0' : String(p)) : p[0];
        const tip = `${formatDate(r.date, { day: 'numeric', month: 'short', year: '2-digit' })} · ${r.course} · ${formatDistance(r.distanceYards)} · ${r.going} · ${describeFinish(r)}`;
        return (
          <span key={i} className={`pip pip-${kind}`} title={tip}>
            {label}
          </span>
        );
      })}
    </span>
  );
}
