#!/usr/bin/env python3
"""Generate web-sized photo derivatives and rebuild data/photos.json.

Reads every image in photos/originals/, writes a grid thumbnail and a larger
display copy as WebP, pulls the camera settings out of EXIF, and regenerates
data/photos.json.

photos/originals/ is gitignored: the originals stay on your machine and only the
derivatives are published. Keep your own backup of that directory — it is the
input this script needs, and it is not in the repository.

Captions are the one thing EXIF cannot supply, so any `caption`, `alt`, or
`location` already present in data/photos.json is carried over. Edit those
fields in the JSON, re-run this script, and they survive.

    python3 tools/build_photos.py

Derivatives are skipped when they are newer than the original; pass --force to
rebuild them all.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ExifTags, ImageOps
except ImportError:
    sys.exit("Pillow is required: python3 -m pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
ORIGINALS = ROOT / "photos" / "originals"
THUMB_DIR = ROOT / "photos" / "thumb"
LARGE_DIR = ROOT / "photos" / "large"
OUTPUT = ROOT / "data" / "photos.json"

# Grid tiles render at roughly 300 CSS px, so 800px covers a 2x display.
THUMB_WIDTH = 800
THUMB_QUALITY = 78

# Expanded cards span the full content column (max 1000 CSS px).
LARGE_EDGE = 2000
LARGE_QUALITY = 82

SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}
TAG_IDS = {name: tag for tag, name in ExifTags.TAGS.items()}

# Fields a human writes; never overwritten by this script.
PRESERVED = ("caption", "alt", "location")


def exif_fields(image: Image.Image) -> dict:
    """Pull the handful of EXIF values we display, tolerating missing tags."""
    exif = image.getexif()
    if not exif:
        return {}
    inner = exif.get_ifd(0x8769)

    def get(name):
        tag = TAG_IDS.get(name)
        if tag is None:
            return None
        return inner.get(tag, exif.get(tag))

    fields = {}

    model = get("Model")
    make = get("Make")
    if model:
        model = str(model).strip()
        make = str(make).strip() if make else ""
        # "Canon" + "Canon EOS 6D" should not become "Canon Canon EOS 6D".
        fields["camera"] = model if not make or model.startswith(make) else f"{make} {model}"

    lens = get("LensModel")
    if lens:
        fields["lens"] = str(lens).strip()

    focal = get("FocalLength")
    if focal:
        fields["focalLength"] = f"{float(focal):g}mm"

    aperture = get("FNumber")
    if aperture:
        fields["aperture"] = f"f/{float(aperture):g}"

    shutter = get("ExposureTime")
    if shutter:
        shutter = float(shutter)
        fields["shutter"] = f"{shutter:g}s" if shutter >= 1 else f"1/{round(1 / shutter)}s"

    iso = get("ISOSpeedRatings") or get("PhotographicSensitivity")
    if iso:
        iso = iso[0] if isinstance(iso, (tuple, list)) else iso
        fields["iso"] = f"ISO {int(iso)}"

    taken = get("DateTimeOriginal")
    if taken:
        try:
            stamp = datetime.strptime(str(taken), "%Y:%m:%d %H:%M:%S")
            fields["taken"] = stamp.strftime("%Y-%m-%d")
            fields["year"] = stamp.year
        except ValueError:
            pass

    return fields


def has_gps(image: Image.Image) -> bool:
    exif = image.getexif()
    return bool(exif and exif.get_ifd(0x8825))


def write_derivative(image: Image.Image, path: Path, box: tuple[int, int], quality: int):
    copy = image.copy()
    copy.thumbnail(box, Image.LANCZOS)
    if copy.mode not in ("RGB", "L"):
        copy = copy.convert("RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    # No exif= argument: derivatives carry no EXIF, so GPS never reaches the web.
    copy.save(path, "WEBP", quality=quality, method=6)
    return copy.size


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="rebuild derivatives that are up to date")
    args = parser.parse_args()

    if not ORIGINALS.is_dir():
        sys.exit(f"No originals directory at {ORIGINALS.relative_to(ROOT)}")

    existing = {}
    if OUTPUT.exists():
        for entry in json.loads(OUTPUT.read_text()).get("photos", []):
            if "id" in entry:
                existing[entry["id"]] = entry

    sources = sorted(p for p in ORIGINALS.iterdir() if p.suffix.lower() in SUFFIXES)
    if not sources:
        sys.exit(f"No images found in {ORIGINALS.relative_to(ROOT)}")

    photos, gps_seen, total_bytes = [], [], 0

    for source in sources:
        photo_id = source.stem
        thumb_path = THUMB_DIR / f"{photo_id}.webp"
        large_path = LARGE_DIR / f"{photo_id}.webp"

        with Image.open(source) as image:
            fields = exif_fields(image)
            if has_gps(image):
                gps_seen.append(source.name)
            # Bake in EXIF orientation so the browser never has to rotate.
            oriented = ImageOps.exif_transpose(image)

            stale = args.force or not thumb_path.exists() or not large_path.exists()
            if not stale:
                mtime = source.stat().st_mtime
                stale = thumb_path.stat().st_mtime < mtime or large_path.stat().st_mtime < mtime

            if stale:
                write_derivative(oriented, thumb_path, (THUMB_WIDTH, THUMB_WIDTH * 3), THUMB_QUALITY)
                large_size = write_derivative(oriented, large_path, (LARGE_EDGE, LARGE_EDGE), LARGE_QUALITY)
            else:
                with Image.open(large_path) as existing_large:
                    large_size = existing_large.size

        previous = existing.get(photo_id, {})
        caption = previous.get("caption") or photo_id.replace("_", " ")
        entry = {
            "id": photo_id,
            "thumb": f"photos/thumb/{photo_id}.webp",
            "src": f"photos/large/{photo_id}.webp",
            "width": large_size[0],
            "height": large_size[1],
            "caption": caption,
            "alt": previous.get("alt") or caption,
            **{key: previous[key] for key in PRESERVED if key in previous and key not in ("caption", "alt")},
            **fields,
        }
        photos.append(entry)

        sizes = (thumb_path.stat().st_size, large_path.stat().st_size)
        total_bytes += sizes[0]
        flag = "" if previous.get("caption") else "  <- needs a caption"
        print(
            f"{photo_id:<12} {large_size[0]:>5}x{large_size[1]:<5} "
            f"thumb {sizes[0] / 1024:>6.0f}KB  large {sizes[1] / 1024:>6.0f}KB{flag}"
        )

    # Newest first.
    photos.sort(key=lambda p: p.get("taken", ""), reverse=True)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"photos": photos}, indent=2, ensure_ascii=False) + "\n")

    print(f"\n{len(photos)} photos -> {OUTPUT.relative_to(ROOT)}")
    print(f"Grid weight if all on one page: {total_bytes / 1024 / 1024:.2f} MB")
    if gps_seen:
        print(f"\nGPS data found in {len(gps_seen)} original(s); derivatives are stripped of all EXIF.")
    missing = [p["id"] for p in photos if p["caption"] == p["id"].replace("_", " ")]
    if missing:
        print(f"\nStill using filenames as captions: {', '.join(missing)}")
        print(f"Edit the caption fields in {OUTPUT.relative_to(ROOT)} and re-run.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
