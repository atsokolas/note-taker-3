# NOEIS woven mark

The approved two-strand N replaces the existing app icons. `note-taker-ui/src/assets/noeis-mark.svg` is the vector master; the first path is the rear strand, the second the foreground strand. It is a clean vector reconstruction of Athan's selected concept, not a raster crop.

The shared `NoeisMark` uses the SVG as an alpha mask and inherits its surrounding text color. It replaces the plain colored square in the shared-question header and accompanies the existing wordmark in the app and authentication pages. It is decorative to avoid repeating the accessible link name. Existing theme defaults and typography remain unchanged.

The favicon SVG and PNG/ICO, PWA sizes, Chrome extension sizes and iOS 1024px asset derive from the same geometry. Standalone app artwork uses Tokyo Midnight indigo with ivory/lavender strands. iOS is RGB without an alpha channel. No app identifiers, routes or extension permissions change.

## Verification

- Focused UI tests: 5 files, 50 tests passed (brand mark, TopBar, Login, Register, SharedQuestion).
- Production UI build passed. Compiled successfully; runtime proxy warnings were emitted, with no compile errors.
- Live Chrome check on an isolated local preview confirms the mark renders beside Noeis on the login page and inherits its active dark theme.
- Independent review caught iOS alpha-channel and ICO size metadata issues; corrected both.
- No signed-in interaction, native iOS installation, extension installation, or full-suite claim. Installed Node is 22.22.3, below declared >=22.23.4 requirement; commands completed but not verified on the declared runtime.
- No push, merge or deployment.
