import React from 'react';
import { PIXEL_ALPHABET } from './pixels';

// Draws a sprite from src/pixels.js as SVG rects.
//
// Runs of the same colour collapse into one rect, which takes a 24x24 sprite from
// ~576 nodes to a few dozen. crispEdges keeps the pixels square at any size — without
// it the browser smooths the rect edges and the art goes soft when scaled up.
//
// A creature's palette is used verbatim, deliberately: these are drawn artwork and
// recolouring them per theme would wreck them. They are legible on every palette
// because each carries its own outline.
//
// The app's own furniture — the star, the nest, the ball — is the other way round, and
// its palettes are CSS: `currentColor`, `var(--accent)`, `color-mix(...)`. Those have
// to go through the style attribute. A presentation attribute is parsed as a CSS value
// in theory, and var() in `fill="..."` does work in current browsers, but it is thinly
// supported and silently paints black where it doesn't — on an inline style it simply
// works everywhere. Hex stays an attribute, which is every creature sprite and the bulk
// of the rects.
const isCss = (paint) => typeof paint === 'string' && paint.includes('(');

// The drawn pixels, ignoring any transparent margin. Cheap next to building the rects,
// which already walks every cell.
function contentBox(rows, w, h) {
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === '.') continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  });
  if (x1 < 0) return { x: 0, y: 0, w, h };     // nothing drawn
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export default function Pixel({ sprite, size = 48, label, className = '', frame = 'rows', fit = 'content' }) {
  if (!sprite) return null;
  const { w, h, palette } = sprite;
  // The second frame indexes the same palette on the same canvas, so drawing it is
  // the same work against a different set of rows. Anything without one — the star,
  // the nest, the ball — falls back to its only frame.
  const rows = (frame === 'alt' && sprite.alt) || sprite.rows;

  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x += 1; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run += 1;
      const paint = palette[PIXEL_ALPHABET.indexOf(ch)];
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={run}
          height={1}
          {...(isCss(paint) ? { style: { fill: paint } } : { fill: paint })}
        />
      );
      x += run;
    }
  });

  // Two ways to fill `size`, and the difference is the empty margin around the art.
  //
  // `content` (the default) crops to the drawn pixels and scales those to fit, so a
  // picture fills the slot it is given — which is what a header icon, a shop row or
  // an album thumbnail want, and what every sprite did implicitly back when they were
  // stored pre-trimmed at sixteen different sizes.
  //
  // `canvas` keeps the whole 24x24 frame. The room needs it for two reasons: the
  // stages then sit at their true relative sizes, a kid smaller than an adult rather
  // than every creature blown up to the same box; and an egg's wobble frame is the
  // same art moved a pixel, which cropping to the content would faithfully undo.
  const box = fit === 'canvas' ? { x: 0, y: 0, w, h } : contentBox(rows, w, h);
  const scale = size / Math.max(box.w, box.h);
  return (
    <svg
      className={`dt-pixel ${className}`}
      width={box.w * scale}
      height={box.h * scale}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      {rects}
    </svg>
  );
}
