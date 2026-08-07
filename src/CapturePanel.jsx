import React, { useMemo, useRef, useState } from 'react';
import { X, Sparkles, Check, ShoppingCart, CornerDownRight, Repeat, ArrowUp } from 'lucide-react';
import { useLang } from './i18n/LanguageProvider';

// Type a sentence (or dictate it with the keyboard's microphone), get a proposal, review
// it, confirm. Nothing is written until Confirm — the model proposes, this panel is where
// a person agrees.
//
// Rows are include/exclude rather than editable. The card's job is to stop a wrong entry
// reaching the ledger, and "untick it and say it again" is a clearer, smaller answer to a
// bad parse than a second task editor that has to stay in step with the real one.
export default function CapturePanel({ onParse, onApply, onClose, formatDate }) {
  const { t } = useLang();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [proposal, setProposal] = useState(null);
  // Index-keyed so a row can be excluded without mutating the proposal itself.
  const [dropped, setDropped] = useState({ tasks: {}, groceries: {}, completions: {} });
  const [usePreset, setUsePreset] = useState({});
  const inputRef = useRef(null);

  const reset = () => {
    setProposal(null);
    setDropped({ tasks: {}, groceries: {}, completions: {} });
    setUsePreset({});
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    reset();
    try {
      setProposal(await onParse(value));
    } catch (e) {
      // A CaptureError carries a code the copy can translate. Anything else is a bug on
      // our side wearing the same generic message, so log it rather than lose it.
      if (!e || !e.code) console.error('capture failed', e);
      setError(e && e.code ? e.code : 'upstream');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (kind, i) => setDropped((d) => ({ ...d, [kind]: { ...d[kind], [i]: !d[kind][i] } }));

  const approved = useMemo(() => {
    if (!proposal) return null;
    return {
      tasks: proposal.tasks
        .map((task, i) => (dropped.tasks[i] ? null : (
          // Taking the suggestion is what makes it a preset match — the parse only ever
          // offered it.
          usePreset[i] && task.suggestedPreset
            ? {
              ...task,
              name: task.suggestedPreset.name,
              time: task.time || task.suggestedPreset.time || null,
              goalId: task.goalId || task.suggestedPreset.goalId || null,
            }
            : task
        )))
        .filter(Boolean),
      groceries: proposal.groceries.filter((_, i) => !dropped.groceries[i]),
      completions: proposal.completions.filter((_, i) => !dropped.completions[i]),
    };
  }, [proposal, dropped, usePreset]);

  const total = approved
    ? approved.tasks.length + approved.groceries.length + approved.completions.length
    : 0;

  const confirm = () => {
    if (!total) return;
    onApply(approved);
    setText('');
    reset();
    if (inputRef.current) inputRef.current.focus();
  };

  const row = (kind, i, icon, main, meta, extra) => (
    <div key={`${kind}-${i}`} className={`dt-capture-row ${dropped[kind][i] ? 'dropped' : ''}`}>
      <div
        className={`dt-checkbox ${dropped[kind][i] ? '' : 'checked'}`}
        onClick={() => toggle(kind, i)}
      >
        {!dropped[kind][i] && <Check size={13} color="currentColor" strokeWidth={3} />}
      </div>
      <div className="dt-capture-main" onClick={() => toggle(kind, i)}>
        <div className="dt-capture-name">{icon}{main}</div>
        {meta && <div className="dt-capture-meta">{meta}</div>}
        {extra}
      </div>
    </div>
  );

  return (
    <div className="dt-manage-panel" onClick={onClose}>
      <div className="dt-manage-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span className="dt-grocery-title"><Sparkles size={18} /> {t('capture.title')}</span>
          <button className="dt-icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Not autofocused: opening the sheet shouldn't throw a keyboard over it. Tap the
            field, then the microphone key on the iOS keyboard — that is the voice input. */}
        <div className="dt-capture-input-row">
          <textarea
            ref={inputRef}
            className="dt-input dt-capture-input"
            rows={2}
            placeholder={t('capture.placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <button
            className="dt-capture-send"
            title={t('capture.send')}
            disabled={busy || !text.trim()}
            onClick={submit}
          >
            <ArrowUp size={20} />
          </button>
        </div>
        <div className="dt-hint" style={{ margin: '8px 0 0' }}>{t('capture.dictateHint')}</div>

        {busy && <div className="dt-empty-manage">{t('capture.thinking')}</div>}
        {error && <div className="dt-capture-error">{t(`capture.error.${error}`)}</div>}

        {proposal && !busy && (
          proposal.tasks.length + proposal.groceries.length + proposal.completions.length === 0
          && proposal.unclear.length === 0
            ? <div className="dt-empty-manage">{t('capture.nothing')}</div>
            : (
              <>
                <div className="dt-section-label">{t('capture.proposalTitle')}</div>

                {proposal.tasks.map((task, i) => row(
                  'tasks', i,
                  null,
                  task.name,
                  <>
                    {task.repeat
                      ? <span className="dt-capture-chip"><Repeat size={11} /> {t('capture.repeats')}</span>
                      : <span className="dt-capture-chip">{formatDate(task.date)}</span>}
                    {task.time && <span className="dt-time-badge">{task.time}</span>}
                    <span className="dt-capture-chip">{task.goalName || t('common.others')}</span>
                    {task.carryOver && <CornerDownRight size={11} className="dt-repeat-icon" />}
                    {task.matchedPreset && (
                      <span className="dt-capture-chip matched">{t('capture.matchedPreset')}</span>
                    )}
                  </>,
                  task.suggestedPreset && (
                    // An offer, not a decision — the parse wasn't sure, so this asks.
                    <label className="dt-capture-ask" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!usePreset[i]}
                        onChange={() => setUsePreset((u) => ({ ...u, [i]: !u[i] }))}
                      />
                      {t('capture.didYouMean', { name: task.suggestedPreset.name })}
                    </label>
                  ),
                ))}

                {proposal.groceries.map((name, i) => row(
                  'groceries', i,
                  <ShoppingCart size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />,
                  name,
                  <span className="dt-capture-chip">{t('capture.toGroceries')}</span>,
                ))}

                {proposal.completions.map((c, i) => row(
                  'completions', i,
                  <Check size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />,
                  c.name,
                  <>
                    <span className="dt-capture-chip">{t('capture.tickOff')}</span>
                    <span className="dt-capture-chip">{formatDate(c.dateStr)}</span>
                  </>,
                ))}

                {proposal.unclear.map((phrase, i) => (
                  <div key={`u-${i}`} className="dt-capture-unclear">
                    {t('capture.unclear', { text: phrase })}
                  </div>
                ))}

                <div className="dt-capture-actions">
                  <button className="dt-btn-secondary" onClick={() => { reset(); setText(''); }}>
                    {t('capture.discard')}
                  </button>
                  <button className="dt-btn-primary" disabled={!total} onClick={confirm}>
                    {t('capture.add', { n: total })}
                  </button>
                </div>
              </>
            )
        )}
      </div>
    </div>
  );
}
