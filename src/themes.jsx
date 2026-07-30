import React from 'react';

// ---------------------------------------------------------------------------
// Mascot characters.
//
// These are drawn from scratch as inline SVG rather than pulled from an icon
// pack or an image host. Three reasons: the app stays offline-capable (no extra
// network requests), each character can react to how the day is going, and we
// aren't shipping anyone else's character art into the repo.
//
// Every mascot takes the same props so they're interchangeable:
//   size  — pixel width/height
//   mood  — 'idle' | 'cheer' (everything done) | 'sleepy' (nothing to do)
//   label — accessible name, already translated by the caller. Falls back to the
//           i18n key if omitted, which is wrong but visible rather than silent.
//
// The colours here are deliberately hardcoded rather than themed: the picker
// shows all six characters side by side, so each needs to look like itself
// regardless of which palette is currently active.
// ---------------------------------------------------------------------------

// A four-pointed sparkle, used for the 'cheer' mood.
const starPath = (cx, cy, r) =>
  `M${cx} ${cy - r} L${cx + r * 0.3} ${cy - r * 0.3} L${cx + r} ${cy} L${cx + r * 0.3} ${cy + r * 0.3}` +
  ` L${cx} ${cy + r} L${cx - r * 0.3} ${cy + r * 0.3} L${cx - r} ${cy} L${cx - r * 0.3} ${cy - r * 0.3} Z`;

function Sparkles({ show, color, points = [[7, 19], [56, 15]] }) {
  if (!show) return null;
  return (
    <g fill={color}>
      {points.map(([x, y], i) => (
        <path key={i} d={starPath(x, y, i === 0 ? 5 : 3.4)} opacity={i === 0 ? 0.95 : 0.7} />
      ))}
    </g>
  );
}

function Zzz({ show, color, points = [[49, 22], [56, 15]] }) {
  if (!show) return null;
  return (
    <g fill={color} fontFamily="Inter, system-ui, sans-serif" fontWeight="700" opacity="0.8">
      <text x={points[0][0]} y={points[0][1]} fontSize="10">z</text>
      <text x={points[1][0]} y={points[1][1]} fontSize="7">z</text>
    </g>
  );
}

// Shared eyes. 'idle' is open with a highlight, 'cheer' arcs upward, 'sleepy'
// closes the lids downward — the same three shapes read on every character.
function Eyes({ left, right, y, mood, color, r = 3.2 }) {
  if (mood === 'cheer') {
    return (
      <g stroke={color} strokeWidth="2" strokeLinecap="round" fill="none">
        <path d={`M${left - 3.6} ${y + 1.4} q3.6 -4.4 7.2 0`} />
        <path d={`M${right - 3.6} ${y + 1.4} q3.6 -4.4 7.2 0`} />
      </g>
    );
  }
  if (mood === 'sleepy') {
    return (
      <g stroke={color} strokeWidth="2" strokeLinecap="round" fill="none">
        <path d={`M${left - 3.6} ${y} q3.6 3.6 7.2 0`} />
        <path d={`M${right - 3.6} ${y} q3.6 3.6 7.2 0`} />
      </g>
    );
  }
  return (
    <g fill={color}>
      <circle cx={left} cy={y} r={r} />
      <circle cx={right} cy={y} r={r} />
      <circle cx={left + r * 0.38} cy={y - r * 0.46} r={r * 0.32} fill="#FFFFFF" />
      <circle cx={right + r * 0.38} cy={y - r * 0.46} r={r * 0.32} fill="#FFFFFF" />
    </g>
  );
}

function Mouth({ x, y, mood, color }) {
  if (mood === 'cheer') {
    return <path d={`M${x - 4.2} ${y - 1} q4.2 6.4 8.4 0 Z`} fill={color} />;
  }
  if (mood === 'sleepy') {
    return <path d={`M${x - 2.6} ${y} h5.2`} stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none" />;
  }
  return (
    <path
      d={`M${x - 3.6} ${y - 1} q1.8 2.6 3.6 0 q1.8 2.6 3.6 0`}
      stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none"
    />
  );
}

const svgProps = (size, label) => ({
  width: size, height: size, viewBox: '0 0 64 64', role: 'img', 'aria-label': label,
});

