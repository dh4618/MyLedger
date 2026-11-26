import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { useLang } from './i18n/LanguageProvider';
import Pixel from './Pixel';
import { spriteFor, MYSTERY_EGG, PIXEL_STAR, PIXEL_STAR_SMALL, PIXEL_NEST, PIXEL_BALL } from './pixels';
import { stars, collection, activeEntry, liveProgress, nextStage, stageOf, album, isPinned, residents, knownSpecies, seedAt, EGG_PRICE } from './game';

// The room has two halves, and which half a resident stands in is the point of them:
// eggs wait in the nest, hatched creatures play on the mat. Both the art and the
// residents are positioned from this one table — the nest is drawn where eggs stand
// because they read the same numbers, not because two sets of percentages were kept
// in step by hand.
//
// `left`/`width` and `top`/`band` are percentages of the room. A sprite is 44px, about
// 14% of the room's width, so the horizontal budget is the zone's width less that:
// otherwise a resident at the end of its band stands half in the other zone.
const SPRITE_PCT = 14;
// The vertical bands are chosen against the room's own furniture: an egg's base lands
// inside the nest's rim, and a creature's feet land on the mat rather than floating
// above the skirting. Both are set in theme.css off the same --floor-y.
const ZONES = {
  hatch: { left: 8, width: 22, top: 44, band: 3 },
  play: { left: 38, width: 58, top: 36, band: 34 },
};

// `left` is the middle of a resident, not its left edge — the sprites are between 12
// and 21 pixels wide, so a shared left edge put a tall thin egg and a wide cat in
// visibly different places. .dt-resident pulls itself back by half its width.

// Creatures get a seeded spot: they wander anyway, and a scattered group reads as a
// room rather than a shelf. The right of the band is pulled in by half a sprite so
// nobody ends up half outside the zone.
const scatter = (zone, seed) => ({
  left: zone.left + (SPRITE_PCT / 2) + (seedAt(seed, 1) % Math.max(1, Math.round(zone.width - SPRITE_PCT))),
  top: zone.top + (seedAt(seed, 2) % Math.max(1, zone.band)),
});

// Eggs are laid out instead of scattered: evenly across the nest, in collection order.
// Seeded spots piled two eggs on top of each other often enough to look like a bug,
// and eggs in a nest sit in a row in any case. The y still jitters a pixel or two so
// the row isn't ruled.
const inNest = (zone, seed, index, count) => ({
  left: zone.left + (zone.width * (index + 0.5)) / Math.max(1, count),
  top: zone.top + (seedAt(seed, 2) % Math.max(1, zone.band)),
});

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
  // Which egg is which in the row: a map rather than an indexOf per egg, so adding a
  // tenth egg doesn't quietly make this quadratic.
  const eggIndex = new Map(living.filter((w) => !w.walks).map((w, i) => [w.id, i]));
  const canBuy = balance >= EGG_PRICE;

  const activeLive = active ? liveProgress(active, game, total) : 0;
  const step = active ? nextStage(activeLive) : null;
  const activeStage = active ? stageOf(activeLive) : null;

  // Every name in the panel comes through here, which is what makes "you don't know
  // what it is until it hatches" one rule rather than six places to keep in step.
  const known = knownSpecies(game, total);
  const creatureName = (species) => (known.has(species) ? t(`species.${species}`) : t('game.unknownName'));
  const stageName = (stage) => t(`stage.${stage}`);

  return (
    <div className="dt-manage-panel" onClick={onClose}>
      <div className="dt-manage-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          {t('game.title')}
          <button className="dt-icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* ---- the room ---- */}
        {/* The zone table is handed to CSS as custom properties rather than written out
            a second time in the stylesheet, so the nest cannot drift away from the eggs
            standing in it. */}
        <div
          className="dt-habitat"
          style={{
            '--hatch-left': `${ZONES.hatch.left}%`,
            '--hatch-width': `${ZONES.hatch.width}%`,
            '--play-left': `${ZONES.play.left}%`,
            '--play-width': `${ZONES.play.width}%`,
          }}
        >
          {/* Scenery. All of it decoration: it carries no state, nothing can be tapped,
              and it is hidden from assistive tech — the residents below are the content.
              Wall, rail and floor are CSS because flat bands and a checker are cheaper
              as hard-stop gradients than as sprite rows; the nest and the ball are
              sprites because shapes aren't. */}
          <div className="dt-room-wall" aria-hidden="true" />
          <div className="dt-room-rail" aria-hidden="true" />
          <div className="dt-room-floor" aria-hidden="true" />
          <div className="dt-room-divider" aria-hidden="true" />
          <div className="dt-room-mat" aria-hidden="true" />
          <div className="dt-room-nest" aria-hidden="true">
            <Pixel sprite={PIXEL_NEST} size={80} />
          </div>
          <div className="dt-room-ball" aria-hidden="true">
            <Pixel sprite={PIXEL_BALL} size={18} />
          </div>
          <div className="dt-zone-label hatch" aria-hidden="true">{t('game.zoneHatch')}</div>
          <div className="dt-zone-label play" aria-hidden="true">{t('game.zonePlay')}</div>

          {living.length === 0 ? (
            <div className="dt-habitat-empty">{t('game.habitatEmpty')}</div>
          ) : living.map((who) => {
            // A creature's spot and gait come off its id-derived seed, so it keeps both
            // between renders instead of teleporting on every repaint. Eggs get a place
            // in the nest and no walk — eggs don't walk.
            const { left, top } = who.walks
              ? scatter(ZONES.play, who.seed)
              : inNest(ZONES.hatch, who.seed, eggIndex.get(who.id), eggIndex.size);
            const duration = 7 + (seedAt(who.seed, 3) % 9);
            const delay = -(seedAt(who.seed, 4) % 11);
            const drift = 18 + (seedAt(who.seed, 5) % 20);
            return (
              <div
                key={who.id}
                className={`dt-resident ${who.walks ? 'walks' : ''} ${who.isActive ? 'active' : ''}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  '--drift': `${drift}%`,
                  '--walk-dur': `${duration}s`,
                  '--walk-delay': `${delay}s`,
                }}
                title={`${creatureName(who.species)} · ${stageName(who.stage)}`}
              >
                {/* The wander is on the inner element so the outer can keep the
                    half-width offset that centres the sprite on its spot — one
                    transform cannot do both. */}
                <div className="dt-resident-body">
                  <Pixel sprite={spriteFor(who.species, who.stage)} size={44} label={creatureName(who.species)} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="dt-stars">
          <Pixel sprite={PIXEL_STAR} size={18} />
          <span className="dt-stars-count">{balance}</span>
          <span className="dt-stars-label">{t('game.starsLabel')}</span>
        </div>
        <div className="dt-hint" style={{ marginTop: 0 }}>{t('game.starsHint')}</div>

        {/* ---- the slot ---- */}
        <div className="dt-field-label" style={{ marginTop: 20 }}>{t('game.raising')}</div>
        {active ? (
          <div className="dt-raise-card">
            <Pixel sprite={spriteFor(active.species, activeStage)} size={72} label={creatureName(active.species)} />
            <div className="dt-raise-body">
              <div className="dt-raise-name">{creatureName(active.species)}</div>
              <div className="dt-raise-stage">{stageName(activeStage)}</div>
              {/* Says why the name is withheld, so ??? reads as a surprise being kept
                  rather than as something the app failed to load. */}
              {activeStage === 'egg' && <div className="dt-raise-hint">{t('game.unknownHint')}</div>}
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
            <Pixel sprite={PIXEL_STAR_SMALL} size={14} /> {EGG_PRICE}
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
