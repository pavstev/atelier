"""Scores the Values and Shapes bench pictures the way an oil painter judges a value study.

Bench only, never shipped. Every metric and its pass range is in
docs/research/2026-11-04-value-eval-spec.md, with the sources behind it.

Run from the repo root:
    uv run --with numpy --with scipy --with pillow python -I bench/value-eval/score.py [--only NAME] [--csv OUT]

It reads the photos and the rendered layers by absolute path under BENCH (.agents/bench in the
main checkout) and prints one row per photo and version, then the totals. Same inputs, same
numbers: no randomness, fixed bins, fixed iteration counts, ties broken by index.
"""

import argparse
import csv
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

BENCH = Path(__file__).resolve().parents[2] / ".agents" / "bench"
SHEETS = BENCH / "sheets-v3"
PHOTO_DIRS = [BENCH / "eval" / s / "photos" for s in ("owner", "portraits", "places")]
VERSIONS = ("old", "new", "new2")
# The sunset test photo has its old and first new sheets in its own folder.
SUNSET = {
    "photo": BENCH / "sunset" / "sunset.png",
    "old": BENCH / "sunset" / "sheets" / "before-{layer}-sunset.png",
    "new": BENCH / "sunset" / "sheets" / "v1-{layer}-sunset.png",
    "new2": SHEETS / "new2-{layer}-sunset.png",
}

# Squint: the photo is blurred by this share of its long side before it is judged.
SQUINT = 0.01
# A mass or a shape counts from this share of the picture; a speck is under SPECK.
MASS = 0.005
BIG_SHAPE = 0.01
SPECK = 0.0005

# name: (low, high), None for an open side. The spec gives the reason for each.
PASS = {
    "v_purity": (0.90, None),
    "v_worst": (None, 0.20),
    "v_dom": (0.40, 0.80),
    "v_gap": (1.5, None),
    "v_dark": (1.0, 3.5),
    "v_light": (7.0, 9.8),
    "v_order": (1, 1),
    "v_err": (None, 1.5),
    "v_masses": (2, 20),
    "v_speck": (None, 0.01),
    "s_big": (4, 20),
    "s_pstep": (1, 6),
    "s_purity": (0.85, None),
    "s_fid": (None, 6.0),
    "s_sep": (3.0, None),
    "s_accent": (None, 0.05),
    "s_speck": (None, 0.01),
    "x_lce": (None, 0.10),
}
COLS = list(PASS)


def l_star(rgb):
    """CIE L* of 8-bit sRGB (D65), the formula of srgb::l_star."""
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = 0.2126729 * lin[..., 0] + 0.7151522 * lin[..., 1] + 0.0721750 * lin[..., 2]
    f = np.where(y > (6 / 29) ** 3, np.cbrt(y), y / (3 * (6 / 29) ** 2) + 4 / 29)
    return 116 * f - 16


def oklab(rgb):
    """OKLab of 8-bit sRGB, times 100 so 1 unit is about one just-noticeable step."""
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m1 = np.array(
        [
            [0.4122214708, 0.5363325363, 0.0514459929],
            [0.2119034982, 0.6806995451, 0.1073969566],
            [0.0883024619, 0.2817188376, 0.6299787005],
        ]
    )
    m2 = np.array(
        [
            [0.2104542553, 0.7936177850, -0.0040720468],
            [1.9779984951, -2.4285922050, 0.4505937099],
            [0.0259040371, 0.7827717662, -0.8086757660],
        ]
    )
    lms = np.cbrt(lin @ m1.T)
    return 100 * (lms @ m2.T)


def otsu(values, lo=0.0, hi=100.0, bins=256):
    """The Otsu cut of `values` on a fixed histogram; ties go to the lowest bin."""
    hist, edges = np.histogram(values, bins=bins, range=(lo, hi))
    centers = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist).astype(np.float64)
    w1 = w0[-1] - w0
    m = np.cumsum(hist * centers)
    mu0 = np.divide(m, w0, out=np.zeros_like(m), where=w0 > 0)
    mu1 = np.divide(m[-1] - m, w1, out=np.zeros_like(m), where=w1 > 0)
    between = w0 * w1 * (mu0 - mu1) ** 2
    return float(edges[int(np.argmax(between)) + 1])


def kmeans_1d(values, k, iters=30):
    """Lloyd-Max levels of `values` from quantile seeds: the best flat k-tone error."""
    v = np.sort(values.ravel())
    levels = np.quantile(v, (np.arange(k) + 0.5) / k)
    for _ in range(iters):
        cuts = (levels[:-1] + levels[1:]) / 2
        idx = np.searchsorted(cuts, v)
        for j in range(k):
            part = v[idx == j]
            if part.size:
                levels[j] = part.mean()
    cuts = (levels[:-1] + levels[1:]) / 2
    return float(np.abs(v - levels[np.searchsorted(cuts, v)]).mean())


