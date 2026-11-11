"""vfa -- video-forge analyzer CLI.

  vfa fetch     URL [--out DIR] [--max-height 2160]          download with ORIGINAL audio + subs
  vfa channel   URL [--top 20] [--sort views|recent] [--analyze]   list/download/analyze a channel's videos
  vfa analyze   VIDEO [--out DIR] [--width 512] [--sheets auto|all|sampled|none] [--speech auto|whisper|subs|off]
  vfa compare   REF OURS [--out gap.md]                      fingerprint gap -> ranked to-do list
  vfa aggregate DIR_OR_FP... [--out DIR]                     median style fingerprint across many videos
  vfa breakdown ANALYSIS_DIR [--out md]                       sentence-by-sentence script x picture table
  vfa batch     VIDEO_DIR --out DIR [--workers 3] [--meta selection.json --group-key era]   parallel channel study
  vfa qa        VIDEO [--min-class 2k|4k] [--fps 30] [--duration S] [--plan timeline.json] [--ref FP]
  vfa sbs       --ref A.jpg,B.jpg --ours C.jpg,D.jpg --out sbs.jpg   side-by-side judge sheet
  vfa probe     VIDEO
  deep extras (optional deps; each writes <name>.json + <name>.md into the analysis dir):
  vfa ocr         VIDEO|ANALYSIS_DIR [--every 0.5]           captions: words/page, size (u), colours, font class, sync
  vfa transitions VIDEO|ANALYSIS_DIR                         cut / dissolve / dip / flash / wipe / whip / zoom / match
  vfa keygap      ANALYSIS_DIR --plan timeline.json [--ref FP] [--prev DIR] [--cuts]   colour per lighting key (section), not one median
  vfa stems       VIDEO|ANALYSIS_DIR                         demucs stems: music presence, voice-over-music margin, SFX
  vfa embed       VIDEO|ANALYSIS_DIR [--every 1]             CLIP style / lighting / shot-type tags (cached embeddings)
  vfa similar     REF_DIR OURS_DIR [--out PATH]              per-shot CLIP nearest neighbours + style similarity 0-100
  vfa pose        VIDEO|ANALYSIS_DIR [--stride 1]            face/body coverage, lip-sync r + lag, blinks, gestures
  vfa analyze ... --deep [--deep-skip stems,pose]            run the extras and store summaries in fingerprint["deep"]
  topic / hook / title research (metadata + subtitles only; see vfa/topics.py):
  vfa topics      CHANNEL_URL --out DIR [--max 300] [--subs-top 30 --subs-bottom 30] [--subs-mid 0] [--local DIR]
                  [--summary-out FILE]                       outlier score, topic/hook/title lifts with 90% CIs
  vfa topics-aggregate DIR... --out D [--summary-out FILE]   which effects replicate across channels
  vfa hookcheck   "hook sentence" [--style toonworld-explainer] [--data DIR_OR_JSON...]   score a draft hook
  vfa titlecheck  "title" ["title" ...] [--style S] [--hook "first sentence"] [--data ...]   score / rank titles
  vfa thumbcheck  PNG... [--kind long|short|hires] [--sheet S.jpg] [--out J]   score thumbnails at feed size
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["thumbcheck"]:  # own argparse in vfa/thumbcheck.py
        from .thumbcheck import main as _tc
        return _tc(argv[1:])
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
    p.add_argument("--deep", action="store_true", help="also run ocr/transitions/stems/embed/pose (whatever is installed)")
    p.add_argument("--deep-skip", default="", help="comma list of extras to skip with --deep")

    p = sub.add_parser("compare")
    p.add_argument("ref")
    p.add_argument("ours")
    p.add_argument("--out")

    p = sub.add_parser("aggregate")
    p.add_argument("inputs", nargs="+")
    p.add_argument("--out", default="style")

    p = sub.add_parser("breakdown")
    p.add_argument("analysis_dir")
    p.add_argument("--out")

    p = sub.add_parser("batch")
    p.add_argument("video_dir")
    p.add_argument("--out", required=True)
    p.add_argument("--workers", type=int, default=3)
    p.add_argument("--meta")
    p.add_argument("--group-key")
    p.add_argument("--speech", default="auto", choices=["auto", "whisper", "subs", "off"])

    p = sub.add_parser("qa")
    p.add_argument("video")
    p.add_argument("--out")
    p.add_argument("--min-class", default="2k", choices=["2k", "4k", "none"])
    p.add_argument("--fps", type=float)
    p.add_argument("--duration", type=float)
    p.add_argument("--plan", help="timeline.json written by the engine (planned cuts)")
    p.add_argument("--ref", help="reference fingerprint.json / analysis dir / aggregate")
    p.add_argument("--lufs", type=float, default=-14.0)
    p.add_argument("--freeze", type=float, help="min frozen seconds to flag (default 0.4 for shorts, 2.5 otherwise)")
    p.add_argument("--mixreport", help="*_mixreport.json from audio/mix.py (speech-over-bed margin)")

    p = sub.add_parser("sbs")
    p.add_argument("--ref", required=True)
    p.add_argument("--ours", required=True)
    p.add_argument("--out", required=True)

    p = sub.add_parser("keygap"); p.add_argument("analysis"); p.add_argument("--plan", required=True); p.add_argument("--ref"); p.add_argument("--prev"); p.add_argument("--cuts", action="store_true")
    p = sub.add_parser("strips"); p.add_argument("video"); p.add_argument("--plan", required=True); p.add_argument("--analysis"); p.add_argument("--around", type=int, default=4); p.add_argument("--out", required=True)
    p = sub.add_parser("probe")
    p.add_argument("video")

    for name in ("ocr", "transitions", "stems", "embed", "pose"):
        p = sub.add_parser(name)
        p.add_argument("target", help="video file or analysis dir")
        p.add_argument("--video", help="source video when TARGET is an analysis dir without fingerprint")
        if name in ("ocr", "embed"):
            p.add_argument("--every", type=float, help="sampling interval in seconds")
        if name == "pose":
            p.add_argument("--stride", type=int)
    p = sub.add_parser("similar")
    p.add_argument("ref")
    p.add_argument("ours")
    p.add_argument("--out", help="output path without extension (default OURS/similar)")

    p = sub.add_parser("topics")
    p.add_argument("url", help="channel URL (/shorts or /videos appended from --tab)")
    p.add_argument("--out", required=True)
    p.add_argument("--max", type=int, default=300)
    p.add_argument("--tab", default="shorts", choices=["shorts", "videos"])
    p.add_argument("--subs-top", type=int, default=30)
    p.add_argument("--subs-bottom", type=int, default=30)
    p.add_argument("--subs-mid", type=int, default=0, help="random middle sample for less biased hook stats")
    p.add_argument("--local", action="append", default=[], help="dir with <id>.info.json / subs / transcript.json to reuse")
    p.add_argument("--min-age-days", type=int, default=14)
    p.add_argument("--no-network", action="store_true")
    p.add_argument("--whisper-model", default="small")
    p.add_argument("--k", type=int, default=10, help="neighbours on each side for the outlier score")
    p.add_argument("--summary-out", help="numbers-only summary json (e.g. references/styles/data/topics_<channel>.json)")
    p.add_argument("--style", help="style profile this channel informs (hookcheck weights it x2)")
    p.add_argument("--last", type=int, help="only the newest N uploads (one format era)")
    p.add_argument("--skip-newest", type=int, default=0, help="exclude the N newest uploads without per-video requests")

    p = sub.add_parser("topics-aggregate")
    p.add_argument("dirs", nargs="+")
    p.add_argument("--out", required=True)
    p.add_argument("--summary-out")

    p = sub.add_parser("titlecheck")
    p.add_argument("titles", nargs="+")
    p.add_argument("--style")
    p.add_argument("--hook", help="the video's first sentence (helps the topic classifier)")
    p.add_argument("--data", nargs="*")
    p.add_argument("--json", action="store_true")

    p = sub.add_parser("hookcheck")
    p.add_argument("text")
    p.add_argument("--style")
    p.add_argument("--data", nargs="*", help="topics dirs / topics.json / summary files (default: references/styles/data)")
    p.add_argument("--json", action="store_true")

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
                whisper_model=a.whisper_model, keyframes=not a.no_keyframes, start=a.start, duration=a.duration,
                deep=a.deep, deep_skip=[x.strip() for x in a.deep_skip.split(",") if x.strip()])
        print(os.path.join(out, "report.md"))
    elif a.cmd == "strips":
        from .strips import strips
        r = strips(a.video, a.plan, a.out, a.analysis, a.around)
        print(f"{len(r['rows'])} transitions -> {r['out']}; unplanned {r.get('unplanned', [])}, explained only by an event {r.get('event_explained', [])}")
    elif a.cmd == "keygap":
        from .keygap import keygap
        from .compare import load as _load
        print(keygap(a.analysis, a.plan, _load(a.ref) if a.ref else None, a.prev, a.cuts)["md"])
    elif a.cmd in ("ocr", "transitions", "stems", "embed", "pose"):
        import importlib
        mod = importlib.import_module(f".{a.cmd}", __package__)
        kw = {}
        if getattr(a, "every", None):
            kw["every"] = a.every
        if getattr(a, "stride", None):
            kw["stride"] = a.stride
        res = mod.run(a.target, a.video, **kw)
        print(json.dumps(res.get("summary", res), indent=1, default=str))
    elif a.cmd == "similar":
        from .embed import similar
        res = similar(a.ref, a.ours, a.out)
        print(json.dumps({k: v for k, v in res.items() if k != "per_shot"}, indent=1, default=str))
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
    elif a.cmd == "breakdown":
        from .breakdown import breakdown
        print(breakdown(a.analysis_dir, a.out))
    elif a.cmd == "batch":
        from .batch import run_batch
        run_batch(a.video_dir, a.out, a.workers, a.meta, a.group_key, a.speech)
    elif a.cmd == "qa":
        from .qa import run_qa
        out = a.out or os.path.splitext(a.video)[0] + "_qa"
        r = run_qa(a.video, out, a.min_class, a.fps, a.duration, a.plan, a.ref, a.lufs, a.freeze, a.mixreport)
        print(open(os.path.join(out, "qa.md"), encoding="utf-8").read())
        sys.exit(1 if r["verdict"] == "FAIL" else 0)
    elif a.cmd == "topics":
        from .topics import run_topics
        res = run_topics(a.url, a.out, a.max, a.tab, a.subs_top, a.subs_bottom, a.subs_mid, a.local, a.min_age_days,
                         not a.no_network, a.whisper_model, a.k, a.summary_out, a.style, last=a.last,
                         skip_newest=a.skip_newest)
        print(f"{res['channel']['used']} videos, {res['channel']['hooks']} hooks, {res['requests']} yt-dlp calls"
              f"{' (RATE LIMITED)' if res['rate_limited'] else ''} -> {os.path.join(a.out, 'topics.md')}")
    elif a.cmd == "topics-aggregate":
        from .topics import aggregate
        res = aggregate(a.dirs, a.out, a.summary_out)
        rep = [k for k, v in res["features"].items() if v["replicates"]]
        print(f"{len(res['channels'])} channels; replicating: {', '.join(rep) or 'none'} -> {os.path.join(a.out, 'aggregate.md')}")
    elif a.cmd == "titlecheck":
        from .topics import titlecheck, titlecheck_text
        rs = sorted((titlecheck(t, a.style, a.data, a.hook) for t in a.titles), key=lambda r: -r["score"])
        if a.json:
            print(json.dumps(rs, indent=1))
        elif len(rs) == 1:
            print(titlecheck_text(rs[0]))
        else:
            for r in rs:
                print(f"{r['score']:3d}  x{r['predicted_x_views']:<5} {r['title']}   [{', '.join(r['features']) or '-'}; topic {r['topic']}]")
            print("\nBest: " + titlecheck_text(rs[0]))
    elif a.cmd == "hookcheck":
        from .topics import hookcheck, hookcheck_text
        r = hookcheck(a.text, a.style, a.data)
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
        print(json.dumps(r, indent=1) if a.json else hookcheck_text(r))
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
        vid = ytdlp_download(it["url"], os.path.join(a.out, "videos"), max(a.max_height, 2560) if "/shorts" in url or a.tab == "shorts" else a.max_height)
        if a.analyze:
            analyze(vid, os.path.join(a.out, "analysis", it["id"]), sheets="all", quiet=True)
    if a.analyze:
        from .compare import aggregate, aggregate_md, load
        fps = [load(os.path.join(a.out, "analysis", it["id"])) for it in pick]
        agg = aggregate(fps)
        json.dump(agg, open(os.path.join(a.out, "fingerprint_aggregate.json"), "w"), indent=1)
        open(os.path.join(a.out, "style_fingerprint.md"), "w", encoding="utf-8").write(aggregate_md(agg))
        print(os.path.join(a.out, "style_fingerprint.md"))


if __name__ == "__main__":
    main()
