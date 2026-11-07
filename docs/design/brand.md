# Atelier brand

Name: Atelier. Tagline: **Study a photo like a painter.** Use the tagline as written, with the
period, and nowhere in another wording.

## The mark

One mark: the handwritten Cyrillic capital А, a script letter drawn by hand by the
owner of the project. It is the owner's own work and it is free to publish. It looks like a Latin
A, so it reads Atelier. It has an indigo gradient
(the dark theme's `--logo-from` to `--logo-to`) and it comes in two shapes:

- **The tile** is the letter on a graphite rounded square. For the favicons, the app icon and any
  place that needs a small square. Below 32 px the letter is bigger and heavier.
- **The lockup** is the same letter plus "telier" beside it. For the app and the share images. It
  has no tile.

Both are made from the same two path files. Nothing is drawn twice.

## Files

| File | What it is |
| --- | --- |
| `app/web/brand/mark.path` | The outline of the letter. The source of truth. |
| `app/web/brand/word.path` | The outline of "telier": Jost (SIL OFL), weight 500, 20 px, set beside a 21 px mark. Fixed art, no font file needed. |
| `app/web/scripts/brand.mjs` | Makes everything below from those two files and the colors in `src/styles/atelier-theme.css`. |
| `app/web/brand/logo.svg`, `logo-small.svg` | The tile, big and favicon form. Made by the script. |
| `app/web/public/` | Made by the script: `favicon.svg`, `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `logo.svg`, `og.png` (1200 x 630), `og-square.png` (1200 x 1200). |
| `app/web/src/ui/Logo.tsx` | The in-app lockup. It imports the two path files, so it follows them. |

## Change the brand

1. Edit `mark.path` or `word.path`, or the logo colors (`--logo-from`, `--logo-to`) in the theme.
2. Run `mise run web:brand`. It rewrites every file above that the script makes.
3. Commit them.

To change the tagline, edit it in `app/web/index.html` (title, description, og and twitter tags),
in `brand.mjs` (the share images) and in `Stage.tsx` (the empty stage), then run the script.

## Rules

- Keep the letter as drawn. No variants, no swash line, no dot.
- Below 32 px use the small tile (`logo-small.svg`).
- The share images show the lockup and the tagline, no domain, so a fork can reuse them.
- Fonts: the app loads none. "telier" is a path. The share image text uses Inter, loaded from
  `@fontsource/inter` only while the script runs.
- Colors: [the color system](2026-11-01-heroui-color-system.md). The tile graphite and the share
  card graphite are set in `brand.mjs` in the same hue (260) as the theme.
- To make "telier" again from Jost with fontTools: load Jost at weight 500, set the letters t e l i
  e r at 20 px with 0.01 em spacing and no kerning, scale so the 21 px mark is 7.65 units high, and
  write one path. Put it in `word.path`.
