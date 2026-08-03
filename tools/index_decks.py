#!/usr/bin/env python3
"""
index_decks.py — 掃描五份 .pptx，產生選圖用的索引

232 張投影片、637 個 media part，不可能手動瀏覽。
這支腳本讓你用「投影片標題」來挑圖，而不是猜 image121.png。

刻意只讀 PNG/JPEG 的**檔頭**取尺寸（struct.unpack IHDR），
絕不 decode —— 那份 100 MB 的 deck 裡有 110 MP 的圖，decode 會很慢很吃記憶體。

用法：
    python3 tools/index_decks.py            → tools/deck_index.json
    python3 tools/index_decks.py --big 2    → 順便列出所有 >2 MP 的圖
"""

import json
import pathlib
import re
import struct
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DECKS = json.loads((ROOT / "src/data/decks.json").read_text(encoding="utf-8"))
OUT = ROOT / "tools/deck_index.json"

NS_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def png_size(head: bytes):
    """只讀 PNG IHDR。不 decode。"""
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def jpeg_size(data: bytes):
    """走 JPEG segment 找 SOFn。同樣不 decode。"""
    i = 2
    n = len(data)
    while i + 9 < n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seglen = struct.unpack(">H", data[i + 2:i + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + seglen
    return None


def dims(zf: zipfile.ZipFile, name: str):
    ext = name.rsplit(".", 1)[-1].lower()
    try:
        with zf.open(name) as fh:
            head = fh.read(64 * 1024)
    except KeyError:
        return None
    if ext == "png":
        return png_size(head)
    if ext in ("jpg", "jpeg"):
        return jpeg_size(head)
    return None


def texts(xml: str):
    """抽出 <a:t> 裡的文字。夠用了，不需要完整解析。"""
    return [t.strip() for t in re.findall(r"<a:t>(.*?)</a:t>", xml, re.S) if t.strip()]


def unescape(s: str) -> str:
    return (s.replace("&amp;", "&").replace("&lt;", "<")
             .replace("&gt;", ">").replace("&quot;", '"').replace("&#10;", " "))


def main():
    show_big = "--big" in sys.argv
    big_mp = 2.0
    if show_big:
        try:
            big_mp = float(sys.argv[sys.argv.index("--big") + 1])
        except (IndexError, ValueError):
            pass

    index = {}
    grand_slides = grand_media = 0
    big_list = []

    for did, meta in DECKS.items():
        if did.startswith("_"):
            continue
        path = ROOT / meta["file"]
        if not path.exists():
            print(f"  ! 找不到 {meta['file']}")
            continue

        zf = zipfile.ZipFile(path)
        names = set(zf.namelist())

        slide_nums = sorted(
            int(m.group(1))
            for n in names
            if (m := re.fullmatch(r"ppt/slides/slide(\d+)\.xml", n))
        )

        slides = []
        for n in slide_nums:
            xml = zf.read(f"ppt/slides/slide{n}.xml").decode("utf-8", "replace")
            runs = [unescape(t) for t in texts(xml)]

            notes = ""
            npath = f"ppt/notesSlides/notesSlide{n}.xml"
            if npath in names:
                nxml = zf.read(npath).decode("utf-8", "replace")
                notes = " ".join(unescape(t) for t in texts(nxml))

            media = []
            rpath = f"ppt/slides/_rels/slide{n}.xml.rels"
            if rpath in names:
                rels = zf.read(rpath).decode("utf-8", "replace")
                for tgt in re.findall(r'Target="\.\./(media/[^"]+)"', rels):
                    part = "ppt/" + tgt
                    d = dims(zf, part)
                    try:
                        size = zf.getinfo(part).file_size
                    except KeyError:
                        size = 0
                    entry = {"part": part, "bytes": size}
                    if d:
                        entry["w"], entry["h"] = d
                        entry["mp"] = round(d[0] * d[1] / 1e6, 1)
                        if entry["mp"] >= big_mp:
                            big_list.append((did, n, part, entry["mp"],
                                             runs[0] if runs else ""))
                    media.append(entry)

            slides.append({
                "n": n,
                "title": runs[0] if runs else "",
                "text": " / ".join(runs[1:12]),
                "notes": notes[:600],
                "media": media,
            })

        index[did] = {
            "file": meta["file"],
            "label": meta["label"],
            "speaker": meta["speaker"],
            "slides": slides,
        }
        grand_slides += len(slides)
        grand_media += sum(len(s["media"]) for s in slides)
        print(f"  {did}: {len(slides):3d} 張投影片, "
              f"{sum(len(s['media']) for s in slides):3d} 個 media")
        zf.close()

    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n  合計 {grand_slides} 張投影片、{grand_media} 個 media reference")
    print(f"  → {OUT.relative_to(ROOT)}")

    if show_big:
        big_list.sort(key=lambda x: -x[3])
        print(f"\n  >= {big_mp} MP 的圖（共 {len(big_list)} 張），前 30：")
        for did, n, part, mp, title in big_list[:30]:
            print(f"    {did} s{n:<3d} {mp:8.1f} MP  {part:28s} {title[:40]}")


if __name__ == "__main__":
    main()
