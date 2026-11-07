# docs

What is current and what is history. The code wins over every doc. Old plans and replaced
designs are deleted from main; `git log` keeps them.

## Start here

- [../README.md](../README.md): what Atelier is and how to run it.
- [../ARCHITECTURE.md](../ARCHITECTURE.md): how the parts fit.
- [../CONTRIBUTING.md](../CONTRIBUTING.md): setup, checks and rules.

## Current

- [how-it-works/](how-it-works/README.md): how Values, Shapes, Edges and Grid draw.
- [web-app.md](web-app.md): what the app does, control by control, and how the web app is built.
- [development/](development/README.md): [testing](development/testing.md),
  [release](development/release.md) and the [bench](development/bench.md).
- [LEFTOVERS.md](LEFTOVERS.md): open work and known problems, with file pointers.
- [design/brand.md](design/brand.md): the logo, its files and how to change it.
- [design/2026-11-01-heroui-color-system.md](design/2026-11-01-heroui-color-system.md): the
  Graphite palette, the radius and the Hero UI part map. The theme is
  [app/web/src/styles/atelier-theme.css](../app/web/src/styles/atelier-theme.css).
- [research/2026-11-04-painting-value-science.md](research/2026-11-04-painting-value-science.md) and
  [research/2026-11-04-value-eval-spec.md](research/2026-11-04-value-eval-spec.md): the science
  behind Values and Shapes for oil painting, and the deterministic metrics that judge them
  (`bench/value-eval/`).

## History

Records of finished work. Do not plan from these without checking the code. They are not
rewritten.

- [research/2026-10-28-value-study-algorithm.md](research/2026-10-28-value-study-algorithm.md):
  the L* and Munsell choice for value studies.

## For AI coding tools

[../AGENTS.md](../AGENTS.md) and [../CLAUDE.md](../CLAUDE.md) give AI tools the rules and commands.
The setup is described in [../.claude/HARNESS.md](../.claude/HARNESS.md). The folder map is
[../MAP.md](../MAP.md).
