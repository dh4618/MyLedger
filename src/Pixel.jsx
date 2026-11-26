import React from 'react';
import { PIXEL_ALPHABET } from './pixels';

// Draws a sprite from src/pixels.js as SVG rects.
//
// Runs of the same colour collapse into one rect, which takes a 24x24 sprite from
// ~576 nodes to a few dozen. crispEdges keeps the pixels square at any size — without
// it the browser smooths the rect edges and the art goes soft when scaled up.
//
// The sprite's own palette is used verbatim, deliberately: these are drawn artwork
// and recolouring them per theme would wreck them. They are legible on every palette
// because each carries its own outline.
export default function Pixel({ sprite, size = 48, label, className = '' }) {
  if (!sprite) return null;
  const { w, h, palette, rows } = sprite;

  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') { x += 1; continue; }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run += 1;
      rects.push(
        <rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={palette[PIXEL_ALPHABET.indexOf(ch)]} />
      );
      x += run;
    }
  });

  // Scaled by the taller axis so sprites of different shapes sit at a consistent
  // visual weight rather than the wide ones dwarfing the tall ones.
  const scale = size / Math.max(w, h);
  return (
    <svg
      className={`dt-pixel ${className}`}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      {rects}
    </svg>
  );
}
