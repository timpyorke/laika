# Laika Design System

Source of truth: the **Laika Design Canvas** in the Claude Design project
"Laika Desktop REST Client" (`Laika Design Canvas.dc.html`, 6 artboards at
1440 × 900 plus the locked app-icon sheet). This document records how that
canvas is expressed in code so new UI stays consistent without re-reading the
canvas every time.

## Where the palette comes from

Colours are sampled from the 1971 Ajman "Sputnik 2 / Laika" souvenir sheet: a
cerulean ground rather than the category-standard slate, burnt sienna rather
than a saturated orange, and litho-muted greens and ochres throughout. **Dark is
the default theme**; the light theme runs on the sheet's own paper stock.

## Tokens

All tokens live in `src/App.css` as CSS custom properties — light values on
`:root`, dark overrides under `.dark`. Components reference them as
`bg-[var(--surface)]`, never as raw hex.

| Group | Tokens |
| --- | --- |
| Ground | `--background` (panel body), `--surface` (chrome: title bar, sidebar, toolbars, table headers, footers), `--surface-raised` (dialogs), `--surface-muted` (hover/selected), `--surface-sunken` (gutters, inset cards) |
| Lines | `--border`, `--border-subtle` (row rules), `--border-strong` (interactive edges) |
| Text | `--foreground`, `--foreground-soft`, `--muted`, `--muted-dim`, `--faint`, `--fainter` |
| Accent | `--accent`, `--accent-hover`, `--accent-fg`, `--accent-soft`, `--focus` |
| State | `--success`, `--warning`, `--danger`, `--danger-strong`, `--danger-soft` |
| Status bands | `--status-success` (2xx), `--status-redirect` (3xx), `--status-client` (4xx), `--status-server` (5xx) |
| Methods | `--method-get` … `--method-options` — consumed via `methodColor` in `src/lib/http-display.ts` |
| Code | `--code-key`, `--code-string`, `--code-number`, `--code-boolean`, `--code-punct` — mirrored into the Monaco themes in `src/components/ui/monaco-code-editor.tsx` |
| Segments | `--segment-active`, `--segment-active-ring` |

One deliberate deviation from the canvas: the sheet's red `#A8382A` only reaches
~2:1 against the cerulean ground, so dark-theme *text* uses a lifted
`--danger: #e07c64` (≈4.5:1) while `--danger-strong: #a8382a` stays for
hairlines and fills, where contrast requirements do not apply.

## Typography

Bundled with `@fontsource*` so the app never fetches a font at runtime.

- `--font-display` — **Space Grotesk**: brand wordmark, dialog titles, empty-state
  and error headings. Use the `.font-display` helper class.
- `--font-sans` — **IBM Plex Sans**: all UI text. Base size is `12.5px`.
- `--font-mono` — **IBM Plex Mono**: URLs, methods, status codes, timings, sizes,
  keyboard hints, table keys, code. Use Tailwind's `font-mono`.

Scale: `12.5px` body · `11.5px` secondary · `10.5px` micro-labels (see the
`.label-caps` helper) · `10px` mono badges.

## Density and shape

- Title bar 48px; sub-tab strips 32–34px; table header rows 28px; table body
  rows 30px; footer status bars 28–32px; sidebar tree rows 28px.
- Radii: 6px controls, 8px panels, 10px dialogs, 3px chips and checkboxes.
- All separators are 1px hairlines — no shadows between panels.
- Every panel ends in a mono status bar rather than floating text.

## Shared primitives

`src/components/ui/` carries the pieces the canvas repeats. They must stay free
of feature, store, and Tauri imports.

- `laika-mark.tsx` — `LaikaMark` (brand tile) and `LaikaGlyph` (orbit glyph).
- `button.tsx` — `Button` variants plus `KeyHint` for the `⌘↵`-style shortcut
  chips (hidden from the accessibility tree; pair with `aria-keyshortcuts`).
- `tabs.tsx` — `Tabs*`, `TabBadge` (count pill), `TabDot` (state dot), and
  `SegmentedControl`/`SegmentedItem` for recessed toggle tracks.
- `key-value-table.tsx` — the dense params/headers/form table, including the
  ghost trailing row and footer action bar.
- `resizable.tsx` — the 5px three-dot splitter.

## App icon

`src-tauri/icons/` holds the locked "2a Capsule" mark exported from the canvas —
see `src-tauri/icons/README.md` for the file ladder and regeneration notes. The
web favicon is the same master at `public/laika.svg`.

## Known gaps against the canvas

Artboards show capabilities Laika has not built yet; these were intentionally
left out rather than faked:

- A **Description** column in the params/headers table (needs a persisted field
  on `KeyValueEntry`, spanning the TS types, the Rust DTOs, and a migration).
- The **command palette** (artboard 06) and the full-screen **environment
  manager** layout (artboard 05) — Laika's environments live in a dialog today.
- Sidebar affordances tied to unbuilt features: collection sync status, Postman
  and Insomnia import, and folder-level run/export commands.