def load(path, size=None):
    im = Image.open(path).convert("RGB")
    if size is not None and im.size != size:
        im = im.resize(size, Image.Resampling.LANCZOS)
    return np.asarray(im)


def labels_of(index_map):
    """4-connected components of each value of `index_map`, numbered in scan order."""
    out = np.zeros(index_map.shape, np.int64)
    n = 0
    for v in np.unique(index_map):
        lab, k = ndimage.label(index_map == v)
        out[lab > 0] = lab[lab > 0] + n
        n += k
    return out, n


def speck_share(comp, n, total):
    sizes = np.bincount(comp.ravel(), minlength=n + 1)[1:]
    return float(sizes[sizes < SPECK * total].sum() / total)


def lce(a, b):
    """Local consistency error of two segmentations (Martin et al. 2001): 0 when one refines the other."""
    na, nb = int(a.max()) + 1, int(b.max()) + 1
    pair = np.bincount(
        (a.astype(np.int64) * nb + b).ravel(), minlength=na * nb
    ).reshape(na, nb)
    sa, sb = pair.sum(1, keepdims=True), pair.sum(0, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        e1 = np.where(pair > 0, (sa - pair) / sa, 0.0)
        e2 = np.where(pair > 0, (sb - pair) / sb, 0.0)
    return float((pair * np.minimum(e1, e2)).sum() / a.size)


def score_values(ph, vmap):
    gray = vmap[..., 0]
    tones = np.unique(gray)
    idx = np.searchsorted(tones, gray)
    tv = l_star(np.stack([tones] * 3, -1)) / 10
    k = len(tones)
    shares = np.bincount(idx.ravel(), minlength=k) / ph.total
    r = {"n": k}
    # Family purity: the best cut between two tones against the photo's light/shadow break.
    best, worst = 0.0, 1.0
    for cut in range(1, k):
        lit_map = idx >= cut
        agree = float((lit_map == ph.lit).mean())
        if agree > best:
            best = agree
            w = 0.0
            for j in range(k):
                sel = idx == j
                if sel.any():
                    wrong = ~ph.lit[sel] if j >= cut else ph.lit[sel]
                    w = max(w, float(wrong.mean()))
            worst = w
    r["v_purity"] = best
    r["v_worst"] = worst if k > 1 else 1.0
    r["v_dom"] = float(shares.max())
    r["v_gap"] = float(np.diff(tv).min()) if k > 1 else 0.0
    r["v_dark"] = float(tv.min())
    r["v_light"] = float(tv.max())
    means = np.array([ph.V[idx == j].mean() for j in range(k)])
    r["v_order"] = int(bool(np.all(np.diff(means) > 0)))
    err = float(np.abs(tv[idx] - ph.V).mean())
    r["v_err"] = err / max(kmeans_1d(ph.V, k), 1e-6)
    comp, n = labels_of(idx)
    sizes = np.bincount(comp.ravel(), minlength=n + 1)[1:]
    r["v_masses"] = int((sizes >= MASS * ph.total).sum())
    r["v_speck"] = speck_share(comp, n, ph.total)
    r["comp"] = comp
    return r


def score_shapes(ph, smap):
    flat = smap.reshape(-1, 3)
    piles, inv = np.unique(flat, axis=0, return_inverse=True)
    inv = inv.reshape(smap.shape[:2])
    p = len(piles)
    pl = l_star(piles)
    lab = oklab(piles)
    area = np.bincount(inv.ravel(), minlength=p) / ph.total
    # Steps from the photo: shadow under the break, halftone and light split at the Otsu cut of
    # the lit side, accents are small piles a full value beyond the area mean of their family.
    lit_l = ph.L[ph.lit]
    hl = otsu(lit_l, ph.brk, 100.0) if lit_l.size else ph.brk
    step = np.where(pl < ph.brk, 0, np.where(pl < hl, 1, 2))
    sh = step == 0
    mean_sh = np.average(pl[sh], weights=area[sh]) if area[sh].sum() > 0 else 0.0
    mean_li = np.average(pl[~sh], weights=area[~sh]) if area[~sh].sum() > 0 else 100.0
    accent = (area < 0.015) & (
        (sh & (pl <= mean_sh - 10)) | (~sh & (pl >= mean_li + 10))
    )
    step = np.where(accent, 3, step)
    r = {"piles": p}
    comp, n = labels_of(inv)
    sizes = np.bincount(comp.ravel(), minlength=n + 1)[1:]
    r["s_big"] = int((sizes >= BIG_SHAPE * ph.total).sum())
    per = np.bincount(step, minlength=4)
    r["s_pstep"] = int(per.max())
    r["steps"] = "/".join(str(int(x)) for x in per)
    shape_lit = (pl >= ph.brk)[inv]
    r["s_purity"] = float((shape_lit == ph.lit).mean())
    r["s_fid"] = float(np.linalg.norm(lab[inv] - ph.lab, axis=-1).mean())
    sep = np.inf
    for s in range(4):
        ids = np.flatnonzero(step == s)
        for a in range(len(ids)):
            for b in range(a + 1, len(ids)):
                sep = min(sep, float(np.linalg.norm(lab[ids[a]] - lab[ids[b]])))
    r["s_sep"] = sep if np.isfinite(sep) else 99.0
    r["s_accent"] = float(area[accent].sum())
    r["s_speck"] = speck_share(comp, n, ph.total)
    r["comp"] = comp
    return r


def passes(name, v):
    if v is None:
        return None
    lo, hi = PASS[name]
    return (lo is None or v >= lo) and (hi is None or v <= hi)


def sheet(ver, layer, name):
    if name == "sunset":
        at = SUNSET.get(ver, SHEETS / f"{ver}-{{layer}}-sunset.png")
        path = Path(str(at).format(layer=layer))
    else:
        path = SHEETS / f"{ver}-{layer}-{name}.png"
    return path if path.exists() else None


def photos(only):
    found = {"sunset": SUNSET["photo"]}
    for d in PHOTO_DIRS:
        for p in sorted(d.iterdir()):
            if p.suffix.lower() in (".jpg", ".jpeg", ".png"):
                found[p.stem] = p
    names = sorted(found)
    if only:
        names = [n for n in names if only in n]
    return [(n, found[n]) for n in names]


def fmt(v):
    if v is None:
        return "-"
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, str):
        return v
    return f"{v:.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--csv", default="")
    ap.add_argument("--versions", default=",".join(VERSIONS))
    args = ap.parse_args()
    versions = tuple(args.versions.split(","))
    rows = []
    for name, path in photos(args.only):
        ph = None
        for ver in versions:
            v_on, s_on = (
                sheet(ver, "values", name),
                sheet(ver, "shapes", name),
            )
            if v_on is None or s_on is None:
                continue
            vmap = load(v_on)
            size = (vmap.shape[1], vmap.shape[0])
            if ph is None or ph.size != size:
                ph = Photo(path, size)
            row = {"photo": name, "ver": ver}
            vr = score_values(ph, vmap)
            sr = score_shapes(ph, load(s_on))
            row["x_lce"] = lce(vr.pop("comp"), sr.pop("comp"))
            row.update(vr)
            row.update(sr)
            row["pass"] = sum(1 for c in COLS if passes(c, row.get(c)))
            row["checks"] = sum(1 for c in COLS if row.get(c) is not None)
            rows.append(row)
    if not rows:
        sys.exit("no sheets found")
    head = [
        "photo",
        "ver",
        "n",
        *COLS[:10],
        "piles",
        "steps",
        *COLS[10:],
        "pass",
        "checks",
    ]
    print("\t".join(head))
    for r in rows:
        print("\t".join(fmt(r.get(h)) for h in head))
    report_totals(rows, versions)
    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=head, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)


