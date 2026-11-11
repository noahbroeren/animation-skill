"""Topic / hook / title research tests: outlier score, classification, stats, aggregate, hookcheck. No network.

Run:  py tests/test_topics.py
"""
import json
import math
import os
import random
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "skill", "video-forge", "analyzer"))
from vfa import topics as T  # noqa: E402


def test_outlier_score_controls_for_growth():
    # channel grows 10x over 60 uploads; one video at index 30 does 5x its era
    views = [1000 * 10 ** (i / 60) for i in range(60)]
    views[30] *= 5
    sc = T.outlier_scores(views, k=10)
    assert abs(sc[30] - math.log10(5)) < 0.05, sc[30]
    # everything else is ~0 despite the 10x growth (raw views would rank the newest highest)
    # (away from the list ends, where a sliding window under steady growth biases by ~half the window's growth)
    others = [abs(s) for i, s in enumerate(sc) if 10 <= i < 50 and i != 30]
    assert max(others) < 0.05, max(others)
    # edges keep a full window (slides), missing views -> None
    sc2 = T.outlier_scores([None, 100, 100, 100, 400, 100, 100, 100], k=2)
    assert sc2[0] is None and abs(sc2[4] - math.log10(4)) < 1e-3 and abs(sc2[1]) < 1e-6


def test_build_rows_reverses_to_upload_order():
    ents = [{"id": f"id{i:09d}", "title": "Why Cats Hate Water", "views": 100} for i in range(5)]  # newest first
    rows = T.build_rows(ents, k=2)
    assert rows[0]["id"] == "id000000004" and rows[0]["age_rank"] == 0
    assert rows[0]["t_why_how"] and rows[0]["t_starts_why_how"] and not rows[0]["t_question"]


def test_hook_classification():
    c = T.classify_hook
    f = c("It's impossible to get fired in Japan, but companies found something way worse.")
    assert f["forbidden_impossible"] and f["contrast_twist"] and f["absurd_fact"] and not f["question"]
    f = c("If you dropped a penny from the Empire State Building, you'd hurt nobody.")
    assert f["if_you"] and f["second_person"] and not f["absurd_fact"]
    f = c("Why do cats always land on their feet?")
    assert f["question"] and f["curiosity_gap"] and not f["absurd_fact"]
    f = c("This man spent 20 years digging a tunnel under his own house.")
    assert f["story_open"] and f["number_superlative"] and f["absurd_fact"] and not f["this_is_meet"]
    f = c("Meet the only dog that ever flew a plane.")
    assert f["this_is_meet"] and f["number_superlative"]
    f = c("So today we're going to look at bridges.")
    assert f["setup_opener"] and not f["absurd_fact"]
    f = c("In 1923, a farmer built a road out of glass.")
    assert f["story_open"]
    f = c("A blue whale's heart is bigger than a car.")
    assert f["comparison"] and f["absurd_fact"]
    f = c("Look at these two scratch cards.")
    assert f["imperative"] and not f["absurd_fact"]
    assert c("")["no_speech"] and c(None)["no_speech"]


def test_topic_and_title_features():
    assert T.classify_topic("Why Your Stomach Growls")[0] == "body_medicine"
    assert T.classify_topic("The Shark That Lived 400 Years")[0] == "animals_nature"
    assert T.classify_topic("Why Bridges Have Gaps")[0] == "engineering_how"
    assert T.classify_topic("The Man Who Stole The Moon Rocks")[0] in ("law_crime", "space_physics")
    assert T.classify_topic("The Strangest Pizza Ever")[0] == "food"
    assert T.classify_topic("Zxqv")[0] == "other"
    tf = T.title_features("Why is this ILLEGAL in 3 countries? \U0001F631 #shorts")
    assert tf["t_question"] and tf["t_number"] and tf["t_emoji"] and tf["t_caps_word"] and tf["t_hashtag"]
    assert tf["t_forbidden_impossible"] and tf["t_this"] and tf["t_starts_why_how"]
    assert tf["t_words"] == 7 and tf["t_caps_words"] == 1
    assert T.duration_bucket(45) == "35-50s" and T.duration_bucket(None) is None


def test_feature_stats_and_ci():
    rnd = random.Random(1)
    base = [rnd.gauss(0, 0.2) for _ in range(80)]
    good = [rnd.gauss(0.4, 0.15) for _ in range(20)]
    st = T.feature_stat(good, base + good, base)
    assert st["n"] == 20 and not st["too_few"] and st["confident"] and st["ci90"][0] > 0, st
    assert st["lift"] > 0.25 and st["x_views"] > 1.7 and st["delta_vs_without"] > 0.3
    few = T.feature_stat(good[:5], base + good)
    assert few["too_few"] and not few["confident"]
    noise = T.feature_stat(base[:30], base)
    assert not noise["confident"], noise
    assert abs(T.spearman([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12]) - 1) < 1e-9
    assert T.spearman([1, 2, 3], [1, 2, 3]) is None


