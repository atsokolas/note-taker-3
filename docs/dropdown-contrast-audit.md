# Dropdown contrast — all NOEIS themes

The owner added this fix to the Work Weekfold release on 26 October 2026. The audit covers the 14 concrete themes in `settings/themeCatalog.js`, both resolved Follow-this-device schemes, and representative light/dark Omarchy inputs. It is not a Tokyo-only patch.

## Findings and shared fix

The source inventory contains 69 native selects across 29 files: Think context and notebooks, Work notebooks/item forms, Wiki filters/metadata/decisions/valuation, Library questions, editions, connections, integrations and handoff controls. Five custom menu/listbox implementations use the shared semantic roles: TopBar, reader selection actions, editor slash commands, Wiki page actions and named-distinction choices. System-status and Work utility popovers use the same popover surface vocabulary.

Native options previously had no opaque theme-owned surface. That allowed theme text and native/OS-grey backgrounds to combine. Unstyled custom menu buttons could retain the same grey default. The semantic theme package now owns one choice surface/ink/hover/focus set, applied to native selects/options and these shared menus. Ink derives from each theme's own ink and scheme; hover/selection uses its sunken paper. Selected rows retain a visible leading marker; keyboard focus has a 2px high-contrast outline. Disabled labels remain readable, italic and semantically disabled. Highlight-colour swatches retain their own paint.

No per-screen hex-colour patches, duplicated theme lists or changes to selection behavior were introduced.

## Verification

- Browser matrix: 18 theme/scheme scenarios, 612 computed state checks covering normal, selected, hover, focus and disabled controls. All pass; minimum measured text and focus contrast 5.16:1. Native option surfaces are opaque.
- Actual local Work notebook selector/item forms and Think Personal/Work context selector inspected at desktop1320 and mobile430 in Tokyo Midnight. Fixture content is fictional.
- Existing theme catalog/preferences/style contracts and the affected Work UI/session regressions run through the compact test workflow. Final native CI and independent delta review remain release gates.

**Inspection limit:** Native OS popup windows are outside headless browser screenshots. The actual closed controls and their computed option colours were checked; a browser-painted expanded native HTML list and shared custom-menu state board provide visual inspection. This does not claim pixel verification of every macOS/iOS/Windows native picker.

Omarchy's default plus representative valid custom palettes are covered; arbitrary user-supplied desktop colours remain inputs, not a finite theme catalog.
