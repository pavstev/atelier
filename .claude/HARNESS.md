# Harness

This file is for AI coding tools and the maintainers who run them. Contributors do not need it.

How Claude Code works in this repo. The owner's dotfiles harness (`~/dotfiles`, linked to
`~/.claude`) gives the general rules, skills, agents and hooks. This repo adds only what is
special to Atelier, in git under `.claude/`, plus a `Makefile` and `lefthook.yml`.

## Instructions

| File | Loads | Job |
|---|---|---|
| `CLAUDE.md` | every session | Imports `AGENTS.md`, then the Claude-only lines. |
| `AGENTS.md` | every session (other agents read it too) | Check commands, rules, dropped features. Under 200 lines. |
| `MAP.md` | when a session reads it (`CLAUDE.md` says to) | The folder map. |
| `.claude/AGENT-MAP.md` | when the main thread reads it (`CLAUDE.md` says to), before it spawns a helper | Which helper does which job, in what order, and the agents of this repo. Never imported. |
| `.claude/rules/rust.md` | on a file in `crates/`, `xtask/`, `Cargo.toml` | The Rust module map and work rules. |
| `.claude/rules/web.md` | on a file in `app/web/`, `scripts/*.sh`, `wrangler.jsonc`, `.claude/skills/ship/` | Browser tests, golden pictures, release, Cloudflare. |
| `.claude/rules/docs.md` | on any `.md` file | English only, one home per fact. |

A rule loads only because it has `paths` frontmatter; that is the only field rules read.

## Skills

| Name | Use it to |
|---|---|
| `/view-change` | Change what a part draws, across the core, the wasm edge and the web app. |
| `/tool-bench` | Run real photos through the parts with `examples/bench.rs` and make before and after sheets. |
| `/ship` | Push to main and prove the Cloudflare build deployed it. |

The agents (`model-bench`, `tool-rater`, `live-checker`) are in `.claude/agents/` and in
[AGENT-MAP.md](AGENT-MAP.md).

`.claude/settings.json` is the owner's file: it asks before the two bless commands and denies
`cargo clean` and reading `bench-out/`, `in/` and `out/`. `.claude/settings.local.json` is
personal and ignored.

## The dotfiles contract

The dotfiles hooks look for `check`, `check-fast` and `fix` in a `package.json`, `justfile` or
`Makefile`. The root `Makefile` has them and calls `mise.toml`: `make check` is `mise run check`,
`make check-fast` is `mise run check:fast`, `make fix` formats Rust and the web files. With
`STAGED=1`, `make check-fast` checks only staged files (rustfmt and Biome, what the hook runs).
`~/.claude/hooks/rust-bin proj detect` must report all three.

`lefthook.yml` holds the git hooks, and Lefthook (pinned in `mise.toml`) runs them. `mise install`
installs them into `.git/hooks` by itself (a mise `postinstall` hook); `mise run setup` does only
that. No git config is needed. `pre-commit` checks staged files only, as they are in the working
tree, in a few seconds (stage whole files). `pre-push` runs `mise run check`. A push to main
deploys, and Cloudflare runs no checks, so the hook is the gate.

## Other files

- `.claude/launch.json`: one preview server, `web`, which runs `mise run web:dev` on port 5173.
  Auto-verify is off, because browser checks here are headless Playwright.
- `.mcp.json`: the Hero UI MCP, pinned (`@heroui/react-mcp`): component docs, sources, theme
  tokens. Restart Claude Code and run `/mcp` to load it.

## From the dotfiles harness

Use these as they are. They are not copied here.

- `/ps:whatsleft` (reads `.agents/leftovers.jsonl`), `/ps:mic-drop`, `/ps:autopilot` (a
  `PROGRESS.md` ledger), `/ps:handoff` (briefs go to `.agents/`), superlite for multi-task work.
- Agents: `worker`, `code-reviewer` for the final review, `researcher`, `ui-verifier`.
- Hooks format each edited file and guard helper counts and commands.

## Local only

`.gitignore` lists what stays out of git. In short: `.agents/` holds the reports, hand-offs, the
leftovers list, the test photos and the bench sheets (Claude may read them by exact path).
`bench-out/`, `in/` and `out/` are under a Read deny. Run `scripts/docs-check.sh` after a doc
moves.
