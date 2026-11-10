"""vfa -- video-forge analyzer CLI.

  vfa fetch     URL [--out DIR] [--max-height 2160]          download with ORIGINAL audio + subs
  vfa channel   URL [--top 20] [--sort views|recent] [--analyze]   list/download/analyze a channel's videos
  vfa analyze   VIDEO [--out DIR] [--width 512] [--sheets auto|all|sampled|none] [--speech auto|whisper|subs|off]
  vfa compare   REF OURS [--out gap.md]                      fingerprint gap -> ranked to-do list
  vfa aggregate DIR_OR_FP... [--out DIR]                     median style fingerprint across many videos
  vfa qa        VIDEO [--min-class 2k|4k] [--fps 30] [--duration S] [--plan timeline.json] [--ref FP]
  vfa sbs       --ref A.jpg,B.jpg --ours C.jpg,D.jpg --out sbs.jpg   side-by-side judge sheet
  vfa probe     VIDEO
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def main(argv=None):
    ap = argparse.ArgumentParser(prog="vfa", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("fetch")
    p.add_argument("url")
    p.add_argument("--out", default="refs")
    p.add_argument("--max-height", type=int, default=2160)

    p = sub.add_parser("channel")
    p.add_argument("url", help="channel URL; /shorts or /videos tab is appended if missing")
    p.add_argument("--tab", default="auto", choices=["auto", "shorts", "videos"])
    p.add_argument("--top", type=int, default=20)
    p.add_argument("--sort", default="views", choices=["views", "recent"])
    p.add_argument("--out", default="refs/channel")
    p.add_argument("--download", action="store_true")
    p.add_argument("--analyze", action="store_true", help="download + analyze + aggregate")
    p.add_argument("--max-height", type=int, default=1440)

    p = sub.add_parser("analyze")
    p.add_argument("video")
    p.add_argument("--out")
    p.add_argument("--width", type=int, default=512)
    p.add_argument("--sheets", default="auto", choices=["auto", "all", "sampled", "none"])
    p.add_argument("--sheet-seconds", type=float, default=2.0)
    p.add_argument("--speech", default="auto", choices=["auto", "whisper", "subs", "off"])
    p.add_argument("--whisper-model", default="small")
    p.add_argument("--start", type=float, default=0.0)
    p.add_argument("--duration", type=float)
    p.add_argument("--no-keyframes", action="store_true")

    p = sub.add_parser("compare")
    p.add_argument("ref")
    p.add_argument("ours")
    p.add_argument("--out")

    p = sub.add_parser("aggregate")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--out", default="style")

    p = sub.add_parser("qa")
    p.add_argument("video")
    p.add_argument("--out")
    p.add_argument("--min-class", default="2k", choices=["2k", "4k", "none"])
    p.add_argument("--fps", type=float)
    p.add_argument("--duration", type=float)
    p.add_argument("--plan", help="timeline.json written by the engine (planned cuts)")
    p.add_argument("--ref", help="reference fingerprint.json / analysis dir / aggregate")
    p.add_argument("--lufs", type=float, default=-14.0)

    p = sub.add_parser("sbs")
    p.add_argument("--ref", required=True)
    p.add_argument("--ours", required=True)
    p.add_argument("--out", required=True)

    p = sub.add_parser("probe")
    p.add_argument("video")

    a = ap.parse_args(argv)

    if a.cmd == "probe":
        from .mediaio import probe
        print(json.dumps(probe(a.video).to_dict(), indent=1))
    elif a.cmd == "fetch":
        from .mediaio import ytdlp_download
        print(ytdlp_download(a.url, a.out, a.max_height))
    elif a.cmd == "channel":
        _channel(a)
    elif a.cmd == "analyze":
        from .analyze import analyze
        out = a.out or os.path.splitext(a.video)[0] + "_analysis"
        analyze(a.video, out, width=a.width, sheets=a.sheets, sheet_seconds=a.sheet_seconds, speech=a.speech,
                whisper_model=a.whisper_model, keyframes=not a.no_keyframes, start=a.start, duration=a.duration)
        print(os.path.join(out, "report.md"))
    elif a.cmd == "compare":
        from .compare import compare, compare_md, load
        r, o = load(a.ref), load(a.ours)
        res = compare(r, o)
        md = compare_md(res, a.ref, a.ours)
        if a.out:
            open(a.out, "w", encoding="utf-8").write(md)
            json.dump(res, open(os.path.splitext(a.out)[0] + ".json", "w"), indent=1)
        print(md)
    elif a.cmd == "aggregate":
        from .compare import aggregate, aggregate_md, load
        fps = []
        for inp in a.inputs:
            if os.path.isdir(inp) and not os.path.exists(os.path.join(inp, "fingerprint.json")):
                for root, _, files in os.walk(inp):
                    if "fingerprint.json" in files:
                        fps.append(load(os.path.join(root, "fingerprint.json")))
            else:
                fps.append(load(inp))
        agg = aggregate(fps)
        os.makedirs(a.out, exist_ok=True)
        json.dump(agg, open(os.path.join(a.out, "fingerprint_aggregate.json"), "w"), indent=1)
        open(os.path.join(a.out, "style_fingerprint.md"), "w", encoding="utf-8").write(aggregate_md(agg))
        print(os.path.join(a.out, "style_fingerprint.md"))
    elif a.cmd == "qa":
        from .qa import run_qa
        out = a.out or os.path.splitext(a.video)[0] + "_qa"
        r = run_qa(a.video, out, a.min_class, a.fps, a.duration, a.plan, a.ref, a.lufs)
        print(open(os.path.join(out, "qa.md"), encoding="utf-8").read())
        sys.exit(1 if r["verdict"] == "FAIL" else 0)
    elif a.cmd == "sbs":
        from .visuals import side_by_side
        side_by_side(a.out, list(zip(a.ref.split(","), a.ours.split(","))))
        print(a.out)


def _channel(a):
    from .mediaio import ytdlp_download, ytdlp_list
    url = a.url.rstrip("/")
    tabs = [a.tab] if a.tab != "auto" else ["shorts", "videos"]
    items = []
    for tab in tabs:
        u = url if url.endswith(("/shorts", "/videos", "/streams")) else f"{url}/{tab}"
        try:
            items = ytdlp_list(u, limit=300)
        except SystemExit:
            continue
        if items:
            break
    if a.sort == "views":
        items.sort(key=lambda x: -(x.get("view_count") or 0))
    pick = items[: a.top]
    os.makedirs(a.out, exist_ok=True)
    json.dump(pick, open(os.path.join(a.out, "selection.json"), "w"), indent=1)
    for i, it in enumerate(pick):
        print(f"{i + 1:2d}. {it.get('view_count') or 0:>12,} views  {it.get('duration') or 0:>5}s  {it['title']}")
    if not (a.download or a.analyze):
        return
    from .analyze import analyze
    for it in pick:
        vid = ytdlp_download(it["url"], os.path.join(a.out, "videos"), a.max_height)
        if a.analyze:
            analyze(vid, os.path.join(a.out, "analysis", it["id"]), sheets="all")
    if a.analyze:
        from .compare import aggregate, aggregate_md, load
        fps = [load(os.path.join(a.out, "analysis", it["id"])) for it in pick]
        agg = aggregate(fps)
        json.dump(agg, open(os.path.join(a.out, "fingerprint_aggregate.json"), "w"), indent=1)
        open(os.path.join(a.out, "style_fingerprint.md"), "w", encoding="utf-8").write(aggregate_md(agg))
        print(os.path.join(a.out, "style_fingerprint.md"))


if __name__ == "__main__":
    main()