def _synthetic_channel(seed=0, n=120, name="Synth"):
    """Question hooks under-perform, illegal/impossible hooks and food titles over-perform."""
    rnd = random.Random(seed)
    rows = []
    for i in range(n):
        kind = rnd.choice(["q", "ill", "plain", "plain"])
        food = rnd.random() < 0.25
        hook = {"q": "Why do people still use old bridges?",
                "ill": "It's illegal to own a cow in this town, yet everyone has one.",
                "plain": "A man built a house out of old doors."}[kind]
        title = ("The Pizza " if food else "The Bridge ") + "Story"
        s = rnd.gauss(0, 0.15) + (-0.3 if kind == "q" else 0.35 if kind == "ill" else 0) + (0.3 if food else 0)
        rows.append({"id": f"{name[:3]}{i:08d}", "title": title, "views": int(10 ** (5 + s)), "outlier": round(s, 4),
                     "age_rank": i, "hook": hook, "hook_source": "test", "duration": 30 + i % 40, "wps": 3.0,
                     **T.title_features(title)})
    return rows


def test_analyse_findings_and_patterns():
    rows = _synthetic_channel()
    ranked = sorted(rows, key=lambda r: -r["outlier"])
    st = T.analyse(rows, [r["id"] for r in ranked[:30]], [r["id"] for r in ranked[-30:]])
    assert st["hook"]["question"]["lift"] < -0.15 and st["hook"]["question"]["confident"]
    assert st["hook"]["forbidden_impossible"]["lift"] > 0.15 and st["hook"]["forbidden_impossible"]["confident"]
    assert st["hook"]["question"]["share_top"] < st["hook"]["question"]["share_bottom"]
    assert st["topic"]["food"]["lift"] > 0.1
    f = T.findings(st)
    assert any(x.startswith("OVER hook: forbidden_impossible") for x in f), f
    assert any(x.startswith("UNDER hook: question") for x in f), f
    sk = T.hook_skeleton("This man spent 20 years digging a tunnel under Paris.")
    assert sk.startswith("This [person] [did] [N]") and "[Name]" in sk and "digging" not in sk, sk


def _write_channel(d, rows, name):
    ranked = sorted(rows, key=lambda r: -r["outlier"])
    for r in ranked[:30]:
        r["group"] = "top"
    for r in ranked[-30:]:
        r["group"] = "bottom"
    st = T.analyse(rows, [r["id"] for r in ranked[:30]], [r["id"] for r in ranked[-30:]])
    res = {"channel": {"name": name, "handle": "@" + name, "url": "x", "tab": "shorts", "listed": len(rows),
                       "used": len(rows), "excluded": 0, "hooks": st["hook_n"], "hook_sources": {}, "fetched": "",
                       "date_range_known": None, "median_views": 1e5, "followers": None, "style": None},
           "params": {}, "stats": st, "findings": T.findings(st), "rankings": {"raw_top": [], "outlier_top": [],
                                                                            "outlier_bottom": []},
           "patterns": [{"template": T.hook_skeleton(r["hook"]), "outlier": r["outlier"],
                         "types": sorted(k for k, v in r["hook_feats"].items() if v), "topic": r["topic"], "group": None}
                        for r in sorted(rows, key=lambda r: -r["outlier"])],
           "videos": rows}
    os.makedirs(d, exist_ok=True)
    json.dump(res, open(os.path.join(d, "topics.json"), "w"), indent=1)
    return res


def test_aggregate_replication_and_summary():
    tmp = tempfile.mkdtemp()
    dirs = []
    for i in range(3):
        d = os.path.join(tmp, f"c{i}")
        _write_channel(d, _synthetic_channel(seed=i + 10, name=f"Ch{i}"), f"Ch{i}")
        dirs.append(d)
    agg = T.aggregate(dirs, os.path.join(tmp, "agg"), os.path.join(tmp, "data", "topics_crosschannel.json"))
    assert agg["features"]["hook:forbidden_impossible"]["replicates"]
    assert agg["features"]["hook:question"]["replicates"] and agg["features"]["hook:question"]["direction"] == "-"
    assert not agg["features"]["hook:comparison"]["replicates"]
    sh = agg["features"]["hook:question"]["share"]
    assert sh["replicates"] and sh["diff"] < 0 and sh["channels"] == 3, sh
    assert agg["features"]["hook:forbidden_impossible"]["share"]["diff"] > 0
    res = T._load_topics(dirs[0])
    s = T.export_summary(res, os.path.join(tmp, "data", "topics_ch0.json"))
    blob = json.dumps(s)
    assert "videos" not in s and "old doors" not in blob and len(s["example_titles"]) <= 5
    assert os.path.exists(os.path.join(tmp, "agg", "aggregate.md"))


