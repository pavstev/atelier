# Mac app

A Tauri 2 window around the built web app (`app/desktop/`). It has no Rust code of its own beyond
starting the window. The Rust core runs as wasm inside the page, as in the browser. Nothing leaves
the device.

## Build and install

```bash
mise run desktop:build        # builds the web app, then the app
cp -R app/desktop/target/release/bundle/macos/Atelier.app /Applications/
```

Needs the tools `mise install` gives, plus `cargo install tauri-cli --version "^2"`. The app is signed
ad hoc only: no developer certificate, no notarization.

## How the page knows

`main.tsx` sets `data-shell="mac"` on `<html>` when Tauri is there (`__TAURI_INTERNALS__`) and
`data-full` in full screen. The block "The Mac app (Tauri)" at the end of
`app/web/src/styles/index.css` does the rest:

- no title bar (`titleBarStyle: Overlay`); the window buttons float over the page;
- a see-through window with the macOS sidebar material; the side panel is flush and full height
  and the stage starts right of it;
- the photo list buttons sit in the top row of the panel, the logo is over the stage (at the left
  in full screen, where the window buttons are gone);
- the legend strip is hidden until the Legend button in the bar shows it (right edge of the stage);
- the window remembers its size and place; the Tauri drop handler is off so the page takes drops.

The browser app and the PWA are not changed by any of this.
