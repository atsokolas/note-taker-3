# Design System: The Editorial Instrument

## 1. Overview & Creative North Star

### Creative North Star: "The Digital Vellum"
This design system rejects the frantic, high-density "dashboard" culture of modern SaaS. Instead, it positions itself as a **Digital Vellum**—a quiet, expansive, and high-stakes environment for intellectual labor. We move away from the "widgetized" web toward a high-end editorial experience that mirrors the layout of a premium academic journal or a bespoke literary magazine.

**The Anti-Template Approach:**
Standard SaaS layouts rely on rigid grids and boxed containers. This system breaks that monotony through:
*   **Intentional Asymmetry:** Aligning metadata to the left or right of a central reading column to create a "margin note" feel.
*   **Cardless Architecture:** We do not use boxes to contain ideas. We use space and tonal shifts. Content is primary; the UI is the ghost that supports it.
*   **Breathing Room:** We utilize aggressive negative space (leveraging our `16` and `20` spacing tokens) to isolate core thoughts, treating every sentence with the reverence of a headline.

---

## 2. Colors

The palette is designed to mimic the tactile qualities of physical media: heavy paper, carbon ink, and graphite.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. 
*   **Boundaries** must be defined by shifts in background color. For instance, a sidebar should not be separated by a line, but by a transition from `surface` (`#fffcf7`) to `surface_container_low` (`#fcf9f3`).
*   **Nesting:** Use the surface-container tiers (`Lowest` to `Highest`) to create depth. An "Active Thought" block should sit on `surface_container_highest` (`#eae8de`) to feel physically closer to the user than the background.

### Glassmorphism & Depth
To ensure the interface feels modern yet organic, use `backdrop-blur` on floating menus (like command palettes or context menus) using semi-transparent variations of `surface_container`. This allows the "ink" of the content below to bleed through, maintaining a sense of place.

### Signature Textures
For primary actions, avoid flat fills. Use a subtle linear gradient from `primary` (`#615e5b`) to `primary_dim` (`#55524f`) at a 15-degree angle. This provides a "press-print" quality that flat hex codes lack.

---

## 3. Typography

Typography is the architecture of thought. This system uses a high-contrast pairing to distinguish between **Content** (The Work) and **Chrome** (The Interface).

*   **Display & Headlines (Newsreader):** Used for the "Intellectual Surface." Large, elegant serifs convey authority and permanence. `display-lg` at `3.5rem` should be used sparingly to title major research bodies.
*   **Body (Newsreader):** Optimized for long-form reading. The slightly tall x-height of Newsreader ensures legibility on "paper-like" backgrounds. Use `body-lg` (`1rem`) for primary thoughts.
*   **Labels & Metadata (Inter):** Used for "UI Silence." Small, clean, and quiet. Inter serves as the utilitarian layer—timestamps, word counts, and status indicators. It should never compete with the serif content.

---

## 4. Elevation & Depth

We achieve hierarchy through **Tonal Layering**, not structural shadows.

*   **The Layering Principle:** Stacking is the primary tool for importance. 
    *   *Base:* `surface`
    *   *Section:* `surface_container_low`
    *   *Interactive/Active Element:* `surface_container_highest`
*   **Ambient Shadows:** If an element must float (e.g., a critical popover), use a "Weightless Shadow."
    *   *Values:* `0px 24px 48px rgba(56, 56, 49, 0.06)` (using the `on_surface` color for the tint). It should feel like a soft glow of shadow, not a hard drop.
*   **The Ghost Border Fallback:** If a boundary is strictly required for accessibility, use `outline_variant` at **15% opacity**. A 100% opaque border is a failure of spacing.

---

## 5. Components

### Buttons & Inputs
*   **The "Sharp" Rule:** All components have `0px` border-radius. We embrace the precision of a guillotine paper cutter.
*   **Primary Button:** Background `primary`, text `on_primary`. No border.
*   **Secondary Button:** Background `surface_container_high`, text `on_surface`.
*   **Input Fields:** No boxes. A single bottom-weighted `outline_variant` (at 30%) or a subtle `surface_container` fill.

### Cards & Lists
*   **Cardless by Default:** Content should flow directly on the surface. To group items, use `1.4rem` (`4`) of vertical padding rather than a containing box.
*   **Dividers:** Prohibited. Use a spacing jump (e.g., from `spacing-4` to `spacing-8`) to signify a change in context.

### Contextual "Thought Partner" Sidebar
As seen in the research interface, the right-hand context column uses `surface_container` to create a "margin" effect. Elements within this sidebar should use `label-md` for headers to remain distinct from the central "thinking" surface.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical margins. If the content is 600px wide, center it but allow metadata to bleed into the left margin.
*   **Do** prioritize vertical rhythm. Use the spacing scale religiously to ensure the "editorial" feel.
*   **Do** use `primary_container` for subtle highlighting of text, mimicking a pale highlighter on paper.

### Don't
*   **Don't** use "Pill" buttons. Every corner in this system must be a sharp `0px`.
*   **Don't** use icons as primary navigation. Use `label-md` text. This is a system for writers; use words.
*   **Don't** use standard SaaS blue. Our "Action" color is the deep charcoal of `primary` or the warmth of `tertiary`.
*   **Don't** use cards with shadows to display list items. Use white space and tonal shifts in the background.

---

## 7. Spacing Scale

| Token | Rem | Use Case |
| :--- | :--- | :--- |
| **0.5 / 1** | 0.175 - 0.35 | Micro-adjustments (Label to Icon) |
| **4** | 1.4 | Standard component internal padding |
| **8** | 2.75 | Gutters between major editorial columns |
| **16 / 20** | 5.5 - 7.0 | Vertical breathing room between major thoughts |