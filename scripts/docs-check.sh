#!/usr/bin/env bash
# Finds broken relative links in the repo's own Markdown files. A link is `[text](path)` or an
# HTML `src="path"` (an image) where path is not a URL or an anchor. Run it after you move or delete a doc. Exit 1 on a broken link.
source "$(dirname "$0")/lib.sh"

bad=0
while IFS= read -r file; do
  dir=$(dirname "$file")
  while IFS= read -r link; do
    target=${link%%#*}
    [ -z "$target" ] && continue
    if [ ! -e "$dir/$target" ]; then
      echo "broken: $file -> $link"
      bad=1
    fi
  done < <({
    grep -oE '\]\([^)[:space:]]+\)' "$file" | sed -E 's/^\]\(//; s/\)$//'
    grep -oE 'src="[^"]+"' "$file" | sed -E 's/^src="//; s/"$//'
  } | grep -vE '^(https?:|mailto:|data:|#)' || true)
done < <(git ls-files '*.md')

[ "$bad" = 0 ] && echo "docs links ok"
exit "$bad"
