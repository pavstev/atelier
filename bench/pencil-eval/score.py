"""Scores Pencil pictures against their photos with fixed metrics. Bench only, never shipped.

The metrics and their sources: docs/research/2026-11-14-graphite-pencil-science.md, section 5.

    uv run --with numpy --with scipy --with pillow python -I bench/pencil-eval/score.py DIR

DIR holds the photos as `photos/<photo>.png` and the pictures as `<tag>-<photo>.png` (any tag). A tag
named `tone` is the reference for the grain mean of the other tags. `--dark L` is the L* of the
darkest pencil of the set (17, the 9B, by default). `--csv OUT` also writes the rows.

T is the photo lightness stretched from its 1st to 99th percentile onto L --dark to 95; R is the
picture's lightness. Same inputs give the same numbers.
"""

import argparse
import csv
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, uniform_filter

PAPER = 95.0
# MS-SSIM: 5 scales and their weights (Wang, Simoncelli and Bovik 2003, table 1).
MS_WEIGHTS = np.array([0.0448, 0.2856, 0.3001, 0.2363, 0.1333])
# SSIM constants for a range of 100 (K1 = 0.01, K2 = 0.03).
C1, C2 = 1.0, 9.0
# One CIE76 step of lightness (Mahy et al. 1994).
JND = 2.3
# The patch of the grain mean, in px at 1024.
GRAIN_PATCH = 16


def l_star(path: Path, size: tuple[int, int] | None = None) -> np.ndarray:
    """The CIE L* of a picture, from its sRGB luminance; resized with Lanczos to `size` first."""
    img = Image.open(path).convert("RGB")
    if size is not None and img.size != size:
        img = img.resize(size, Image.LANCZOS)
    c = np.asarray(img, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    y = lin @ np.array([0.2126, 0.7152, 0.0722])
    f = np.where(y > (6 / 29) ** 3, np.cbrt(y), y / (3 * (6 / 29) ** 2) + 4 / 29)
    return 116.0 * f - 16.0


def stretch(photo: np.ndarray, dark: float) -> np.ndarray:
    """The photo's 1st to 99th percentile onto `dark` to paper, clamped."""
    lo, hi = np.percentile(photo, [1, 99])
    hi = max(hi, lo + 1e-6)
    return np.clip(dark + (photo - lo) / (hi - lo) * (PAPER - dark), dark, PAPER)


def ssim_parts(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """The mean luminance term and the mean contrast-structure term of SSIM (11 px Gaussian, 1.5)."""
    g = lambda x: gaussian_filter(x, 1.5, truncate=3.5)
    ma, mb = g(a), g(b)
    va, vb, cov = g(a * a) - ma * ma, g(b * b) - mb * mb, g(a * b) - ma * mb
    lum = (2 * ma * mb + C1) / (ma * ma + mb * mb + C1)
    cs = (2 * cov + C2) / (va + vb + C2)
    return float(lum.mean()), float(cs.mean())


def ms_ssim(a: np.ndarray, b: np.ndarray) -> float:
    """MS-SSIM over 5 scales, halved by a 2x2 mean between scales."""
    out = 1.0
    for j, w in enumerate(MS_WEIGHTS):
        lum, cs = ssim_parts(a, b)
        out *= max(cs, 1e-6) ** w
        if j == len(MS_WEIGHTS) - 1:
            out *= max(lum, 1e-6) ** w
        else:
            h, wd = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
            half = lambda x: x[:h, :wd].reshape(h // 2, 2, wd // 2, 2).mean(axis=(1, 3))
            a, b = half(a), half(b)
    return out


def grad(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gy, gx = np.gradient(x)
    return gx, gy


def banding(r: np.ndarray, t: np.ndarray) -> tuple[float, float]:
    """False contours (percent of smooth photo pixels where R jumps a JND or more to a neighbor)
    and gradient reversal (percent of pixels where R and T slope opposite ways, both over 1 L*/px)."""
    tx, ty = grad(gaussian_filter(t, 1.5))
    smooth = np.hypot(tx, ty) < 0.5
    step = np.zeros_like(r, dtype=bool)
    step[:, :-1] |= np.abs(np.diff(r, axis=1)) >= JND
    step[:-1, :] |= np.abs(np.diff(r, axis=0)) >= JND
    contours = 100.0 * (step & smooth).sum() / max(smooth.sum(), 1)
    rx, ry = grad(gaussian_filter(r, 1.0))
    tx, ty = grad(gaussian_filter(t, 1.0))
    both = (np.hypot(rx, ry) > 1) & (np.hypot(tx, ty) > 1)
    reversal = 100.0 * (both & (rx * tx + ry * ty < 0)).sum() / max(both.size, 1)
    return float(contours), float(reversal)


def grain_mean(r: np.ndarray, tone: np.ndarray) -> tuple[float, float]:
    """The mean absolute and the mean signed difference of the 16 px box means of R and of Tone."""
    k = max(2, round(GRAIN_PATCH * max(r.shape) / 1024))
    d = uniform_filter(r, k) - uniform_filter(tone, k)
    return float(np.abs(d).mean()), float(d.mean())


def score(dir_: Path, dark: float) -> list[dict]:
    rows = []
    for photo in sorted((dir_ / "photos").glob("*.png")):
        name = photo.stem
        pics = sorted(dir_.glob(f"*-{name}.png"))
        if not pics:
            continue
        size = Image.open(pics[0]).size
        t = stretch(l_star(photo, size), dark)
        tone_path = dir_ / f"tone-{name}.png"
        tone = l_star(tone_path) if tone_path.exists() else None
        for pic in pics:
            tag = pic.name[: -len(f"-{name}.png")]
            r = l_star(pic)
            p1, p99 = np.percentile(r, [1, 99])
            contours, reversal = banding(r, t)
            row = {
                "photo": name,
                "tag": tag,
                "ms_ssim": round(ms_ssim(r, t), 3),
                "mae": round(float(np.abs(r - t).mean()), 2),
                "mae_blur2": round(float(np.abs(gaussian_filter(r, 2) - t).mean()), 2),
                "range_use": round(float((p99 - p1) / (PAPER - dark)), 3),
                "contours_pct": round(contours, 2),
                "reversal_pct": round(reversal, 2),
            }
            if tone is not None and tag != "tone" and tone.shape == r.shape:
                gm, bias = grain_mean(r, tone)
                row["grain_mean"], row["grain_bias"] = round(gm, 2), round(bias, 2)
            rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir", type=Path)
    ap.add_argument("--dark", type=float, default=17.0)
    ap.add_argument("--csv", type=Path)
    a = ap.parse_args()
    rows = score(a.dir, a.dark)
    if not rows:
        print(f"no pictures in {a.dir}", file=sys.stderr)
        return 1
    keys = list(dict.fromkeys(k for r in rows for k in r))
    print("\t".join(keys))
    for r in rows:
        print("\t".join(str(r.get(k, "")) for k in keys))
    if a.csv:
        with a.csv.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
