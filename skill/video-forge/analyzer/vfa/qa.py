"""Automated QA gate for a finished render. Exit code 1 on any FAIL.

Checks: delivery spec (resolution class, fps, codec, bitrate vs YouTube
recommendations), duration vs plan, black/frozen stretches, pops/flicker not
explained by planned cuts, clipping, camera snaps/jerk, native-detail estimate
(native vs upscaled), loudness/true-peak, A/V length, optional gap analysis
against a reference fingerprint. Writes qa.json + qa.md + contact sheets.
"""
from __future__ import annotations

import json
import os
import re
import subprocess

import numpy as np

from .analyze import analyze
from .compare import compare, compare_md, load
from .mediaio import probe

# YouTube recommended SDR upload bitrates (Mbps) by height & fps class
YT_BITRATE = {(1440, 30): 16, (1440, 60): 24, (2160, 30): 40, (2160, 60): 60, (1080, 30): 8, (1080, 60): 12}
MIN_CLASSES = {"2k": (2560, 1440), "4k": (3840, 2160)}


def _ff_detect(path: str, vf: str) -> str:
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-an", "-vf", vf, "-f", "null", "-"],
                       capture_output=True, text=True)
    return r.stderr


def _intervals(txt: str, key: str) -> list[tuple[float, float]]:
    out = []
    if key == "black":
        for m in re.finditer(r"black_start:([\d.]+) black_end:([\d.]+)", txt):
            out.append((float(m.group(1)), float(m.group(2))))
    else:
        starts = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", txt)]
        ends = [float(x) for x in re.findall(r"freeze_end: ([\d.]+)", txt)]
        out = list(zip(starts, ends + [None] * (len(starts) - len(ends))))
    return out


