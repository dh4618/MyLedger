import React from 'react';
import { X, Star, Sparkles } from 'lucide-react';
import { useLang } from './i18n/LanguageProvider';
import Pixel from './Pixel';
import { spriteFor, MYSTERY_EGG } from './pixels';
import { stars, collection, activeEntry, liveProgress, nextStage, stageOf, album, isPinned, residents, seedAt, EGG_PRICE } from './game';

// Where completed tasks turn into something. Tasks earn stars, stars buy an egg, the
// egg reveals one of four creatures, and you raise it by carrying on with your day.
//
// The panel only ever reads the task log. Nothing in here can tick a task, which is
// what keeps the report and the streak honest while this sits on top of them.
export default function HatcheryPanel({ game, total, onBuy, onOpen, onStart, onStop, onPin, onUnpin, onClose }) {
  const { t } = useLang();
  const { balance } = stars(game, total);
  const active = activeEntry(game);
  const rows = collection(game, total);
  const pictures = album(game, total);
  const living = residents(game, total);
  const canBuy = balance >= EGG_PRICE;

  const activeLive = active ? liveProgress(active, game, total) : 0;
  const step = active ? nextStage(activeLive) : null;

  const creatureName = (species) => t(`species.${species}`);
  const stageName = (stage) => t(`stage.${stage}`);

  return (
    <div className="dt-manage-panel" onClick={onClose}>
      <div className="dt-manage-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          {t('game.title')}
          <button className="dt-icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* ---- the room ---- */}
        <div className="dt-habitat">
          {living.length === 0 ? (
            <div className="dt-habitat-empty">{t('game.habitatEmpty')}</div>
          ) : living.map((who) => {
            // Everything positional comes off the id-derived seed, so a creature keeps
            // its spot and its gait between renders instead of teleporting on every
            // repaint. Eggs get a spot but no walk — eggs don't walk.
            const left = 6 + (seedAt(who.seed, 1) % 76);
            const top = 10 + (seedAt(who.seed, 2) % 58);
            const duration = 7 + (seedAt(who.seed, 3) % 9);
            const delay = -(seedAt(who.seed, 4) % 11);
            const drift = 10 + (seedAt(who.seed, 5) % 16);
            return (
              <div
                key={who.id}
                className={`dt-resident ${who.walks ? 'walks' : ''} ${who.isActive ? 'active' : ''}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  '--drift': `${drift}%`,
                  animationDuration: `${duration}s`,
                  animationDelay: `${delay}s`,
                }}
                title={`${creatureName(who.species)} · ${stageName(who.stage)}`}
              >
                <Pixel sprite={spriteFor(who.species, who.stage)} size={44} label={creatureName(who.species)} />
              </div>
            );
          })}
        </div>

        <div className="dt-stars">
          <Star size={18} />
          <span className="dt-stars-count">{balance}</span>
          <span className="dt-stars-label">{t('game.starsLabel')}</span>
        </div>
        <div className="dt-hint" style={{ marginTop: 0 }}>{t('game.starsHint')}</div>

        {/* ---- the slot ---- */}
        <div className="dt-field-label" style={{ marginTop: 20 }}>{t('game.raising')}</div>
        {active ? (
          <div className="dt-raise-card">
            <Pixel sprite={spriteFor(active.species, stageOf(activeLive))} size={72} label={creatureName(active.species)} />
            <div className="dt-raise-body">
              <div className="dt-raise-name">{creatureName(active.species)}</div>
              <div className="dt-raise-stage">{stageName(stageOf(activeLive))}</div>
              {step ? (
                <>
                  <div className="dt-raise-track">
                    <div className="dt-raise-fill" style={{ width: `${Math.round((step.done / step.need) * 100)}%` }} />
                  </div>
                  <div className="dt-raise-meta">
                    {t('game.toNext', { done: step.done, need: step.need, stage: stageName(step.into) })}
                  </div>
                </>
              ) : (
                <div className="dt-raise-meta">{t('game.fullyGrown')}</div>
              )}
              <button className="dt-preset-btn" style={{ marginTop: 8 }} onClick={onStop}>{t('game.putDown')}</button>
            </div>
          </div>
        ) : (
          <div className="dt-empty-manage" style={{ padding: '10px 0' }}>{t('game.nothingRaising')}</div>
        )}

        {/* ---- the store ---- */}
        <div className="dt-field-label" style={{ marginTop: 20 }}>{t('game.store')}</div>
        <div className="dt-shop-card">
          <Pixel sprite={MYSTERY_EGG} size={56} label={t('game.mysteryEgg')} className="dt-mystery" />
          <div className="dt-shop-body">
            <div className="dt-raise-name">{t('game.mysteryEgg')}</div>
            <div className="dt-raise-meta">{t('game.mysteryEggHint')}</div>
          </div>
          <button className="dt-buy-btn" disabled={!canBuy} onClick={onBuy}>
            <Star size={13} /> {EGG_PRICE}
          </button>
        </div>
        {!canBuy && (
          <div className="dt-hint" style={{ marginTop: 6 }}>
            {t('game.needMore', { n: EGG_PRICE - balance })}
          </div>
        )}

        {/* ---- what you own ---- */}
        <div className="dt-field-label" style={{ marginTop: 20 }}>{t('game.collection')}</div>
        {rows.length === 0 && <div className="dt-empty-manage" style={{ padding: '10px 0' }}>{t('game.collectionEmpty')}</div>}
        <div className="dt-collection">
          {rows.map((row) => {
            const unopened = !row.species;
            const isActive = game.activeId === row.id;
            const grown = !unopened && !nextStage(row.live);
            return (
              <div key={row.id} className={`dt-creature-card ${isActive ? 'active' : ''}`}>
                <Pixel
                  sprite={unopened ? MYSTERY_EGG : spriteFor(row.species, row.stage)}
                  size={54}
                  label={unopened ? t('game.mysteryEgg') : creatureName(row.species)}
                />
                <div className="dt-creature-name">
                  {unopened ? t('game.unopened') : creatureName(row.species)}
                </div>
                <div className="dt-creature-stage">
                  {unopened ? '···' : stageName(row.stage)}
                </div>
                {unopened ? (
                  <button className="dt-preset-btn" onClick={() => onOpen(row.id)}>
                    <Sparkles size={13} /> {t('game.open')}
                  </button>
                ) : isActive ? (
                  <div className="dt-creature-flag">{t('game.raisingNow')}</div>
                ) : grown ? (
                  <div className="dt-creature-flag done">{t('game.fullyGrown')}</div>
                ) : (
                  <button
                    className="dt-preset-btn"
                    /* One at a time: while anything is in the slot, nothing else may
                       enter it — which is also why this says why it's disabled. */
                    disabled={!!game.activeId}
                    title={game.activeId ? t('game.slotBusy') : undefined}
                    onClick={() => onStart(row.id)}
                  >{t('game.raise')}</button>
                )}
              </div>
            );
          })}
        </div>

        {/* ---- the album ---- */}
        <div className="dt-field-label" style={{ marginTop: 20 }}>{t('game.album')}</div>
        {pictures.length === 0 ? (
          <div className="dt-empty-manage" style={{ padding: '10px 0' }}>{t('game.albumEmpty')}</div>
        ) : (
          <>
            {/* Says which of the two modes the icon is in, so "nothing is ringed" reads
                as "following your pet" rather than as nothing having been set. */}
            <div className="dt-hint" style={{ marginTop: 0 }}>
              {game.icon ? t('game.pinHint') : t('game.following')}
            </div>
            {pictures.map((row) => (
              <div key={row.species} className="dt-album-row">
                <div className="dt-album-species">{creatureName(row.species)}</div>
                <div className="dt-album-stages">
                  {row.stages.map((stage) => {
                    const pinned = isPinned(game, row.species, stage);
                    return (
                      <button
                        key={stage}
                        className={`dt-album-shot ${pinned ? 'pinned' : ''}`}
                        aria-pressed={pinned}
                        title={`${creatureName(row.species)} · ${stageName(stage)}`}
                        onClick={() => (pinned ? onUnpin() : onPin(row.species, stage))}
                      >
                        <Pixel sprite={spriteFor(row.species, stage)} size={40} />
                        <span className="dt-album-stage">{stageName(stage)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
