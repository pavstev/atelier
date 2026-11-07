# app/web

The web app: React 19, Hero UI v3 and Tailwind CSS v4 over the Rust core in wasm. What it does and
how it is built: [docs/web-app.md](../../docs/web-app.md). The overview is in the
[README](../../README.md).

```bash
mise run web:dev     # build the wasm, start Vite on http://localhost:5173/
mise run web:build   # type check and build into dist/
mise run web:e2e     # headless Chromium tests
```

The tasks are in `mise.toml`. The test rules are in
[docs/development/testing.md](../../docs/development/testing.md).

## Folders

Paths are under `src/`. `@/` is an alias for `src/` (`tsconfig.json` and `vite.config.ts`).

- `features/photos/`: the photo list on this device and the photo on screen.
- `features/stage/`: the stage, the bottom bar, zoom and pan, shortcuts, the real size lock and the
  color swatches.
- `features/tools/`: the pop-up cards of the bottom bar and the settings (`settings.ts`).
- `draw/`: the layers worker, its client, the typed calls and the draw hook.
- `ui/`: parts that know nothing about photos (fields, icons, the logo, the theme hook).
- `lib/`: `storage.ts` (every saved key) and small helpers.
- `styles/`: `index.css` and the theme `atelier-theme.css`.

The rule: `ui/` and `lib/` import no feature; a feature imports `ui/`, `lib/` and `draw/`; `App.tsx`
joins the features.

Other folders: `e2e/` (Playwright specs and golden pictures), `wasm/` (the JS glue that
`scripts/build-wasm.sh` writes, committed at release), `public/` (favicons, share images and the
`_headers` file), `brand/` (the logo sources) and `scripts/` (the wasm and brand scripts).
