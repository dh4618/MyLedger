import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { useLang } from './i18n/LanguageProvider';
import { toDateStr, fromDateStr, addDays, startOfWeek, dateRange, formatShortDate, formatMonthYear } from './dates';
import { buildReport, pct } from './report';

// How a week or a month scored, per goal. The day page already answers "how is today
// going"; this answers "have I actually been doing this", which no screen could answer
// before — a goal's History lists every instance, but reading consistency off it means
// counting rows against a schedule in your head.
//
// Repeats and on-demand tasks are shown differently on purpose. A repeat has a schedule,
// so it has a denominator and can be scored. Laundry has none: "3 times this month" is
// the whole truth about it, and dividing that by an invented target would turn "I did
// laundry three times" into "you failed at laundry".
export default function ReportPanel({ getTasks, isDone, goals, presets, todayStr, locale, noGoalColor, streak, onClose }) {
  const { t } = useLang();
  const [mode, setMode] = useState('week');
  // 0 is the period containing today; negative steps back. There is no positive: a
  // report on days that haven't happened would be all misses.
  const [offset, setOffset] = useState(0);

  const period = useMemo(() => {
    const today = fromDateStr(todayStr);
    if (mode === 'week') {
      const start = startOfWeek(addDays(today, offset * 7));
      return { startStr: toDateStr(start), endStr: toDateStr(addDays(start, 6)) };
    }
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { startStr: toDateStr(start), endStr: toDateStr(end) };
  }, [mode, offset, todayStr]);

  // Days after today haven't happened, so they are not misses — without this the current
  // month would look wrecked every 1st. A period entirely in the past uses all of itself.
  const lastDay = period.endStr > todayStr ? todayStr : period.endStr;
  const partial = period.endStr > todayStr;
  const dateStrs = useMemo(() => dateRange(period.startStr, lastDay), [period.startStr, lastDay]);

  const { sections, others } = useMemo(
    () => buildReport({ dateStrs, getTasks, isDone, goals, presets }),
    [dateStrs, getTasks, isDone, goals, presets]
  );

  const label = () => {
    if (mode === 'month') return formatMonthYear(fromDateStr(period.startStr), locale);
    if (offset === 0) return t('report.thisWeek');
    return `${formatShortDate(fromDateStr(period.startStr), locale)} – ${formatShortDate(fromDateStr(period.endStr), locale)}`;
  };

  const dots = (row) => (
    <div
      className="dt-dots"
      role="img"
      aria-label={t('report.dotsAria', { done: row.done, due: row.due })}
    >
      {row.dots.map((hit, i) => (
        // Filled versus a hollow ring, not two colours — the difference has to survive
        // being read at a glance, and colour alone wouldn't.
        <span key={i} className={`dt-dot ${hit ? 'on' : ''}`} />
      ))}
    </div>
  );

  const section = (s, key) => {
    const name = s.name || t('common.others');
    const color = s.color || noGoalColor;
    return (
      <div key={key} className="dt-report-section" style={{ '--goal': color }}>
        <div className="dt-report-head">
          <span className="dt-report-dot" />
          <span className="dt-report-goal">{name}</span>
          {s.due > 0 && (
            <span className="dt-report-score">
              {t('report.consistency', { done: s.done, due: s.due, pct: pct(s.done, s.due) })}
            </span>
          )}
        </div>

        {s.repeats.length > 0 && (
          <>
            <div className="dt-report-kind">{t('manage.repeatedSection')}</div>
            {s.repeats.map((row) => (
              <div key={row.id} className="dt-report-row">
                <div className="dt-report-row-top">
                  <span className="dt-report-name">{row.name}</span>
                  <span className="dt-report-score">
                    {t('report.consistency', { done: row.done, due: row.due, pct: pct(row.done, row.due) })}
                  </span>
                </div>
                {dots(row)}
              </div>
            ))}
          </>
        )}

        {s.oneOffs.length > 0 && (
          <>
            <div className="dt-report-kind">{t('report.onDemand')}</div>
            {s.oneOffs.map((row) => (
              <div key={row.key} className={`dt-report-count ${row.count === 0 ? 'zero' : ''}`}>
                <span className="dt-report-name">{row.name}</span>
                {/* An em dash rather than "0×": a template you didn't reach for this
                    month is an absence, not a score of nothing. */}
                <span className="dt-report-times">{row.count > 0 ? t('report.times', { n: row.count }) : '—'}</span>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  const all = [...sections.map((s, i) => section(s, s.goalId || `g${i}`))];
  if (others) all.push(section(others, '__others__'));

  return (
    <div className="dt-manage-panel" onClick={onClose}>
      <div className="dt-manage-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          {t('report.title')}
          <button className="dt-icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Above the period switch because it belongs to no period — the streak is a
            running fact about today, not a figure for the week you happen to be viewing. */}
        <div className={`dt-streak-card ${streak.current > 0 ? '' : 'none'}`}>
          <Flame size={20} />
          <div className="dt-streak-main">
            <div className="dt-streak-count">
              {streak.current > 0 ? t('streak.days', { n: streak.current }) : t('streak.none')}
            </div>
            <div className="dt-streak-sub">
              {streak.current === 0 ? t('streak.startToday')
                : !streak.includesToday ? t('streak.keepGoing')
                : t('streak.best', { n: streak.longest })}
            </div>
          </div>
          {/* The best run only earns its space once it is actually better than now. */}
          {streak.current > 0 && !streak.includesToday && streak.longest > streak.current && (
            <div className="dt-streak-best">{t('streak.best', { n: streak.longest })}</div>
          )}
        </div>

        <div className="dt-segmented">
          {['week', 'month'].map((m) => (
            <button
              key={m}
              className={`dt-segmented-btn ${mode === m ? 'active' : ''}`}
              // Switching keeps you on the period containing today rather than trying to
              // map "3 weeks back" onto months, which has no honest answer.
              onClick={() => { setMode(m); setOffset(0); }}
            >{t(m === 'week' ? 'report.week' : 'report.month')}</button>
          ))}
        </div>

        <div className="dt-report-nav">
          <button className="dt-icon-btn" title={t('report.prev')} onClick={() => setOffset(offset - 1)}>
            <ChevronLeft size={18} />
          </button>
          <div className="dt-report-period">
            {label()}
            {partial && <span className="dt-report-sofar">{t('report.soFar')}</span>}
          </div>
          <button
            className="dt-icon-btn"
            title={t('report.next')}
            disabled={offset === 0}
            onClick={() => setOffset(Math.min(0, offset + 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {all.length === 0 ? <div className="dt-empty-manage">{t('report.empty')}</div> : all}
      </div>
    </div>
  );
}
