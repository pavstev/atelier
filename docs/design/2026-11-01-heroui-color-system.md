# Atelier colors (Graphite indigo)

The look of the web app, as it is now. The live values are in
[`app/web/src/styles/atelier-theme.css`](../../app/web/src/styles/atelier-theme.css). This note says
why they are what they are. The file keeps its 2026-11-01 name so old links work.

## The idea

A painter judges value and color against a neutral ground. So the UI around the photo is gray with
a small blue tint (hue 260, chroma 0.008), and it has one accent: a quiet indigo (hue 272). The
study colors live on the stage only. Status colors (success 155, warning 75, danger 25) are Hero's
hues with less chroma. The palette was refined on 2026-11-07. It was not swapped.

Every control is a Hero UI part. The stage (the photo) and the logo are the only non-Hero pieces.
Sizes (radius, icon buttons, z-index) are tokens in block 1 of the CSS file, not colors.

## The tokens

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(0.955 0.008 260)` | `oklch(0.155 0.008 260)` |
| `--surface` | `oklch(0.995 0.003 260)` | `oklch(0.205 0.008 260)` |
| `--foreground` | `oklch(0.215 0.008 260)` | `oklch(0.99 0.002 260)` |
| `--muted` | `oklch(0.49 0.0128 260)` | `oklch(0.72 0.0128 260)` |
| `--border` | `oklch(0.865 0.008 260)` | `oklch(0.33 0.008 260)` |
| `--accent` | `oklch(0.51 0.155 272)` | `oklch(0.72 0.1275 272)` |
| `--focus-ring` (`--focus`) | `oklch(0.48 0.17 272)` | `oklch(0.8 0.12 272)` |
| `--success` | `oklch(0.54 0.115 155)` | `oklch(0.76 0.13 155)` |
| `--warning` | `oklch(0.76 0.12 75)` | `oklch(0.82 0.12 76)` |
| `--danger` | `oklch(0.56 0.17 25)` | `oklch(0.66 0.17 25)` |
| `--logo-from` to `--logo-to` | `oklch(0.45 0.16 272)` to `oklch(0.68 0.11 272)` | `oklch(0.72 0.1275 272)` to `oklch(0.93 0.04 272)` |

The accent tints are `--accent-soft` (18% light, 24% dark) and `--accent-soft-hover` (26% and 32%).
The text on a tint (`--accent-soft-foreground`) is 65% accent and 35% foreground in both themes.
Other grays and the calculated colors are in the CSS file.

## Contrast (WCAG 2, computed from the values)

| Pair | Light | Dark | Need |
|---|---|---|---|
| Text on background | 15.4 | 19.0 | 4.5 |
| Muted text on background | 5.5 | 7.9 | 4.5 |
| Accent as text on background | 5.2 | 7.7 | 4.5 |
| Text on the accent button | 5.8 | 6.9 | 4.5 |
| Text on the accent tint (on a surface) | 7.0 | 6.3 | 4.5 |
| Text on the hovered tint (on a field) | 5.9 | 4.7 | 4.5 |
| Focus ring on surface | 6.8 | 9.3 | 3 |
| Success and danger as text on surface | 4.7 and 5.0 | 8.8 and 5.3 | 4.5 |
| Border on surface | 1.5 | 1.5 | none (quiet by design) |

What changed on 2026-11-07: the light accent is a little darker (it was 4.8 on the background),
success and danger pass 4.5 in light, the focus ring has its own token and is stronger than the
accent, the accent tints are a little stronger, the text on a tint is darker, and borders are a
little firmer. Warning is a fill, never text on a plain surface (its text color is mixed from the
foreground).

## Check it

The numbers above come from the oklch values with oklab mixing and sRGB compositing. Re-run such a
check after any change to a color token. Both themes must keep every row above its need.
