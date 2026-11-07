# The three commands of the dotfiles harness contract (see .claude/HARNESS.md). The real work lives
# in mise.toml; these targets only call it, so `proj detect` finds them.
#   make check                the full gate (mise run check)
#   make check-fast           the fast check (mise run check:fast)
#   make check-fast STAGED=1  format and lint of the staged files only (the pre-commit hook)
#   make fix                  format Rust and the web files, apply the safe Biome fixes
.PHONY: check check-fast fix

check:
	mise run check

check-fast:
ifeq ($(STAGED),1)
	lefthook run pre-commit
else
	mise run check:fast
endif

fix:
	cargo fmt --all
	pnpm --dir app/web lint --write
