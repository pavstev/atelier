# Agent map: atelier

<!-- For the main thread, before it spawns a helper here. Under 60 lines. Shared side: ~/dotfiles/claude/HARNESS-MAP.md -->

## Jobs
| Job | Dispatch, in order | Check |
|---|---|---|
| Change what a layer draws | `/view-change` skill, then `worker` for big edits | `mise run check:fast`, then `cargo refs` |
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

Skills, rules and hooks: [HARNESS.md](HARNESS.md).

## Rules
- Inside a superlite build, dispatch only `superlite:*` agents. Its coordinator hook denies the others.
- Send reading work (logs, big docs, research) to a helper. This repo hit the most compactions.
- One bench job at a time, 20 GB at most (owner rule). `model-bench` checks it first.
- No helper blesses pictures and no helper runs `wrangler`. `live-checker` proves a deploy with
  `scripts/live-check.sh`.
- Every helper brief repeats the `AGENTS.md` rules it needs: headless browsers only, and never
  read `target/`, `bench-out/`, `in/` or `out/`.
