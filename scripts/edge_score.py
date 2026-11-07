# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy", "pillow"]
# ///
"""Approximate BSDS500 edge score of the Edges layer.

Usage:
  uv run scripts/edge_score.py --pred OUT --bsds DIR [--n 20] [--tol 0.0075]
  uv run scripts/edge_score.py --self-test

OUT holds one gray PNG per photo (made by `cargo run --example edge_score`), white is ink. DIR is
`BSR/BSDS500/data`. The score is the ODS F with a tolerance match: a predicted pixel counts when a
human boundary pixel lies within tol x the image diagonal, and the other way round. It is NOT the
official bipartite match, so it sits a little above the published numbers. Use it to compare two versions of Edges on
the same images. Run it with `uv run`, which reads the dependencies from the block above.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np


def thresholds():
    import numpy as np

    return np.linspace(0.05, 0.95, 19)


def thin(img: np.ndarray) -> np.ndarray:
    """Zhang and Suen thinning of a bool image, to lines one pixel wide."""
    import numpy as np

    img = np.pad(img.copy(), 1)
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            p = [
                img[:-2, 1:-1], img[:-2, 2:], img[1:-1, 2:], img[2:, 2:],
                img[2:, 1:-1], img[2:, :-2], img[1:-1, :-2], img[:-2, :-2],
            ]  # fmt: skip
            centre = img[1:-1, 1:-1]
            n = sum(q.astype(np.int8) for q in p)
            seq = p + [p[0]]
            a = sum(((~seq[i]) & seq[i + 1]).astype(np.int8) for i in range(8))
            if step == 0:
                c = ~(p[0] & p[2] & p[4]) & ~(p[2] & p[4] & p[6])
            else:
                c = ~(p[0] & p[2] & p[6]) & ~(p[0] & p[4] & p[6])
            kill = centre & (n >= 2) & (n <= 6) & (a == 1) & c
            if kill.any():
                img[1:-1, 1:-1] = centre & ~kill
                changed = True
    return img[1:-1, 1:-1]


def gt_boundaries(bsds: Path, stem: str) -> list[np.ndarray]:
    import numpy as np
    from scipy import io as sio

    mat = sio.loadmat(bsds / "groundTruth" / "test" / f"{stem}.mat")
    cells = mat["groundTruth"][0]
    return [np.asarray(c["Boundaries"][0][0], dtype=bool) for c in cells]


def match_counts(pred: np.ndarray, gts: list[np.ndarray], tol_px: float) -> tuple[int, int, int, int]:
    """Returns (matched pred, total pred, matched gt, total gt) with a tolerance match."""
    import numpy as np
    from scipy.ndimage import distance_transform_edt

    pred = thin(pred)
    gt_any = np.any(np.stack(gts), axis=0)
    dist_to_gt = distance_transform_edt(~gt_any)
    tp_pred = int((pred & (dist_to_gt <= tol_px)).sum())
    n_pred = int(pred.sum())
    if n_pred:
        dist_to_pred = distance_transform_edt(~pred)
    else:
        dist_to_pred = np.full(pred.shape, np.inf)
    tp_gt = 0
    n_gt = 0
    for g in gts:
        tp_gt += int((g & (dist_to_pred <= tol_px)).sum())
        n_gt += int(g.sum())
    return tp_pred, n_pred, tp_gt, n_gt


def best_f(sums: np.ndarray) -> dict[str, float]:
    """The threshold row with the best F: f, precision, recall, threshold."""
    best = {"f": 0.0, "p": 0.0, "r": 0.0, "t": 0.0}
    for i, t in enumerate(thresholds()):
        tp_p, n_p, tp_g, n_g = sums[i]
        p = tp_p / n_p if n_p else 0.0
        r = tp_g / n_g if n_g else 0.0
        f = 2 * p * r / (p + r) if p + r else 0.0
        if f > best["f"]:
            best = {"f": f, "p": p, "r": r, "t": float(t)}
    return best


def self_test() -> None:
    """A ground truth scored against itself must give F 1.0."""
    import numpy as np

    gt = np.zeros((60, 80), dtype=bool)
    gt[20, 10:70] = True
    gt[10:50, 40] = True
    tol = 0.0075 * float(np.hypot(80, 60))
    sums = np.zeros((len(thresholds()), 4), dtype=np.int64)
    for i in range(len(thresholds())):
        sums[i] = match_counts(gt.copy(), [gt], tol)
    best = best_f(sums)
    assert abs(best["f"] - 1.0) < 1e-9, best
    print(f"self test ok: F {best['f']:.3f} P {best['p']:.3f} R {best['r']:.3f}")


def main() -> None:
    import numpy as np
    from PIL import Image

    ap = argparse.ArgumentParser()
    ap.add_argument("--pred", type=Path)
    ap.add_argument("--bsds", type=Path)
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--tol", type=float, default=0.0075)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.pred or not args.bsds:
        sys.exit("need --pred and --bsds (or --self-test)")
    images = sorted((args.bsds / "images" / "test").glob("*.jpg"))[: args.n]
    if not images:
        sys.exit("no BSDS images in " + str(args.bsds))
    sums = np.zeros((len(thresholds()), 4), dtype=np.int64)
    for path in images:
        size = Image.open(path).size
        out = Image.open(args.pred / f"{path.stem}.png").convert("L")
        if out.size != size:
            out = out.resize(size, Image.BILINEAR)
        prob = np.asarray(out, dtype=np.float32) / 255.0
        gts = gt_boundaries(args.bsds, path.stem)
        tol_px = args.tol * float(np.hypot(*size))
        for i, t in enumerate(thresholds()):
            sums[i] += match_counts(prob >= t, gts, tol_px)
    b = best_f(sums)
    print(f"approx ODS F {b['f']:.3f} (P {b['p']:.3f} R {b['r']:.3f} at t={b['t']:.2f}) on {len(images)} images")


if __name__ == "__main__":
    main()
