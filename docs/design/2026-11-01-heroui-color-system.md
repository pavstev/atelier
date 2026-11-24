# Atelier colors (Graphite indigo)

The look of the web app, as it is now. The live values are in
[`app/web/src/styles/atelier-theme.css`](../../app/web/src/styles/atelier-theme.css). This note says
why they are what they are. The file keeps its 2026-11-01 name so old links work.

## The idea

A painter judges value and color against a neutral ground. So the UI around the photo is gray with
a small blue tint (hue 260, chroma 0.008), and it has one accent: a quiet indigo (hue 272). The
study colors live on the stage only. Status colors (success 155, warning 75, danger 25) are Hero's
hues with less chroma. The palette was refined on 2026-11-07. It was not swapped.

The app is dark only (light mode was dropped on 2026-11-16). Every token value is in block 3 of the
CSS file; this note does not copy them.

Every control is a Hero UI part. The stage (the photo) and the logo are the only non-Hero pieces.
Sizes (radius, icon buttons, z-index) are tokens in block 1 of the CSS file, not colors.

The accent tints are `--accent-soft` and `--accent-soft-hover`. The text on a tint
(`--accent-soft-foreground`) is 65% accent and 35% foreground. The focus ring has its own token
(`--focus-ring`) and is stronger than the accent. Warning is a fill, never text on a plain surface
(its text color is mixed from the foreground).

## Contrast (WCAG 2, computed from the values)

| Pair | Ratio | Need |
|---|---|---|
| Text on background | 19.0 | 4.5 |
| Muted text on background | 7.9 | 4.5 |
| Accent as text on background | 7.7 | 4.5 |
| Text on the accent button | 6.9 | 4.5 |
| Text on the accent tint (on a surface) | 6.3 | 4.5 |
| Text on the hovered tint (on a field) | 4.7 | 4.5 |
| Focus ring on surface | 9.3 | 3 |
| Success and danger as text on surface | 8.8 and 5.3 | 4.5 |
| Border on surface | 1.5 | none (quiet by design) |

## Check it

The numbers above come from the oklch values with oklab mixing and sRGB compositing. Re-run such a
check after any change to a color token. Every row must stay above its need.
