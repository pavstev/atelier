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

The folders are in [MAP.md](../../MAP.md). The import rule is in
[ARCHITECTURE.md](../../ARCHITECTURE.md#the-parts).