def run_qa(path: str, out_dir: str, min_class: str = "2k", expect_fps: float | None = None,
           expect_duration: float | None = None, plan: str | None = None, ref: str | None = None,
           lufs_target: float = -14.0, allow_freeze: float | None = None, mixreport: str | None = None) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    pr = probe(path)
    checks: list[dict] = []

    def add(name, status, detail):
        checks.append({"check": name, "status": status, "detail": detail})

    # --- delivery spec
    W, H = MIN_CLASSES.get(min_class, (2560, 1440))
    long_side, short_side = max(pr.width, pr.height), min(pr.width, pr.height)
    add("resolution", "PASS" if (long_side >= W and short_side >= H) else "FAIL",
        f"{pr.width}x{pr.height} ({pr.aspect}); required >= {W}x{H} class ({min_class})")
    if expect_fps:
        add("fps", "PASS" if abs(pr.fps - expect_fps) < 0.01 else "FAIL", f"{pr.fps:.3f} (expected {expect_fps})")
    add("codec", "PASS" if pr.vcodec in ("h264", "hevc", "av1", "prores", "vp9") else "WARN", f"{pr.vcodec} {pr.pix_fmt}")
    fps_class = 60 if pr.fps > 45 else 30
    h_class = 2160 if short_side >= 2160 else (1440 if short_side >= 1440 else 1080)
    rec = YT_BITRATE.get((h_class, fps_class))
    if rec and pr.bit_rate:
        mbps = pr.bit_rate / 1e6
        add("bitrate", "PASS" if mbps >= rec * 0.8 else "WARN", f"{mbps:.1f} Mbps (YouTube recommends ~{rec} Mbps for {h_class}p{fps_class})")
    if expect_duration:
        d = abs(pr.duration - expect_duration)
        add("duration", "PASS" if d <= 2 / pr.fps + 0.05 else "FAIL", f"{pr.duration:.3f}s vs planned {expect_duration:.3f}s")

    # shorts: a flat hold of 0.4 s already reads as a freeze ("every hold needs a creeping push-in")
    if allow_freeze is None:
        allow_freeze = 0.4 if (pr.height > pr.width and pr.duration < 120) else 2.5
    # --- black / frozen
    blacks = _intervals(_ff_detect(path, "blackdetect=d=0.25:pix_th=0.06"), "black")
    add("black stretches", "PASS" if not blacks else "WARN", f"{blacks[:10]}" if blacks else "none")
    if blacks and blacks[0][0] < 0.05:
        add("starts on black", "FAIL", "first frame is black: shorts must open on an image (hook in frame 1)")
    freezes = _intervals(_ff_detect(path, f"freezedetect=n=0.0008:d={allow_freeze}"), "freeze")
    add("frozen stretches", "PASS" if not freezes else "WARN",
        f"{freezes[:10]} (deliberate holds are fine; dead frames are not)" if freezes else f"none >= {allow_freeze}s")

    # --- measure the render with the same analyzer used on references
    fp = analyze(path, os.path.join(out_dir, "analysis"), sheets="all" if pr.duration <= 240 else "sampled",
                 speech="off", quiet=True)
    A = np.load(os.path.join(out_dir, "analysis", "frames.npz"))
    luma_d = A["luma_d"]
    cuts = set(int(round(t * pr.fps)) for t in fp["editing"]["cut_times"])
    planned: set[int] = set()
    events: set[int] = set()
    if plan and os.path.exists(plan):
        pj = json.load(open(plan, encoding="utf-8"))
        planned = set(int(f) for f in pj.get("cuts", []))
        events = set(int(f) for f in pj.get("events", []) + pj.get("soft", []))
        tol = 2
        unexpected = [c for c in cuts if not any(abs(c - p) <= tol for p in planned)
                      and not any(0 <= c - e <= 12 for e in events)]  # graphic entrances / flashes are intended
        missing = [p for p in planned if not any(abs(c - p) <= tol for c in cuts)]
        soft_f = set(int(f) for f in pj.get("soft", []))
        # detected cuts that no planned cut or dissolve explains, only an `events` frame: a graphic entrance, or a camera
        # jump hiding behind one (the coin short listed frames around every travel as events and 12 jumps passed)
        by_event = sorted(c for c in cuts if c not in unexpected and not any(abs(c - p) <= tol for p in planned) and not any(abs(c - s) <= 8 for s in soft_f))
        add("cuts vs plan", "PASS" if not unexpected else "FAIL",
            f"detected {len(cuts)}, planned {len(planned)}; unexpected cuts (glitch/pop) at frames {sorted(unexpected)[:20]}; "
            f"planned-but-not-detected (soft transitions are fine) {sorted(missing)[:20]}")
        add("cuts explained only by an event", "PASS" if not by_event else "WARN",
            "none" if not by_event else f"{len(by_event)} detected cut(s) at frames {by_event[:20]} match no planned cut or dissolve, only an `events` "
            "frame: look at them (`vfa strips VIDEO --plan timeline.json --analysis DIR`); a camera jump can hide behind an event")
    from scipy.ndimage import median_filter
    base = median_filter(luma_d, size=15, mode="nearest")
    speed = np.hypot(A["dx"], A["dy"]) * pr.fps + np.abs(A["dlogs"]) * pr.fps
    k = pr.fps / 30.0  # tolerance windows are seconds-based (authored in frames @30)
    intended = lambda i: any(abs(i - c) <= 2 * k for c in cuts | planned) or any(-2 * k <= i - e <= 12 * k for e in events)
    pops = [int(i) for i in np.where((luma_d > 4 * base + 0.03) & (luma_d > 0.06))[0] if not intended(i) and speed[i] < 0.6]
    add("pops (unexplained frame jumps)", "PASS" if not pops else "FAIL", f"frames {pops[:30]}" if pops else "none")
    travels = [tuple(t) for t in (json.load(open(plan, encoding="utf-8")).get("travels", []) if plan and os.path.exists(plan) else [])]
    in_travel = lambda i: any(a - 2 <= i <= b + 2 for a, b in travels)  # a planned camera travel: the picture's brightness may swing
    lm = A["luma_mean"]
    whites = [int(i) for i in np.where(lm > 0.93)[0] if not intended(int(i))]
    add("white frames", "PASS" if not whites else "FAIL", f"unplanned near-white frames {whites[:20]}" if whites else "none unplanned")
    if len(lm) > 8:
        hf = np.abs(lm[2:] - 2 * lm[1:-1] + lm[:-2])
        bad = [int(i + 1) for i in np.where(hf > 0.03)[0] if not intended(i + 1) and not in_travel(i + 1) and speed[min(len(speed) - 1, i + 1)] < 0.15]
        add("flicker", "PASS" if len(bad) <= 2 else "WARN",
            f"{len(bad)} unexplained luminance zig-zag frames {bad[:20]} (cuts, planned events and fast camera moves excluded)")
    cb = fp["color"]["clip_black"]["p90"] or 0
    cw = fp["color"]["clip_white"]["p90"] or 0
    add("clipping", "PASS" if cb < 0.02 and cw < 0.02 else "WARN", f"p90 clipped black {cb:.2%}, white {cw:.2%}")
    snaps = [m for s in fp["shots"] for m in s.get("moves", [])
             if m["ease"] == "snap" and m["peak_speed"] < 0.6 and not intended(s["start"] + 1 + m["start"])
             and not any(abs(s["start"] + 1 + m["start"] - e) <= 15 * k for e in events | planned)]
    add("camera snaps", "PASS" if not snaps else "WARN",
        f"{len(snaps)} moves shorter than 0.2 s (reference styles typically glide 0.6-1.5 s)" if snaps else "none")
    res = fp.get("resolution") or {}
    if res:
        eh = res.get("effective_height_median")
        native = res.get("upscale_factor_estimate_median", 1.0) <= 1.0
        add("native detail", "PASS" if native else "WARN",
            f"effective detail ~{eh}px of {pr.height}px tall ({'native' if native else 'looks upscaled or very soft'}) -- "
            "report upscaled output honestly")

    # --- audio
    au = fp.get("audio") or {}
    if au.get("has_audio"):
        sil = re.findall(r"silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)", subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-vn", "-af", "silencedetect=n=-45dB:d=0.3", "-f", "null", "-"],
            capture_output=True, text=True).stderr)
        add("dead air", "PASS" if not sil else "WARN", f"{len(sil)} silences >= 0.3 s at {[round(float(a_), 2) for a_, _ in sil][:10]}" if sil else "none >= 0.3 s")
        if mixreport and os.path.exists(mixreport):
            mr = json.load(open(mixreport))
            sm = mr.get("speech_margin_p10")
            if sm is not None:
                add("speech over bed", "PASS" if sm >= 2 else ("WARN" if sm >= 0 else "FAIL"),
                    f"p10 voice-minus-bed margin {sm:.1f} LU on spoken windows (>= 2 LU keeps every word clear)")
        L, TP = au.get("integrated_lufs"), au.get("true_peak_dbtp")
        add("loudness", "PASS" if L is not None and abs(L - lufs_target) <= 1.5 else "WARN", f"{L} LUFS (target {lufs_target})")
        # measured on the DELIVERED file: the AAC encode adds ~0.1-0.5 dB over the master, so master at -1.5 dBTP
        # (the elevator proof short passed with -0.9 under the old "<= -0.9" test while the label said "<= -1.0")
        add("true peak", "FAIL" if TP is None or TP > -0.5 else ("PASS" if TP <= -1.0 else "WARN"),
            f"{TP} dBTP (must be <= -1.0 after encoding; master to -1.5 dBTP to leave AAC headroom)")
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration",
                            "-of", "csv=p=0", path], capture_output=True, text=True)
        try:
            ad = float(r.stdout.strip().split("\n")[0])
            add("A/V length", "PASS" if abs(ad - pr.duration) < 0.1 else "WARN", f"audio {ad:.3f}s vs video {pr.duration:.3f}s")
        except ValueError:
            pass
    else:
        add("audio present", "WARN", "no audio stream")

    comp = None
    if ref:
        rf = load(ref)
        comp = compare(rf, fp)
        with open(os.path.join(out_dir, "gap.md"), "w", encoding="utf-8") as f:
            f.write(compare_md(comp, rf.get("source", {}).get("path", ref), os.path.basename(path)))
        # machine-readable twin of gap.md: `vfa_loop.py learn --before A/gap.json --after B/gap.json` reads it
        with open(os.path.join(out_dir, "gap.json"), "w", encoding="utf-8") as f:
            json.dump(comp, f, indent=1, default=float)
        add("style match vs reference", "PASS" if comp["match_score"] >= 70 else "WARN",
            f"{comp['matched']}/{comp['total']} metrics in tolerance (see gap.md)")

    worst = "FAIL" if any(c["status"] == "FAIL" for c in checks) else ("WARN" if any(c["status"] == "WARN" for c in checks) else "PASS")
    result = {"schema": "vfa.qa/1", "file": path, "verdict": worst, "checks": checks,
              "sheets": fp["artifacts"]["sheets"], "timeline": fp["artifacts"]["timeline"]}
    with open(os.path.join(out_dir, "qa.json"), "w") as f:
        json.dump(result, f, indent=1)
    md = [f"# QA: `{os.path.basename(path)}` -> **{worst}**", "", "| check | status | detail |", "|---|---|---|"]
    md += [f"| {c['check']} | {c['status']} | {c['detail']} |" for c in checks]
    md += ["", "Automated checks are necessary, not sufficient: now LOOK at the contact sheets and timeline "
           "(`analysis/sheets`, `analysis/timeline.png`) and run the judge rubric in references/pipeline/quality.md."]
    with open(os.path.join(out_dir, "qa.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    return result
