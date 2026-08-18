#!/usr/bin/env python3
"""Single-page pipeline: deskew → accurate convert (checkpoint) → schema extract.

Bills one convert page (+ extract). No ROI crops.

Usage:
  python3 scripts/ocr_pipeline.py data/input/test1.pdf
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from deskew import deskew_pdf_to_png  # noqa: E402
from lib_datalab import (  # noqa: E402
    api_base,
    http_json,
    multipart_encode,
    poll_result,
    require_api_key,
)


SCHEMA_PATH = ROOT / "schemas" / "daily_production_sheet.json"

CONVERT_MODES = ("accurate", "balanced", "fast")
EXTRACT_MODES = ("fast", "balanced", "turbo")


def convert_options(*, cheap: bool = True, mode: str = "accurate") -> dict[str, str]:
    """Convert settings.

    cheap/lean keeps handwriting-capable modes but strips paid add-ons:
    no word_bboxes, no table_cell_bboxes, single output format, no images.
    ``mode`` is the Datalab convert mode: accurate | balanced | fast.
    """
    convert_mode = mode if mode in CONVERT_MODES else "accurate"
    if cheap:
        return {
            "output_format": "markdown",
            "mode": convert_mode,
            "paginate": "false",
            "add_block_ids": "false",
            "word_bboxes": "false",
            "save_checkpoint": "true",
            "disable_image_extraction": "true",
            "disable_image_captions": "true",
            "additional_config": json.dumps(
                {
                    "keep_pageheader_in_output": True,
                    "keep_pagefooter_in_output": True,
                }
            ),
        }
    return {
        "output_format": "markdown,html,json",
        "mode": convert_mode,
        "paginate": "false",
        "add_block_ids": "true",
        "word_bboxes": "true",
        "save_checkpoint": "true",
        "disable_image_extraction": "true",
        "disable_image_captions": "true",
        "extras": "table_cell_bboxes",
        "additional_config": json.dumps(
            {
                "keep_pageheader_in_output": True,
                "keep_pagefooter_in_output": True,
            }
        ),
    }


def run_convert(
    file_path: Path,
    api_key: str,
    out_dir: Path,
    *,
    cheap: bool,
    mime: str,
    mode: str = "accurate",
) -> dict:
    base = api_base()
    fields = convert_options(cheap=cheap, mode=mode)
    body, ctype = multipart_encode(
        fields,
        {"file": (file_path.name, file_path.read_bytes(), mime)},
    )
    (out_dir / "10_convert_request.json").write_text(
        json.dumps(
            {
                "file": str(file_path),
                "options": fields,
                "cheap": cheap,
                "mode": mode,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Convert {file_path.name} (mode={mode}, cheap={cheap})…")
    initial = http_json("POST", f"{base}/api/v1/convert", api_key, body, ctype)
    (out_dir / "11_convert_submit.json").write_text(
        json.dumps(initial, indent=2), encoding="utf-8"
    )
    check_url = initial.get("request_check_url")
    if not check_url:
        raise SystemExit(f"No request_check_url: {initial}")
    print(f"  request_id={initial.get('request_id')}")
    result = poll_result(check_url, api_key, label="convert")
    (out_dir / "12_convert_result_raw.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if result.get("markdown"):
        (out_dir / "convert_result.md").write_text(result["markdown"], encoding="utf-8")
    if result.get("html"):
        (out_dir / "convert_result.html").write_text(result["html"], encoding="utf-8")
    if result.get("json") is not None:
        (out_dir / "convert_result.json").write_text(
            json.dumps(result["json"], indent=2, ensure_ascii=False), encoding="utf-8"
        )
    if not result.get("success") or result.get("status") == "failed":
        raise SystemExit(f"Convert failed: {result.get('error')}")
    if not result.get("checkpoint_id"):
        raise SystemExit("Convert succeeded but no checkpoint_id — cannot extract without re-parse")
    return result


def run_extract(
    checkpoint_id: str,
    api_key: str,
    out_dir: Path,
    *,
    extraction_mode: str,
) -> dict:
    base = api_base()
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    fields = {
        "checkpoint_id": checkpoint_id,
        "page_schema": json.dumps(schema),
        "extraction_mode": extraction_mode,
        "output_format": "json",
    }
    (out_dir / "20_extract_request.json").write_text(
        json.dumps(
            {
                "checkpoint_id": checkpoint_id,
                "extraction_mode": extraction_mode,
                "schema_title": schema.get("title"),
                "schema_path": str(SCHEMA_PATH),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    body, ctype = multipart_encode(fields)
    print(f"Extract via checkpoint {checkpoint_id[:24]}… ({extraction_mode})")
    initial = http_json("POST", f"{base}/api/v1/extract", api_key, body, ctype)
    (out_dir / "21_extract_submit.json").write_text(
        json.dumps(initial, indent=2), encoding="utf-8"
    )
    check_url = initial.get("request_check_url")
    if not check_url:
        raise SystemExit(f"No request_check_url: {initial}")
    print(f"  request_id={initial.get('request_id')}")
    result = poll_result(check_url, api_key, label="extract")

    # Optionally wait briefly for scoring fields if present later — keep first complete.
    (out_dir / "22_extract_result_raw.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    extracted_raw = result.get("extraction_schema_json")
    if isinstance(extracted_raw, str):
        try:
            extracted = json.loads(extracted_raw)
        except json.JSONDecodeError:
            extracted = {"_unparsed": extracted_raw}
    elif extracted_raw is not None:
        extracted = extracted_raw
    else:
        extracted = None

    if extracted is not None:
        (out_dir / "extract_structured.json").write_text(
            json.dumps(extracted, indent=2, ensure_ascii=False), encoding="utf-8"
        )

        def _clean(obj):
            if isinstance(obj, list):
                return [_clean(x) for x in obj]
            if isinstance(obj, dict):
                return {
                    k: _clean(v)
                    for k, v in obj.items()
                    if not (
                        k.endswith("_citations")
                        or k.endswith("_meta")
                        or k.endswith("_score")
                    )
                }
            return obj

        (out_dir / "extract_structured_clean.json").write_text(
            json.dumps(_clean(extracted), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    if not result.get("success") or result.get("status") == "failed":
        raise SystemExit(f"Extract failed: {result.get('error')}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Deskew → convert → extract (1 page)")
    parser.add_argument(
        "pdf",
        nargs="?",
        default=str(ROOT / "data" / "input" / "test1.pdf"),
    )
    parser.add_argument("--out", default=str(ROOT / "data" / "output"))
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument(
        "--cheap",
        action="store_true",
        help="Accurate convert without paid extras; fast extract (recommended default cost mode)",
    )
    parser.add_argument(
        "--skip-deskew",
        action="store_true",
        help="Convert original PDF without deskew (still 1 page)",
    )
    parser.add_argument(
        "--extraction-mode",
        default="",
        help="Override extract mode: fast | balanced | turbo (default: fast if --cheap else balanced)",
    )
    parser.add_argument(
        "--checkpoint",
        default="",
        help="Skip convert; extract only using an existing checkpoint_id",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.is_file():
        raise SystemExit(f"File not found: {pdf_path}")

    cheap = bool(args.cheap)
    extraction_mode = (args.extraction_mode or ("fast" if cheap else "balanced")).strip()

    api_key = require_api_key(ROOT)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tag = "cheap" if cheap else "full"
    out_dir = (
        Path(args.out).expanduser().resolve()
        / f"{pdf_path.stem}_pipeline_{tag}_{stamp}"
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    summary: dict = {
        "input": str(pdf_path),
        "output_dir": str(out_dir),
        "schema": str(SCHEMA_PATH),
        "cheap": cheap,
        "extraction_mode": extraction_mode,
    }

    checkpoint_id = args.checkpoint.strip()
    if not checkpoint_id:
        # Cheap path skips deskew when not requested — prior scans were ~0° and deskew
        # re-uploads a PNG (still 1 page) with no quality win for this form set.
        do_deskew = (not args.skip_deskew) and (not cheap)
        if do_deskew:
            png_path = out_dir / "00_deskewed.png"
            print("Deskewing…")
            deskew_meta = deskew_pdf_to_png(pdf_path, png_path, dpi=args.dpi)
            (out_dir / "00_deskew.json").write_text(
                json.dumps(deskew_meta, indent=2), encoding="utf-8"
            )
            print(
                f"  skew_degrees_applied={deskew_meta['skew_degrees_applied']} "
                f"→ {png_path.name}"
            )
            summary["deskew"] = deskew_meta
            convert_result = run_convert(
                png_path, api_key, out_dir, cheap=cheap, mime="image/png"
            )
        else:
            summary["deskew"] = None
            convert_result = run_convert(
                pdf_path,
                api_key,
                out_dir,
                cheap=cheap,
                mime="application/pdf",
            )

        checkpoint_id = convert_result["checkpoint_id"]
        summary["convert"] = {
            "request_success": convert_result.get("success"),
            "page_count": convert_result.get("page_count"),
            "parse_quality_score": convert_result.get("parse_quality_score"),
            "cost_breakdown": convert_result.get("cost_breakdown"),
            "checkpoint_id": checkpoint_id,
        }
    else:
        summary["convert"] = {"skipped": True, "checkpoint_id": checkpoint_id}
        print(f"Skipping convert; using checkpoint {checkpoint_id}")

    extract_result = run_extract(
        checkpoint_id, api_key, out_dir, extraction_mode=extraction_mode
    )
    summary["extract"] = {
        "success": extract_result.get("success"),
        "page_count": extract_result.get("page_count"),
        "cost_breakdown": extract_result.get("cost_breakdown"),
        "extraction_score_average": extract_result.get("extraction_score_average"),
        "has_extraction_schema_json": bool(extract_result.get("extraction_schema_json")),
    }

    (out_dir / "30_pipeline_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))
    print(f"\nDone → {out_dir}")
    print(f"  structured: {out_dir / 'extract_structured_clean.json'}")


if __name__ == "__main__":
    main()
