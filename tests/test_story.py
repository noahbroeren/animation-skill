"""Story engine tests: lint scores, beat inference, fact-check gate, beat sheet + generated camera plan (compiled and run:
no camera jumps outside cuts/dissolves).

Run:  py tests/test_story.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, "..", "skill", "video-forge")
sys.path.insert(0, os.path.join(SKILL, "story"))
import story  # noqa: E402

EX = os.path.join(SKILL, "story", "examples", "manhole.txt")


def _tmp_script(text: str) -> str:
    p = os.path.join(tempfile.mkdtemp(), "s.txt")
    open(p, "w", encoding="utf-8").write(text)
    return p


def test_lint_example_is_clean_and_beats_follow_the_formula():
    r = story.lint(EX, "toonworld-explainer")
    assert r["score"] >= 90, r["issues"]
    b = r["beats"]
    assert b[0] == "hook" and "mock" in b and "pivot" in b and b[-1] == "payoff"
    assert b.index("pivot") > b.index("mock")


def test_lint_flags_weak_hook_cta_and_double_pivot():
    p = _tmp_script("Hey guys, today we look at manhole covers.\nYou see, they are round.\nThey are heavy.\n"
                    "You see, a circle cannot fall in.\nSubscribe for more!\n")
    r = story.lint(p, "toonworld-explainer")
    msgs = " ".join(i["issue"] for i in r["issues"])
    assert "greeting" in msgs and "call to action" in msgs and "'You see' used more than once" in msgs
    assert r["score"] < 50


def test_claims_and_verify_gate():
    rows = story.claims(EX)
    assert any("1890" in r["claim"] for r in rows) and any("1.41" in r["claim"] for r in rows)
    p = os.path.join(tempfile.mkdtemp(), "c.md")
    open(p, "w", encoding="utf-8").write(story.claims_md(rows))
    assert len(story.verify(p)) == len(rows)  # all open
    txt = open(p, encoding="utf-8").read().replace("| TODO |  |", "| OK | https://example.org/source |")
    open(p, "w", encoding="utf-8").write(txt)
    assert story.verify(p) == []


def test_hooks_ranking_prefers_absurd_fact_over_greeting():
    r = story.rank_hooks(["Hey guys, today let's talk about manhole covers.",
                          "In 1890, a mayor ordered every manhole cover in town made perfectly square."], "toonworld-explainer")
    assert r[0]["hook"].startswith("In 1890")


def test_beats_and_generated_camera_plan_runs_without_jumps():
    B = story.beats(EX, "toonworld-explainer", None)
    assert B["beats"][0]["camera"].startswith("establish")
    assert sum(1 for b in B["beats"] if b["camera"].startswith("in-world dissolve")) == 3
    assert any(b["lipsync"] for b in B["beats"])
    engine = os.path.join(SKILL, "engine")
    if not shutil.which("node") or not os.path.exists(os.path.join(engine, "node_modules", "esbuild")):
        print("skip camera-plan run (no node/esbuild)")
        return
    d = os.path.join(engine, "src", "projects", "__storytest__")
    os.makedirs(d, exist_ok=True)
    try:
        bj = os.path.join(d, "beats.json")
        json.dump(B, open(bj, "w", encoding="utf-8"))
        open(os.path.join(d, "story_plan.ts"), "w", encoding="utf-8").write(story.scaffold(bj))
        open(os.path.join(d, "run.ts"), "w", encoding="utf-8").write("""
import { cameraRig } from "../../lib/camera";
import { planKeys, planPush, planKicks, BEATS, Shots } from "./story_plan";
const SHOTS: Shots = { start: { a: { pos: [2.9, 1.25, 3.9], look: [0.35, 0.65, 0.1], fov: 34 }, b: { pos: [2.3, 1.1, 3.1], look: [0.4, 0.6, 0.1] } },
  foundry: { a: { pos: [17.2, 1.7, -1.2], look: [20.5, 1.5, -5.6] }, b: { pos: [18, 1.6, -2.2], look: [20.6, 1.4, -5.6] } },
  street: { a: { pos: [-2.6, 2, 4.8], look: [-5.4, 0.9, -0.6] }, b: { pos: [-3, 1.85, 4.1], look: [-5.4, 0.9, -0.6] } } };
for (const fps of [30, 60]) {
  const rig = cameraRig(planKeys(fps, SHOTS), { push: planPush(fps), kicks: planKicks(fps), refFps: 30 });
  let worst = 0;
  for (let f = 1; f < Math.round(BEATS[BEATS.length - 1].end * fps); f++) {
    if (rig.cuts.includes(f) || rig.dissolveAt(f, fps)) continue;
    const a = rig.at(f - 1, fps).pos, b = rig.at(f, fps).pos;
    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * fps / 30);
  }
  console.log(fps, worst);
}
""")
        js = os.path.join(tempfile.mkdtemp(), "run.js")
        npx = "npx.cmd" if os.name == "nt" else "npx"
        subprocess.run([npx, "esbuild", os.path.join(d, "run.ts"), "--bundle", "--platform=node", "--log-level=error", f"--outfile={js}"],
                       cwd=engine, check=True)
        out = subprocess.run(["node", js], capture_output=True, text=True, check=True).stdout.split()
        steps = [float(x) for x in out[1::2]]
        assert all(s < 0.3 for s in steps), out  # metres per 30-fps frame; a jump was 2.5 m before the push-carry fix
    finally:
        shutil.rmtree(d, ignore_errors=True)


def test_titles_generate_and_rank():
    v = story.title_variants("manhole covers", "are round", "square")
    assert "Why Manhole Covers Are Round" in v and "Why Square Manhole Covers Don't Work" in v
    assert all(not t.lower().startswith("this") for t in v) and len(set(map(str.lower, v))) == len(v)
    r = story.rank_titles(["This manhole cover is INSANE", "Why Square Manhole Covers Don't Work"], "toonworld-explainer")
    assert r[0]["title"].startswith("Why Square")  # measured data (or the fallback rules) agree
    L = story.lint(EX, None)
    assert L["measured_title"] is None or L["measured_title"]["score"] >= 50


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
