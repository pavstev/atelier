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
  handle just right of its edge (or `[`) hides it, and a drag on the edge itself resizes it. The
  handle stays off the drag line. Under 768 px it is a drawer
  that starts closed.
- **The panel's pixels.** Everything in the panel sits on a 4 px grid and on whole pixels. The card
  is inset 12 px from the window (`--panel-gap`, the same gap as the bottom bar), has a 1 px edge and
  12 px padding, so content starts 13 px in; the logo uses the same 13 px. Rows are 32 px high
  (a 28 px thumb, 4 px around it, 8 px between thumb and name) and touch each other. Icon buttons
  are 28 px in a bar and 24 px in a row; icons are 16 px. Radii nest: row 8, thumb and row buttons
  4. The hover and active look is one variable (`--ovl-bg`) that the row and the buttons floating
  over its right end both read, so they never show two colors. Hover is `--default`; the active
  row is `--default-hover` with a 2 px accent bar. A mouse press leaves no overlay behind; only
  keyboard focus (`:focus-visible`) shows it (on a touch screen a tap does). A folder's indent step
  is 16 px and its guide line sits under the parent's arrow. In an installed app the panel starts
  12 px under the title strip.
- **The free stage** is the stage minus the open photo panel (a wide window; on a phone the drawer
  floats over everything). The bottom bar and the legend strip center on it and never sit on the
  panel. With the panel hidden it is the whole window. The panel's right edge plus its gap is
  `--free-left`, set in `StageArea.tsx`.
- **The bottom bar** sits at the bottom center of the free stage and shows only while a photo is
  open. Left to right: See photo | Base, Grid | Paper, Zoom | Color picker. Thin
  lines split the groups. The bar does not move.
- **Pop-up cards.** A bar button opens its card above the button. One card is open at a time. A
  second press, Esc or a press outside closes it. A drag on the photo pans and keeps the card open.
- **The phone sheet.** Under 768 px a card is a bottom sheet instead, with the same body. The
  window width decides, so a card is written once (`features/stage/Popup.tsx`). A press outside
  closes the sheet as it closes a pop-up. The legend strip sits above the sheet scrim
  (`--z-legend`), so a swatch press holds its color and closes the sheet, as on a wide window.
- **The legend strip** is a glass row of swatches at the top center of the free stage, below the
  error banner and the title bar area of an installed app. It shows the legend of Values or
  Shapes, stays on one row and scrolls sideways when it is too wide. It keeps clear of the Add photo
  button, which shows while the panel is hidden. A swatch press holds its color in the picker card.
- **Fixed layer order**, bottom first: one base, then Grid.

## The bar buttons

- **Split button for Grid.** The main part switches the layer on or off and looks
  pressed while it is on. The chevron next to it opens the card. The Grid card also
  has the switch in its head.
- **Base** has no switch. It looks pressed when the base is not Photo, and says so with
  `aria-pressed`. **Paper** does the same while Fit to paper is on.
- **The zoom menu** holds Fit, 100% and 200%, and shows the zoom now on its button.
- **A blocked button** stays visible, dimmed, with a tip that says why.
- **Toggles without a card**: See photo and the color picker.

## Inside a card

- A card is the tool name, then three groups split by thin lines (`features/tools/Panel.tsx`):
  1. **Opacity first**, in every layer card. In the Base card it comes right under the Base choice,
     and only for a base that draws (Values, Shapes).
  2. **The main choice** at full width.
  3. **Its settings**, one line each: the label in a fixed left column (`.atelier-row`), the
     control on the right.
- A big card may split into tabs. A tab holds one job. No card has tabs now.
- **The Grid card** has the On switch in its head, then Opacity, then the step in cm (a `Knob`).
  Nothing else: the lines are Contrast lines and the squares start at the top left corner.

## The widget rule

Pick the control by the number and the length of the options. The controls are in
`app/web/src/ui/fields.tsx`.

| Options | Control |
|---|---|
| 2 to 5 short ones | `Segment`, a row of buttons |
| 4 or 5 long ones | `Segment` with `stacked` (the label above, the row at full width) |
| more than 5 | `Choice`, a select list |
| many on/off items | chips: toggle buttons with `aria-pressed` |
| a number in a range | `Knob`, a slider that shows its value |
| a size in cm | `NumberBox` |
| a color | `ColorField` |

## Words

- Plain words a painter uses: "See photo", "Detail", "Paint step". No code
  names, no jargon in a label.
- Labels are short, in sentence case. A tip says what a button does in a few words ("Paper: the
  paper or canvas you paint on").
- A note or an error says what happened and what to do. No apologies.

## Test ids

Browser tests find every control by `data-testid`. To find a real id:
`rg data-testid app/web/src`. A new control follows these patterns.

| Thing | Id |
|---|---|
| A bar button | `tool-<tool>`: `tool-base`, `tool-grid`, `tool-size` (Paper), `tool-picker` |
| A split button | `group-<tool>` holds `toggle-<tool>` (the switch) and `tool-<tool>` (the chevron) |
| The open card or sheet | `tool-popup` with `data-tool`, and its body `tools` |
| An opacity slider | `opacity-<layer>`: `opacity-base`, `opacity-grid` |
| A setting | `<part>-<setting>`: `values-detail`, `grid-step` |
| A tab | `<card>-tab-<id>` (no card has tabs now) |
| One of many in a row | one id for each item, and a `data-*` for which: `size-preset` with `data-preset` |
| The photo list | `photo-<thing>` for a photo (`photo-row`, `photo-open`, `photo-move`) and `folder-<thing>` for a folder (`folder-row` with `data-folder`, `data-open`, `folder-toggle`, `folder-count`, `folder-move`). The lists are `photos` (the top) and `folder-photos`; the open part of a folder is `folder-children`. The plus is a menu: `photo-add` opens `photo-add-files` and `folder-new`. |

- State is an `aria-*` or `data-*` attribute (`aria-pressed`, `aria-checked`, `data-active`), never a class alone.
- The controls of a card exist only while it is open.
- In a spec, set any setting with `studio.knob(id, value)` (`app/web/e2e/studio.ts`). A slider
  takes the value; a `Segment` or `Choice` takes the index of the option.
