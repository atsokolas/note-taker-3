# Noeis Brand System (Product)

## Intent

Noeis is a warm, Greek-inflected editorial study: calm enough for sustained reading, structured enough to make knowledge relationships legible, and lively enough to make thinking feel inviting.

## Core principles

- Let the user's material dominate; keep navigation and agent chrome quiet.
- Use one persistent visual language across Library, Think, Wiki, and Judgment.
- Adapt each room through semantic roles and composition, not a separate palette or component dialect.
- Use motion to clarify continuity, state, and relationships. Honor `prefers-reduced-motion`.
- Prefer deliberate whitespace, readable measure, and restrained borders over card grids and decorative panels.

## Semantic theme authority

- Package: `theme.editorial`, schema version `1`.
- Theme implementation: `note-taker-ui/src/styles/semantic-theme.css`.
- Snapshot validation and application: `note-taker-ui/src/settings/semanticTheme.js`.
- Persisted user preferences: `note-taker-ui/src/settings/uiPreferences.js`.
- Shared surface frame: `note-taker-ui/src/surface/surface-frame.css`.
- Shared shell: `note-taker-ui/src/layout/AppShell.jsx` and `note-taker-ui/src/layout/TopBar.jsx`.

The semantic package owns canvas, chrome, paper, ink, rules, typography, spacing, controls, focus, shadow, and motion. Room styles consume those roles and may define domain-specific roles only when they express real meaning, such as Wiki evidence or Judgment state.

## Visual character

- Light: warm vellum canvas, dark ink, restrained bronze thread, quiet rules.
- Dark: deep warm paper rather than blue-black dashboard chrome.
- Reading typography: `Newsreader`, `Iowan Old Style`, Georgia, serif.
- Interface typography: the system sans stack.
- Code and provenance: the system monospace stack.
- Motion: 140–320ms direct transitions, reduced to the package's 1ms safety value when reduced motion is requested.

## Guardrails

- Do not create another root palette, token file, or room-owned shell theme.
- Do not reintroduce `noeis-rebrand.css`, `tokens.css`, or the old `nt`, `dashboard`, and `original` token dialects.
- Do not turn knowledge surfaces into generic dashboards or uniform card grids.
- Glass belongs only on genuinely floating controls.
- New components must use semantic roles before adding local values.
- Light and dark variants, density, typography scale, and user accent must remain a single fail-closed snapshot.

## Verification

Changes to the brand system require semantic-theme contract tests, a production build, and rendered checks across Library, Think, Wiki, and Judgment at desktop, sidebar-width, mobile, and reduced-motion settings.
