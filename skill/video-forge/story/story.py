#!/usr/bin/env python3
"""Story engine: script -> lint -> fact-check gate -> beat sheet + camera plan -> engine scaffold.

  py story.py lint     script.txt [--style toonworld-explainer]      # formula, pacing, hook, payoff checks + score
  py story.py claims   script.txt --out claims.md                    # every checkable claim as a TODO row
  py story.py verify   claims.md                                     # gate: exit 1 unless every claim is OK + sourced
  py story.py beats    script.txt [--words words.json] --out DIR     # beats.json/.md: timing, beat, shot, camera move,
                                                                     # light, FX, SFX per sentence
  py story.py scaffold DIR/beats.json --out PROJECT_DIR/story_plan.ts   # typed plan the engine project imports
  py story.py hooks    "hook A" "hook B" ...  [--style S]            # rank hook variants (formula + measured data)
  py story.py export   script.txt --out vo.txt [--per-speaker DIR]   # clean spoken text for TTS (tags stripped)

Script format (plain text, one or more sentences per line):
  # title: Why manhole covers are round          (header lines: title / style / topic)
  He made every manhole cover in town *square*.  (*word* = punch-in word)
  @founder: Square? Good luck with that.          (a character's line: speaker before the colon)
  [place:foundry] The old foundry laughs at him.  (place change -> 10 f in-world dissolve)
  [beat:pivot] You see, ...                       (override the inferred beat)

The formula and every number come from story/targets.json (measured style profiles). The writing itself is done by
Claude in the workflow (references/story-engine.md); this tool measures, gates and turns the script into a plan.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGETS = json.load(open(os.path.join(HERE, "targets.json"), encoding="utf-8"))

BEATS = ["hook", "setting", "mock", "escalation", "incident", "mystery", "pivot", "explanation", "payoff"]
TIME_MARKERS = re.compile(r"^(then|one (morning|day|night)|by (spring|summer|autumn|fall|winter|the end)|in (january|february|march|april|may|june|july|august|september|october|november|december|\d{4})|soon|next|years later|a week later|the next day|that night|weeks later|months later)\b", re.I)
INCIDENT = re.compile(r"\b(falls?|fell|drops?|dropped|slips?|slipped|crash(es|ed)?|breaks?|broke|explodes?|exploded|collapses?|collapsed|sinks?|sank|bursts?|burst|straight down|disappears?)\b", re.I)
MYSTERY = re.compile(r"\b(wait|what\??|how did|why did|but why|huh)\b", re.I)
CTA = re.compile(r"\b(subscribe|follow (me|for)|like (and|this video)|comment below|link in (the )?bio|part 2|stay tuned)\b", re.I)
WEAK_OPEN = re.compile(r"^(hey|hi|hello|welcome|today|in this video|so,? today|did you know|let me|let's talk|have you ever wondered)\b", re.I)
# "we'll teach you / here's how X works" framing lowered CTR in causal headline tests (Banerjee & Urminsky 2025, Marketing
# Science); misconception -> refutation teaches better (Muller 2008); negative words raised CTR ~2.3 %/word (Robertson 2023)
TEACH = re.compile(r"\b(let's (learn|see|find out|explore)|here's (how|why)|we('ll| will) (explain|show|teach)|i('ll| will) (explain|show)|learn (how|why)|this is how)\b", re.I)
MISCONCEPTION = re.compile(r"\b(most people think|everyone thinks|you('ve| have) been|you probably think|actually|it's not|isn't what|myth|wrong about|they're not)\b", re.I)
NEGATIVE = re.compile(r"\b(died|dead|death|kill\w*|disaster|fail\w*|ruin\w*|crash\w*|lost|wrong|worst|danger\w*|illegal|banned|broke|mistake|accident\w*)\b", re.I)
STAKES = re.compile(r"\b(illegal|impossible|banned|deadly|died|kill(ed|s)?|million|billion|never|only|every|nobody|secret|forbidden|dangerous|worst|first|last|accident(ally)?|wrong|mistake|ruin(ed)?|lost)\b", re.I)


def load_style(name: str | None) -> tuple[str, dict]:
    n = name if name in TARGETS else "default"
    return n, TARGETS[n]


# ------------------------------------------------------------------------------------------------ parsing
def parse(path: str) -> dict:
    head, sents = {}, []
    place = None
    for raw in open(path, encoding="utf-8").read().splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"#\s*(\w+)\s*:\s*(.+)", line)
        if m:
            head[m.group(1).lower()] = m.group(2).strip()
            continue
        tags = dict(re.findall(r"\[(\w+):([^\]]+)\]", line))
        line = re.sub(r"\[\w+:[^\]]+\]\s*", "", line)
        speaker = "narrator"
        m = re.match(r"@(\w+)\s*:\s*(.+)", line)
        if m:
            speaker, line = m.group(1), m.group(2)
        if "place" in tags:
            place = tags["place"]
        # a character's line stays ONE unit (one shot, one lip-sync window); narration splits into sentences
        parts = [line] if speaker != "narrator" else [p for p in re.split(r"(?<=[.!?])\s+(?=[\"'A-Z0-9*])", line) if p.strip()]
        for i, p in enumerate(parts):
            punches = re.findall(r"\*([^*]+)\*", p)
            text = p.replace("*", "")
            sents.append({"text": text, "speaker": speaker, "tags": tags if i == 0 else {k: v for k, v in tags.items() if k != "place"},
                          "place": place, "place_change": i == 0 and "place" in tags, "punches": punches,
                          "words": len(re.findall(r"[\w'’-]+", text))})
    return {"head": head, "sentences": sents}


def infer_beats(sents: list[dict], T: dict) -> None:
    n = len(sents)
    cands = [i for i, s in enumerate(sents) if "beat" not in s["tags"] and any(s["text"].lower().startswith(p) for p in T["pivot_phrases"])]
    cands += [i for i, s in enumerate(sents) if s["tags"].get("beat") == "pivot"]
    pa, pb = T["pivot_position"]  # several "You see"s: the real pivot is the one inside the measured window, else the last
    inside = [i for i in cands if pa <= i / max(1, n) <= pb]
    pivot_i = (inside or sorted(cands) or [None])[-1] if cands else None
    seen_mock = False
    for i, s in enumerate(sents):
        if "beat" in s["tags"]:
            s["beat"] = s["tags"]["beat"]
            continue
        low = s["text"].lower()
        if i == 0:
            s["beat"] = "hook"
        elif pivot_i is not None and i == pivot_i:
            s["beat"] = "pivot"
        elif pivot_i is not None and i > pivot_i:
            s["beat"] = "payoff" if i >= n - max(1, round(n * T["payoff_last_frac"])) else "explanation"
        elif s["speaker"] != "narrator" or (seen_mock is False and re.search(r"\b(laughs?|mocks?|jokes?|scoffs?)\b", low)):
            s["beat"] = "mock"
            seen_mock = True
        elif MYSTERY.search(low) and (pivot_i is None or i < pivot_i) and i > n * 0.3:
            s["beat"] = "mystery"
        elif INCIDENT.search(low):
            s["beat"] = "incident"
        elif TIME_MARKERS.search(low) or low.startswith(("but ", "so ")):
            s["beat"] = "escalation"
        else:
            s["beat"] = "setting" if (pivot_i is None or i < pivot_i) and i <= 3 else "escalation" if (pivot_i is None or i < pivot_i) else "explanation"


# ------------------------------------------------------------------------------------------------ timing
def _norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def time_sentences(sents: list[dict], T: dict, words_path: str | None) -> float:
    if words_path:
        words = json.load(open(words_path, encoding="utf-8"))
        k = 0
        for s in sents:
            toks = [_norm(t) for t in re.findall(r"[\w'’-]+", s["text"]) if _norm(t)]
            start = None
            for t in toks:  # greedy sequential alignment; tolerant to ASR merges/splits
                j = next((q for q in range(k, min(k + 6, len(words))) if _norm(words[q]["word"]).startswith(t[:4]) or t.startswith(_norm(words[q]["word"])[:4] or "#")), None)
                if j is None:
                    continue
                start = words[j]["start"] if start is None else start
                s["end"] = words[j]["end"]
                k = j + 1
            s["start"] = start if start is not None else (sents[sents.index(s) - 1].get("end", 0.0) if sents.index(s) else 0.0)
            s.setdefault("end", s["start"] + s["words"] / T["wps"])
        return sents[-1]["end"] if sents else 0.0
    t = 0.0
    for s in sents:
        s["start"] = t
        s["end"] = t + s["words"] / T["wps"]
        t = s["end"] + (0.25 if s["text"].rstrip().endswith((".", "!", "?")) else 0.1)
    return sents[-1]["end"] if sents else 0.0


# ------------------------------------------------------------------------------------------------ lint
def hook_signals(text: str) -> dict:
    low = text.lower()
    return {
        "absurd_or_stakes_fact": bool(STAKES.search(low)) or bool(re.search(r"\b(made|built|tried|decided|bought|sold|put|turned)\b", low)),
        "if_you_form": low.startswith("if you"),
        "question": text.strip().endswith("?"),
        "number": bool(re.search(r"\d|\b(one|two|three|ten|hundred|thousand|million|billion)\b", low)),
        "second_person": bool(re.search(r"\byou(r)?\b", low)),
        "weak_opening": bool(WEAK_OPEN.search(low)),
        "teach_framing": bool(TEACH.search(low)),
        "misconception": bool(MISCONCEPTION.search(low)),
        "negative_words": len(NEGATIVE.findall(low)),
        "concrete_subject": bool(re.search(r"\b(he|she|they|a man|a woman|this (man|woman|guy|town|city)|[A-Z][a-z]+)\b", text)),
    }


def measured_hookcheck(text: str, style: str):
    """Use the measured hook model (vfa topics/hookcheck) when it is installed; None otherwise."""
    sys.path.insert(0, os.path.join(HERE, "..", "analyzer"))
    try:
        from vfa import topics  # type: ignore
        fn = getattr(topics, "hookcheck", None) or getattr(topics, "score_hook", None)
        return fn(text, style=style) if fn else None
    except Exception:
        return None


def lint(path: str, style: str | None) -> dict:
    sc = parse(path)
    name, T = load_style(style or sc["head"].get("style"))
    S = sc["sentences"]
    infer_beats(S, T)
    dur = time_sentences(S, T, None)
    issues = []

    def add(sev, msg, fix):
        issues.append({"severity": sev, "issue": msg, "fix": fix})

    if not S:
        return {"style": name, "score": 0, "issues": [{"severity": "FAIL", "issue": "empty script", "fix": "write it"}]}
    lo, hi = T["duration_s"]
    if not lo <= dur <= hi:
        add("FAIL", f"estimated duration {dur:.1f} s at {T['wps']} words/s is outside {lo}-{hi} s", "cut or add sentences")
    hook = S[0]
    hs = hook_signals(hook["text"])
    a, b = T["hook_words"]
    if not a <= hook["words"] <= b:
        add("WARN", f"hook has {hook['words']} words (target {a}-{b})", "state the absurd act + stakes in one sentence")
    if hs["weak_opening"]:
        add("FAIL", "hook opens with a greeting / setup phrase", "start with the absurd fact itself, no intro")
    if hs["teach_framing"]:
        add("WARN", "hook is framed as a lesson ('here's how / let's learn')", "state the surprising fact or misconception instead (teach framing lowered CTR in causal headline tests)")
    if not (hs["absurd_or_stakes_fact"] or hs["if_you_form"] or hs["misconception"]):
        add("WARN", "hook has no absurd act / stakes signal", "who did what impossible/illegal/costly thing?")
    lens = sorted(s["words"] for s in S)
    med = lens[len(lens) // 2]
    if med > T["sentence_words_median"] + 4:
        add("WARN", f"median sentence {med} words (target ~{T['sentence_words_median']})", "split long sentences")
    for s in S:
        if s["words"] > T["sentence_words_max"]:
            add("WARN", f"long sentence ({s['words']} words): '{s['text'][:60]}...'", "split it")
    pivots = [i for i, s in enumerate(S) if s["beat"] == "pivot"]
    if not pivots:
        add("WARN", "no pivot sentence ('You see, ...')", "add the turn to the real mechanism")
    else:
        pos = S[pivots[0]]["start"] / max(dur, 1e-6)
        pa, pb = T["pivot_position"]
        if not pa <= pos <= pb:
            add("WARN", f"pivot at {pos:.0%} of the runtime (target {pa:.0%}-{pb:.0%})", "move the mechanism reveal")
    if sum(1 for s in S if "you see" in s["text"].lower()) > 1:
        add("WARN", "'You see' used more than once: weakens the pivot", "keep one")
    mocks = sum(1 for s in S if s["speaker"] != "narrator")
    ma, mb = T["mock_lines"]
    if not ma <= mocks <= mb:
        add("INFO", f"{mocks} in-character lines (style uses {ma}-{mb})", "a rival/crowd line raises stakes")
    if CTA.search(" ".join(s["text"] for s in S[-3:])):
        add("FAIL", "ends with a call to action / outro", "end on the ironic payoff, last word = last frame")
    gaps, last = [], 0.0
    for s in S:  # re-hooks: questions, time jumps, incidents, mystery, pivot
        if s["beat"] in ("mock", "incident", "mystery", "pivot", "escalation", "payoff") or s["text"].endswith("?") or s["place_change"] or s["punches"] or TIME_MARKERS.search(s["text"].lower()):
            gaps.append(s["start"] - last)
            last = s["start"]
    gaps.append(dur - last)
    if max(gaps) > T["rehook_every_s"] * 1.6:
        add("WARN", f"{max(gaps):.1f} s without a re-hook (target every ~{T['rehook_every_s']} s)", "add a turn, time jump, question or reaction")
    first = set(re.findall(r"[a-z]{4,}", S[0]["text"].lower()))
    last = set(re.findall(r"[a-z]{4,}", " ".join(x["text"] for x in S[-2:]).lower()))
    if not first & last:
        add("INFO", "the ending does not echo the hook", "let the last line lead back into the first (loopable Shorts)")
    if not any(re.search(r"\d", s["text"]) for s in S):
        add("INFO", "no numbers in the script", "concrete numbers make it feel real (fact-check them)")
    mh = measured_hookcheck(hook["text"], name)
    pen = {"FAIL": 25, "WARN": 8, "INFO": 2}
    score = max(0, 100 - sum(pen[i["severity"]] for i in issues))
    return {"style": name, "duration_s": round(dur, 1), "sentences": len(S), "score": score, "hook": hook["text"],
            "hook_signals": hs, "measured_hook": mh, "beats": [s["beat"] for s in S], "issues": issues}


# ------------------------------------------------------------------------------------------------ claims
def claims(path: str) -> list[dict]:
    out = []
    for i, s in enumerate(parse(path)["sentences"]):
        t = s["text"]
        why = []
        if re.search(r"\d", t):
            why.append("number/date")
        if re.search(r"(?<!^)(?<![.!?] )\b[A-Z][a-z]{2,}", t[1:]):
            why.append("named entity")
        if re.search(r"\b(first|only|largest|biggest|smallest|most|least|never|always|every|all|illegal|banned|invented)\b", t, re.I):
            why.append("absolute/superlative")
        if re.search(r"\b(because|so that|which is why|that's why|causes?|means)\b", t, re.I):
            why.append("causal mechanism")
        if s["speaker"] == "narrator" and why:
            out.append({"id": f"C{len(out) + 1}", "sentence": i + 1, "claim": t, "why": ", ".join(why), "status": "TODO", "source": ""})
    return out


def claims_md(rows: list[dict]) -> str:
    L = ["# Fact-check sheet", "",
         "Verify every row with a primary or reputable source (web search). Set status to OK (true as written), FIX (rewrite the",
         "sentence, then re-run), or STORY (deliberate story framing around a true mechanism, say which part is invented).",
         "`story.py verify claims.md` blocks production until every row is OK/STORY with a source URL.", "",
         "| id | sentence | claim | why checked | status | source |", "|---|---|---|---|---|---|"]
    L += [f"| {r['id']} | {r['sentence']} | {r['claim'].replace('|', '/')} | {r['why']} | {r['status']} | {r['source']} |" for r in rows]
    return "\n".join(L) + "\n"


def verify(path: str) -> list[str]:
    bad = []
    for line in open(path, encoding="utf-8"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 6 and re.match(r"C\d+$", cells[0]):
            st, src = cells[4].upper(), cells[5]
            if st not in ("OK", "STORY") or not re.search(r"https?://", src):
                bad.append(f"{cells[0]} ({st or 'no status'}{'' if re.search(r'https?://', src) else ', no source URL'}): {cells[2][:70]}")
    return bad


# ------------------------------------------------------------------------------------------------ beats + camera plan
SHOT = {"hook": "medium on the subject + hook object", "setting": "wide establishing", "mock": "close on the speaker",
        "escalation": "medium, new place or time", "incident": "close follow on the action", "mystery": "close-up reaction",
        "pivot": "wide/top-down, diagram on screen", "explanation": "insert / diagram", "payoff": "medium on the payoff character"}
FX = {"hook": "sparkle on the hook object", "mock": "'?' over the doubter", "incident": "impact/splash/dust on contact",
      "mystery": "'!' over the reactor", "payoff": "stars / sign prop on the payoff word"}


def beats(path: str, style: str | None, words: str | None) -> dict:
    sc = parse(path)
    name, T = load_style(style or sc["head"].get("style"))
    S = sc["sentences"]
    infer_beats(S, T)
    dur = time_sentences(S, T, words)
    cam = T["camera"]
    light_by = T["light"]
    section = "setup"
    push = True
    rows = []
    for i, s in enumerate(S):
        b = s["beat"]
        if b in ("incident",) and section == "setup":
            section = "incident"
        if b == "pivot":
            section = "pivot"
        if b == "payoff":
            section = "payoff"
        if i == 0:
            move = "establish (slow push)"
        elif s["end"] - s["start"] < 1.2 and not s["place_change"]:
            move = "hold (constant push; too short for its own move)"
        elif s["place_change"]:
            move = f"in-world dissolve {cam['dissolve_f']} f to [{s['place']}]"
        elif b == "incident":
            move = "follow the falling/moving object, kick on contact"
        else:
            move = f"{'push' if push else 'pull'} {cam['travel_f']} f centred on the sentence start"
            push = not push
        punch = s["punches"] or re.findall(r"\b\d[\d,.]*\b", s["text"])
        rows.append({"i": i + 1, "beat": b, "start": round(s["start"], 3), "end": round(s["end"], 3), "speaker": s["speaker"],
                     "place": s["place"], "text": s["text"], "shot": SHOT.get(b, "medium"), "camera": move,
                     "punch_words": punch, "kick": bool(INCIDENT.search(s["text"])) and b == "incident",
                     "light": light_by.get(section if section != "setup" else "setup", "day"), "fx": FX.get(b, ""),
                     "sfx": ("swish on the move" if move.startswith(("push", "pull", "in-world")) else "") +
                            ("; hit on contact" if b == "incident" else "") + ("; button after the last word" if i == len(S) - 1 else ""),
                     "lipsync": s["speaker"] != "narrator"})
    return {"title": sc["head"].get("title", ""), "style": name, "duration_s": round(dur, 2), "timed_from": "words.json" if words else f"estimate @ {T['wps']} w/s",
            "camera_rules": cam, "beats": rows}


def beats_md(B: dict) -> str:
    L = [f"# Beat sheet: {B['title']}", "", f"style `{B['style']}`, {B['duration_s']} s, timing from {B['timed_from']}", "",
         "| # | t (s) | beat | place | shot | camera | punch | light | FX | SFX | text |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in B["beats"]:
        L.append(f"| {r['i']} | {r['start']:.2f}-{r['end']:.2f} | {r['beat']} | {r['place'] or ''} | {r['shot']} | {r['camera']} | "
                 f"{', '.join(r['punch_words'])}{' + kick' if r['kick'] else ''} | {r['light']} | {r['fx']} | {r['sfx']} | "
                 f"{('@' + r['speaker'] + ': ') if r['speaker'] != 'narrator' else ''}{r['text'].replace('|', '/')} |")
    return "\n".join(L) + "\n"


def scaffold(beats_json: str) -> str:
    B = json.load(open(beats_json, encoding="utf-8"))
    rows = [{k: r[k] for k in ("i", "beat", "start", "end", "speaker", "place", "camera", "punch_words", "kick", "light", "fx", "lipsync")} for r in B["beats"]]
    places = sorted({r["place"] for r in rows if r["place"]} | {"start"})
    cam = B["camera_rules"]
    return f"""/**
 * GENERATED by story/story.py scaffold from beats.json ("{B['title']}", style {B['style']}). Re-generate after the VO
 * changes (timings come from words.json). Fill SHOTS with a camera framing per place, then in index.tsx:
 *   const rig = cameraRig(planKeys(fps, SHOTS), {{ push: planPush(fps), kicks: planKicks(fps), refFps: 30 }});
 *   <Stage3D ... dissolveAt={{(f, fp) => rig.dissolveAt(f, fp)}} cuts={{rig.cuts}} />
 *   SceneDef: {{ innerSoft: planSoft(fps), cues: planCues(fps), events: planEvents(fps) }}
 */
