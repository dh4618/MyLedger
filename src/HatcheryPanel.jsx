import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useLang } from './i18n/LanguageProvider';
import Pixel from './Pixel';
import { spriteFor, hasAltFrame, MYSTERY_EGG, PIXEL_STAR_SMALL, PIXEL_NEST, PIXEL_BALL } from './pixels';
import { stars, collection, activeEntry, progressOf, nextStage, stageOf, album, isPinned, residents, knownSpecies, seedAt, seedFromId, FEED_COST } from './game';

// The room has two halves, and which half a resident stands in is the point of them:
// eggs wait in the nest, hatched creatures play on the mat. Both the art and the
// residents are positioned from this one table — the nest is drawn where eggs stand
// because they read the same numbers, not because two sets of percentages were kept
// in step by hand. The halves are not labelled and nothing is drawn between them:
// where the nest and the mat are says it, and a caption on each would be the app
// explaining its own furniture.
//
// Residents are drawn on the whole 24x24 canvas rather than cropped to their art, so
// a kid is visibly smaller than an adult and the two frames of a blink line up. The
// box is always square and the art always sits on its bottom edge, which is what makes
// "feet on the floor" one number for every shape.
const RESIDENT_PX = 56;
// `left`/`width` and `top`/`band` are percentages of the room. The box is 56px, about
// 16% of the room's width, so the horizontal budget is the zone's width less that:
// otherwise a resident at the end of its band stands half in the other zone.
const SPRITE_PCT = 16;
// The vertical bands are chosen against the room's own furniture: an egg's base lands
// inside the nest's rim, and a creature's feet land on the mat rather than floating
// above the skirting. Both are set in theme.css off the same --floor-y.
const ZONES = {
  hatch: { left: 8, width: 22, top: 38, band: 3 },
  play: { left: 38, width: 58, top: 32, band: 30 },
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

// A creature and its second frame, stacked, blinking on its own rhythm.
//
// The second frame sits exactly over the first and is uncovered for a sixth of a
// second every few seconds. It can simply be revealed rather than cross-faded because
// the pair share a canvas and differ only in the eyes, so the top one covers the
// bottom one wherever it is drawn at all — which also means one animation is involved
// and there are no two timelines to drift apart. An egg has no eyes: its second frame
// is the whole shape nudged a pixel, so the same machinery wobbles it.
//
// `fit` is canvas here and not negotiable. Cropping to the drawn pixels would scale
// the two frames differently — an egg's wobble frame has a different bounding box by
// exactly the pixel it was nudged — and faithfully undo the wobble.
function Pet({ sprite, size, label, seed, className = '' }) {
  return (
    <div
      className={`dt-pet-frames ${className}`}
      style={{
        // Tenths of a second, not whole ones: six possible periods and seven possible
        // offsets is 42 combinations, and three creatures found a collision on the
        // first try.
        '--blink-dur': `${4 + (seedAt(seed, 6) % 41) / 10}s`,
        '--blink-delay': `-${(seedAt(seed, 7) % 80) / 10}s`,
      }}
    >
      <Pixel sprite={sprite} size={size} fit="canvas" label={label} />
      {hasAltFrame(sprite) && (
        <Pixel sprite={sprite} frame="alt" size={size} fit="canvas" className="dt-blink-frame" />
      )}
    </div>
  );
}

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
export default function HatcheryPanel({ game, total, onOpen, onSelect, onFeed, onPin, onUnpin }) {
  const { t } = useLang();
  const { balance } = stars(game, total);
  const active = activeEntry(game);
  const rows = useMemo(() => collection(game), [game]);
  const pictures = album(game);
  const living = residents(game);
  // Which egg is which in the row: a map rather than an indexOf per egg, so adding a
  // tenth egg doesn't quietly make this quadratic.
  const eggIndex = new Map(living.filter((w) => !w.walks).map((w, i) => [w.id, i]));

  const activeProgress = progressOf(active);
  const step = active ? nextStage(activeProgress) : null;
  const activeStage = active ? stageOf(activeProgress) : null;
  const canFeed = !!active && !!step && balance >= FEED_COST;

  // Every name in the panel comes through here, which is what makes "you don't know
  // what it is until it hatches" one rule rather than six places to keep in step.
  const known = knownSpecies(game);
  const creatureName = (species) => (known.has(species) ? t(`species.${species}`) : t('game.unknownName'));
  const stageName = (stage) => t(`stage.${stage}`);

  // ---- ta-da ----
  // Watches every owned entry's stage, not just the one in the slot: reaching adult
  // releases the slot in the same update that changes the stage, so anything hanging
  // off `active` would miss the last and best transition of the four.
  const [tada, setTada] = useState(null);
  const stages = useMemo(() => new Map(rows.map((r) => [r.id, r.stage])), [rows]);
  const seen = useRef(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = stages;
    // Nothing on the first pass: opening the panel is not a transition.
    if (!before) return;
    for (const [id, stage] of stages) {
      if (before.has(id) && before.get(id) !== stage) {
        const row = rows.find((r) => r.id === id);
        setTada({ id, species: row.species, stage });
        return;
      }
    }
  }, [stages, rows]);
  // Long enough to read the name, short enough not to need dismissing — though a tap
  // closes it, because anything covering the screen should.
  useEffect(() => {
    if (!tada) return undefined;
    const handle = setTimeout(() => setTada(null), 2200);
    return () => clearTimeout(handle);
  }, [tada]);

  return (
    /* A tab's page, not a sheet pulled up over the day. No title row and no close
       button: the tab bar says where you are, and there is nothing to close. */
    <div className="dt-page">
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
        <div className="dt-room-mat" aria-hidden="true" />
        <div className="dt-room-nest" aria-hidden="true">
          <Pixel sprite={PIXEL_NEST} size={80} />
        </div>
        <div className="dt-room-ball" aria-hidden="true">
          <Pixel sprite={PIXEL_BALL} size={18} />
        </div>

        {living.length === 0 ? (
          <div className="dt-habitat-empty">{t('game.habitatEmpty')}</div>
        ) : living.map((who) => {
          // A creature's spot and gait come off its id-derived seed, so it keeps both
          // between renders instead of teleporting on every repaint. Eggs get a place
          // in the nest and no walk — eggs don't walk.
          const { left, top } = who.walks
            ? scatter(ZONES.play, who.seed)
            : inNest(ZONES.hatch, who.seed, eggIndex.get(who.id), eggIndex.size);
          const sprite = spriteFor(who.species, who.stage);
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
                // Painter's order: whoever is standing further down the room is
                // nearer, so they overlap the ones behind. Two creatures sharing a
                // patch of mat then read as one in front of the other rather than
                // as a drawing order nobody chose.
                zIndex: Math.round(top),
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
                <Pet sprite={sprite} size={RESIDENT_PX} seed={who.seed} label={creatureName(who.species)} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- the slot ---- */}
      <div className="dt-field-label" style={{ marginTop: 18 }}>{t('game.raising')}</div>
      {active ? (
        <div className="dt-raise-card">
          {/* The one you are raising blinks too — it is the pet you are looking at
              while you feed it. Canvas-fit, like the room, so it is a touch larger
              a number than the 72 a cropped sprite used to be given, so an egg still fills the slot. */}
          <Pet
            sprite={spriteFor(active.species, activeStage)}
            size={104}
            seed={seedFromId(active.id)}
            label={creatureName(active.species)}
          />
          <div className="dt-raise-body">
            <div className="dt-raise-name">{creatureName(active.species)}</div>
            <div className="dt-raise-stage">{stageName(activeStage)}</div>
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
            {/* Feeding is the only button here. Raise and Put down used to flank it
                — tapping a pet in the collection is both of those now, so the slot
                is simply whichever one you picked. Disabled for exactly the reasons
                feed() refuses, and absent entirely once there is nothing to grow. */}
            {step && (
              <div className="dt-raise-actions">
                <button className="dt-feed-btn" disabled={!canFeed} onClick={onFeed}>
                  {/* An egg is not fed, it is hatched. Same star, same step of
                      progress, different word for the one stage where feeding is
                      the wrong verb. */}
                  {t(activeStage === 'egg' ? 'game.hatch' : 'game.feed')}
                  {' '}<Pixel sprite={PIXEL_STAR_SMALL} size={14} /> {FEED_COST}
                </button>
              </div>
            )}
            {step && !canFeed && (
              <div className="dt-raise-meta">{t('game.needMore', { n: FEED_COST - balance })}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="dt-empty-manage" style={{ padding: '10px 0' }}>{t('game.nothingRaising')}</div>
      )}

      {/* ---- what you own ---- */}
      <div className="dt-field-label" style={{ marginTop: 20 }}>{t('game.collection')}</div>
      {rows.length === 0
        ? <div className="dt-empty-manage" style={{ padding: '10px 0' }}>{t('game.collectionEmpty')}</div>
        /* The Raise button used to say what a card was for. Tapping one does not, so
           this does. */
        : <div className="dt-hint" style={{ marginTop: 0, marginBottom: 8 }}>{t('game.collectionHint')}</div>}
      <div className="dt-collection">
        {rows.map((row) => {
          const unopened = !row.species;
          const isActive = game.activeId === row.id;
          const grown = !unopened && !nextStage(row.progress);
          const body = (
            <>
              {/* Canvas-fit, so every picture is the same square and every creature
                  stands on its bottom edge — a row of them lines up instead of each
                  being blown up to fill a box of its own shape. It also puts the
                  stages at their true relative sizes, which is the same reason the
                  room uses it: an egg is small and an adult is not.

                  The name used to sit under here. The picture says which animal it
                  is, and a word under every one of a dozen cards was the noisiest
                  thing in the grid. */}
              <Pixel
                sprite={unopened ? MYSTERY_EGG : spriteFor(row.species, row.stage)}
                size={60}
                fit="canvas"
                label={unopened ? t('game.mysteryEgg') : creatureName(row.species)}
              />
              <div className="dt-creature-stage">
                {unopened ? t('game.unopened') : stageName(row.stage)}
              </div>
            </>
          );
          // An unopened egg stays a plain card, because it holds the Open button and
          // a button inside a button is not a thing. Everything else *is* the button:
          // tapping a pet puts it on show, which is all choosing one means now.
          if (unopened) {
            return (
              <div key={row.id} className="dt-creature-card">
                {body}
                <button className="dt-preset-btn" onClick={() => onOpen(row.id)}>
                  <Sparkles size={13} /> {t('game.open')}
                </button>
              </div>
            );
          }
          return (
            <button
              key={row.id}
              type="button"
              className={`dt-creature-card ${isActive ? 'active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onSelect(row.id)}
            >
              {body}
              {/* No "raising now" here: the pet that is selected is the one shown
                  under Raising, and saying it twice makes the grid noisier without
                  saying anything the ring does not. "Fully grown" stays, because it
                  is about the creature rather than about which one you picked. */}
              {grown && <div className="dt-creature-flag done">{t('game.fullyGrown')}</div>}
            </button>
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

    {/* ---- ta-da ----
        Over the whole panel rather than inside the card, because a stage change is
        the thing the stars were for and it deserves the screen for two seconds. The
        sprite is the new one, so hatching reveals both the animal and its name here
        — which is the first time either has been shown. */}
    {tada && (
      <div className="dt-tada" onClick={(e) => { e.stopPropagation(); setTada(null); }} role="status">
        <div className="dt-tada-card">
          <div className="dt-tada-burst" aria-hidden="true">
            {/* Eight sparks on the compass points, flung out and gone. Plain divs:
                a spark is one square, and a sprite for that would be a sprite of a
                square. */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <span key={i} className="dt-tada-spark" style={{ '--angle': `${i * 45}deg` }} />
            ))}
            <Pixel sprite={spriteFor(tada.species, tada.stage)} size={96} label={creatureName(tada.species)} />
          </div>
          <div className="dt-tada-word">{t('game.tada')}</div>
          <div className="dt-tada-name">{creatureName(tada.species)}</div>
          <div className="dt-tada-stage">{stageName(tada.stage)}</div>
        </div>
      </div>
    )}
    </div>
  );
}
