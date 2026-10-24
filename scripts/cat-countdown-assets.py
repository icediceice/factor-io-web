#!/usr/bin/env python3
"""Build assets/cat-countdown/ for the catcountdown.factor-io.com landing page.

    ~/.venv-rembg/bin/python3 -I scripts/cat-countdown-assets.py [--clips DIR] [--only art|clips]

Reads the app's own art from /Git/cat_countdown_flutter (READ-ONLY; nothing there is
written) and the simulator recordings in --clips (raw .mov files made on mac-mini with
`xcrun simctl io <udid> recordVideo --codec=h264`, never committed). Writes only under
assets/cat-countdown/ and is safe to re-run: every output is regenerated from source.

Outputs (names are what cat-countdown.html references):
  scenes/<cat>-<category>.webp        117 storybook scenes (the card art), 360px
  looks/<cat>-<category>-<n>.webp     the five "Choose the look" variants per scene, 240px
  poses/<cat>-<pose>.webp             nine poses per cat, 240px
  cats/<cat>-alarm.webp               the alarm-screen animation, animated WebP, 256px
  cats/<cat>-still.webp               its first frame, for reduced motion
  categories/<category>.webp          the 13 category icons, 160px
  widgets/<cat>-<shape>-<mood>.webp   home-screen widget art, 480px wide
  captures/<name>.mp4 + .jpg          simulator recordings, H.264, 960px tall, no audio
  og.jpg                              1200x630 share card from the store feature graphic
  manifest.json                       counts and bytes, read by the page build checks
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

APP = Path("/Git/cat_countdown_flutter")
ART = APP / "assets/images"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/cat-countdown"

# lib/core/cat/cat.dart order, as the app lists them.
CATS = ["sakura", "nimbus", "luna", "nori", "tangerine", "chai", "coco", "mallow", "yuki"]
# lib/core/category/countdown_category.dart ids, in enum order.
CATEGORIES = ["anniversary", "birthday", "trip", "exam", "pregnancy", "baby", "me_time",
              "medical", "work", "family", "festival", "shopping", "others"]
POSES = ["waving", "playing", "sitting", "sleeping", "stretching", "surprised", "thinking",
         "celebrating"]
WIDGET_MOODS = ["celebrate", "eager", "playful", "sleep"]

# Clip name -> (source .mov, start s, duration s). Starts skip the app launch.
CLIPS = {
    "tour": ("tour_detail", 2.0, 18.0),
    "notes": ("notes", 0.5, 12.0),
    "tasks": ("tasks", 0.3, 6.0),
    "wizard": ("wizard", 1.0, 21.0),
    "alarm": ("alarm", 8.0, 12.0),  # ringing screen starts ~8s in
    "bg-heart": ("bg_heart", 0.5, 5.0),
    "bg-flower": ("bg_flower", 0.5, 5.0),
    "bg-glitter": ("bg_glitter", 0.5, 5.0),
    "bg-starlight": ("bg_starlight", 0.5, 5.0),
    "bg-fireflies": ("bg_fireflies", 0.5, 5.0),
    "bg-ember": ("bg_ember", 0.5, 5.0),
    "bg-season": ("bg_season", 0.5, 5.0),
}


def save_webp(im: Image.Image, dst: Path, width: int, quality: int) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=quality, method=6)


def still(name: str, dst: Path, width: int, quality: int = 72) -> None:
    with Image.open(ART / name) as im:
        save_webp(im.convert("RGBA"), dst, width, quality)


def animated(name: str, dst: Path, size: int, quality: int) -> None:
    """Re-encode an animated WebP frame by frame (ffmpeg cannot decode animated WebP)."""
    frames, durations = [], []
    with Image.open(ART / name) as im:
        for i in range(im.n_frames):
            im.seek(i)
            frames.append(im.convert("RGBA").resize((size, size), Image.LANCZOS))
            durations.append(im.info.get("duration", 40))
    dst.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(dst, "WEBP", save_all=True, append_images=frames[1:], duration=durations,
                   loop=0, quality=quality, method=6)
    frames[0].save(dst.with_name(dst.name.replace("-alarm", "-still")), "WEBP",
                   quality=80, method=6)


def art() -> None:
    for d in ("scenes", "looks", "poses", "cats", "categories", "widgets"):
        shutil.rmtree(OUT / d, ignore_errors=True)
    for cat in CATS:
        for cg in CATEGORIES:
            slug = cg.replace("_", "-")
            still(f"cat_{cat}_{cg}_default.webp", OUT / f"scenes/{cat}-{slug}.webp", 360)
            for n in range(1, 6):
                still(f"cat_{cat}_{cg}_v{n}.webp", OUT / f"looks/{cat}-{slug}-{n}.webp", 240, 66)
        for pose in POSES:
            still(f"cat_{cat}_{pose}.webp", OUT / f"poses/{cat}-{pose}.webp", 240)
        animated(f"cat_{cat}_alarm.webp", OUT / f"cats/{cat}-alarm.webp", 256, 62)
        for mood in WIDGET_MOODS:
            for shape in ("banner", "square"):
                still(f"catw_{cat}_{shape}_{mood}_v1.webp",
                      OUT / f"widgets/{cat}-{shape}-{mood}.webp", 480, 70)
    for cg in CATEGORIES:
        still(f"ic_cat_{cg}.webp", OUT / f"categories/{cg.replace('_', '-')}.webp", 160, 80)
    with Image.open(APP / "store/graphics/feature_1024x500.png") as im:
        bg = Image.new("RGB", (1200, 630), (250, 240, 245))
        fg = im.convert("RGB").resize((1200, 586), Image.LANCZOS)
        bg.paste(fg, (0, 22))
        bg.save(OUT / "og.jpg", "JPEG", quality=84, optimize=True, progressive=True)


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def clips(src: Path) -> None:
    dst = OUT / "captures"
    shutil.rmtree(dst, ignore_errors=True)
    dst.mkdir(parents=True)
    for name, (raw, start, dur) in CLIPS.items():
        mov = src / f"{raw}.mov"
        if not mov.exists():
            sys.exit(f"missing capture {mov}")
        cut = ["-ss", f"{start}"] + (["-t", f"{dur}"] if dur else [])
        crf = "30" if name.startswith("bg-") else "28"
        ffmpeg(*cut, "-i", str(mov), "-an", "-vf", "scale=-2:960:flags=lanczos,fps=30",
               "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", crf,
               "-preset", "slow", "-movflags", "+faststart", str(dst / f"{name}.mp4"))
        # Poster: one second in, so the screen has settled and is not the launch frame.
        ffmpeg("-ss", "1", "-i", str(dst / f"{name}.mp4"), "-frames:v", "1",
               "-q:v", "4", str(dst / f"{name}.jpg"))


def manifest() -> None:
    files = sorted(p for p in OUT.rglob("*") if p.is_file() and p.name != "manifest.json")
    by_dir: dict[str, dict[str, int]] = {}
    for p in files:
        key = p.relative_to(OUT).parts[0] if len(p.relative_to(OUT).parts) > 1 else "."
        entry = by_dir.setdefault(key, {"files": 0, "bytes": 0})
        entry["files"] += 1
        entry["bytes"] += p.stat().st_size
    total = sum(v["bytes"] for v in by_dir.values())
    (OUT / "manifest.json").write_text(json.dumps({"total_bytes": total, "dirs": by_dir}, indent=2) + "\n")
    for k, v in sorted(by_dir.items()):
        print(f"  {k:<12} {v['files']:>4} files {v['bytes'] / 1e6:7.2f} MB")
    print(f"  total             {total / 1e6:7.2f} MB")


def main() -> int:
    argv = sys.argv[1:]
    src = Path(argv[argv.index("--clips") + 1]) if "--clips" in argv else None
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    OUT.mkdir(parents=True, exist_ok=True)
    if only in (None, "art"):
        art()
    if only in (None, "clips"):
        if src is None:
            sys.exit("--clips DIR is required to encode captures")
        clips(src)
    manifest()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())