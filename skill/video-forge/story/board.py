"""`story.py board`: a script -> a DRAFT storyboard (engine/src/lib/board.tsx) with a place, a lighting key, a shot and
a visual gag proposed for every sentence, plus a table of the sentences that still need a concrete gag.

Rule being enforced (measured on the reference hero short, 14+ setups a minute): one gag prop, effect or stamp per
sentence that makes the claim concrete. The draft is a starting point: the author replaces generic picks with the
topic's own props (custom `props` in the board) and fixes marks, but never starts from an empty file.

Proposals come from story/gags.json (keyword -> set / key / gag / crowd reaction), the beat roles from `infer_beats`
and ONE SHOT PER SENTENCE (1.8): the first clause carries the shot (a medium for the hook, a wide to open a place, an
insert when the gag is a prop, never the same size twice in a row); the other clauses are beats inside that shot that
change the acting, the gag and the `focus`. A dialogue exchange is one two-shot with a rack focus. No whips: the camera
travels inside a place and dissolves to a new one. Camera moves cycle push, orbit, track, crane so no shot just holds.
"""
from __future__ import annotations

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SETS = ["street", "alley", "road", "yard", "shop", "workshop", "office", "hall"]
INTERIOR = {"shop", "workshop", "office", "hall"}
STOP = {"a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "by", "as", "is", "it", "he", "she", "they", "his", "her", "its", "so", "then", "that", "this", "with", "was", "are", "were"}
PRESETS = ["bbGent", "bbLady", "bbFarmer", "bbBoss", "bbChef", "bbGrandpa", "bbGirl", "bbCop"]
KEY_BY_BEAT = {"hook": "day", "setting": "day", "mock": None, "escalation": None, "incident": None, "mystery": "dusk", "pivot": "office", "explanation": None, "payoff": "golden"}
MOVES = ["push", "orbit", "track", "crane"]


def _clean(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def _clauses(text: str) -> list[str]:
    """split a long sentence at commas / 'and' / 'then' into clauses of at least 4 words (max 3)"""
    parts = [p.strip() for p in re.split(r",\s+|;\s+|:\s+|\s+(?=(?:and|then|but)\s+(?:the|he|she|they|soon|then|it)\b)", text) if p and p.strip()]
    out: list[str] = []
    for p in parts:
        if out and (len(p.split()) < 4 or len(out[-1].split()) < 4):
            out[-1] += ", " + p
        else:
            out.append(p)
    while len(out) > 3:
        out[-2:] = [out[-2] + ", " + out[-1]]
    return out


def draft(sc: dict, sents: list[dict], words: list[dict] | None, pid: str) -> dict:
    G = json.load(open(os.path.join(HERE, "gags.json"), encoding="utf-8"))
    rx = lambda s: re.compile(s, re.I)
    tokens = [_clean(w["word"]) for w in words] if words else [_clean(t) for s in sents for t in re.findall(r"[\w'’-]+", s["text"])]
    cursor = 0

    def anchor(clause: str) -> tuple[str, int]:
        """first content word of the clause that exists in the narration after the cursor -> 'word#n'"""
        nonlocal cursor
        cand = [_clean(t) for t in re.findall(r"[\w'’-]+", clause)]
        pick = next((c for c in cand if c and c not in STOP), cand[0] if cand else "")
        for c in [pick] + cand:
            if not c:
                continue
            for i in range(cursor, len(tokens)):
                if tokens[i] == c or (c.isdigit() is False and tokens[i].startswith(c) and len(c) > 3):
                    nth = sum(1 for t in tokens[: i + 1] if t == tokens[i])
                    cursor = i + 1
                    return (tokens[i] if nth == 1 else f"{tokens[i]}#{nth}"), i
        return pick, cursor

    speakers = [s["speaker"] for s in sents if s["speaker"] != "narrator"]
    cast = {"hero": "bbHero"}
    for sp in dict.fromkeys(speakers):
        cast[sp] = PRESETS[(len(cast) - 1) % len(PRESETS)]
    places: dict[str, dict] = {}
    beats, rows = [], []
    recent: list[str] = []
    place_id, cur_set, last_size, key_now, mv = None, None, None, None, 0
    for si, s in enumerate(sents):
        text = s["text"]
        tag = s["place"] if s.get("place_change") else None
        sugg = next((e for e in G["sets"] if rx(e["re"]).search((tag or "") + " " + text)), None)
        if si == 0 or tag:
            pid_new = tag or (sugg["set"] if sugg else "street")
            st = tag if tag in SETS else (sugg["set"] if sugg else "street")
            if pid_new not in places:
                places[pid_new] = {"set": st}
            new_place = pid_new != place_id
            place_id, cur_set = pid_new, places[pid_new]["set"]
        else:
            new_place = False
        if cur_set in ("street", "hall") and "crowd" not in places[place_id]:
            places[place_id]["crowd"] = 6
        for ci, clause in enumerate(_clauses(text) if s["speaker"] == "narrator" else [text]):
            a, wi = (0, 0) if (si == 0 and ci == 0) else anchor(clause)
            b: dict = {"at": a}
            first_of_place = new_place and ci == 0
            if first_of_place or (si == 0 and ci == 0):
                b["place"] = place_id
            # lighting key: a keyword wins, then the beat role, and only when it changes
            kw = next((e for e in G["keys"] if rx(e["re"]).search(clause)), None)
            key = (kw["key"] if kw else None) or (sugg["key"] if (first_of_place and sugg) else None) or (KEY_BY_BEAT.get(s["beat"]) if ci == 0 else None)
            if key == "office" and cur_set not in INTERIOR:
                key = "night"
            if si == 0 and ci == 0 and not key:
                key = "day"
            if key and key != key_now:
                b["key"] = key
                key_now = key
            if kw and kw.get("rain"):
                b["rain"] = kw["rain"]
            # the gag
            # the same generic prop twice in a row is not a new picture: skip it and let the line show up under 'needs a gag'
            gm = next((e for e in G["gags"] if rx(e["re"]).search(clause) and json.dumps(e["gag"]) not in recent[-3:]), None)
            recent.append(json.dumps(gm["gag"]) if gm else "")
            gag, why = None, ""
            yr = re.search(r"\b(1[0-9]{3}|20[0-9]{2})s?\b", clause)
            num = re.search(r"\b(\d[\d,.]*)\s*(%|percent|times|million|billion|thousand)?", clause)
            if yr:
                gag, why = {"stamp": yr.group(0)}, "year"
            elif num and not yr and num.group(1) not in ("1",):
                gag, why = {"counter": {"to": float(num.group(1).replace(",", "")), "suffix": (" %" if num.group(2) in ("%", "percent") else (" " + num.group(2)) if num.group(2) else "")}}, "number"
            elif gm:
                gag, why = dict(gm["gag"]), "keyword"
                if "big" in gag:
                    m = rx(gm["re"]).search(clause)
                    gag["big"] = m.group(0).upper()
                if "prop" in gag:
                    gag["at"] = "center" if cur_set not in INTERIOR else [0.9, 1.0, 0.2]
                    gag["id"] = f"{gag['prop']}{len(beats)}"
                if "fx" in gag:
                    gag["on"] = s["speaker"] if s["speaker"] != "narrator" else "hero"
                if gm.get("kick"):
                    b["kick"] = gm["kick"]
                if gm.get("sfx"):
                    b["sfx"] = [gm["sfx"]]
            cm = next((e for e in G["crowd"] if rx(e["re"]).search(clause)), None)
            if cm and places[place_id].get("crowd"):
                b["crowd"] = cm["crowd"]
            # the shot
            who = s["speaker"] if s["speaker"] != "narrator" else "hero"
            # 1.8: ONE SHOT PER SENTENCE. The first clause carries the shot; the other clauses change the acting, the gag and
            # the focus inside it (the first board cut 34 setups into 57 s, 1.7 s each; the reference holds 6 s). A dialogue
            # exchange is one two-shot with a rack focus from speaker to speaker.
            prev_sp = sents[si - 1]["speaker"] if si else "narrator"
            next_sp = sents[si + 1]["speaker"] if si + 1 < len(sents) else "narrator"
            inside = (ci > 0 and not first_of_place) or (s["speaker"] != "narrator" and prev_sp not in ("narrator", who) and not first_of_place)
            if s["speaker"] == "narrator" and si > 0 and not first_of_place and len(text.split()) <= 5:
                inside = True  # a short sentence ("No two edges match.") is a beat of the shot before it
            if inside:
                size = None
            elif s["speaker"] != "narrator":
                size = "two" if next_sp not in ("narrator", who) else "medium"
            elif si == 0 and ci == 0:
                size = "medium"
            elif first_of_place:
                size = "wide"
            elif gag and "prop" in gag and last_size != "insert":
                size = "insert"
            elif rx(G["pov"]).search(clause) and gag and "prop" in gag:
                size = "pov"
            else:
                size = next(x for x in ["medium", "close", "full", "low", "medium"] if x != last_size)
            shot: dict = {"size": size}
            if size is None:
                focus = gag["id"] if (gag and "prop" in gag) else (who if s["speaker"] != "narrator" else None)
                if focus:
                    b["focus"] = focus
            elif size == "two":
                shot["on"] = [who, next_sp]
            elif size == "insert":
                shot["on"] = gag["id"]
            elif size == "pov":
                shot.update({"on": gag["id"], "from": who})
            elif size != "wide":
                shot["on"] = who
                shot["angle"] = 16 if len(beats) % 2 else -16
            if size is not None:
                shot["move"] = MOVES[mv % len(MOVES)] if size not in ("insert", "pov", "close", "two") else "push"
                mv += 1
                b["shot"] = shot  # no whips: the way in is a slow travel (same place) or a dissolve (new place)
                last_size = size
            # the acting: a pose per beat role
            pose = {"hook": "hips", "mock": "point", "mystery": "shock", "incident": "shock", "pivot": "think", "explanation": "point", "payoff": "cheer"}.get(s["beat"], "idle")
            act = {who: {"pose": pose}}
            if b.get("place") or (si == 0 and ci == 0):
                act = {n: {"at": ("center" if n == who else [(-1.0 if k % 2 else 1.0), 0, 0.7])} for k, n in enumerate(cast)}
                act[who]["pose"] = pose
            if s["speaker"] != "narrator":
                act[who]["talk"] = True
            b["act"] = act
            if gag:
                b["gag"] = gag
            if si == 0 and ci == 0:
                b["music"] = "build"
            if s["beat"] == "pivot" and ci == 0:
                b["music"] = "calm"
            if s["beat"] == "payoff" and ci == 0:
                b["music"] = "full"
            beats.append(b)
            rows.append({"n": len(beats), "beat": s["beat"], "at": a, "place": place_id, "shot": size or ("(same shot" + (", focus " + b["focus"] if b.get("focus") else "") + ")"), "key": b.get("key", ""), "gag": json.dumps(gag) if gag else "",
                         "why": why, "text": clause, "suggest_set": sugg["set"] if (sugg and sugg["set"] != cur_set and not tag) else ""})
    return {"id": pid, "title": sc["head"].get("title", pid), "cast": cast, "places": places, "beats": beats, "rows": rows}


def to_ts(D: dict) -> str:
    j = lambda v: json.dumps(v, ensure_ascii=False)
    name = re.sub(r"[^A-Za-z0-9]", "", D["id"]) or "story"
    L = ["/**", f" * DRAFT storyboard for \"{D['title']}\" (written by `story.py board`; edit it, it is a starting point).",
         " * Every beat has a place, a lighting key, a shot and a proposed gag. Replace generic picks with the topic's own props",
         " * (`props: { name: (api) => Object3D | { group, update } }`), move people to real marks, then check the pictures:",
         f" *   node tools/render.mjs --project {D['id']} --stills cues --scale 0.3",
         " * Authoring guide: references/pipeline/board.md.", " */",
         'import { Beat, Board, boardProject } from "../../lib/board";', 'import WORDS from "./words.json";', "", "const beats: Beat[] = ["]
    for b, r in zip(D["beats"], D["rows"]):
        L.append(f"  // {r['n']}. {r['beat']}: {r['text']}" + ("   <-- NEEDS A GAG" if not b.get("gag") else ""))
        L.append("  " + j(b) + ",")
    L += ["];", "", "const board: Board = {", f"  id: {j(D['id'])}, title: {j(D['title'])}, words: WORDS,",
          "  cast: { " + ", ".join(f"{k}: {{ spec: {j(v)} }}" for k, v in D["cast"].items()) + " }, // TODO: dress the cast for the story",
          "  places: " + j(D["places"]) + ",", "  beats,", "};", f"export const {name}Short = boardProject(board);", ""]
    return "\n".join(L)


def to_md(D: dict) -> str:
    rows, n = D["rows"], len(D["rows"])
    have = sum(1 for r in rows if r["gag"])
    L = [f"# Storyboard draft: {D['title']}", "", f"{n} beats in {len(D['places'])} places; **{have} of {n} beats have a proposed gag** (target: every sentence shows its claim).", "",
         "| # | beat | anchor | place | shot | key | gag | text |", "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['n']} | {r['beat']} | `{r['at']}` | {r['place']}{' (try: ' + r['suggest_set'] + ')' if r['suggest_set'] else ''} | {r['shot']} | {r['key']} | {r['gag'] or '**needs a gag**'} | {r['text'].replace('|', '/')} |")
    need = [r for r in rows if not r["gag"]]
    if need:
        L += ["", "## Still needs a gag", "", "Ask of each line: what OBJECT or ACT proves this sentence without the narration? Build it as a prop, or show it as a stamp / counter.", ""]
        L += [f"- beat {r['n']}: {r['text']}" for r in need]
    return "\n".join(L) + "\n"