export function MochiMascot({ size = 64, mood = 'idle', label }) {
  return (
    <svg {...svgProps(size, label || 'mascot.mochi.aria')}>
      <ellipse cx="32" cy="56" rx="17" ry="3.6" fill="#000000" opacity="0.06" />
      <path d="M17 25 L15 8 L29 17 Z" fill="#F7C9D6" stroke="#E38FAB" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M47 25 L49 8 L35 17 Z" fill="#F7C9D6" stroke="#E38FAB" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19.5 21 L18.5 13 L26 18 Z" fill="#EE93AF" />
      <path d="M44.5 21 L45.5 13 L38 18 Z" fill="#EE93AF" />
      <circle cx="32" cy="34" r="19" fill="#FDE3EA" stroke="#E38FAB" strokeWidth="1.5" />
      <circle cx="20" cy="38" r="3.6" fill="#F79FBA" opacity="0.65" />
      <circle cx="44" cy="38" r="3.6" fill="#F79FBA" opacity="0.65" />
      <Eyes left={25} right={39} y={32} mood={mood} color="#5B3040" />
      <Mouth x={32} y={40} mood={mood} color="#5B3040" />
      <g stroke="#E38FAB" strokeWidth="1.2" strokeLinecap="round">
        <path d="M11 32 h5.5" />
        <path d="M11 37 l5.5 -1" />
        <path d="M53 32 h-5.5" />
        <path d="M53 37 l-5.5 -1" />
      </g>
      <Sparkles show={mood === 'cheer'} color="#F2789F" />
      <Zzz show={mood === 'sleepy'} color="#C98BA0" />
    </svg>
  );
}

export function SproutMascot({ size = 64, mood = 'idle', label }) {
  return (
    <svg {...svgProps(size, label || 'mascot.sprout.aria')}>
      <ellipse cx="32" cy="57" rx="17" ry="3.6" fill="#000000" opacity="0.06" />
      <path d="M32 13 v-5" stroke="#4E8F45" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M32 10 C32 5 34 2 38 1 C39 6 37 10 32 10 Z" fill="#7CC46A" stroke="#4E8F45" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="32" cy="36" r="18" fill="#A7D89B" stroke="#4E8F45" strokeWidth="1.5" />
      <circle cx="22" cy="21" r="7.5" fill="#A7D89B" stroke="#4E8F45" strokeWidth="1.5" />
      <circle cx="42" cy="21" r="7.5" fill="#A7D89B" stroke="#4E8F45" strokeWidth="1.5" />
      <circle cx="22" cy="21" r="4.8" fill="#FFFFFF" />
      <circle cx="42" cy="21" r="4.8" fill="#FFFFFF" />
      <Eyes left={22} right={42} y={21} mood={mood} color="#23431F" r={2.7} />
      <circle cx="19" cy="40" r="3.2" fill="#F2A0A8" opacity="0.55" />
      <circle cx="45" cy="40" r="3.2" fill="#F2A0A8" opacity="0.55" />
      <Mouth x={32} y={41} mood={mood} color="#23431F" />
      <Sparkles show={mood === 'cheer'} color="#5FAE4E" />
      <Zzz show={mood === 'sleepy'} color="#6C9A62" />
    </svg>
  );
}

export function EmberMascot({ size = 64, mood = 'idle', label }) {
  return (
    <svg {...svgProps(size, label || 'mascot.ember.aria')}>
      <ellipse cx="32" cy="56" rx="16" ry="3.6" fill="#000000" opacity="0.06" />
      <path d="M14 27 L11 6 L27 16 Z" fill="#E8843C" stroke="#B85A21" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M50 27 L53 6 L37 16 Z" fill="#E8843C" stroke="#B85A21" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16.5 22 L15 11 L23.5 17 Z" fill="#7A4526" />
      <path d="M47.5 22 L49 11 L40.5 17 Z" fill="#7A4526" />
      <path d="M32 15 C46 15 52 23 52 32 C52 43 43 52 32 52 C21 52 12 43 12 32 C12 23 18 15 32 15 Z" fill="#F0A05A" stroke="#B85A21" strokeWidth="1.5" />
      <path d="M32 34 C39 34 43 38 43 43 C43 48 38 51.5 32 51.5 C26 51.5 21 48 21 43 C21 38 25 34 32 34 Z" fill="#FFF3E4" />
      <circle cx="17" cy="37" r="3.2" fill="#E8843C" opacity="0.45" />
      <circle cx="47" cy="37" r="3.2" fill="#E8843C" opacity="0.45" />
      <Eyes left={24} right={40} y={30} mood={mood} color="#4A2B18" />
      <path d="M30 39 h4 q1.4 0 0.4 1.6 L32 42.4 L29.6 40.6 Q28.6 39 30 39 Z" fill="#4A2B18" />
      <Mouth x={32} y={46} mood={mood} color="#4A2B18" />
      <Sparkles show={mood === 'cheer'} color="#E8843C" />
      <Zzz show={mood === 'sleepy'} color="#C2793E" />
    </svg>
  );
}

