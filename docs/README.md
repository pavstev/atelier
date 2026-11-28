# docs

What is current and what is history. The code wins over every doc. Old plans and replaced
designs are deleted from main; `git log` keeps them.

## Start here

- [../README.md](../README.md): what Atelier is and how to run it.
- [../ARCHITECTURE.md](../ARCHITECTURE.md): how the parts fit.
- [../CONTRIBUTING.md](../CONTRIBUTING.md): setup, checks and rules.

## Current

- [how-it-works/](how-it-works/README.md): how Values, Shapes and Grid draw.
- [web-app.md](web-app.md): what the app does, control by control, and how the web app is built.
- [testing](development/testing.md), [release](development/release.md), the
  [bench](development/bench.md) and the [Mac app](development/mac-app.md).
- [LEFTOVERS.md](LEFTOVERS.md): open work and known problems, with file pointers.
- [design/brand.md](design/brand.md): the logo, its files and how to change it.
- [design/2026-11-01-heroui-color-system.md](design/2026-11-01-heroui-color-system.md): the
  Graphite palette and its contrast numbers. The theme is
  [app/web/src/styles/atelier-theme.css](../app/web/src/styles/atelier-theme.css).
- [research/2026-11-04-painting-value-science.md](research/2026-11-04-painting-value-science.md) and
  [research/2026-11-04-value-eval-spec.md](research/2026-11-04-value-eval-spec.md): the science
  behind Values and Shapes for oil painting, and the deterministic metrics that judge them
  (`bench/value-eval/`).
- [research/2026-11-13-acrylic-paint-spectra.md](research/2026-11-13-acrylic-paint-spectra.md): the
  model and the data limits behind the color picker's paint mix.

## History

Records of finished work. Do not plan from these without checking the code. They are not
rewritten.

- [research/2026-10-28-value-study-algorithm.md](research/2026-10-28-value-study-algorithm.md):
  the L* and Munsell choice for value studies.
- [research/2026-11-14-graphite-pencil-grades.md](research/2026-11-14-graphite-pencil-grades.md) and
  [research/2026-11-14-graphite-pencil-science.md](research/2026-11-14-graphite-pencil-science.md):
  research for the Pencil base, which was cut on 2026-11-28. They are history. The code and the
  rest of the docs no longer have a Pencil base.
- Other research notes may still name Pencil, Edges, tints or the Paper base. Those parts are cut.
  Read such a note as a record.

## For AI coding tools

[../AGENTS.md](../AGENTS.md) and [../CLAUDE.md](../CLAUDE.md) give AI tools the rules and commands.
The setup is described in [../.claude/HARNESS.md](../.claude/HARNESS.md). The folder map is
[../MAP.md](../MAP.md).
