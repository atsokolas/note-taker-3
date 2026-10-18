/*
 * Every concrete theme Noeis can wear, in the order the theme menu lists them.
 *
 * The palettes themselves live in styles/semantic-theme.css, the one palette
 * authority. This list names each theme, says whether it is light or dark, and
 * carries the four colours its swatch shows (accent, ink, danger, rule on its
 * paper), the same reading of a theme Strata's menu gives.
 *
 * family 'editorial' themes are Noeis's warm paper and its dark twin; every
 * other theme is a 'palette' and shares one set of structural rules in the CSS.
 * The community palettes are the published upstream values of each theme, as
 * collected by Tinted Theming (MIT) and shown on stratafiles.io.
 */
const theme = (id, label, scheme, family, origin, [paper, accent, ink, danger, rule]) => Object.freeze({
  id,
  label,
  scheme,
  family,
  origin,
  swatch: Object.freeze({ paper, accent, ink, danger, rule })
});

export const THEME_CATALOG = Object.freeze([
  theme('light', 'Light', 'light', 'editorial', 'noeis', ['#fffdf8', '#8b5f1d', '#332f29', '#9b5a46', '#d1cdc4']),
  theme('dark', 'Dark', 'dark', 'editorial', 'noeis', ['#211e17', '#e0b971', '#f1eadc', '#c78978', '#564f3f']),
  theme('tokyo-midnight', 'Tokyo Midnight', 'dark', 'palette', 'noeis', ['#0e1829', '#e0b07a', '#f3e9ed', '#ff9b92', '#66758d']),
  theme('tokyo-night', 'Tokyo Night', 'dark', 'palette', 'community', ['#1a1b26', '#7aa2f7', '#c0caf5', '#f7768e', '#3b4261']),
  theme('catppuccin', 'Catppuccin', 'dark', 'palette', 'community', ['#1e1e2e', '#f5c2e7', '#cdd6f4', '#f38ba8', '#45475a']),
  theme('dracula', 'Dracula', 'dark', 'palette', 'community', ['#282a36', '#bd93f9', '#f8f8f2', '#ff5555', '#44475a']),
  theme('nord', 'Nord', 'dark', 'palette', 'community', ['#2e3440', '#81a1c1', '#e5e9f0', '#bf616a', '#434c5e']),
  theme('gruvbox-dark', 'Gruvbox Dark', 'dark', 'palette', 'community', ['#1d2021', '#83a598', '#d5c4a1', '#fb4934', '#504945']),
  theme('rose-pine', 'Rosé Pine', 'dark', 'palette', 'community', ['#191724', '#ebbcba', '#e0def4', '#eb6f92', '#403d52']),
  theme('everforest', 'Everforest', 'dark', 'palette', 'community', ['#2d353b', '#a7c080', '#d3c6aa', '#e67e80', '#475258']),
  theme('monokai', 'Monokai', 'dark', 'palette', 'community', ['#272822', '#66d9ef', '#f8f8f2', '#f92672', '#49483e']),
  theme('solarized-dark', 'Solarized Dark', 'dark', 'palette', 'community', ['#002b36', '#268bd2', '#839496', '#dc322f', '#586e75']),
  theme('solarized-light', 'Solarized Light', 'light', 'palette', 'community', ['#fdf6e3', '#268bd2', '#586e75', '#dc322f', '#93a1a1']),
  /* The desktop's own colours, so its swatch reads them too. */
  theme('omarchy', 'Omarchy', 'dark', 'palette', 'omarchy', [
    'var(--omarchy-background)', 'var(--omarchy-accent)', 'var(--omarchy-foreground)', 'var(--omarchy-color1)',
    'color-mix(in srgb, var(--omarchy-foreground) 26%, var(--omarchy-background))'
  ])
]);

const BY_ID = new Map(THEME_CATALOG.map((entry) => [entry.id, entry]));

export const themeById = (id) => BY_ID.get(id) || null;
