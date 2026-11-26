// Colour palettes.
//
// The authoritative palettes live in theme.css as `[data-theme="<id>"]` blocks — they
// have to be plain CSS so index.html can apply the saved theme before React boots and
// avoid a flash of the wrong colours. What lives here is only what JavaScript needs:
// per palette the iOS status-bar colours, which are meta tags rather than CSS.
//
// This file used to also hold six SVG mascots, each welded to a palette. The hatchery
// replaced choosing a character with earning one, so the characters moved to
// src/pixels.js as pixel art and the coupling is gone for good.
//
// Display copy is *not* here — nameKey points at src/i18n/strings.js so names
// translate with the rest of the interface.

export const COLOR_THEMES = [
  { id: 'rose-pine-dawn', nameKey: 'theme.rosePineDawn', themeColor: '#FAF4ED', statusBar: 'default' },
  { id: 'wa-iro',         nameKey: 'theme.waIro',        themeColor: '#F3EEE1', statusBar: 'default' },
  { id: 'dracula',        nameKey: 'theme.dracula',      themeColor: '#282A36', statusBar: 'black'   },
  { id: 'swiss',          nameKey: 'theme.swiss',        themeColor: '#FFFFFF', statusBar: 'default' },
];

export const THEME_IDS = COLOR_THEMES.map((th) => th.id);

// Anyone whose saved value is one of the six mascot-coupled themes this replaced
// fails isValid and lands here instead.
export const DEFAULT_THEME_ID = 'rose-pine-dawn';

export const getColorTheme = (id) => COLOR_THEMES.find((th) => th.id === id) || COLOR_THEMES[0];
