"""Learning log: turn measured iteration results into durable, per-style knowledge.

  py analyzer/vfa_loop.py learn --style toonworld-explainer --project manhole --before gapA.json --after gapB.json
                               [--scores PACK/scores.json] [--change "what we changed"] [--note "free text"]
  py analyzer/vfa_loop.py lessons --style toonworld-explainer      # print the distilled rules so far

Every entry records WHAT changed and WHICH metrics moved (gap = |delta|/tolerance before -> after), so a rule only
counts as learned when the numbers confirmed it. Entries go to references/styles/<style>.learnings.md (human
readable) and <style>.learnings.json (machine readable). `lessons` aggregates them: changes that improved a metric
in >= 2 entries become "confirmed rules"; changes that regressed become "avoid".
"""
from __future__ import annotations

import datetime as _dt
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
STYLES = os.path.abspath(os.path.join(HERE, "..", "..", "references", "styles"))


def _rows(p: str | None) -> dict:
    if not p or not os.path.exists(p):
        return {}
    d = json.load(open(p, encoding="utf-8"))
    return {r["metric"]: r for r in d.get("rows", [])}


def record(style: str, project: str, before: str | None, after: str | None, scores: str | None = None,
           change: str = "", note: str = "") -> dict:
    os.makedirs(STYLES, exist_ok=True)
    b, a = _rows(before), _rows(after)
    moved = []
    for k in sorted(set(b) & set(a)):
        gb, ga = b[k]["gap"], a[k]["gap"]
        if abs(gb - ga) >= 0.25:
            moved.append({"metric": k, "label": a[k]["label"], "gap_before": gb, "gap_after": ga,
                          "ours_before": b[k]["ours"], "ours_after": a[k]["ours"], "ref": a[k]["ref"],
                          "result": "improved" if ga < gb else "regressed"})
    sc = json.load(open(scores, encoding="utf-8")) if scores and os.path.exists(scores) else None
    def score(p):
        if not p or not os.path.exists(p):
            return None
        return json.load(open(p, encoding="utf-8")).get("match_score")
    entry = {"date": _dt.date.today().isoformat(), "project": project, "change": change, "note": note,
             "match_score_before": score(before), "match_score_after": score(after),
             "judge_mean": sc.get("mean_score") if sc else None, "moved": moved}
    jp = os.path.join(STYLES, f"{style}.learnings.json")
    log = json.load(open(jp, encoding="utf-8")) if os.path.exists(jp) else []
    log.append(entry)
    json.dump(log, open(jp, "w", encoding="utf-8"), indent=1)
    mp = os.path.join(STYLES, f"{style}.learnings.md")
    new = not os.path.exists(mp)
    with open(mp, "a", encoding="utf-8") as f:
        if new:
            f.write(f"# Learnings: {style}\n\nAppended automatically by `vfa_loop.py learn` after each measured iteration. "
                    "A change counts only if the numbers moved.\n\n")
        f.write(f"## {entry['date']} - {project}\n\n- change: {change or '(not described)'}\n")
        if note:
            f.write(f"- note: {note}\n")
        f.write(f"- match score: {entry['match_score_before']} -> {entry['match_score_after']}"
                + (f"; judge mean {entry['judge_mean']}" if entry["judge_mean"] is not None else "") + "\n")
        for m in moved:
            f.write(f"- {m['result']}: {m['label']} gap {m['gap_before']} -> {m['gap_after']} (ours {m['ours_before']:.4g} -> {m['ours_after']:.4g}, ref {m['ref']:.4g})\n")
        f.write("\n")
    return entry


def lessons(style: str) -> str:
    jp = os.path.join(STYLES, f"{style}.learnings.json")
    if not os.path.exists(jp):
        return f"(no learnings yet for {style})"
    log = json.load(open(jp, encoding="utf-8"))
    tally: dict[str, dict] = {}
    tags = []
    for i, e in enumerate(log):
        tag = f"{e.get('project', '?')}#{e.get('iteration', i + 1)}"
        tags.append((tag, e))
        for m in e["moved"]:
            t = tally.setdefault(m["label"], {"improved": [], "regressed": []})
            t[m["result"]].append(tag)
    L = [f"# Distilled lessons for {style} ({len(log)} iterations)", ""]
    conf = [(k, v) for k, v in tally.items() if len(v["improved"]) >= 2 and len(v["improved"]) > len(v["regressed"])]
    avoid = [(k, v) for k, v in tally.items() if len(v["regressed"]) >= 1 and len(v["regressed"]) >= len(v["improved"])]
    row = lambda k, v: f"- {k}: improved in {', '.join(v['improved']) or '-'}; regressed in {', '.join(v['regressed']) or '-'}"
    L += ["## Confirmed (improved the metric in >= 2 iterations, more often than it regressed)"]
    L += [row(k, v) for k, v in conf] or ["- none yet"]
    L += ["", "## Avoid / unresolved (regressed at least as often as it improved)"]
    L += [row(k, v) for k, v in avoid] or ["- none"]
    L += ["", "## Iterations"] + [f"- {t}: {e['change'][:160]}{'...' if len(e['change']) > 160 else ''}" for t, e in tags]
    return "\n".join(L) + "\n"
