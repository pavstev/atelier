---
paths:
  - "**/*.md"
---

# Docs

- English only. Plain words, short sentences, no em dashes.
- One home per fact. Link to it; do not copy it.

| Fact | Its home |
|---|---|
| The pitch, privacy, quick start | `README.md` |
| What the app does, control by control; how the web app is built | `docs/web-app.md` |
| How each part draws | `docs/how-it-works/` |
| How the parts fit | `ARCHITECTURE.md` |
| Setup, checks, contribution rules | `CONTRIBUTING.md` |
| Tests, release, bench | `docs/development/` |
| Rules and dropped features for AI tools | `AGENTS.md` |
| The folder map | `MAP.md` |
| Which helper does which job | `.claude/AGENT-MAP.md` |
| Open work and known problems | `docs/LEFTOVERS.md` |
| Which docs are current and which are history | `docs/README.md` |
| The Claude setup (rules, skills, agents) | `.claude/HARNESS.md` |
| Rust module map | `.claude/rules/rust.md` |
| Browser test hooks, release and Cloudflare rules | `.claude/rules/web.md` |
| What changed | `git log` (there is no changelog file) |

- After you move or delete a doc, run `bash scripts/docs-check.sh`: it lists broken relative links.
- A fix that closes a leftover deletes its row in `docs/LEFTOVERS.md` in the same commit.
- Dated notes in `docs/research` are records. Do not rewrite them. When one goes stale, say so
  in `docs/README.md`. Plans and reviews are not kept on main.
- A doc names files by path and code by symbol. Line numbers go stale; add one only as "near
  line N".
- No photo and no picture made from one in any doc. No private photo names or codes. The one
  exception is the README hero (`docs/design/assets/hero.png`, the public domain Mona Lisa).
- Public docs say nothing about agent tooling. That goes in `AGENTS.md`, `CLAUDE.md` and `.claude/`.
