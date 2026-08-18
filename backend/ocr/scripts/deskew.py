#!/usr/bin/env python3
"""Deskew a scanned form image using horizontal-line projection (stdlib + Pillow).

Finds the rotation in a small angle range that maximises variance of the
horizontal ink projection — strong for ruled forms like PR-FO-4623.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageOps, ImageFilter


def _projection_score(img: Image.Image) -> float:
    """Higher = sharper horizontal line structure."""
    g = ImageOps.grayscale(img)
    # Emphasize dark rulings
    bw = g.point(lambda p: 255 if p < 140 else 0)
    w, h = bw.size
    # Row ink sums
    px = bw.load()
    row_sums = []
    for y in range(h):
        s = 0
        for x in range(0, w, 2):  # stride for speed
            s += 1 if px[x, y] > 0 else 0
        row_sums.append(s)
    if not row_sums:
        return 0.0
    mean = sum(row_sums) / len(row_sums)
    var = sum((v - mean) ** 2 for v in row_sums) / len(row_sums)
    return var


def estimate_skew_degrees(
    img: Image.Image,
    max_angle: float = 4.0,
    step: float = 0.25,
) -> float:
    """Return best deskew angle in degrees (positive = CCW)."""
    # Work on a small preview for speed
    preview = img.copy()
    preview.thumbnail((900, 900), Image.Resampling.BILINEAR)
    preview = ImageOps.autocontrast(preview.filter(ImageFilter.FIND_EDGES))

    best_angle = 0.0
    best_score = -1.0
    angle = -max_angle
    while angle <= max_angle + 1e-9:
        rotated = preview.rotate(angle, resample=Image.Resampling.BILINEAR, expand=False, fillcolor=255)
        score = _projection_score(rotated)
        if score > best_score:
            best_score = score
            best_angle = angle
        angle = round(angle + step, 4)
    return best_angle


def deskew_image(img: Image.Image, max_angle: float = 4.0) -> tuple[Image.Image, float]:
    """Return (deskewed_image, angle_degrees_applied).

    ``estimate_skew_degrees`` returns the PIL CCW angle that maximises horizontal
    line score on a preview; apply the same angle to the full image.
    """
    angle = estimate_skew_degrees(img, max_angle=max_angle)
    if abs(angle) < 0.05:
        return img.copy(), 0.0
    out = img.rotate(
        angle, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white"
    )
    return out, angle


def render_pdf_page(pdf_path: Path, dpi: int = 200) -> Image.Image:
    """Render first PDF page via pdftoppm (poppler)."""
    import subprocess
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        out_prefix = Path(td) / "page"
        subprocess.run(
            ["pdftoppm", "-png", "-r", str(dpi), "-f", "1", "-l", "1", str(pdf_path), str(out_prefix)],
            check=True,
        )
        pages = sorted(Path(td).glob("page*.png"))
        if not pages:
            raise RuntimeError(f"pdftoppm produced no pages for {pdf_path}")
        return Image.open(pages[0]).convert("RGB")


def deskew_pdf_to_png(pdf_path: Path, out_png: Path, dpi: int = 200) -> dict:
    img = render_pdf_page(pdf_path, dpi=dpi)
    deskewed, angle = deskew_image(img)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    deskewed.save(out_png, format="PNG")
    return {
        "source_pdf": str(pdf_path),
        "output_png": str(out_png),
        "dpi": dpi,
        "skew_degrees_applied": angle,
        "input_size": list(img.size),
        "output_size": list(deskewed.size),
    }


if __name__ == "__main__":
    import argparse
    import json

    p = argparse.ArgumentParser()
    p.add_argument("pdf")
    p.add_argument("-o", "--output", required=True)
    p.add_argument("--dpi", type=int, default=200)
    args = p.parse_args()
    meta = deskew_pdf_to_png(Path(args.pdf), Path(args.output), dpi=args.dpi)
    print(json.dumps(meta, indent=2))