import type {{ CamKey, V3 }} from "../../lib/camera";

export const BEATS = {json.dumps(rows, indent=1)} as const;

export type Shot = {{ pos: V3; look: V3; fov?: number; focus?: number }};
/** one framing per place (A) and its push/pull partner (B): "{'", "'.join(places)}" */
export type Shots = Record<string, {{ a: Shot; b?: Shot }}>;

const F = (s: number, fps: number) => Math.round(s * fps);
export const planCues = (fps: number) => Object.fromEntries(BEATS.map((b) => [`s${{b.i}}_${{b.beat}}`, F(b.start, fps)]));

/** Camera keys: one move per sentence (alternating A/B framings), {cam['dissolve_f']} f in-world dissolves on place changes,
 *  {cam['travel_f']} f travels centred on each sentence start, glides clamped to the gap (no jumps). */
export function planKeys(fps: number, SHOTS: Shots): CamKey[] {{
  const R = (n: number) => (n * 30) / fps, H = Math.round(({cam['travel_f']} / 2) * fps / 30), DZ = Math.round({cam['dissolve_f']} * fps / 30);
  const keys: CamKey[] = [];
  let place = "start", alt = false;
  for (const b of BEATS) {{
    const f = F(b.start, fps), sh = SHOTS[b.place ?? place] ?? SHOTS[place] ?? Object.values(SHOTS)[0];
    if (!keys.length) {{ keys.push({{ f: 0, ...sh.a }}); continue; }}
    if (b.camera.startsWith("in-world dissolve")) {{
      place = b.place ?? place;
      const prev = keys[keys.length - 1];
      keys.push({{ ...prev, f: f - Math.round(5 * fps / 30), glide: R(f - prev.f) }}, {{ f, ...SHOTS[place].a, dissolve: DZ }});
      alt = false;
      continue;
    }}
    alt = !alt;
    const target = alt && sh.b ? sh.b : sh.a;
    const prev = keys[keys.length - 1];
    keys.push({{ f: f + H, ...target, glide: Math.min({cam['travel_f']}, R(f + H - prev.f)) }});
  }}
  return keys;
}}
export const planSoft = (fps: number) => BEATS.filter((b) => b.camera.startsWith("in-world dissolve")).map((b) => F(b.start, fps));
export const planPush = (fps: number) => ({{ rate: {cam['push_rate']}, punches: BEATS.filter((b) => b.punch_words.length).map((b) => ({{ f: F(b.start, fps) - 2, rate: {cam['punch_rate']}, n: {cam['punch_n']} }})) }});
export const planKicks = (fps: number) => BEATS.filter((b) => b.kick).map((b) => ({{ f: F(b.end, fps) - 4, amp: 0.05 }}));
export const planEvents = (fps: number) => BEATS.flatMap((b) => (b.fx ? [F(b.start, fps)] : []));
/** light per section for lookTimeline / applyToonSetup */
export const planLight = (fps: number) => BEATS.filter((b, k) => k === 0 || b.light !== BEATS[k - 1].light).map((b) => [F(b.start, fps), b.light] as const);
/** characters that speak on screen -> lip-sync windows (cueAt from audio/lipsync.py, or visemeAt from words.json) */
export const planLipsync = (fps: number) => BEATS.filter((b) => b.lipsync).map((b) => ({{ who: b.speaker, f0: F(b.start, fps), f1: F(b.end, fps) }}));
"""


# ------------------------------------------------------------------------------------------------ hooks
def rank_hooks(hooks: list[str], style: str | None) -> list[dict]:
    name, T = load_style(style)
    out = []
    for h in hooks:
        hs = hook_signals(h)
        n = len(re.findall(r"[\w'’-]+", h))
        a, b = T["hook_words"]
        s = 50 + 15 * hs["absurd_or_stakes_fact"] + 10 * hs["if_you_form"] + 6 * hs["number"] + 6 * hs["concrete_subject"] \
            + 8 * hs["misconception"] + 3 * min(2, hs["negative_words"]) - 15 * hs["teach_framing"] \
            - 30 * hs["weak_opening"] - 8 * (not a <= n <= b) - 4 * (hs["question"] and not hs["absurd_or_stakes_fact"])
        mh = measured_hookcheck(h, name)
        if isinstance(mh, dict) and isinstance(mh.get("score"), (int, float)):
            s = 0.4 * s + 0.6 * float(mh["score"])  # measured channel data outranks the formula heuristics
        out.append({"hook": h, "score": round(max(0, min(100, s)), 1), "words": n, "signals": hs, "measured": mh})
    return sorted(out, key=lambda r: -r["score"])


# ------------------------------------------------------------------------------------------------ cli
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("lint"); p.add_argument("script"); p.add_argument("--style"); p.add_argument("--json", action="store_true")
    p = sub.add_parser("claims"); p.add_argument("script"); p.add_argument("--out", required=True)
    p = sub.add_parser("verify"); p.add_argument("claims")
    p = sub.add_parser("beats"); p.add_argument("script"); p.add_argument("--style"); p.add_argument("--words"); p.add_argument("--out", required=True)
    p = sub.add_parser("scaffold"); p.add_argument("beats"); p.add_argument("--out", required=True)
    p = sub.add_parser("hooks"); p.add_argument("hooks", nargs="+"); p.add_argument("--style")
    p = sub.add_parser("export"); p.add_argument("script"); p.add_argument("--out", required=True); p.add_argument("--per-speaker")
    a = ap.parse_args()
    if a.cmd == "lint":
        r = lint(a.script, a.style)
        if a.json:
            print(json.dumps(r, indent=1))
        else:
            print(f"style {r['style']}: score {r['score']}/100, {r.get('sentences', 0)} sentences, ~{r.get('duration_s', 0)} s")
            print(f"beats: {' > '.join(r.get('beats', []))}")
            for i in r["issues"]:
                print(f"  {i['severity']:4} {i['issue']}  ->  {i['fix']}")
        sys.exit(1 if any(i["severity"] == "FAIL" for i in r["issues"]) else 0)
    elif a.cmd == "claims":
        rows = claims(a.script)
        open(a.out, "w", encoding="utf-8").write(claims_md(rows))
        print(f"{a.out}: {len(rows)} claims to verify")
    elif a.cmd == "verify":
        bad = verify(a.claims)
        for b in bad:
            print("  OPEN", b)
        print("fact-check gate: " + ("PASS" if not bad else f"FAIL ({len(bad)} open)"))
        sys.exit(1 if bad else 0)
    elif a.cmd == "beats":
        B = beats(a.script, a.style, a.words)
        os.makedirs(a.out, exist_ok=True)
        json.dump(B, open(os.path.join(a.out, "beats.json"), "w", encoding="utf-8"), indent=1)
        open(os.path.join(a.out, "beats.md"), "w", encoding="utf-8").write(beats_md(B))
        print(f"{a.out}: {len(B['beats'])} beats, {B['duration_s']} s ({B['timed_from']})")
    elif a.cmd == "scaffold":
        open(a.out, "w", encoding="utf-8", newline="\n").write(scaffold(a.beats))
        print(f"{a.out}: generated plan (fill SHOTS, see header)")
    elif a.cmd == "export":
        S = parse(a.script)["sentences"]
        open(a.out, "w", encoding="utf-8").write(" ".join(s["text"] for s in S) + "\n")
        if a.per_speaker:
            os.makedirs(a.per_speaker, exist_ok=True)
            for who in sorted({s["speaker"] for s in S}):
                open(os.path.join(a.per_speaker, f"{who}.txt"), "w", encoding="utf-8").write(" ".join(s["text"] for s in S if s["speaker"] == who) + "\n")
        print(f"{a.out}: {sum(s['words'] for s in S)} words for TTS (one voice); per-speaker files: {bool(a.per_speaker)}")
    elif a.cmd == "hooks":
        for r in rank_hooks(a.hooks, a.style):
            flags = [k for k, v in r["signals"].items() if v]
            print(f"{r['score']:5.1f}  ({r['words']} w)  {r['hook']}   [{', '.join(flags)}]")


if __name__ == "__main__":
    main()
