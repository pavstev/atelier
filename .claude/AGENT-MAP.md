# Agent map: atelier

<!-- For the main thread, before it spawns a helper here. Under 60 lines. Shared side: ~/dotfiles/claude/HARNESS-MAP.md -->

## Jobs
| Job | Dispatch, in order | Check |
|---|---|---|
| Change what a layer draws | `/view-change` skill, then `worker` for big edits | `mise run check:fast`, then `cargo xtask refs` |
| Bench run on real photos | `/tool-bench` skill -> `model-bench` (long run) -> `tool-rater` (many photos) | sheets in `.agents/bench/sheets/` |
| Release to the live site | `/ship` skill -> `live-checker` | `bash scripts/live-check.sh <sha>` |
| Final review | `code-reviewer` (opus, high) | `mise run check` before a push |
| Read logs, big docs, research | `researcher` or `worker`, findings back in a file | none |

## Agents here
| Agent | Job and trigger | Tools | Model | Owns |
|---|---|---|---|---|
| `live-checker` | proves the live commit after a push to main | Read, Bash | haiku | none |
| `tool-rater` | scores bench sheets like a painter, lists problems | Read, Glob, Grep, Write | sonnet | the report file the caller names |
| `model-bench` | runs a named bench pass on the photo sets, writes the numbers | Bash, Read, Write | sonnet | the numbers file the caller names |

## Skills, rules and hooks
- Skills: `view-change`, `tool-bench`, `ship` (in `.claude/skills/`).
- Rules (load by `paths:`): `rust.md` (crates, xtask), `web.md` (app/web, scripts, deploy files), `docs.md` (any `.md`).
- Hooks: lefthook runs pre-commit (staged files) and pre-push (`mise run check`). See `lefthook.yml`.

## Rules
- Inside a superlite build, dispatch only `superlite:*` agents. Its coordinator hook denies the others.
- Send reading work (logs, big docs, research) to a helper. This repo hit the most compactions.
- One bench job at a time, 20 GB at most (owner rule). `model-bench` checks it first.
- Bless only for a meant change: `cargo xtask refs --bless`, `mise run web:golden:bless`. No helper blesses.
- No helper runs `wrangler`. `live-checker` proves a deploy with `scripts/live-check.sh`.
- Browser checks are headless Chromium (`mise run web:e2e`). Never a visible window.
- Never read `target/`, `bench-out/`, `in/` or `out/`. They hold private photos.
