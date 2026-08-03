#!/usr/bin/env python3
"""
extract_media.py — 依 tools/figures.json 從 .pptx 抽圖並縮到適合網頁的尺寸

設計上的幾個要點：

1. 直接從開啟的 ZIP 讀進 io.BytesIO，**不解壓** 100 MB 的 deck 到磁碟。
2. **先 crop 再 resize**。把 110 MP 的整張圖縮到 1600px 只會得到一片糊掉的色帶；
   裁到真正要講的區域才會可讀。
3. 六張 27000×3600 的全基因體帶狀圖若要用，必須 tile 切片，
   因為縮到 1600px 寬等於 0.21 px/原始 px，每個刻度標籤都會消失。
4. `Image.MAX_IMAGE_PIXELS` 明確抬高到 200 MP（而不是設 None 拿掉防護）。
   實測有 7 張超過 Pillow 預設的 89 MP 門檻。
5. 逐張處理並 close()，因為 110 MP RGBA 常駐約 440 MB。
6. IGV 截圖用高一點的 q（文字反鋸齒在 q82 會被抹糊）。

輸出 site/assets/data/figures.data.js（**不是 .json** —— file:// 擋 fetch）
以及 src/data/figures.manifest.json 供 build.mjs 使用。

用法：
    python3 tools/extract_media.py            # 增量
    python3 tools/extract_media.py --force    # 全部重做
"""

import io
import json
import pathlib
import sys
import warnings
import zipfile

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install Pillow")

# 實測本專案最大 110.0 MP。明確抬高上限而不是拿掉防護。
Image.MAX_IMAGE_PIXELS = 200_000_000
warnings.simplefilter("ignore", Image.DecompressionBombWarning)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DECKS = json.loads((ROOT / "src/data/decks.json").read_text(encoding="utf-8"))
SPEC = json.loads((ROOT / "tools/figures.json").read_text(encoding="utf-8"))
OUT_DIR = ROOT / "site/assets/img"
MANIFEST = ROOT / "src/data/figures.manifest.json"
DATA_JS = ROOT / "site/assets/data/figures.data.js"

FORCE = "--force" in sys.argv


def human(n):
    for unit in ("B", "KB", "MB"):
        if n < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def save(im, path, quality):
    path.parent.mkdir(parents=True, exist_ok=True)
    if im.mode in ("RGBA", "P", "LA"):
        im = im.convert("RGB")
    im.save(path, "WEBP", quality=quality, method=5)
    return path.stat().st_size


def main():
    manifest = {}
    total_bytes = 0
    zips = {}
    made = skipped = 0

    for spec in SPEC:
        key = spec.get("key")
        if not key:
            continue                                   # 註解區塊

        did = spec["deck"]
        deck = DECKS.get(did)
        if not deck:
            print(f"  ! 未知的 deck 代號 {did}（key={key}）")
            continue

        if did not in zips:
            p = ROOT / deck["file"]
            if not p.exists():
                print(f"  ! 找不到 {deck['file']}")
                continue
            zips[did] = zipfile.ZipFile(p)
        zf = zips[did]

        out1 = OUT_DIR / did.lower() / f"{key}.webp"
        out2 = OUT_DIR / did.lower() / f"{key}@2x.webp"

        max_w = spec.get("max_w", 1600)
        q = spec.get("q", 85)

        entry = {
            "deck": did, "slide": spec["slide"],
            "src": str(out1.relative_to(ROOT / "site")),
            "alt": spec.get("alt", ""),
            "caption": spec.get("caption", ""),
        }

        if out1.exists() and not FORCE:
            entry["src2x"] = str(out2.relative_to(ROOT / "site")) if out2.exists() else None
            total_bytes += out1.stat().st_size + (out2.stat().st_size if out2.exists() else 0)
            manifest[key] = {k: v for k, v in entry.items() if v is not None}
            skipped += 1
            continue

        try:
            raw = zf.read(spec["part"])
        except KeyError:
            print(f"  ! {did} 裡沒有 {spec['part']}（key={key}）")
            continue

        with Image.open(io.BytesIO(raw)) as src:
            src.load()
            w0, h0 = src.size

            if "crop" in spec:
                box = tuple(spec["crop"])
                src = src.crop(box)

            # tile：把超寬的帶狀圖切成多段，各自縮圖
            if "tile" in spec:
                cols = spec["tile"].get("cols", 6)
                tw = src.width // cols
                parts = []
                for i in range(cols):
                    piece = src.crop((i * tw, 0, (i + 1) * tw if i < cols - 1 else src.width,
                                      src.height))
                    piece.thumbnail((max_w, max_w * 4), Image.LANCZOS, reducing_gap=2.0)
                    pp = OUT_DIR / did.lower() / f"{key}.p{i + 1}.webp"
                    total_bytes += save(piece, pp, q)
                    parts.append(str(pp.relative_to(ROOT / "site")))
                    piece.close()
                entry["tiles"] = parts
                entry["src"] = parts[0]
                manifest[key] = entry
                made += 1
                print(f"  ✓ {key:26s} tile×{cols}  (原 {w0}×{h0})")
                continue

            # 一般路徑：先 2x 再 1x。reducing_gap 讓 Pillow 先做便宜的 reduce()，
            # 把 110 MP 的縮圖從數秒降到毫秒等級。
            big = src.copy()
            big.thumbnail((min(max_w * 2, src.width), 99999), Image.LANCZOS, reducing_gap=2.0)
            if big.width > max_w:
                total_bytes += save(big, out2, q)
                entry["src2x"] = str(out2.relative_to(ROOT / "site"))
            big.close()

            small = src.copy()
            small.thumbnail((max_w, 99999), Image.LANCZOS, reducing_gap=2.0)
            sz = save(small, out1, q)
            total_bytes += sz
            small.close()

        manifest[key] = entry
        made += 1
        print(f"  ✓ {key:26s} {w0}×{h0} → {max_w}px  {human(sz)}")

    for zf in zips.values():
        zf.close()

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    DATA_JS.parent.mkdir(parents=True, exist_ok=True)
    DATA_JS.write_text(
        "/* generated by tools/extract_media.py — 不要手動編輯 */\n"
        "window.TW_FIGURES = " + json.dumps(manifest, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8")

    print(f"\n  產出 {made} 張、沿用 {skipped} 張，合計 {human(total_bytes)}")
    if total_bytes > 25 * 1024 * 1024:
        print("  ⚠ 已超過 25 MB 警戒線 —— 考慮再裁小一點或減少張數")
    print(f"  → {MANIFEST.relative_to(ROOT)}")
    print(f"  → {DATA_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