export function PixelMascot({ size = 64, mood = 'idle', label }) {
  return (
    <svg {...svgProps(size, label || 'mascot.pixel.aria')}>
      <ellipse cx="32" cy="56" rx="16" ry="3.6" fill="#000000" opacity="0.06" />
      <path d="M32 13 v-6" stroke="#6D4FD6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="5" r="3.4" fill="#F0A6D6" stroke="#6D4FD6" strokeWidth="1.2" />
      <rect x="6" y="27" width="6" height="12" rx="3" fill="#B9A9EE" stroke="#6D4FD6" strokeWidth="1.2" />
      <rect x="52" y="27" width="6" height="12" rx="3" fill="#B9A9EE" stroke="#6D4FD6" strokeWidth="1.2" />
      <rect x="11" y="13" width="42" height="39" rx="13" fill="#DDD4F7" stroke="#6D4FD6" strokeWidth="1.6" />
      <rect x="17" y="20" width="30" height="20" rx="8" fill="#2C2246" />
      <Eyes left={25} right={39} y={30} mood={mood} color="#8FE3D0" r={3.4} />
      <Mouth x={32} y={46} mood={mood} color="#6D4FD6" />
      <Sparkles show={mood === 'cheer'} color="#8FE3D0" />
      <Zzz show={mood === 'sleepy'} color="#9A8CC9" />
    </svg>
  );
}

export function CloudyMascot({ size = 64, mood = 'idle', label }) {
  return (
    <svg {...svgProps(size, label || 'mascot.cloudy.aria')}>
      <ellipse cx="32" cy="57" rx="16" ry="3.6" fill="#000000" opacity="0.06" />
      <ellipse cx="23" cy="14" rx="5.5" ry="12.5" fill="#DCE9F8" stroke="#7FA3CE" strokeWidth="1.5" />
      <ellipse cx="41" cy="14" rx="5.5" ry="12.5" fill="#DCE9F8" stroke="#7FA3CE" strokeWidth="1.5" />
      <ellipse cx="23" cy="14" rx="2.6" ry="8.4" fill="#BBD3EE" />
      <ellipse cx="41" cy="14" rx="2.6" ry="8.4" fill="#BBD3EE" />
      <circle cx="32" cy="37" r="17" fill="#EDF4FD" stroke="#7FA3CE" strokeWidth="1.5" />
      <circle cx="21" cy="41" r="3.4" fill="#A9C6E8" opacity="0.6" />
      <circle cx="43" cy="41" r="3.4" fill="#A9C6E8" opacity="0.6" />
      <Eyes left={26} right={38} y={35} mood={mood} color="#28405C" />
      <Mouth x={32} y={43} mood={mood} color="#28405C" />
      <path
        d="M47 55 A4 4 0 0 1 47.6 47.2 A5.4 5.4 0 0 1 57.4 48.4 A3.6 3.6 0 0 1 57 55 Z"
        fill="#FFFFFF" stroke="#7FA3CE" strokeWidth="1.2" strokeLinejoin="round"
      />
      <Sparkles show={mood === 'cheer'} color="#7FA3CE" points={[[7, 20], [55, 14]]} />
      <Zzz show={mood === 'sleepy'} color="#8AA7C9" points={[[50, 24], [57, 17]]} />
    </svg>
  );
}

