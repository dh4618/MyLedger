import React from 'react';
import { useLang } from './i18n/LanguageProvider';

// How the day is described alongside the x/y count. Kept short so it stays on one
// line next to the count even on a narrow phone.
const labelKey = (done, total) => {
  if (done === 0) return 'progress.notStarted';
  if (done === total) return 'progress.allDone';
  const ratio = done / total;
  if (ratio < 0.5) return 'progress.gettingGoing';
  if (ratio === 0.5) return 'progress.halfway';
  return 'progress.nearlyThere';
};

// A bar for the tasks currently on screen. It follows the active goal filter, so
// filtering to one goal narrows the count to that goal — `scopeLabel` names it.
// The reacting mascot lives in the header; duplicating it here would put the same
// character on screen twice.
export default function ProgressBar({ done, total, scopeLabel }) {
  const { t } = useLang();

  // Nothing to show a ratio for; the empty state carries the mascot instead.
  if (!total) return null;

  const complete = done === total;
  const pct = Math.round((done / total) * 100);
  const label = t(labelKey(done, total));

  return (
    <div className={`dt-progress ${complete ? 'complete' : ''}`}>
      <div className="dt-progress-main">
        <div className="dt-progress-top">
          <span className="dt-progress-label">
            {scopeLabel ? `${scopeLabel} · ${label}` : label}
          </span>
          <span className="dt-progress-count">{done}/{total}</span>
        </div>
        <div
          className="dt-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={t('progress.aria', { done, total })}
        >
          <div className="dt-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
