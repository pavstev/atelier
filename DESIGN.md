# Design

How the Atelier web app looks and behaves, as rules. What each control does is in
[docs/web-app.md](docs/web-app.md). This page does not repeat it.

## The look

- **Dark only.** There is no light mode and no theme switch. `<html class="dark">` stays set.
- **Glass.** Everything that floats over the stage is glass: a see-through dark tint with a blur.
  That is the photo panel, the bottom bar, every pop-up card, menu and tip, the bottom sheet and
  the legend strip. The rule is `.glass` in `app/web/src/styles/index.css`; it also covers the
  Hero UI classes of popovers, tips, menus and sheets. Its tokens are `--glass`, `--glass-edge`,
  `--glass-shadow` and `--glass-blur`.
- **Tokens.** Colors and design sizes live in `app/web/src/styles/atelier-theme.css`: the palette
  "Graphite indigo" (gray with a small blue tint, an indigo accent), the radius scale
  (`--radius-card`, `--radius-chip`, `--radius-pill`), the icon button sizes (`--icon-btn-bar`,
  `--icon-btn-row`), the z-index ladder (`--z-stage` up to `--z-toast`) and the tip delay. Use a
  token; never a raw color or a raw z-index. Why the palette is what it is:
  [docs/design/2026-11-01-heroui-color-system.md](docs/design/2026-11-01-heroui-color-system.md).
  The logo and icons: [docs/design/brand.md](docs/design/brand.md).
- **Less motion.** With `prefers-reduced-motion` nothing slides or fades.

## The layout

- **The stage** fills the window. Nothing pushes the photo: the panel and the bar float over it.
- **The photo panel** is a glass card on the left. It holds the photo list only, no tools. A
  handle on its edge (or `[`) hides it, and its right edge resizes it. Under 768 px it is a drawer
  that starts closed.
- **The bottom bar** sits at the bottom center and shows only while a photo is open. Left to
  right: See photo | Base, Edges, Grid | Paper, Zoom | Color picker | the grip. Thin lines split
  the groups. The grip drags the bar along the stage (not on a phone).
- **Pop-up cards.** A bar button opens its card above the button. One card is open at a time. A
  second press, Esc or a press outside closes it. A drag on the photo pans and keeps the card open.
- **The phone sheet.** Under 768 px a card is a bottom sheet instead, with the same body. The
  window width decides, so a card is written once (`features/stage/Popup.tsx`).
- **The legend strip** is a glass row of swatches at the top center of the stage, below the error
  banner and the title bar area of an installed app. It shows the legend of Values, Shapes or
  Pencil, stays on one row and scrolls sideways when it is too wide. A swatch press holds its color
  in the picker card.
- **Fixed layer order**, bottom first: one base, then Edges, then Grid.

## The bar buttons

- **Split buttons for Edges and Grid.** The main part switches the layer on or off and looks
  pressed while it is on. The chevron next to it opens the card. The Edges and Grid cards also
  have the switch in their head.
- **Base** has no switch. It looks pressed when the base is not Photo.
- **A blocked button** stays visible, dimmed, with a tip that says why (Edges in Pencil mode).
- **Toggles without a card**: See photo and the color picker.

## Inside a card

- A card is the tool name, then three groups split by thin lines (`features/tools/Panel.tsx`):
  1. **Opacity first**, in every layer card. In the Base card it comes right under the Base choice,
     and only for a base that draws (Values, Shapes, Pencil).
  2. **The main choice** at full width.
  3. **Its settings**, one line each: the label in a fixed left column (`.atelier-row`), the
     control on the right.
- A big card splits into tabs (the Pencil card: Look, Effects, Pencils). A tab holds one job.

## The widget rule

Pick the control by the number and the length of the options. The controls are in
`app/web/src/ui/fields.tsx`.

| Options | Control |
|---|---|
| 2 to 5 short ones | `Segment`, a row of buttons |
| 4 or 5 long ones | `Segment` with `stacked` (the label above, the row at full width) |
| more than 5 | `Choice`, a select list |
| many on/off items | chips: toggle buttons with `aria-pressed` (Pencil effects, the pencils) |
| a number in a range | `Knob`, a slider that shows its value |
| a size in cm | `NumberBox` |
| a color | `ColorField` |

## Words

- Plain words a painter uses: "See photo", "Brightness", "Paint step", "Real size". No code
  names, no jargon in a label.
- Labels are short, in sentence case. A tip says what a button does in a few words ("Paper: size
  and real size").
- A note or an error says what happened and what to do. No apologies.

## Test ids

Browser tests find every control by `data-testid`. To find a real id:
`rg data-testid app/web/src`. A new control follows these patterns.

| Thing | Id |
|---|---|
| A bar button | `tool-<tool>`: `tool-base`, `tool-edges`, `tool-grid`, `tool-size` (Paper), `tool-picker` |
| A split button | `group-<tool>` holds `toggle-<tool>` (the switch) and `tool-<tool>` (the chevron) |
| The open card or sheet | `tool-popup` with `data-tool`, and its body `tools` |
| An opacity slider | `opacity-<layer>`: `opacity-base`, `opacity-edges`, `opacity-grid` |
| A setting | `<part>-<setting>`: `values-detail`, `grid-cells`, `pencil-contrast` |
| A tab | `<card>-tab-<id>`: `pencil-tab-look` |
| One of many in a row | one id for each item, and a `data-*` for which: `pencil-grade` with `data-grade`, `size-preset` with `data-preset` |

- State is an `aria-*` or `data-*` attribute (`aria-pressed`, `aria-checked`, `data-active`,
  `data-locked`), never a class alone.
- The controls of a card exist only while it is open.
- In a spec, set any setting with `studio.knob(id, value)` (`app/web/e2e/studio.ts`). A slider
  takes the value; a `Segment` or `Choice` takes the index of the option.