def test_hookcheck_uses_measured_lifts():
    tmp = tempfile.mkdtemp()
    res = _write_channel(os.path.join(tmp, "c"), _synthetic_channel(seed=3, name="Hk"), "Hk")
    p = os.path.join(tmp, "topics_hk.json")
    T.export_summary(res, p)
    good = T.hookcheck("It's illegal to paint your house purple in this town, yet one man did it anyway.",
                       style="toonworld-explainer", data=[p])
    bad = T.hookcheck("Why do people paint their houses?", style="toonworld-explainer", data=[p])
    assert good["score"] > bad["score"], (good["score"], bad["score"])
    assert "forbidden_impossible" in good["features"] and "question" in bad["features"]
    assert any("question" in s.lower() for s in bad["suggestions"]), bad["suggestions"]
    assert len(good["similar_patterns"]) >= 1 and "[" in good["similar_patterns"][0]["template"]
    assert {r["rule"] for r in bad["style_rules"] if not r["ok"]} >= {"not a question"}
    again = T.hookcheck("Why do people paint their houses?", style="toonworld-explainer", data=[p])
    assert again == bad  # deterministic
    assert "Score" in T.hookcheck_text(good)


def test_subtitle_parsers():
    tmp = tempfile.mkdtemp()
    vtt = os.path.join(tmp, "abcdefghijk.en-orig.vtt")
    open(vtt, "w", encoding="utf-8").write(
        "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n \nIt's<00:00:00.200><c> impossible</c><00:00:00.900><c> to</c>"
        "<00:00:01.000><c> fly.</c>\n\n00:00:02.000 --> 00:00:02.010\nIt's impossible to fly.\n \n\n"
        "00:00:02.010 --> 00:00:04.000\nIt's impossible to fly.\nBut<00:00:02.300><c> birds</c><00:00:02.600><c> do.</c>\n")
    w = T.parse_vtt(vtt)
    assert [x for _, x in w] == ["It's", "impossible", "to", "fly.", "But", "birds", "do."], w
    j = os.path.join(tmp, "abcdefghijk.en.json3")
    json.dump({"events": [{"tStartMs": 500, "dDurationMs": 2000, "segs": [{"utf8": "Hello"}, {"utf8": " there", "tOffsetMs": 400}]}]},
              open(j, "w"))
    assert T.parse_json3(j) == [(0.5, "Hello"), (0.9, "there")]
    h = T.hook_from_words([(0.1 * i, x) for i, x in enumerate("This is short. Then a much longer second sentence follows here.".split())])
    assert h["hook"].startswith("This is short. Then") and h["first_word_s"] == 0.0
    assert T._pick_subs([j, vtt]) == j  # en (manual or original ASR) before en-orig; json3 before vtt
    idx = T.index_local([tmp])
    assert idx["abcdefghijk"]["subs"] == j


def test_titlecheck_measured_rules_and_overlap():
    # synthetic cross-channel file: why/how + negation help, this/ALL-CAPS hurt (all replicating, CIs exclude 0)
    tmp = tempfile.mkdtemp()
    feat = lambda lift, n=200: {"pooled": {"n": n, "lift": lift, "ci90": [lift - 0.02, lift + 0.02]}, "replicates": True}
    json.dump({"kind": "vfa-topics-crosschannel", "features": {
        "title:t_starts_why_how": feat(0.05), "title:t_why_how": feat(0.05), "title:t_curiosity": feat(0.03),
        "title:t_negation": feat(0.15), "title:t_this": feat(-0.08), "title:t_caps_word": feat(-0.08),
        "topic:engineering_how": feat(-0.05)}}, open(os.path.join(tmp, "topics_x.json"), "w"))
    good = T.titlecheck("Why Square Wheels Don't Work", data=[tmp])
    bad = T.titlecheck("This wheel is INSANE", data=[tmp])
    plain = T.titlecheck("Why wheels are round", data=[tmp])
    assert good["score"] > plain["score"] > bad["score"], (good["score"], plain["score"], bad["score"])
    # 'why' hits three nested lexicons but is credited once (the strongest of the group)
    assert {"t_why_how", "t_starts_why_how", "t_curiosity"} <= set(plain["features"])
    assert abs(plain["predicted_lift"] - (0.05 * 200 / 208 + plain["topic_lift"])) < 1e-3, plain
    assert any("This" in x for x in bad["suggestions"]) and any("ALL-CAPS" in x for x in bad["suggestions"])
    f = T.title_features
    assert f("The Window That Breaks the Law")["t_the_that"] and not f("There is a thing that")["t_the_that"]
    assert f("Why Railroads Don't Work")["t_negation"] and not f("Nothing notable")["t_negation"]
    assert "Score" in T.titlecheck_text(good)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
