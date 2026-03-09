# Noeis Brand System (Product)

## Intent
A dark-first interface that feels structured and exploratory at the same time: calm enough for deep thinking, energetic enough to invite connection-making.

## Core Principles
- Build for focused attention, not visual noise.
- Keep UI chrome quiet; let user material dominate.
- Use visual energy to show affordance and relationships, not decoration.
- Favor composable surfaces and consistent spacing over one-off treatments.

## Color System
- Base background: `#050918`
- Primary surface: `#0D1430`
- Raised surface: `#121F49`
- Subtle border: `rgba(130, 152, 230, 0.28)`
- Primary text: `#F1F5FF`
- Secondary text: `#9FB1E6`
- Electric accent (default): `#36E4FF`
- Violet accent: `#9D84FF`
- Indigo accent: `#6F87FF`

## Typography
- Header family (monospace): `IBM Plex Mono`, `SFMono-Regular`, `Menlo`, `Consolas`, `monospace`
- Body family (warm sans): `Nunito Sans`, `Avenir Next`, `Avenir`, `Segoe UI`, system sans-serif

## Iconography
- Minimal line-art glyphs with rounded joins.
- Motifs should suggest nodes, routes, links, and state transitions.
- Keep stroke weight consistent with text weight at small sizes.

## Motion & Texture
- Motion is low-amplitude and purposeful (hover/focus, subtle drift).
- Use node/grid overlays sparingly to imply semantic structure.
- Respect `prefers-reduced-motion` across all surfaces.
- Prefer `140ms` to `220ms` motion windows with ease-out timing for direct manipulation.
- Use trace-line hover states on list rows to reinforce semantic linking without distracting from content.

## Implementation Source of Truth
- Primary brand overrides live in: `note-taker-ui/src/styles/noeis-rebrand.css`
- UI settings contract lives in: `note-taker-ui/src/settings/uiPreferences.js`
- Left rail icon set lives in: `note-taker-ui/src/layout/LeftNav.jsx`
- Screen polish for Think/Library/Notebook (spacing + micro-interactions) also lives in `noeis-rebrand.css`.

## Guardrails
- Do not introduce light mode variants.
- Avoid flat grayscale productivity defaults.
- Avoid high-saturation gradients as primary panel backgrounds.
- New components should use existing tokens before adding custom colors.
