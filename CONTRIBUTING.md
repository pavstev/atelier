# Contributing

Thank you for helping. Atelier is small, and a small, clear change is the easiest to review.
Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Set up

You need [mise](https://mise.jdx.dev). It installs the pinned Rust toolchain, Node, pnpm and the
wasm tools, and it installs the git hooks.

```bash
mise install
brew install cargo-deny cargo-shear typos-cli   # or another package manager
mise run web:dev                                # builds the wasm, then http://localhost:5173/
```

The first `web:dev` compiles the Rust core to wasm, which takes a few minutes. The `brew` line
installs the tools for `mise run check` (not needed for `web:dev`).

## Checks

The tasks are in `mise.toml`.

| When | Command |
|---|---|
| While you work | `mise run check:fast` (fmt, clippy, Rust tests, web types, Biome) |
| Before a pull request | `mise run check` |
| For a core or web change | `mise run web:e2e` (headless Chromium; run `pnpm --dir app/web exec playwright install chromium` once, and put the test photo in `.agents/web-photos`: [how](docs/development/testing.md#the-test-photo)) |
| Reference pictures | `cargo xtask refs` |
| Broken doc links | `bash scripts/docs-check.sh` |

The pre-commit hook checks the files you staged. The pre-push hook runs `mise run check`.

Bless reference or golden pictures only for a change you meant, and say in the commit why they
moved. The commands are in
[docs/development/testing.md](docs/development/testing.md#blessing-a-changed-picture).

## Rules

- **The Rust core is the home of pixel work.** The page decodes a photo and hands RGBA pixels to the
  worker. Do not draw layers in TypeScript.
- **Layer order is fixed** ([ARCHITECTURE.md](ARCHITECTURE.md#the-layers)): one base, then Edges,
  then Grid.
- **A number out of range is `Error::BadInput`,** never a panic.
- **Same input, same bytes.** No clock, no randomness, no hash map order in the core.
- **One simple test per part** in `crates/atelier-core/tests/tools_*.rs`.
- **Browser tests are headless Chromium** with Playwright. No other browser, no visible window.
- **No photo, and no picture made from a photo, goes into git.** See
  [docs/development/testing.md](docs/development/testing.md#no-photos-in-git).
- **Nothing leaves the device.** No analytics, no uploads, no remote scripts.
- Every source file starts with a comment that says its job. Keep it true.
- Features that were dropped on purpose are listed in [AGENTS.md](AGENTS.md) under "Dropped for
  good". Please do not bring them back without a talk first.

## Commits and pull requests

- Small commits with [Conventional Commit](https://www.conventionalcommits.org) subjects:
  `fix(core): ...`, `feat(web): ...`, `docs: ...`.
- Write short, plain sentences, in English.
- One idea per pull request. Say what changed and why. Show a screenshot for a visible change
  (made from a synthetic or CC0 photo, never a private one).
- If you find a problem you do not fix, add a row to [docs/LEFTOVERS.md](docs/LEFTOVERS.md). If you
  fix one, delete its row in the same commit.

## Where things are

- [MAP.md](MAP.md): the folders.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the parts fit.
- [docs/development/](docs/development/): testing, release and the bench.

## Working with AI tools

`AGENTS.md` and `CLAUDE.md` give AI coding tools the same rules and commands. Humans can read them
too. The rules in `.claude/` are for those tools.

## License

By contributing you agree that your work is licensed under [MIT](LICENSE-MIT) or
[Apache-2.0](LICENSE-APACHE), at the user's option.