def report_totals(rows, versions):
    by_photo = {}
    for r in rows:
        by_photo.setdefault(r["photo"], {})[r["ver"]] = r
    sets = [
        (
            f"all {len(versions)}",
            [p for p, v in by_photo.items() if all(x in v for x in versions)],
            versions,
        ),
        (
            "old and new",
            [p for p, v in by_photo.items() if "old" in v and "new" in v],
            ("old", "new"),
        ),
    ]
    for title, names, vers in sets:
        if not names:
            continue
        print(
            f"\nTotals over {len(names)} photos with {title} versions (pass rate per metric):"
        )
        print("\t".join(["metric", *vers]))
        for c in [*COLS, "pass"]:
            cells = []
            for ver in vers:
                vals = [by_photo[p][ver].get(c) for p in names]
                if c == "pass":
                    got = sum(by_photo[p][ver]["pass"] for p in names)
                    out = sum(by_photo[p][ver]["checks"] for p in names)
                    cells.append(f"{got}/{out} ({100 * got / max(out, 1):.0f}%)")
                    continue
                ok = [passes(c, v) for v in vals if v is not None]
                nums = [float(v) for v in vals if v is not None]
                if not ok:
                    cells.append("-")
                    continue
                cells.append(f"{100 * sum(ok) / len(ok):.0f}% mean {np.mean(nums):.2f}")
            print("\t".join([c, *cells]))


if __name__ == "__main__":
    main()
