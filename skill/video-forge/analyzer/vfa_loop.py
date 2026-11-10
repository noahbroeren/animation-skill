#!/usr/bin/env python3
"""Improvement-loop tools (separate entry so the main CLI stays stable):

  py vfa_loop.py judgepack --ours QA/analysis --ref REF_DIR --out PACK [--gap gap.json] [--qa qa.json]
  py vfa_loop.py collect PACK                       -> PACK/scores.json + PACK/fixes.md (grouped by file owner)
  py vfa_loop.py learn --style S --project P --before gapA.json --after gapB.json [--scores scores.json] [--change TEXT]
  py vfa_loop.py lessons --style S
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="vfa_loop", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("judgepack")
    p.add_argument("--ours", required=True)
    p.add_argument("--ref")
    p.add_argument("--out", required=True)
    p.add_argument("--gap")
    p.add_argument("--qa")
    p = sub.add_parser("collect")
    p.add_argument("pack")
    p = sub.add_parser("learn")
    p.add_argument("--style", required=True)
    p.add_argument("--project", required=True)
    p.add_argument("--before")
    p.add_argument("--after")
    p.add_argument("--scores")
    p.add_argument("--change", default="")
    p.add_argument("--note", default="")
    p = sub.add_parser("lessons")
    p.add_argument("--style", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "judgepack":
        from vfa.judgepack import build
        print(build(a.ours, a.ref, a.out, a.gap, a.qa))
    elif a.cmd == "collect":
        from vfa.judgepack import collect
        r = collect(a.pack)
        print(f"mean {r['mean_score']}, min {r['min_score']}, {len(r['fixes'])} fixes -> {os.path.join(a.pack, 'fixes.md')}")
    elif a.cmd == "learn":
        from vfa.learn import record
        e = record(a.style, a.project, a.before, a.after, a.scores, a.change, a.note)
        print(f"recorded: {len(e['moved'])} metrics moved; match {e['match_score_before']} -> {e['match_score_after']}")
    elif a.cmd == "lessons":
        from vfa.learn import lessons
        print(lessons(a.style))


if __name__ == "__main__":
    main()