export function LunaMascot({ size = 64, mood = 'idle', label }) {
  return (
    <svg {...svgProps(size, label || 'mascot.luna.aria')}>
      <ellipse cx="32" cy="57" rx="16" ry="3.6" fill="#000000" opacity="0.18" />
      <path d="M56 5 A8 8 0 1 0 56 21 A6 6 0 1 1 56 5 Z" fill="#E4B65C" opacity="0.9" />
      <path d="M18 23 L15 10 L26 17 Z" fill="#5A6A9C" />
      <path d="M46 23 L49 10 L38 17 Z" fill="#5A6A9C" />
      <path d="M32 16 C44 16 51 26 51 37 C51 47 42 54 32 54 C22 54 13 47 13 37 C13 26 20 16 32 16 Z" fill="#3B466E" stroke="#283050" strokeWidth="1.5" />
      <ellipse cx="32" cy="43" rx="11" ry="10" fill="#4C5A88" />
      <circle cx="24" cy="32" r="8.6" fill="#EAE6F5" />
      <circle cx="40" cy="32" r="8.6" fill="#EAE6F5" />
      <Eyes left={24} right={40} y={32} mood={mood} color="#232A45" r={3.8} />
      <path d="M32 37.5 L35.6 42 L32 45 L28.4 42 Z" fill="#E4B65C" />
      <Sparkles show={mood === 'cheer'} color="#E4B65C" points={[[7, 22], [11, 42]]} />
      <Zzz show={mood === 'sleepy'} color="#B9C0DC" points={[[5, 28], [12, 21]]} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Themes.
//
// The authoritative palettes live in theme.css as `[data-theme="<id>"]` blocks —
// they have to be plain CSS so index.html can apply the saved theme before React
// boots and avoid a flash of the wrong colours. What lives here is everything
// JavaScript needs: the character, the three swatches drawn on the picker card,
// and the colours for the iOS status bar.
//
// Display copy is *not* here — nameKey/blurbKey/ariaKey point at entries in
// src/i18n/strings.js so the character names and descriptions translate along
// with the rest of the interface.
// ---------------------------------------------------------------------------

export const THEMES = [
  {
    id: 'sprout',
    nameKey: 'mascot.sprout.name',
    blurbKey: 'mascot.sprout.blurb',
    ariaKey: 'mascot.sprout.aria',
    Mascot: SproutMascot,
    themeColor: '#EDF0EE',
    statusBar: 'default',
    swatches: ['#EDF0EE', '#3F5A44', '#B8862F'],
  },
  {
    id: 'mochi',
    nameKey: 'mascot.mochi.name',
    blurbKey: 'mascot.mochi.blurb',
    ariaKey: 'mascot.mochi.aria',
    Mascot: MochiMascot,
    themeColor: '#FDF2F4',
    statusBar: 'default',
    swatches: ['#FDF2F4', '#E0729A', '#E8943F'],
  },
  {
    id: 'ember',
    nameKey: 'mascot.ember.name',
    blurbKey: 'mascot.ember.blurb',
    ariaKey: 'mascot.ember.aria',
    Mascot: EmberMascot,
    themeColor: '#FBF3EA',
    statusBar: 'default',
    swatches: ['#FBF3EA', '#D2691E', '#C9A227'],
  },
  {
    id: 'pixel',
    nameKey: 'mascot.pixel.name',
    blurbKey: 'mascot.pixel.blurb',
    ariaKey: 'mascot.pixel.aria',
    Mascot: PixelMascot,
    themeColor: '#F4F1FB',
    statusBar: 'default',
    swatches: ['#F4F1FB', '#6D4FD6', '#E08A2E'],
  },
  {
    id: 'cloudy',
    nameKey: 'mascot.cloudy.name',
    blurbKey: 'mascot.cloudy.blurb',
    ariaKey: 'mascot.cloudy.aria',
    Mascot: CloudyMascot,
    themeColor: '#EFF5FC',
    statusBar: 'default',
    swatches: ['#EFF5FC', '#3B76C4', '#DE9A2C'],
  },
  {
    id: 'luna',
    nameKey: 'mascot.luna.name',
    blurbKey: 'mascot.luna.blurb',
    ariaKey: 'mascot.luna.aria',
    Mascot: LunaMascot,
    themeColor: '#171B26',
    statusBar: 'black',
    swatches: ['#171B26', '#6EA8C9', '#E4B65C'],
  },
];

// Sprout carries the original Ledger palette, so an existing user who has never
// picked a theme sees exactly what they saw before.
export const DEFAULT_THEME_ID = 'sprout';

export const THEME_IDS = THEMES.map((t) => t.id);

export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
