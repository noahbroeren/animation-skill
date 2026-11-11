"""Topic + hook + title research: which topics, hooks and titles make a channel's videos outperform.

  vfa topics CHANNEL_URL --out DIR [--max 300] [--tab shorts|videos] [--subs-top 30 --subs-bottom 30 --subs-mid 0]
             [--last N] [--local DIR ...] [--min-age-days 14] [--no-network] [--summary-out FILE] [--style NAME]
  (--last N restricts the study to the newest N uploads, e.g. when a channel switched format; scores are computed
   inside that window only.)
  vfa topics-aggregate DIR1 DIR2 ... --out D [--summary-out FILE]
  vfa hookcheck "hook sentence" [--style toonworld-explainer] [--data DIR_OR_JSON ...]

Pipeline (vfa topics)
  1. Flat-list the channel tab with yt-dlp (one cheap request; cached in DIR/cache/flat_<tab>.json).
     Shorts flat entries carry id, title, views; playlist order = upload order (newest first).
  2. OUTLIER SCORE (controls for channel growth / era):
        outlier_i = log10( views_i / median(views of the 2k uploads nearest to i in upload order, excluding i) )
     k = 10 (the +-10 neighbours; at the ends of the list the window slides so it still holds 2k neighbours).
     0 = typical for its era, +0.3 = 2x its neighbours, -0.3 = half. Raw-view and outlier rankings are both reported.
     Uploads younger than --min-age-days (default 14) are excluded from the stats (views still accumulating).
  3. HOOKS for the top-N and bottom-N by outlier score (+ an optional random middle sample): per-video yt-dlp metadata
     + subtitles (manual en > en-orig > auto en, json3 or vtt), falling back to audio-only first 9 s + faster-whisper.
     Only the first ~40 words, a few timings and the speech rate are cached (DIR/cache/hooks/<id>.json).
  4. CLASSIFY (deterministic lexicons/regex below, no paid APIs): hook types, topic category (title + hook words),
     title features, duration bucket, speech rate.
  5. STATS per feature: n, median outlier, lift = median(with) - channel median (log10 units; x10**lift views),
     bootstrap 90 % CI (2000 resamples, seed 0), delta vs videos without, "too few to trust" when n < 8;
     Spearman rank correlations for numeric features (with bootstrap CI). For hook features also the share among
     the top-N vs the bottom-N (extreme-groups design). Everything is correlation, not causation.

Outputs DIR/topics.json (all rows + stats), DIR/topics.md (readable report). --summary-out writes a numbers-only
summary (counts, lifts, CIs, abstracted hook templates, <= 5 short example titles) suitable for committing.

Hard exclusion: channels and videos whose handle / title / hook contain blocklisted tokens are dropped before
anything is cached (tokens stored as truncated sha1 hashes below so the words themselves never appear in files).
"""
from __future__ import annotations

import difflib
import glob
import hashlib
import json
import math
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np

# ----------------------------------------------------------------------------------------------- exclusion
_BLOCK = {"cef7e59218e3", "ee2d55fb2345", "08eb6cc88aa8", "4b68d5ee7b38", "456cbca38319", "d590f3f79cb6",
          "c9f87aa52d93", "d65ca144d6ed", "110a4bac5e7b"}


def _blocked(*texts) -> bool:
    for t in texts:
        for tok in re.findall(r"[a-z0-9]+", (t or "").lower()):
            if hashlib.sha1(tok.encode()).hexdigest()[:12] in _BLOCK:
                return True
    return False


# ----------------------------------------------------------------------------------------------- lexicons
# Hook types. Evaluated on the hook sentence (first sentence of speech, lower-cased; a second sentence is appended
# when the first has < 6 words). Patterns are documented so results can be reproduced and argued with.
ACTORS = (r"man|men|guy|guys|woman|women|girl|girls|boy|boys|kid|kids|child|children|baby|person|people|family|dad|mom|"
          r"mother|father|husband|wife|teen|teenager|student|students|worker|workers|soldier|soldiers|farmer|farmers|"
          r"king|queen|prince|princess|emperor|president|scientist|scientists|doctor|doctors|engineer|engineers|pilot|"
          r"pilots|prisoner|prisoners|inmate|thief|criminal|police|cop|cops|company|companies|city|town|village|"
          r"country|government|army|navy|chef|billionaire|millionaire|owner|boss|employee|grandma|grandpa|neighbor|"
          r"neighbour|someone|everyone|he|she|they|we|nasa|athlete|player|officer|judge|lawyer|teacher|monk|sailor|"
          r"astronaut|inventor|driver|drivers|tourist|tourists|passenger|passengers|crew|team|town|islanders|locals")
_ACTOR = rf"\b(?:{ACTORS})\b"
_IRREG_PAST = (r"was|were|did|made|built|went|found|took|got|had|ate|drank|bought|sold|paid|spent|threw|wrote|ran|"
               r"stole|left|came|became|began|caught|chose|drove|fell|felt|flew|gave|grew|hid|kept|knew|lost|met|put|"
               r"rode|saw|sent|shot|stood|swam|told|thought|tried|won|woke|broke|brought|decided|refused|survived")
_PAST = rf"\b(?:{_IRREG_PAST}|\w{{3,}}ed)\b"
_QWORD = (r"^(?:so |and |but |now |okay |ok )?(?:what|why|how|who|where|which|whose|did|do|does|is|are|was|were|"
          r"can|could|would|will|should|have|has|ever wonder\w*)\b")
_NUMWORD = (r"\b(?:\d[\d,.]*|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|"
            r"forty|fifty|hundred|hundreds|thousand|thousands|million|millions|billion|billions|trillion|dozen|half)\b")
_SUPER = (r"\b(?:biggest|largest|smallest|tallest|longest|shortest|fastest|slowest|deadliest|strongest|richest|"
          r"poorest|oldest|youngest|heaviest|hottest|coldest|loudest|weirdest|strangest|craziest|most|least|first|"
          r"only|best|worst|greatest|highest|lowest|deepest|rarest|safest|cheapest|world's|record)\b")
_FORBID = (r"\b(?:illegal|illegally|banned|ban|bans|forbidden|impossible|not allowed|isn't allowed|aren't allowed|"
           r"never allowed|outlawed|prohibited|against the law|a crime to|can't|cannot|couldn't|can not|no way to)\b")
_YOU = r"\b(?:you|your|you're|you'd|you'll|you've|yours|yourself|ya)\b"
_TIME_ANCHOR = (r"^(?:so |and )?(?:in \d{3,4}|in the \d{2,4}s|back in|years ago|centuries ago|one day|once|"
                r"when|after|during|last (?:year|week|month)|in (?:ancient|medieval)|on (?:\w+ )?\d{1,2})\b")
_COMPARE = r"\b(?:vs\.?|versus|compared to|compared with|than|instead of|difference between|rather than)\b"
_CURIOUS = (r"\b(?:why|how|secret|secrets|secretly|actually|nobody|no one|real reason|the reason|truth|turns out|"
            r"hidden|mystery|mysterious|weird|strange|bizarre|what happens|until|little-known|few people|"
            r"most people|never knew|surprising|surprisingly|wait|crazy)\b")
_TWIST = r"\b(?:but|yet|despite|even though|although|however|instead)\b"
_SETUP = (r"^(?:so|okay|ok|hey|hi|hello|today|in this video|let me|let's|welcome|have you ever|did you know|"
          r"here are|ever wondered|fun fact|guys|alright)\b")
_IF = r"^(?:so |and |now |okay )?(?:if|imagine|what if|let's say|say you|suppose|pretend)\b"
_IMPER = (r"^(?:so |and |now |okay )?(?:look|watch|listen|check|see|guess|try|stop|don't|do not|never|picture|"
          r"think about|take|grab|put|pay attention|wait)\b")
_THIS_IS = r"^(?:so |and |okay )?(?:this is|these are|this was|meet|here's|here is|say hello to)\b"

HOOK_TYPES = {
    "absurd_fact": "declarative third-person statement of an act or fact (not a question, hypothetical or 'this is' "
                   "intro, no 'you' in it) -- e.g. '[person] did [absurd act] to [goal]'",
    "question": "a question: '?' or starts with what/why/how/who/did/do/is/can/... ",
    "if_you": "hypothetical: starts with if / imagine / what if / suppose, or 'if you' anywhere in the hook",
    "this_is_meet": "introduction: starts with this is / these are / meet / here's",
    "number_superlative": "a number (digits or number words from 'two' up; 'one' is excluded as it is mostly a pronoun) "
                          "or a superlative (biggest, deadliest, most, first, only, world's, record...)",
    "forbidden_impossible": "illegal / banned / forbidden / not allowed / impossible / can't",
    "second_person": "addresses the viewer: you / your / you'd ...",
    "story_open": "in-media-res: actor at the start + past-tense verb in the first 8 words, or a time anchor "
                  "(in 1923 / back in / one day / when ...)",
    "comparison": "X vs Y / than / compared to / instead of",
    "curiosity_gap": "why / how / secret / actually / nobody / turns out / weird / until ...",
    "contrast_twist": "but / yet / despite / even though / instead inside the hook",
    "setup_opener": "throat-clearing opener: so / today / in this video / did you know / have you ever / hey ...",
    "imperative": "starts with a command to the viewer: look / watch / listen / guess / never / don't / picture ...",
}


def classify_hook(text: str | None) -> dict:
    """Hook-type flags for a hook sentence. Empty/None -> {'no_speech': True}."""
    t = re.sub(r"\s+", " ", (text or "").lower().replace("\u2019", "'")).strip()
    if not re.search(r"[a-z]", t):
        return {"no_speech": True}
    first8 = " ".join(t.split()[:8])
    first6 = " ".join(t.split()[:6])
    f = {}
    f["question"] = "?" in t or bool(re.search(_QWORD, t)) and not re.match(r"^(?:how|what) (?:this|these|a|an|one)\b", t)
    f["if_you"] = bool(re.search(_IF, t) or re.search(r"\bif (?:you|your)\b", t))
    f["this_is_meet"] = bool(re.search(_THIS_IS, t))
    f["number_superlative"] = bool(re.search(_NUMWORD, t) or re.search(_SUPER, t))
    f["forbidden_impossible"] = bool(re.search(_FORBID, t))
    f["second_person"] = bool(re.search(_YOU, t))
    f["story_open"] = bool(re.search(_TIME_ANCHOR, t) or
                           (re.search(rf"^(?:so |and )?(?:this |that |a |an |the |one |some |his |her |these )?(?:\w+ )?{_ACTOR}", t)
                            and re.search(_PAST, first8)))
    f["comparison"] = bool(re.search(_COMPARE, t))
    f["curiosity_gap"] = bool(re.search(_CURIOUS, t))
    f["contrast_twist"] = bool(re.search(_TWIST, t))
    f["setup_opener"] = bool(re.search(_SETUP, t))
    f["imperative"] = bool(re.search(_IMPER, t))
    f["absurd_fact"] = (not f["question"] and not re.search(_IF, t) and not f["this_is_meet"]
                        and not f["setup_opener"] and not f["imperative"] and not re.search(_YOU, first8))
    f["no_speech"] = False
    return f


TOPICS = {
    "body_medicine": r"body|brain|heart|blood|bone|skin|eye|teeth|tooth|doctor|hospital|surger|surgeon|disease|virus|"
                     r"cancer|sick|pain|organ|lung|liver|kidney|stomach|muscle|sleep|dna|gene|medic|pill|vaccine|"
                     r"patient|nurse|hair|nail|poop|pee|sweat|sneez|cough|fever|injur|wound|heal|health|belly|"
                     r"tongue|nose|ear|finger|toe|leg|arm|spine|tumou?r|allerg|bacteria|germ|infect|parasite|"
                     r"pregnan|birth|blind|deaf|breath|lungs|oxygen|hiccup|yawn|fart|vomit|puke|blister|scar|"
                     r"carsick|spit|saliva|tattoo|cocaine|ebola|hiv|injection|tapeworm|maggot|panic attack|weight|skeleton|nausea|drugs?|alcohol|smok|weed|aging|die|dying|death|corpse|immune|hormone",
    "animals_nature": r"animal|dog|puppy|cat|kitten|bird|fish|shark|whale|dolphin|snake|spider|insect|bug|ant|ants|bee|"
                      r"wasp|lion|tiger|bear|wolf|wolves|elephant|monkey|ape|gorilla|frog|crocodile|alligator|"
                      r"octopus|squid|horse|cow|pig|sheep|goat|rat|mouse|mice|deer|plant|tree|flower|forest|jungle|"
                      r"ocean|sea|river|lake|nature|species|pet|zoo|wild|parrot|owl|eagle|crab|jellyfish|dinosaur|"
                      r"dino|mosquito|worm|turtle|tortoise|penguin|koala|kangaroo|giraffe|hippo|rhino|seal|"
                      r"camel|beaver|bat|bats|snail|lobster|coral|reef|fungus|mushroom|weed|grass|seed|"
                     r"toad|python|barnacle|horsefl|goldfish|tardigrade|spiderweb|cobweb|hornet|flea|tick|leech|piranha|scorpion|cockroach|roach|slug|hamster|squirrel|raccoon|moose|bison|buffalo",
    "history": r"histor|ancient|war|wars|wwi|wwii|ww1|ww2|soldier|army|armies|king|queen|emperor|empire|pharaoh|egypt|"
               r"rome|roman|greek|viking|medieval|castle|knight|samurai|pirate|centur|battle|revolution|colonial|"
               r"nazi|hitler|napoleon|president|tribe|pyramid|spy|spies|1[5-9]\d\ds?|18th|19th|olden|"
               r"dynasty|ruler|throne|conquer|invasion|invade|general|tank|trench|cold war|sparta",
    "engineering_how": r"build|built|bridge|tunnel|road|railroad|railway|rail|train|car|cars|engine|plane|airplane|"
                       r"aircraft|airport|ship|boat|submarine|dam|tower|skyscraper|building|machine|factory|design|"
                       r"engineer|invent|construct|crane|elevator|escalator|highway|traffic|wheel|tire|tyre|brake|"
                       r"works|made|manufactur|roller coaster|coaster|pipe|sewer|manhole|power plant|concrete|steel|"
                       r"structure|architect|shape|wall|roof|stairs|parking|truck|bus|bike|bicycle|motor|fuel|gas|"
                       r"oil|water tower|lighthouse|canal|lock|tunnel|road|asphalt|subway|metro|cable|wire|grid|"
                     r"drill|pipeline|bomber|firework|skateboard|renewable|power|blackout|tool|tools|invention|patent|filmed|movie|movies|sword|armor|armour|weapon|gun|guns|cannon",
    "space_physics": r"space|planet|earth|moon|sun|star|stars|galaxy|universe|black hole|nasa|astronaut|rocket|orbit|"
                     r"mars|jupiter|saturn|venus|mercury|asteroid|comet|meteor|gravity|physics|light|atom|quantum|"
                     r"energy|electric|magnet|sound|speed|radiation|nuclear|laser|temperature|heat|cold|freez|"
                     r"vacuum|atmosphere|satellite|solar|telescope|alien|aliens|cosmic|neutron|particle|"
                     r"chemical|chemistry|element|science|scientist|experiment|explod|explosion|"
                     r"plasma|nuke|nukes|magnetic|antimatter|night sky|wave|waves|slinky|thermite|reactor|chernobyl|blue led|equation|math|maths|dimension|infinite|infinity|physics|liquid|metal|fire|ice|water|air|pressure|friction|momentum|electricity|wavelength|color|colour|colors|colours",
    "money_economics": r"money|dollar|dollars|\$|rich|billion|billionaire|millionaire|cost|costs|price|pay|paid|salary|"
                       r"job|jobs|company|business|bank|tax|taxes|econom|market|stock|cheap|expensive|profit|sell|"
                       r"sold|buy|bought|store|shop|brand|mcdonald|walmart|amazon|coin|gold|debt|loan|cash|wealth|"
                       r"poor|invest|fortune|worth|free|ceo|employee|boss|work|worker|customer|sale|discount|"
                       r"lottery|casino|scam|rent|insurance|fee|tip|tips|wage",
    "law_crime": r"law|laws|illegal|legal|crime|criminal|prison|jail|police|cop|cops|arrest|steal|stole|stolen|"
                 r"thief|thieves|rob|robber|heist|murder|court|judge|lawyer|sue|sued|banned|ban|prisoner|inmate|"
                 r"escape|fraud|smuggl|gang|mafia|fbi|cia|detective|evidence|guilty|sentence|fine|fined|"
                 r"ticket|speeding|cartel|hack|hacker|kidnap|crook|outlaw|forbidden|rule|rules|"
                     r"hitm[ae]n|ms ?13|streaker|smuggler|assassin|assassination|terror|bomb plot|conspiracy",
    "food": r"food|foods|eat|eats|ate|eating|cook|cooking|chef|restaurant|pizza|burger|fries|bread|cheese|meat|beef|"
            r"pork|egg|eggs|milk|sugar|salt|candy|chocolate|fruit|banana|apple|apples|rice|noodle|noodles|coffee|"
            r"drink|soda|coke|cola|beer|wine|snack|sandwich|taste|tasty|spicy|kitchen|recipe|honey|ice cream|"
            r"cereal|ketchup|sauce|vegetable|potato|tomato|corn|popcorn|gum|cake|cookie|donut|taco|sushi|"
            r"steak|bacon|sausage|nugget|nuggets|watermelon|lemon|orange|onion|garlic|pepper|butter|oil|"
            r"menu|meal|lunch|dinner|breakfast|hunger|hungry|fast food",
    "disasters_survival": r"surviv|disaster|earthquake|tsunami|volcano|hurricane|tornado|storm|flood|fire|crash|"
                          r"crashed|sink|sank|sinking|titanic|stranded|trapped|avalanche|explosion|explode|accident|"
                          r"emergency|rescue|drown|danger|dangerous|deadly|lightning|quicksand|lost at sea|"
                          r"shipwreck|wildfire|blizzard|collapse|collapsed|lava|plague|pandemic|famine|stuck",
    "psychology_behaviour": r"psycholog|mind|behavio|habit|fear|phobia|emotion|happy|happiness|sad|angry|lonely|"
                            r"love|dream|dreams|memory|memories|think|thinking|trick|tricks|manipulat|study|"
                            r"personality|iq|smart|lazy|motivat|addict|social|stress|anxiety|attention|crowd|"
                            r"persuad|brainwash|mental|boredom|bored|confiden|introvert|jealous|lie|lies|liar|"
                            r"prank|test|experiment|"
                     r"willpower|popular|friends|average person|disgust|illusion|brain|focus|procrastinat|introvert|extrovert|rude|polite|awkward|embarrass",
    "tech": r"tech|technology|computer|phone|phones|iphone|smartphone|internet|app|apps|ai|robot|robots|video game|"
            r"game|games|gaming|software|code|coding|hacker|google|apple|microsoft|tesla|screen|battery|wifi|"
            r"wi-fi|chip|camera|cameras|drone|digital|online|youtube|tiktok|chatgpt|laptop|keyboard|pixel|"
            r"bitcoin|crypto|gps|bluetooth|password|email|website|algorithm|virtual|vr|3d printer|printer",
    "everyday_objects": r"object|pen|pencil|paper|bottle|cup|door|doors|window|chair|toilet|shower|bath|mirror|key|"
                        r"keys|lock|zipper|button|buttons|shoe|shoes|sock|socks|shirt|jeans|pocket|pockets|bag|box|"
                        r"tape|glue|plastic|glass|soap|toothbrush|toothpaste|towel|bed|pillow|clock|watch|"
                        r"light bulb|lightbulb|fridge|microwave|oven|umbrella|wallet|ladder|sticker|label|lid|"
                        r"fork|spoon|knife|plate|tissue|napkin|receipt|vending machine|hanger|candle|blanket|"
                        r"magnet|balloon|rope|nail|screw|hammer|coin|cable|charger|sink|trash|bin|bucket",
}
# Extra category (not in the original brief): modern war / military / geopolitics, common on current-affairs explainers.
TOPICS["geopolitics_military"] = (r"russia|russian|ukraine|ukrainian|nato|china|chinese|military|militaries|troops|missile|"
                                  r"ww3|world war 3|putin|xi jinping|kim jong|north korea|iran|israel|taiwan|sanction|"
                                  r"special forces|navy seals?|marines|pentagon|stealth|fighter jet|warship|"
                                  r"superpower|invade|invasion|nuclear war|wagner|kremlin|crimea|bakhmut")
TOPIC_ORDER = list(TOPICS) + ["other"]
_TOPIC_RE = {k: re.compile(rf"(?<![a-z])(?:{v})(?:s|es|ed|ing|er|ers)?(?![a-z])") for k, v in TOPICS.items()}


def classify_topic(title: str | None, hook: str | None = None) -> tuple[str, dict]:
    """Primary topic = most lexicon hits (title hits x2, first ~40 spoken words x1); ties -> TOPIC_ORDER; none -> other."""
    tt = (title or "").lower().replace("\u2019", "'")
    hk = (hook or "").lower().replace("\u2019", "'")
    scores = {}
    for k, rx in _TOPIC_RE.items():
        s = 2 * len(rx.findall(tt)) + len(rx.findall(hk))
        if s:
            scores[k] = s
    if not scores:
        return "other", {}
    best = max(scores.values())
    return next(k for k in TOPIC_ORDER if scores.get(k) == best), scores


_EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF\U0001F900-\U0001F9FF]")


def title_features(title: str | None) -> dict:
    t = title or ""
    tl = t.lower().replace("\u2019", "'")
    clean = re.sub(r"#\w+", "", t)
    words = re.findall(r"[A-Za-z0-9'$%]+", clean)
    caps = [w for w in words if len(re.sub(r"[^A-Za-z]", "", w)) >= 2 and w.isupper()]
    return {
        "t_question": "?" in t,
        "t_number": bool(re.search(r"\d", clean) or re.search(_NUMWORD, tl)),
        "t_emoji": bool(_EMOJI.search(t)),
        "t_caps_word": bool(caps),
        "t_you": bool(re.search(_YOU, tl)),
        "t_why_how": bool(re.search(r"\b(?:why|how)\b", tl)),
        "t_starts_why_how": bool(re.match(r"^\s*(?:why|how)\b", tl)),
        "t_this": bool(re.search(r"\b(?:this|these)\b", tl)),
        "t_superlative": bool(re.search(_SUPER, tl)),
        "t_forbidden_impossible": bool(re.search(_FORBID, tl)),
        "t_curiosity": bool(re.search(_CURIOUS, tl)),
        "t_the_that": bool(re.match(r"^\s*the\s+(?:\w+\s+){0,4}?\w+\s+(?:that|who|which|where)\b", tl)),
        "t_negation": bool(re.search(r"\b(?:don't|doesn't|didn't|can't|won't|isn't|aren't|never|nobody|no one|not)\b", tl)),
        "t_hashtag": "#" in t,
        "t_words": len(words),
        "t_chars": len(clean.strip()),
        "t_caps_words": len(caps),
    }


TITLE_FEATURES = {
    "t_question": "title has '?'", "t_number": "title has a number", "t_emoji": "title has an emoji",
    "t_caps_word": "title has an ALL-CAPS word", "t_you": "title says you/your", "t_why_how": "title has why/how",
    "t_starts_why_how": "title starts with Why/How", "t_this": "title has this/these",
    "t_superlative": "title has a superlative", "t_forbidden_impossible": "title has illegal/banned/impossible/can't",
    "t_curiosity": "title has a curiosity word (secret/actually/nobody/weird...)", "t_hashtag": "title has a #hashtag",
    "t_the_that": "title is a label 'The [X] That/Who [Y]'", "t_negation": "title has a negation (don't/never/nobody/not)",
}
NUMERIC = {"t_words": "title word count", "t_chars": "title characters", "t_caps_words": "ALL-CAPS words in title",
           "duration": "duration (s)", "hook_words": "hook sentence words", "first_word_s": "voice starts at (s)",
           "wps": "speech rate (words/s)", "age_rank": "upload position (0 = oldest)"}
DUR_BUCKETS = [(0, 20, "<20s"), (20, 35, "20-35s"), (35, 50, "35-50s"), (50, 62, "50-61s"), (62, 1e9, ">61s")]


def duration_bucket(d):
    if d is None:
        return None
    for lo, hi, name in DUR_BUCKETS:
        if lo <= d < hi:
            return name
    return None


# ----------------------------------------------------------------------------------------------- statistics
def outlier_scores(views, k: int = 10) -> list:
    """views in UPLOAD ORDER (any direction). log10(v_i / median of the 2k nearest uploads, i excluded).
    The window slides at the ends so it keeps 2k neighbours. Non-positive / missing views -> None."""
    v = [float(x) if x and x > 0 else None for x in views]
    n = len(v)
    out = []
    for i in range(n):
        if v[i] is None:
            out.append(None)
            continue
        lo, hi = i - k, i + k
        if lo < 0:
            hi, lo = min(n - 1, hi - lo), 0
        if hi > n - 1:
            lo, hi = max(0, lo - (hi - (n - 1))), n - 1
        nb = [v[j] for j in range(lo, hi + 1) if j != i and v[j] is not None]
        out.append(round(math.log10(v[i] / float(np.median(nb))), 4) if nb else None)
    return out


def _median(xs):
    return float(np.median(xs)) if len(xs) else None


def bootstrap_ci(xs, stat=np.median, iters: int = 2000, level: float = 0.90, seed: int = 0):
    xs = np.asarray(xs, float)
    if len(xs) < 2:
        return None, None
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(xs), size=(iters, len(xs)))
    bs = np.median(xs[idx], axis=1) if stat is np.median else np.array([stat(xs[i]) for i in idx])
    a = (1 - level) / 2
    return float(np.quantile(bs, a)), float(np.quantile(bs, 1 - a))


def _rank(a):
    a = np.asarray(a, float)
    order = np.argsort(a, kind="mergesort")
    r = np.empty(len(a))
    r[order] = np.arange(len(a))
    # average ties
    for val in np.unique(a):
        m = a == val
        if m.sum() > 1:
            r[m] = r[m].mean()
    return r


def spearman(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    m = np.isfinite(x) & np.isfinite(y)
    if m.sum() < 6:
        return None
    rx, ry = _rank(x[m]), _rank(y[m])
    if rx.std() == 0 or ry.std() == 0:
        return None
    return float(np.corrcoef(rx, ry)[0, 1])


def spearman_ci(x, y, iters: int = 1000, level: float = 0.90, seed: int = 0):
    x, y = np.asarray(x, float), np.asarray(y, float)
    m = np.isfinite(x) & np.isfinite(y)
    x, y = x[m], y[m]
    if len(x) < 6:
        return None, None
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(iters):
        i = rng.integers(0, len(x), len(x))
        r = spearman(x[i], y[i])
        if r is not None:
            vals.append(r)
    if len(vals) < 20:
        return None, None
    a = (1 - level) / 2
    return float(np.quantile(vals, a)), float(np.quantile(vals, 1 - a))


MIN_N = 8


def feature_stat(scores_with, scores_all, scores_without=None, seed: int = 0) -> dict:
    """lift = median(with) - median(all); CI = bootstrap of median(with) (reference median fixed)."""
    w = [s for s in scores_with if s is not None]
    al = [s for s in scores_all if s is not None]
    base = _median(al)
    d = {"n": len(w), "n_all": len(al), "median": _median(w), "lift": None, "ci90": [None, None],
         "x_views": None, "delta_vs_without": None, "too_few": len(w) < MIN_N}
    if not w or base is None:
        return d
    lo, hi = bootstrap_ci(w, seed=seed)
    d["lift"] = round(_median(w) - base, 4)
    d["ci90"] = [None if lo is None else round(lo - base, 4), None if hi is None else round(hi - base, 4)]
    d["x_views"] = round(10 ** d["lift"], 3)
    if scores_without:
        wo = [s for s in scores_without if s is not None]
        if wo:
            d["delta_vs_without"] = round(_median(w) - _median(wo), 4)
            d["n_without"] = len(wo)
    d["median"] = round(d["median"], 4)
    d["confident"] = bool(not d["too_few"] and d["ci90"][0] is not None and (d["ci90"][0] > 0 or d["ci90"][1] < 0))
    return d


def binary_table(rows, keys, getter, score_key="outlier", top_ids=None, bottom_ids=None) -> dict:
    """keys: feature names; getter(row) -> dict of flags (or None when unknown for that row)."""
    out = {}
    known = [r for r in rows if getter(r) is not None and r.get(score_key) is not None]
    all_scores = [r[score_key] for r in known]
    for k in keys:
        wi = [r[score_key] for r in known if getter(r).get(k)]
        wo = [r[score_key] for r in known if not getter(r).get(k)]
        st = feature_stat(wi, all_scores, wo)
        if top_ids is not None and bottom_ids is not None:
            tk = [r for r in known if r["id"] in top_ids]
            bk = [r for r in known if r["id"] in bottom_ids]
            st["share_top"] = round(sum(bool(getter(r).get(k)) for r in tk) / len(tk), 3) if tk else None
            st["share_bottom"] = round(sum(bool(getter(r).get(k)) for r in bk) / len(bk), 3) if bk else None
            if tk and bk:  # extreme-groups contrast: share among top-N minus share among bottom-N, bootstrap 90 % CI
                a = np.array([bool(getter(r).get(k)) for r in tk], float)
                b = np.array([bool(getter(r).get(k)) for r in bk], float)
                rng = np.random.default_rng(0)
                bs = a[rng.integers(0, len(a), (2000, len(a)))].mean(1) - b[rng.integers(0, len(b), (2000, len(b)))].mean(1)
                st["share_diff"] = round(float(a.mean() - b.mean()), 3)
                st["share_diff_ci90"] = [round(float(np.quantile(bs, 0.05)), 3), round(float(np.quantile(bs, 0.95)), 3)]
        out[k] = st
    return out


def numeric_table(rows, keys, score_key="outlier") -> dict:
    out = {}
    for k in keys:
        pairs = [(r.get(k), r.get(score_key), r.get("views")) for r in rows
                 if r.get(k) is not None and r.get(score_key) is not None]
        if len(pairs) < 6:
            out[k] = {"n": len(pairs), "rho_outlier": None}
            continue
        x = [p[0] for p in pairs]
        y = [p[1] for p in pairs]
        lv = [math.log10(p[2]) for p in pairs if p[2]]
        lo, hi = spearman_ci(x, y)
        out[k] = {"n": len(pairs), "rho_outlier": _r(spearman(x, y)), "ci90": [_r(lo), _r(hi)],
                  "rho_log_views": _r(spearman(x[:len(lv)], lv)) if len(lv) == len(x) else None,
                  "median": _r(_median(x)), "too_few": len(pairs) < MIN_N * 2}
    return out


def _r(v, nd=3):
    return None if v is None else round(float(v), nd)


# ----------------------------------------------------------------------------------------------- hook text utils
_STOP_KEEP = set("""if you your you'd you're you'll this these that those is are was were the a an to of in on at for
and but yet why how what who when where it's it its there they he she his her their be been can't cannot never not no
only most every all would could should will just so than vs because even still now then imagine meet illegal impossible
banned secret actually nobody one first ever did do does with from by into out up""".split())
_SLOT_ACTOR = re.compile(rf"^(?:{ACTORS})$")


def hook_skeleton(text: str | None, max_words: int = 22) -> str:
    """Abstract a hook into a template: keeps function/hook words, slots content words.
    numbers -> [N], actors -> [person], Capitalised mid-sentence words -> [Name], past-tense verbs -> [did],
    other content words -> [...] (runs collapsed). Never reproduces the content words of the original."""
    if not text:
        return ""
    toks = re.findall(r"[A-Za-z0-9$%'\u2019]+|[?,.!]", text.replace("\u2019", "'"))[:max_words + 6]
    out, nw = [], 0
    for i, tok in enumerate(toks):
        if tok in "?,.!":
            if tok in "?!" or (out and out[-1] != tok):
                out.append(tok)
            if tok in ".?!" and nw >= 6:
                break
            continue
        nw += 1
        if nw > max_words:
            break
        lw = tok.lower()
        if re.match(r"^[\d$%][\d,.$%]*$", tok) or re.fullmatch(_NUMWORD.replace(r"\b", ""), lw):
            s = "[N]"
        elif lw in _STOP_KEEP:
            s = lw
        elif _SLOT_ACTOR.match(lw):
            s = "[person]"
        elif i > 0 and tok[0].isupper() and toks[i - 1] not in ".?!":
            s = "[Name]"
        elif re.fullmatch(_PAST.replace(r"\b", ""), lw):
            s = "[did]"
        else:
            s = "[...]"
        if s == "[...]" and out and out[-1] == "[...]":
            continue
        out.append(s)
    s = " ".join(out)
    s = re.sub(r" ([?,.!])", r"\1", s)
    return s[0].upper() + s[1:] if s else s


def _sentences(words: list[str]) -> list[list[str]]:
    sents, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.?!][\"')\]]*$", w):
            sents.append(cur)
            cur = []
    if cur:
        sents.append(cur)
    return sents


def hook_from_words(words: list[tuple[float, str]]) -> dict:
    """words: [(start_s, word)] from subs/whisper. Returns hook fields."""
    words = [(t, w) for t, w in words if w and not re.fullmatch(r"\[.*\]|\(.*\)|>>|-", w)]
    if not words:
        return {"hook": "", "first15": "", "first3s": "", "first_word_s": None, "hook_words": 0, "wps": None, "text40": ""}
    ws = [w for _, w in words]
    sents = _sentences(ws[:80])
    hook = sents[0] if sents else ws[:20]
    if len(hook) > 30:
        hook = hook[:20]
    if len(hook) < 6 and len(sents) > 1:
        hook = hook + sents[1][:24]
    t0 = words[0][0]
    span = words[-1][0] - t0
    return {"hook": " ".join(hook), "first15": " ".join(ws[:15]),
            "first3s": " ".join(w for t, w in words if t < t0 + 3.0),
            "first_word_s": round(t0, 2), "hook_words": len(hook),
            "wps": round(len(words) / span, 2) if span > 5 and len(words) > 10 else None,
            "text40": " ".join(ws[:40])}


def parse_json3(path) -> list[tuple[float, str]]:
    d = json.load(open(path, encoding="utf-8"))
    out = []
    for ev in d.get("events") or []:
        segs = ev.get("segs")
        if not segs:
            continue
        t0 = ev.get("tStartMs", 0) / 1000
        dur = (ev.get("dDurationMs") or 0) / 1000
        has_off = any("tOffsetMs" in s for s in segs)
        text_words = []
        for s in segs:
            u = (s.get("utf8") or "").replace("\n", " ")
            for w in u.split():
                text_words.append((t0 + s.get("tOffsetMs", 0) / 1000 if has_off else None, w))
        if not has_off and text_words:
            step = dur / max(1, len(text_words))
            text_words = [(t0 + i * step, w) for i, (_, w) in enumerate(text_words)]
        out += text_words
    return out


_TS = r"(\d+):(\d\d):(\d\d)[.,](\d+)"


def _ts(m):
    h, mi, s, ms = m
    return int(h) * 3600 + int(mi) * 60 + int(s) + int(ms) / 10 ** len(ms)


def parse_vtt(path) -> list[tuple[float, str]]:
    """Word-timed auto-sub VTT (<00:00:01.2><c> word</c>) or plain cues (words spread evenly). Rolling duplicate
    lines of auto-subs are skipped."""
    txt = open(path, encoding="utf-8", errors="replace").read()
    blocks, cur = [], None
    for ln in txt.splitlines():  # a cue = its "-->" line + following lines (auto-subs put a " " line inside cues)
        if "-->" in ln:
            cur = [ln]
            blocks.append(cur)
        elif cur is not None:
            cur.append(ln)
    blocks = ["\n".join(b) for b in blocks]
    out, seen_last = [], None
    word_timed = "<c>" in txt
    for b in blocks:
        m = re.search(_TS + r"\s*-->\s*" + _TS, b)
        if not m:
            continue
        g = m.groups()
        t0, t1 = _ts(g[:4]), _ts(g[4:])
        lines = [ln for ln in b.splitlines()[1:] if ln.strip() and "-->" not in ln]
        if word_timed:
            for ln in lines:
                if "<c>" not in ln and not re.search(r"<\d", ln):
                    continue
                first = re.sub(r"<.*", "", ln).strip()
                parts = [(t0, first)] if first else []
                for tm, w in re.findall(r"<(\d+:\d\d:\d\d[.,]\d+)><c>([^<]*)</c>", ln):
                    parts.append((_ts(re.match(_TS, tm).groups()), w.strip()))
                for t, w in parts:
                    for x in w.split():
                        out.append((t, x))
        else:
            text = re.sub(r"<[^>]+>", "", " ".join(lines)).strip()
            if not text or text == seen_last:
                continue
            seen_last = text
            ws = text.split()
            step = (t1 - t0) / max(1, len(ws))
            out += [(t0 + i * step, w) for i, w in enumerate(ws)]
    return out


# ----------------------------------------------------------------------------------------------- yt-dlp layer
class RateLimited(Exception):
    pass


_STATE = {"consecutive_429": 0, "requests": 0, "stopped": False}


def _ytdlp(args: list[str], cwd: str, timeout: int = 240, tries: int = 4,
           soft429: bool = False) -> subprocess.CompletedProcess:
    """Run yt-dlp politely (--sleep-requests 1), backing off 60/180/540 s on HTTP 429; stop all network use after six
    429s in a row. soft429 (subtitle requests): no retry, wait 20 s and return so the caller can fall back to whisper."""
    if _STATE["stopped"]:
        raise RateLimited("stopped after repeated HTTP 429")
    exe = shutil.which("yt-dlp")
    cmd = [exe, "--sleep-requests", "1", "--no-warnings", "--no-progress"] + args if exe else \
          [sys.executable, "-m", "yt_dlp", "--sleep-requests", "1", "--no-warnings", "--no-progress"] + args
    wait = 60
    for attempt in range(tries):
        _STATE["requests"] += 1
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=cwd,
                               timeout=timeout)
        except subprocess.TimeoutExpired:
            r = subprocess.CompletedProcess(cmd, 1, "", "timeout")
        err = r.stderr or ""
        if "not a bot" in err or "Sign in to confirm" in err:  # YouTube's bot wall = rate limiting by another name
            err += " 429"
        if ("429" in err or "Too Many Requests" in err) and soft429:
            _STATE["subs_429"] = _STATE.get("subs_429", 0) + 1
            time.sleep(20)
            return r
        if "429" in err or "Too Many Requests" in err:
            _STATE["consecutive_429"] += 1
            if _STATE["consecutive_429"] >= 6:
                _STATE["stopped"] = True
                raise RateLimited("HTTP 429 six times in a row -- stopping network access")
            if attempt == tries - 1:
                break
            print(f"[topics] HTTP 429, backing off {wait}s (attempt {attempt + 1}/{tries})", flush=True)
            time.sleep(wait)
            wait *= 3
            continue
        _STATE["consecutive_429"] = 0
        return r
    _STATE["stopped"] = True
    raise RateLimited("HTTP 429 persisted")


def list_tab(url: str, tab: str, limit: int, cache_dir: str, network: bool = True) -> dict:
    os.makedirs(cache_dir, exist_ok=True)
    p = os.path.join(cache_dir, f"flat_{tab}.json")
    if os.path.exists(p):
        d = json.load(open(p, encoding="utf-8"))
        if d.get("limit", 0) >= limit or not network:
            d["entries"] = d["entries"][:limit]
            return d
    if not network:
        raise SystemExit(f"[topics] no cached listing at {p} and --no-network given")
    u = url.rstrip("/")
    u = u if u.endswith(("/shorts", "/videos", "/streams")) else f"{u}/{tab}"
    r = _ytdlp(["--flat-playlist", "-I", f"1:{limit}", "-J", u], cwd=cache_dir, timeout=600)
    if r.returncode != 0 or not r.stdout.strip():
        raise SystemExit(f"[topics] yt-dlp could not list {u}: {r.stderr[-400:]}")
    data = json.loads(r.stdout)
    ents, dropped = [], 0
    for e in data.get("entries") or []:
        if not e or not e.get("id"):
            continue
        if _blocked(e.get("title")):
            dropped += 1
            continue
        ents.append({"id": e["id"], "title": e.get("title"), "views": e.get("view_count"),
                     "duration": e.get("duration")})
    d = {"url": u, "tab": tab, "limit": limit, "fetched": time.strftime("%Y-%m-%d"),
         "channel": data.get("channel") or data.get("uploader"), "channel_id": data.get("channel_id"),
         "handle": data.get("uploader_id"), "followers": data.get("channel_follower_count"),
         "dropped_blocklist": dropped, "entries": ents}
    json.dump(d, open(p, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return d


def _pick_subs(files: list[str]) -> str | None:
    """en (manual, or auto == original ASR) > en-orig > en-US/GB > other en-* ; json3 before vtt."""
    def rank(f):
        b = os.path.basename(f)
        m = re.search(r"\.([A-Za-z\-]+)\.(json3|vtt|srv\d|ttml|srt)$", b)
        lang = m.group(1) if m else ""
        ext = m.group(2) if m else ""
        lr = {"en": 0, "en-orig": 1, "en-US": 2, "en-GB": 2}.get(lang, 3 if lang.startswith("en") else 9)
        return (lr, 0 if ext == "json3" else 1)
    fs = sorted((f for f in files if re.search(r"\.(json3|vtt)$", f)), key=rank)
    return fs[0] if fs else None


def _words_from_file(p) -> list[tuple[float, str]]:
    return parse_json3(p) if p.endswith(".json3") else parse_vtt(p)


def _decode_audio(path, sr=16000, seconds=9.0):
    r = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", path, "-t", str(seconds),
                        "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(r.stdout, np.float32)


_WHISPER = {}


def whisper_words(audio_path: str, model: str = "small", seconds: float = 8.0) -> list[tuple[float, str]]:
    from faster_whisper import WhisperModel
    if model not in _WHISPER:
        _WHISPER[model] = WhisperModel(model, device="cpu", compute_type="int8")
    a = _decode_audio(audio_path, seconds=seconds)
    if a.size < 1600:
        return []
    segs, _ = _WHISPER[model].transcribe(a, language="en", word_timestamps=True, vad_filter=False, beam_size=5)
    out = []
    for s in segs:
        for w in s.words or []:
            out.append((float(w.start), w.word.strip()))
    return out


def fetch_video(vid: str, cache_dir: str, tab: str = "shorts", network: bool = True, local: dict | None = None,
                whisper_model: str = "small", need_hook: bool = True) -> dict | None:
    """Per-video metadata (+ hook when need_hook). Cached in cache_dir/hooks/<id>.json."""
    hd = os.path.join(cache_dir, "hooks")
    os.makedirs(hd, exist_ok=True)
    p = os.path.join(hd, f"{vid}.json")
    if os.path.exists(p):
        c = json.load(open(p, encoding="utf-8"))
        if c.get("hook_source") or not need_hook or (c.get("hook_failed") and not c.get("subs_429")
                                                       and not c.get("error") and not c.get("offline")):
            return c
    rec = {"id": vid}
    loc = (local or {}).get(vid, {})
    if loc.get("info"):
        d = json.load(open(loc["info"], encoding="utf-8"))
        rec.update({k: d.get(k) for k in ("upload_date", "duration", "like_count", "comment_count")})
    words, src = [], None
    if need_hook:
        for key in ("subs", "whisper", "txt"):
            f = loc.get(key)
            if not f:
                continue
            if key == "subs":
                words, src = _words_from_file(f), "local-subs"
            elif key == "whisper":
                d = json.load(open(f, encoding="utf-8"))
                words = [(float(w.get("start", 0)), str(w.get("word", w.get("text", ""))).strip()) for w in d.get("words") or []]
                if not words:
                    words = [(float(s["start"]), w) for s in d.get("segments") or [] for w in s["text"].split()]
                src = "local-whisper"
            else:
                ws = open(f, encoding="utf-8", errors="replace").read().split()
                words, src = [(i * 0.33, w) for i, w in enumerate(ws)], "local-text"  # ~3 wps, untimed
            if words:
                break
    need_meta = rec.get("upload_date") is None
    if (need_meta or (need_hook and not words)) and network:
        tmp = tempfile.mkdtemp(prefix="vfa_topics_")
        try:
            url = f"https://www.youtube.com/{'shorts/' if tab == 'shorts' else 'watch?v='}{vid}"
            # 1) metadata only (one page request); caption tracks are listed in it
            r = _ytdlp(["-J", url], cwd=tmp)
            info, infop = None, os.path.join(tmp, "info.json")
            if r.stdout.strip():
                try:
                    info = json.loads(r.stdout.strip().splitlines()[-1])
                    rec.update({k: info.get(k) for k in ("upload_date", "duration", "like_count", "comment_count")})
                    rec["views_meta"] = info.get("view_count")
                    rec["title_meta"] = info.get("title")
                    json.dump(info, open(infop, "w", encoding="utf-8"))
                except Exception:
                    info = None
            if info is None:
                rec["error"] = (r.stderr or "")[-300:]
            # 2) ONE subtitle track (manual en > en-orig > auto en), re-using the info json: no second page request
            if need_hook and not words and info is not None:
                man = [k for k in (info.get("subtitles") or {}) if k == "en" or k.startswith("en-")]
                auto = list(info.get("automatic_captions") or {})
                if man:
                    flag, lang = "--write-subs", ("en" if "en" in man else man[0])
                elif "en-orig" in auto:
                    flag, lang = "--write-auto-subs", "en-orig"
                elif "en" in auto and (info.get("language") or "en").startswith("en"):
                    flag, lang = "--write-auto-subs", "en"
                else:
                    flag = lang = None
                if lang:
                    r2 = _ytdlp(["--load-info-json", infop, "--skip-download", flag, "--sub-langs", lang, "--sub-format",
                                 "json3/vtt/best", "-o", os.path.join(tmp, "%(id)s.%(ext)s")], cwd=tmp, soft429=True)
                    f = _pick_subs([x for x in glob.glob(os.path.join(tmp, "*")) if not x.endswith("info.json")])
                    if f:
                        words, src = _words_from_file(f), "subs:" + os.path.basename(f).split(".", 1)[1]
                    elif "429" in (r2.stderr or ""):
                        rec["subs_429"] = True
            if need_hook and not words and "error" not in rec:
                r = _ytdlp(["--load-info-json", infop, "-f", "ba/b", "--download-sections", "*0-9", "-o",
                            os.path.join(tmp, "a.%(ext)s")], cwd=tmp)
                aud = [f for f in glob.glob(os.path.join(tmp, "a.*")) if not f.endswith(".part")]
                if aud:
                    try:
                        words, src = whisper_words(aud[0], whisper_model), f"whisper-{whisper_model}-8s"
                        if not words:
                            src = "whisper-no-speech"
                    except Exception as e:  # whisper missing / broken: keep going
                        rec["whisper_error"] = str(e)[:200]
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    if need_hook:
        if words or src == "whisper-no-speech":
            rec.update(hook_from_words(words))
            rec["hook_source"] = src
        else:
            rec["hook_failed"] = True
            if not network:
                rec["offline"] = True
    if _blocked(rec.get("hook"), rec.get("text40"), rec.get("title_meta")):
        rec = {"id": vid, "blocked": True}
    rec.pop("title_meta", None)
    json.dump(rec, open(p, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return rec


def index_local(dirs: list[str]) -> dict:
    """Map video id -> local files (info.json, subtitles, whisper transcript.json, plain .txt transcripts)."""
    idx = {}
    rid = r"([A-Za-z0-9_-]{11})"
    for d in dirs or []:
        for root, _, files in os.walk(d):
            for f in files:
                full = os.path.join(root, f)
                m = re.match(rid + r"\.info\.json$", f)
                if m:
                    idx.setdefault(m.group(1), {})["info"] = full
                    continue
                m = re.match(rid + r"\.[A-Za-z\-]+\.(vtt|json3)$", f)
                if m:
                    cur = idx.setdefault(m.group(1), {}).get("subs")
                    if not cur or _pick_subs([cur, full]) == full:
                        idx[m.group(1)]["subs"] = full
                    continue
                if f == "transcript.json" and re.fullmatch(rid, os.path.basename(root)):
                    idx.setdefault(os.path.basename(root), {})["whisper"] = full
                    continue
                m = re.match(rid + r"\.txt$", f)
                if m:
                    idx.setdefault(m.group(1), {})["txt"] = full
    return idx


# ----------------------------------------------------------------------------------------------- main study
def _age_days(upload_date: str | None, today: str | None = None):
    if not upload_date:
        return None
    import datetime as dt
    t = dt.date.fromisoformat(today) if today else dt.date.today()
    u = dt.date(int(upload_date[:4]), int(upload_date[4:6]), int(upload_date[6:8]))
    return (t - u).days


def build_rows(entries: list[dict], k: int = 10) -> list[dict]:
    """entries newest-first (as listed). Adds age_rank (0 = oldest), outlier score, topic + title features."""
    ents = list(reversed(entries))
    sc = outlier_scores([e.get("views") for e in ents], k)
    rows = []
    for i, (e, s) in enumerate(zip(ents, sc)):
        r = {"id": e["id"], "title": e.get("title"), "views": e.get("views"), "duration": e.get("duration"),
             "age_rank": i, "outlier": s}
        r.update(title_features(e.get("title")))
        rows.append(r)
    return rows


def analyse(rows: list[dict], top_ids=None, bottom_ids=None) -> dict:
    """rows: dicts with outlier, title features, optional hook / hook_feats / duration / wps. Returns stats."""
    use = [r for r in rows if r.get("outlier") is not None and not r.get("excluded")]
    for r in use:
        r["topic"], r["topic_scores"] = classify_topic(r.get("title"), r.get("text40"))
        r["dur_bucket"] = duration_bucket(r.get("duration"))
        if r.get("hook") is not None or r.get("hook_source"):
            r["hook_feats"] = classify_hook(r.get("hook"))
    stats = {"channel_median_outlier": _r(_median([r["outlier"] for r in use]), 4), "n": len(use)}
    stats["topic"] = binary_table(use, TOPIC_ORDER, lambda r: {r["topic"]: True})
    stats["title"] = binary_table(use, list(TITLE_FEATURES), lambda r: r)
    stats["duration"] = binary_table([r for r in use if r.get("dur_bucket")], [b[2] for b in DUR_BUCKETS],
                                     lambda r: {r["dur_bucket"]: True},
                                     top_ids=set(top_ids or []), bottom_ids=set(bottom_ids or []))
    hooked = [r for r in use if r.get("hook_feats")]
    stats["hook"] = binary_table(hooked, list(HOOK_TYPES) + ["no_speech"], lambda r: r.get("hook_feats"),
                                 top_ids=set(top_ids or []), bottom_ids=set(bottom_ids or []))
    stats["hook_n"] = len(hooked)
    stats["numeric"] = numeric_table(use, list(NUMERIC))
    return stats


def findings(stats: dict, labels: dict | None = None) -> list[str]:
    """Plain-language findings: confident (n >= 8 and 90 % CI excludes 0) first, then suggestive ones."""
    lab = {**{k: f"topic: {k}" for k in TOPIC_ORDER}, **TITLE_FEATURES,
           **{k: f"hook: {k}" for k in list(HOOK_TYPES) + ["no_speech"]},
           **{b[2]: f"duration {b[2]}" for b in DUR_BUCKETS}, **(labels or {})}
    conf, sugg = [], []
    for grp in ("topic", "title", "hook", "duration"):
        for k, s in (stats.get(grp) or {}).items():
            if s.get("lift") is None or s["n"] == 0:
                continue
            if s.get("share_diff_ci90") and grp in ("hook", "duration"):
                # extreme-groups sample (top-N / bottom-N by outlier): medians are bimodal, so judge by the share
                # difference, not the lift
                d, (dlo, dhi) = s["share_diff"], s["share_diff_ci90"]
                txt = (f"{lab.get(k, k)}: {s['share_top']:.0%} of top-N vs {s['share_bottom']:.0%} of bottom-N "
                       f"(diff {d:+.0%}, 90% CI {dlo:+.0%}..{dhi:+.0%}, n={s['n']})")
                if not s["too_few"] and (dlo > 0 or dhi < 0):
                    conf.append((abs(d), ("OVER " if d > 0 else "UNDER ") + txt))
                elif abs(d) >= 0.1:
                    sugg.append((abs(d) / 2, ("too few to trust " if s["too_few"] else "suggestive ") + txt))
                continue
            lo, hi = s["ci90"]
            mult = 10 ** s["lift"]
            extra = ""
            if grp == "hook" and s.get("share_top") is not None and s.get("share_bottom") is not None:
                extra = f"; {s['share_top']:.0%} of top hooks vs {s['share_bottom']:.0%} of bottom hooks"
                if s.get("share_diff_ci90"):
                    extra += f", diff 90% CI {s['share_diff_ci90'][0]:+.0%}..{s['share_diff_ci90'][1]:+.0%}"
            txt = (f"{lab.get(k, k)}: median x{mult:.2f} views vs channel norm (n={s['n']}, 90% CI "
                   f"x{10 ** lo:.2f}-x{10 ** hi:.2f}{extra})" if lo is not None else
                   f"{lab.get(k, k)}: median x{mult:.2f} (n={s['n']})")
            if s.get("confident"):
                conf.append((abs(s["lift"]), ("OVER " if s["lift"] > 0 else "UNDER ") + txt))
            elif not s["too_few"] and abs(s["lift"]) >= 0.08:
                sugg.append((abs(s["lift"]), "suggestive " + txt))
            elif s["too_few"] and abs(s["lift"]) >= 0.15 and s["n"] >= 3:
                sugg.append((abs(s["lift"]) / 3, f"too few to trust ({s['n']}) " + txt))
    out = [t for _, t in sorted(conf, reverse=True)] + [t for _, t in sorted(sugg, reverse=True)]
    for k, s in (stats.get("numeric") or {}).items():
        rho = s.get("rho_outlier")
        if rho is not None and abs(rho) >= 0.2 and s["ci90"][0] is not None:
            sure = s["ci90"][0] > 0 or s["ci90"][1] < 0
            out.append(f"{'' if sure else 'weak '}rank-correlation {NUMERIC[k]} vs outlier: rho={rho:+.2f} "
                       f"(n={s['n']}, 90% CI {s['ci90'][0]:+.2f}..{s['ci90'][1]:+.2f})")
    return out


def run_topics(url: str, out: str, max_n: int = 300, tab: str = "shorts", subs_top: int = 30, subs_bottom: int = 30,
               subs_mid: int = 0, local_dirs=None, min_age_days: int = 14, network: bool = True,
               whisper_model: str = "small", k: int = 10, summary_out: str | None = None, style: str | None = None,
               today: str | None = None, last: int | None = None, skip_newest: int = 0, pause: float = 3.0) -> dict:
    if _blocked(url):
        raise SystemExit("[topics] this channel is on the exclusion list")
    os.makedirs(out, exist_ok=True)
    cache = os.path.join(out, "cache")
    lst = list_tab(url, tab, max_n, cache, network)
    if _blocked(lst.get("handle"), lst.get("channel")):
        raise SystemExit("[topics] this channel is on the exclusion list")
    # --last N: only the newest N uploads (one format era); outlier scores are computed inside that window
    rows = build_rows(lst["entries"][:last] if last else lst["entries"], k)
    local = index_local(local_dirs or [])
    byid = {r["id"]: r for r in rows}

    def merge(rec):
        if not rec:
            return
        r = byid[rec["id"]]
        if rec.get("blocked"):
            r["excluded"] = "blocklist"
            return
        for key in ("upload_date", "duration", "like_count", "comment_count", "hook", "first15", "first3s",
                    "first_word_s", "hook_words", "wps", "text40", "hook_source"):
            if rec.get(key) is not None:
                r[key] = rec[key]

    # pre-load anything cached or local (free)
    for r in rows:
        p = os.path.join(cache, "hooks", f"{r['id']}.json")
        if os.path.exists(p):
            merge(json.load(open(p, encoding="utf-8")))
    # ages of the newest uploads (views still accumulating); --skip-newest N drops the N newest without asking YouTube
    for r in list(reversed(rows))[:skip_newest]:
        r["excluded"] = f"newest {skip_newest} uploads (skip-newest)"
    for r in (list(reversed(rows))[skip_newest:10] if min_age_days > 0 else []):
        if r.get("upload_date") is None and network:
            try:
                merge(fetch_video(r["id"], cache, tab, network, local, whisper_model, need_hook=False))
            except RateLimited as e:
                print(f"[topics] {e}", flush=True)
                break
        a = _age_days(r.get("upload_date"), today)
        if a is not None and a < min_age_days and not r.get("excluded"):
            r["excluded"] = f"younger than {min_age_days} days"
    elig = [r for r in rows if r["outlier"] is not None and not r.get("excluded")]
    ranked = sorted(elig, key=lambda r: -r["outlier"])
    top = ranked[:subs_top]
    bottom = ranked[::-1][:subs_bottom]
    rest = [r for r in ranked[subs_top:len(ranked) - subs_bottom]]
    mid = random.Random(0).sample(rest, min(subs_mid, len(rest))) if subs_mid else []
    for r in top:
        r["group"] = "top"
    for r in bottom:
        r["group"] = "bottom"
    for r in mid:
        r["group"] = "mid"
    want = top + bottom + mid
    failed, n_req0 = [], _STATE["requests"]
    for i, r in enumerate(want, 1):
        try:
            rec = fetch_video(r["id"], cache, tab, network, local, whisper_model, need_hook=True)
            merge(rec)
            if rec and rec.get("hook_failed"):
                failed.append(r["id"])
        except RateLimited as e:
            print(f"[topics] {e}; continuing with what is cached", flush=True)
            break
        if i % 10 == 0:
            print(f"[topics] hooks {i}/{len(want)}", flush=True)
        if pause and _STATE["requests"] > n_req0:
            time.sleep(pause)  # extra politeness between videos that needed the network
        n_req0 = _STATE["requests"]
    # hooks for any other video with local transcripts are free: use them too
    for r in rows:
        if r["id"] in local and not r.get("hook_source") and not r.get("excluded"):
            merge(fetch_video(r["id"], cache, tab, False, local, whisper_model, need_hook=True))
            r.setdefault("group", "local")
    # re-merge local metadata for every row (durations from local info.json)
    for r in rows:
        if r["id"] in local and r.get("duration") is None and local[r["id"]].get("info"):
            d = json.load(open(local[r["id"]]["info"], encoding="utf-8"))
            r["duration"], r["upload_date"] = d.get("duration"), r.get("upload_date") or d.get("upload_date")
    top_ids = [r["id"] for r in top]
    bottom_ids = [r["id"] for r in bottom]
    stats = analyse(rows, top_ids, bottom_ids)
    use = [r for r in rows if r.get("outlier") is not None and not r.get("excluded")]
    srcs = {}
    for r in use:
        if r.get("hook_source"):
            s = r["hook_source"].split(":")[0]
            srcs[s] = srcs.get(s, 0) + 1
    patterns = []
    for r in sorted([r for r in use if r.get("hook")], key=lambda r: -r["outlier"]):
        patterns.append({"template": hook_skeleton(r["hook"]), "outlier": r["outlier"],
                         "types": sorted(t for t, v in (r.get("hook_feats") or {}).items() if v),
                         "topic": r.get("topic"), "group": r.get("group")})
    dates = sorted(r["upload_date"] for r in rows if r.get("upload_date"))
    res = {
        "channel": {"url": lst["url"], "name": lst.get("channel"), "handle": lst.get("handle"),
                    "followers": lst.get("followers"), "tab": tab, "listed": len(rows), "used": len(use),
                    "excluded": sum(1 for r in rows if r.get("excluded")), "hooks": stats["hook_n"],
                    "hook_sources": srcs, "hook_failed": len(failed), "fetched": lst.get("fetched"),
                    "date_range_known": [dates[0], dates[-1]] if dates else None,
                    "median_views": _median([r["views"] for r in use if r.get("views")]),
                    "style": style},
        "params": {"max": max_n, "last": last, "skip_newest": skip_newest, "k": k, "subs_top": subs_top, "subs_bottom": subs_bottom, "subs_mid": subs_mid,
                   "min_age_days": min_age_days, "min_n": MIN_N, "ci": 0.90, "bootstrap": 2000},
        "stats": stats,
        "findings": findings(stats),
        "rankings": {
            "raw_top": [r["id"] for r in sorted(use, key=lambda r: -(r["views"] or 0))[:15]],
            "outlier_top": [r["id"] for r in ranked[:15]],
            "outlier_bottom": [r["id"] for r in ranked[::-1][:15]],
        },
        "patterns": patterns,
        "videos": rows,
        "requests": _STATE["requests"],
        "rate_limited": _STATE["stopped"],
    }
    json.dump(res, open(os.path.join(out, "topics.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    open(os.path.join(out, "topics.md"), "w", encoding="utf-8").write(topics_md(res))
    if summary_out:
        export_summary(res, summary_out)
    return res


# ----------------------------------------------------------------------------------------------- reports
def _fmt_stat(k, s, label):
    if s.get("lift") is None:
        return f"| {label} | {s['n']} | - | - | - | |"
    lo, hi = s["ci90"]
    ci = f"x{10 ** lo:.2f}-x{10 ** hi:.2f}" if lo is not None else "-"
    flag = "too few" if s["too_few"] else ("**CI excl. 0**" if s.get("confident") else "")
    sh = ""
    if "share_top" in s:
        f = lambda v: "-" if v is None else f"{v:.0%}"
        dci = s.get("share_diff_ci90")
        dd = f"{s['share_diff']:+.0%} ({dci[0]:+.0%}..{dci[1]:+.0%})" if dci else "-"
        sh = f" {f(s['share_top'])} / {f(s.get('share_bottom'))} | {dd} |"
    return f"| {label} | {s['n']} | {s['median']:+.2f} | x{s['x_views']:.2f} | {ci} | {flag} |{sh}"


def topics_md(res: dict) -> str:
    ch, st = res["channel"], res["stats"]
    byid = {r["id"]: r for r in res["videos"]}
    L = [f"# Topics, hooks and titles: {ch.get('name') or ch['url']} ({ch['tab']})", "",
         f"{ch['used']} videos used of {ch['listed']} listed ({ch['excluded']} excluded: too new / blocklist). "
         f"Hooks for {ch['hooks']} (sources {ch['hook_sources']}). Median views {ch['median_views'] or 0:,.0f}. "
         f"Known upload dates {ch['date_range_known']}.", "",
         "Outlier score = log10(views / median views of the 20 neighbouring uploads); 0 = typical for its era, "
         "+0.30 = 2x. Lift = median outlier with the feature minus the channel median, shown as a views multiplier. "
         "90 % bootstrap CI. n < 8 = too few to trust. **Correlation, not causation**: topic, title and hook choices "
         "are made together, and the algorithm's push is noisy.", "", "## Findings", ""]
    L += [f"- {f}" for f in res["findings"]] or ["- nothing clears the noise at this sample size"]

    def table(title, grp, labels, share=False):
        L.extend(["", f"## {title}", "", "| feature | n | median outlier | lift | 90% CI | |"
                  + (" top / bottom share | top - bottom (90% CI) |" if share else ""),
                  "|---|---|---|---|---|---|" + ("---|---|" if share else "")])
        for k, s in sorted((st.get(grp) or {}).items(),
                           key=lambda kv: -(kv[1]["lift"] if kv[1].get("lift") is not None else -9)):
            if s["n"]:
                L.append(_fmt_stat(k, s, labels.get(k, k)))
    table("Topics (title + first spoken words)", "topic", {})
    table(f"Hook types (n = {st['hook_n']} hooks: top / bottom / sampled by outlier). With a top/bottom sample the "
          "medians are bimodal and lifts are inflated: read the top-minus-bottom share", "hook", {}, share=True)
    table("Title features", "title", TITLE_FEATURES)
    table("Duration (known where per-video metadata was fetched)", "duration", {}, share=True)
    L += ["", "## Numeric features (Spearman rank correlation with outlier score)", "",
          "| feature | n | rho vs outlier | 90% CI | rho vs log views | median |", "|---|---|---|---|---|---|"]
    for k, s in st["numeric"].items():
        if s.get("rho_outlier") is not None:
            L.append(f"| {NUMERIC[k]} | {s['n']} | {s['rho_outlier']:+.2f} | {s['ci90'][0]:+.2f}..{s['ci90'][1]:+.2f} | "
                     f"{'-' if s['rho_log_views'] is None else format(s['rho_log_views'], '+.2f')} | {s['median']} |")

    def rank(title, ids):
        L.extend(["", f"## {title}", "", "| views | outlier | topic | title | hook (first sentence) |", "|---|---|---|---|---|"])
        for i in ids:
            r = byid[i]
            L.append(f"| {r['views'] or 0:,} | {r['outlier']:+.2f} | {r.get('topic', '')} | {(r['title'] or '')[:70]} | "
                     f"{(r.get('hook') or '')[:110]} |")
    rank("Top 15 by raw views", res["rankings"]["raw_top"])
    rank("Top 15 by outlier score", res["rankings"]["outlier_top"])
    rank("Bottom 15 by outlier score", res["rankings"]["outlier_bottom"])
    L += ["", "## Hook templates of the 12 highest-outlier hooks (abstracted)", ""]
    L += [f"- {p['outlier']:+.2f} `{p['template']}` ({', '.join(p['types'])})" for p in res["patterns"][:12]]
    return "\n".join(L) + "\n"


CANON = {
    "absurd_fact": "[person] did [absurd act] to [goal].",
    "forbidden_impossible": "[X] is illegal / impossible in [place], yet [people] still [do it].",
    "if_you": "If you [everyday act], you'd [surprising consequence].",
    "question": "Why do [familiar things] [odd behaviour]?",
    "this_is_meet": "This is [person/object], and [it does something absurd].",
    "number_superlative": "[N] [people/things] [did extreme thing] -- the [most/first] [X] ever.",
    "story_open": "In [year], [person] [did something strange] ...",
    "second_person": "You [do everyday thing] every day, but [hidden fact].",
    "comparison": "[X] is [N] times [bigger/deadlier] than [Y].",
    "curiosity_gap": "Nobody knows why [X], until [person] [found out].",
    "contrast_twist": "[X] seems [normal], but [twist].",
}


def export_summary(res: dict, path: str, max_examples: int = 5) -> dict:
    """Numbers-only summary: stats, abstracted templates, a handful of short example titles. No transcripts."""
    st = res["stats"]
    use = sorted([r for r in res["videos"] if r.get("outlier") is not None and not r.get("excluded")],
                 key=lambda r: -r["outlier"])
    ex = [r["title"] for r in use if r.get("title") and len(r["title"].split()) <= 8][:max_examples]
    seen, temps = set(), []
    for p in res["patterns"]:
        if p["outlier"] is None or p["outlier"] <= 0.15 or p["template"] in seen or len(p["template"].split()) < 4:
            continue
        seen.add(p["template"])
        temps.append({"template": p["template"], "outlier": p["outlier"], "types": p["types"], "topic": p["topic"]})
        if len(temps) >= 12:
            break
    strip = lambda tab: {k: dict(v) for k, v in (tab or {}).items()}
    s = {"kind": "vfa-topics-summary", "version": 1, "channel": {k: res["channel"].get(k) for k in
         ("name", "handle", "url", "tab", "listed", "used", "hooks", "hook_sources", "fetched", "date_range_known",
          "median_views", "followers", "style")},
         "params": res["params"], "channel_median_outlier": st["channel_median_outlier"], "n": st["n"],
         "hook_n": st["hook_n"], "topic": strip(st["topic"]), "title": strip(st["title"]), "hook": strip(st["hook"]),
         "duration": strip(st["duration"]), "numeric": st["numeric"], "findings": res["findings"],
         "hook_templates_top": temps, "canonical_templates": CANON, "example_titles": ex,
         "note": "Correlation only. Lifts are log10 multipliers vs the channel's own neighbour-median "
                 "(outlier score). Templates are abstracted skeletons, not transcripts."}
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    json.dump(s, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return s


# ----------------------------------------------------------------------------------------------- aggregate
def _load_topics(p):
    if os.path.isdir(p):
        p = os.path.join(p, "topics.json")
    return json.load(open(p, encoding="utf-8"))


def aggregate(dirs: list[str], out: str, summary_out: str | None = None) -> dict:
    """Cross-channel view. Outlier scores are channel-normalised, so videos can be pooled. A feature REPLICATES when
    >= 3 channels have n >= 8, >= 75 % of them agree on the sign, and the pooled 90 % CI excludes 0."""
    chans = [_load_topics(d) for d in dirs]
    os.makedirs(out, exist_ok=True)
    groups = {"topic": TOPIC_ORDER, "title": list(TITLE_FEATURES), "hook": list(HOOK_TYPES) + ["no_speech"],
              "duration": [b[2] for b in DUR_BUCKETS]}
    res = {"channels": [{"name": c["channel"].get("name"), "handle": c["channel"].get("handle"),
                         "n": c["stats"]["n"], "hooks": c["stats"]["hook_n"]} for c in chans], "features": {}}

    def flags(r, grp):
        if grp == "topic":
            return {r.get("topic"): True} if r.get("topic") else None
        if grp == "title":
            return r
        if grp == "hook":
            return r.get("hook_feats")
        return {r.get("dur_bucket"): True} if r.get("dur_bucket") else None

    for grp, keys in groups.items():
        for k in keys:
            per, pool_w, pool_all = [], [], []
            for c in chans:
                s = (c["stats"].get(grp) or {}).get(k)
                use = [r for r in c["videos"] if r.get("outlier") is not None and not r.get("excluded")
                       and flags(r, grp) is not None]
                # centre each channel on its own median so pooling compares like with like
                med = _median([r["outlier"] for r in use]) or 0.0
                pool_all += [r["outlier"] - med for r in use]
                pool_w += [r["outlier"] - med for r in use if flags(r, grp).get(k)]
                if s and s.get("lift") is not None:
                    per.append({"channel": c["channel"].get("name"), "n": s["n"], "lift": s["lift"],
                                "ci90": s["ci90"], "confident": s.get("confident", False), "too_few": s["too_few"]})
            pooled = feature_stat(pool_w, pool_all)
            trusted = [p for p in per if not p["too_few"]]
            pos = sum(p["lift"] > 0 for p in trusted)
            neg = sum(p["lift"] < 0 for p in trusted)
            agree = max(pos, neg) / len(trusted) if trusted else 0
            direction = "+" if pos >= neg else "-"
            replicates = bool(len(trusted) >= 3 and agree >= 0.75 and pooled.get("confident")
                              and (pooled["lift"] > 0) == (direction == "+"))
            entry = {"group": grp, "feature": k, "per_channel": per, "pooled": pooled,
                     "channels_trusted": len(trusted), "sign_agreement": round(agree, 2),
                     "direction": direction, "replicates": replicates}
            if grp == "hook":  # extreme-groups view: share among top-N minus bottom-N, per channel and pooled
                ta, ba, diffs = [], [], []
                for c in chans:
                    t = [bool(r["hook_feats"].get(k)) for r in c["videos"] if r.get("group") == "top"
                         and r.get("hook_feats") and not r.get("excluded")]
                    b = [bool(r["hook_feats"].get(k)) for r in c["videos"] if r.get("group") == "bottom"
                         and r.get("hook_feats") and not r.get("excluded")]
                    if len(t) >= 10 and len(b) >= 10:
                        diffs.append(float(np.mean(t) - np.mean(b)))
                        ta += t
                        ba += b
                if ta and ba:
                    a, b = np.array(ta, float), np.array(ba, float)
                    rng = np.random.default_rng(0)
                    bs = (a[rng.integers(0, len(a), (2000, len(a)))].mean(1)
                          - b[rng.integers(0, len(b), (2000, len(b)))].mean(1))
                    lo, hi = float(np.quantile(bs, 0.05)), float(np.quantile(bs, 0.95))
                    sagree = max(sum(d > 0 for d in diffs), sum(d < 0 for d in diffs)) / len(diffs)
                    entry["share"] = {"top": round(float(a.mean()), 3), "bottom": round(float(b.mean()), 3),
                                      "diff": round(float(a.mean() - b.mean()), 3), "ci90": [round(lo, 3), round(hi, 3)],
                                      "n_top": len(a), "n_bottom": len(b), "channels": len(diffs),
                                      "per_channel_diff": [round(d, 3) for d in diffs],
                                      "sign_agreement": round(sagree, 2),
                                      "replicates": bool(len(diffs) >= 3 and sagree >= 0.75 and (lo > 0 or hi < 0))}
            if grp == "hook" and entry.get("share"):
                entry["replicates_lift"] = entry["replicates"]
                entry["replicates"] = entry["share"]["replicates"]
            res["features"][f"{grp}:{k}"] = entry
    json.dump(res, open(os.path.join(out, "aggregate.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    open(os.path.join(out, "aggregate.md"), "w", encoding="utf-8").write(aggregate_md(res))
    if summary_out:
        s = {"kind": "vfa-topics-crosschannel", "version": 1, "channels": res["channels"],
             "features": {k: {"pooled": v["pooled"], "channels_trusted": v["channels_trusted"],
                              "sign_agreement": v["sign_agreement"], "replicates": v["replicates"],
                              "share": v.get("share"),
                              "per_channel": [{kk: p[kk] for kk in ("channel", "n", "lift", "ci90", "confident")}
                                              for p in v["per_channel"]]}
                          for k, v in res["features"].items()},
             "canonical_templates": CANON,
             "note": "Pooled over channel-centred outlier scores. replicates = >=3 channels with n>=8, >=75% sign "
                     "agreement, pooled 90% CI excludes 0. Correlation only."}
        os.makedirs(os.path.dirname(os.path.abspath(summary_out)), exist_ok=True)
        json.dump(s, open(summary_out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return res


def aggregate_md(res: dict) -> str:
    L = ["# Cross-channel topics / hooks / titles", "",
         "Channels: " + ", ".join(f"{c['name']} (n={c['n']}, hooks={c['hooks']})" for c in res["channels"]), "",
         "REPLICATES = >= 3 channels with n >= 8, >= 75 % agree on the sign, pooled 90 % CI excludes 0. "
         "Pooled lift uses each video's outlier score centred on its own channel's median.", "",
         "| feature | pooled n | pooled lift | 90% CI | channels (n>=8) | sign agree | replicates | per channel (lift, n) |",
         "|---|---|---|---|---|---|---|---|"]
    items = sorted(res["features"].values(), key=lambda v: (not v["replicates"], -abs(v["pooled"].get("lift") or 0)))
    for v in items:
        p = v["pooled"]
        if not p["n"] or p.get("lift") is None:
            continue
        lo, hi = p["ci90"]
        ci = f"x{10 ** lo:.2f}-x{10 ** hi:.2f}" if lo is not None else "-"
        pc = "; ".join(f"{(c['channel'] or '?')[:14]} x{10 ** c['lift']:.2f} ({c['n']})" for c in v["per_channel"])
        L.append(f"| {v['group']}: {v['feature']} | {p['n']} | x{p['x_views']:.2f} | {ci} | {v['channels_trusted']} | "
                 f"{v['sign_agreement']:.0%} | {'**YES**' if v['replicates'] else ''} | {pc} |")
    sh = [v for v in res["features"].values() if v.get("share")]
    if sh:
        L += ["", "## Hook types: share among each channel's top-N vs bottom-N hooks (extreme groups, pooled)", "",
              "REPLICATES = >= 3 channels with >= 10 top and bottom hooks, >= 75 % agree on the sign of the share "
              "difference, pooled 90 % CI excludes 0.", "",
              "| hook type | top share | bottom share | diff | 90% CI | channels | sign agree | replicates | per channel diff |",
              "|---|---|---|---|---|---|---|---|---|"]
        for v in sorted(sh, key=lambda v: -abs(v["share"]["diff"])):
            x = v["share"]
            L.append(f"| {v['feature']} | {x['top']:.0%} | {x['bottom']:.0%} | {x['diff']:+.0%} | "
                     f"{x['ci90'][0]:+.0%}..{x['ci90'][1]:+.0%} | {x['channels']} | {x['sign_agreement']:.0%} | "
                     f"{'**YES**' if x['replicates'] else ''} | {', '.join(f'{d:+.0%}' for d in x['per_channel_diff'])} |")
    return "\n".join(L) + "\n"


# ----------------------------------------------------------------------------------------------- hookcheck
def _skill_data_dir():
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "references", "styles", "data"))


def load_evidence(paths: list[str] | None = None, style: str | None = None) -> dict:
    """Collect per-feature (lift, ci, n) from summaries / topics.json / cross-channel files.
    Default: every references/styles/data/topics_*.json. A channel summary whose style matches --style counts double."""
    files = []
    for p in paths or [_skill_data_dir()]:
        if os.path.isdir(p):
            if os.path.exists(os.path.join(p, "topics.json")):
                files.append(os.path.join(p, "topics.json"))
            else:
                files += sorted(glob.glob(os.path.join(p, "topics_*.json")))
        elif os.path.exists(p):
            files.append(p)
    ev = {"features": {}, "shares": {}, "templates": [], "sources": []}
    for f in files:
        d = json.load(open(f, encoding="utf-8"))
        if d.get("kind") == "vfa-topics-crosschannel":
            ev["sources"].append(os.path.basename(f))
            for key, v in d["features"].items():
                grp, k = key.split(":", 1)
                if grp != "hook":
                    continue
                sh = v.get("share")
                if sh:
                    ev["shares"].setdefault(k, []).append({"src": "cross-channel", "lift": sh["diff"], "ci90": sh["ci90"],
                                                           "n": sh["n_top"] + sh["n_bottom"],
                                                           "w": 1.5 if sh.get("replicates") else 1.0})
            continue
        st = d["stats"] if "stats" in d else d
        ch = d.get("channel", {})
        w = 2.0 if style and ch.get("style") == style else 1.0
        ev["sources"].append(os.path.basename(f) + (" (style match x2)" if w > 1 else ""))
        for k, s in (st.get("hook") or {}).items():
            if s.get("share_diff_ci90"):
                ev["shares"].setdefault(k, []).append({"src": ch.get("name"), "lift": s["share_diff"],
                                                       "ci90": s["share_diff_ci90"], "n": s["n"], "w": w})
            elif s.get("lift") is not None:
                ev["features"].setdefault(k, []).append({"src": ch.get("name"), "lift": s["lift"], "ci90": s["ci90"],
                                                         "n": s["n"], "w": w})
        pats = d.get("hook_templates_top") or [p for p in d.get("patterns", []) if (p.get("outlier") or 0) > 0.15][:12]
        for p in pats:
            ev["templates"].append({**p, "channel": ch.get("name")})
    return ev


def _shrunk(entries):
    """CI-aware weighted lift: each source's lift x n/(n+8) x (1 if its CI excludes 0 else 0.5) x source weight."""
    num = den = 0.0
    for e in entries:
        lo, hi = e["ci90"] if e.get("ci90") else (None, None)
        sure = lo is not None and (lo > 0 or hi < 0)
        rel = e["n"] / (e["n"] + MIN_N) * (1.0 if sure else 0.5)
        num += e["w"] * rel * e["lift"]
        den += e["w"]
    return num / den if den else 0.0


STYLE_RULES = {
    "toonworld-explainer": [
        ("10-18 words", lambda t, f: 10 <= len(t.split()) <= 18),
        ("states an absurd act / fact or uses 'If you X, you'd Y' / 'X is illegal|impossible, yet'",
         lambda t, f: f.get("absurd_fact") or f.get("if_you") or f.get("forbidden_impossible")),
        ("not a question", lambda t, f: not f.get("question")),
        ("no setup / throat-clearing opener", lambda t, f: not f.get("setup_opener")),
        ("has concrete stakes (number, place or named role)",
         lambda t, f: f.get("number_superlative") or bool(re.search(r"\b[A-Z][a-z]+", " ".join(t.split()[1:])))
         or bool(re.search(_ACTOR, t.lower()))),
    ],
}

SUGGEST = {
    "absurd_fact": "State it as a flat fact about someone doing something absurd: '[person] did [absurd act] to [goal].'",
    "forbidden_impossible": "Frame a rule being broken: '[X] is illegal / impossible in [place], yet [people] still [do it].'",
    "if_you": "Put the viewer in it: 'If you [everyday act], you'd [surprising consequence].'",
    "number_superlative": "Add one concrete number or superlative (years, dollars, 'the only', 'the first').",
    "contrast_twist": "Add a 'but / yet' turn inside the first sentence so it opens a loop.",
    "curiosity_gap": "Withhold the mechanism: 'nobody knew why', 'until', 'the real reason'.",
    "story_open": "Start in the middle of the story: 'In [year], [person] [did strange thing]...'",
    "second_person": "Address the viewer directly ('you', 'your').",
    "this_is_meet": "Introduce the subject directly: 'This is [X], and [absurd fact].'",
    "question": "Turn it into a direct question the video answers.",
    "comparison": "Compare against something familiar: '[X] is [N] times [Y] than [Z].'",
}


def hookcheck(text: str, style: str | None = None, data: list[str] | None = None) -> dict:
    f = classify_hook(text)
    ev = load_evidence(data, style)
    present = [k for k, v in f.items() if v and k != "no_speech"]
    # two evidence scales: log10 lifts (channels whose every video has a hook) and top-minus-bottom share
    # differences (extreme-group samples). Both are CI-weighted and shrunk; the share scale is mapped to an
    # approximate log10 lift by x0.5 (a +20-point share difference ~ x1.26 views) so the two can be added.
    contrib = {}
    for k in list(HOOK_TYPES):
        parts = []
        if ev["features"].get(k):
            parts.append(_shrunk(ev["features"][k]))
        if ev["shares"].get(k):
            parts.append(0.5 * _shrunk(ev["shares"][k]))
        if parts:
            contrib[k] = sum(parts) / len(parts)
    pred = sum(contrib.get(k, 0.0) for k in present)
    score = int(max(0, min(100, round(50 + 125 * pred))))
    skel = hook_skeleton(text)
    sims = []
    fs = set(present)
    for p in ev["templates"]:
        ts = set(p.get("types") or [])
        jac = len(fs & ts) / len(fs | ts) if fs | ts else 0
        rat = difflib.SequenceMatcher(None, skel.lower().split(), (p["template"] or "").lower().split()).ratio()
        sims.append((round(0.6 * jac + 0.4 * rat, 3), p))
    sims.sort(key=lambda x: (-x[0], -(x[1].get("outlier") or 0)))
    seen, similar = set(), []
    for s, p in sims:
        if p["template"] in seen:
            continue
        seen.add(p["template"])
        similar.append({"similarity": s, "template": p["template"], "outlier": p.get("outlier"),
                        "x_views": _r(10 ** (p.get("outlier") or 0), 2), "channel": p.get("channel"), "types": p.get("types")})
        if len(similar) == 3:
            break
    sugg = []
    for k, c in sorted(contrib.items(), key=lambda kv: kv[1]):
        if k in present and c < -0.02:
            if k == "question":
                sugg.append((-c, f"Drop the question form (measured x{10 ** c:.2f}): state the answer's most absurd part as a fact."))
            elif k == "setup_opener":
                sugg.append((-c, f"Cut the opener (measured x{10 ** c:.2f}): start on the absurd fact, voice on frame 0."))
            else:
                sugg.append((-c, f"'{k}' measures x{10 ** c:.2f} here; consider removing it."))
    for k, c in sorted(contrib.items(), key=lambda kv: -kv[1]):
        if k not in present and c > 0.02 and k in SUGGEST:
            if k == "question" and f.get("absurd_fact"):
                continue
            sugg.append((c, f"{SUGGEST[k]} (measured x{10 ** c:.2f})"))
    nw = len(text.split())
    if nw > 20:
        sugg.append((0.05, f"Shorten: {nw} words; top hooks are mostly 10-18."))
    elif nw < 7:
        sugg.append((0.05, f"Only {nw} words: add the stakes (who, where, how much)."))
    rules = []
    if style in STYLE_RULES:
        rules = [{"rule": name, "ok": bool(fn(text, f))} for name, fn in STYLE_RULES[style]]
    return {"text": text, "features": present, "contributions": {k: _r(v, 4) for k, v in contrib.items()},
            "predicted_lift": _r(pred, 4), "predicted_x_views": _r(10 ** pred, 2), "score": score,
            "skeleton": skel, "similar_patterns": similar,
            "suggestions": [s for _, s in sorted(sugg, key=lambda x: -x[0])][:6], "style_rules": rules,
            "evidence_sources": ev["sources"]}


def hookcheck_text(r: dict) -> str:
    L = [f"Hook: {r['text']}", f"Score {r['score']}/100  (predicted x{r['predicted_x_views']} views vs channel norm; "
         f"CI-weighted, correlational)", f"Template: {r['skeleton']}", "",
         "Features present: " + (", ".join(f"{k} ({r['contributions'].get(k, 0):+.3f})" for k in r["features"]) or "none")]
    if r["style_rules"]:
        L += ["", "Style rules:"] + [f"  [{'x' if x['ok'] else ' '}] {x['rule']}" for x in r["style_rules"]]
    L += ["", "Most similar high-outlier hook patterns:"]
    L += [f"  {i + 1}. {p['template']}   (x{p['x_views']}, {p['channel']}; {', '.join(p['types'] or [])})"
          for i, p in enumerate(r["similar_patterns"])] or ["  (no pattern data)"]
    L += ["", "Rewrite suggestions:"] + ([f"  - {s}" for s in r["suggestions"]] or ["  - none: it already has the measured winners"])
    L += ["", "Evidence: " + ", ".join(r["evidence_sources"])]
    return "\n".join(L)


# ----------------------------------------------------------------------------------------------- titlecheck
def load_title_evidence(paths: list[str] | None = None, style: str | None = None) -> dict:
    """Per-feature (lift, ci, n, weight) for title features and topics. Cross-channel pooled lifts count x1.5 when they
    replicate; a channel summary whose style matches counts x2."""
    files = []
    for p in paths or [_skill_data_dir()]:
        if os.path.isdir(p):
            files += [os.path.join(p, "topics.json")] if os.path.exists(os.path.join(p, "topics.json")) else \
                sorted(glob.glob(os.path.join(p, "topics_*.json")))
        elif os.path.exists(p):
            files.append(p)
    ev = {"title": {}, "topic": {}, "examples": [], "sources": []}

    def put(grp, k, src, s, w):
        if s and s.get("lift") is not None and s.get("n"):
            ev[grp].setdefault(k, []).append({"src": src, "lift": s["lift"], "ci90": s.get("ci90"), "n": s["n"], "w": w})

    for f in files:
        d = json.load(open(f, encoding="utf-8"))
        if d.get("kind") == "vfa-topics-crosschannel":
            ev["sources"].append(os.path.basename(f))
            for key, v in d["features"].items():
                grp, k = key.split(":", 1)
                if grp in ("title", "topic"):
                    put(grp, k, "cross-channel", v.get("pooled"), 1.5 if v.get("replicates") else 1.0)
            continue
        st = d["stats"] if "stats" in d else d
        ch = d.get("channel", {})
        w = 2.0 if style and ch.get("style") == style else 1.0
        ev["sources"].append(os.path.basename(f) + (" (style match x2)" if w > 1 else ""))
        for k, v in (st.get("title") or {}).items():
            put("title", k, ch.get("name"), v, w)
        for k, v in (st.get("topic") or {}).items():
            put("topic", k, ch.get("name"), v, w)
        if w > 1:
            ev["examples"] += d.get("example_titles") or []
    return ev


TITLE_SUGGEST = {
    "t_starts_why_how": "Lead with Why/How: 'Why [familiar thing] [odd behaviour]'.",
    "t_why_how": "Put the question word in: 'Why / How ...'.",
    "t_curiosity": "One curiosity word (secret, real reason, nobody, actually) can help; never more than one.",
    "t_the_that": "Label form: 'The [object] That [did something absurd]'.",
    "t_negation": "A negation turns it into a contradiction: '... Don't Work', 'Nobody ...'.",
}
TITLE_AVOID = {
    "t_this": "Drop 'This/These' (measured x{x}): name the thing.",
    "t_caps_word": "Drop the ALL-CAPS word (measured x{x}): Title Case reads cleaner.",
}


TITLE_OVERLAP = [("t_starts_why_how", "t_why_how", "t_curiosity"), ("t_negation", "t_forbidden_impossible")]


def titlecheck(title: str, style: str | None = None, data: list[str] | None = None, hook: str | None = None) -> dict:
    """Score a title from the measured title-feature and topic lifts (CI-weighted, shrunk; correlational)."""
    f = title_features(title)
    ev = load_title_evidence(data, style)
    present = [k for k in TITLE_FEATURES if f.get(k)]
    contrib = {k: _shrunk(v) for k, v in ev["title"].items() if k in TITLE_FEATURES}
    topic, _ = classify_topic(title, hook)
    t_lift = _shrunk(ev["topic"][topic]) if ev["topic"].get(topic) else 0.0
    # nested / overlapping lexicons (why -> why_how -> curiosity; can't -> forbidden -> negation) count once: the
    # strongest member of each group, so one word is never credited three times
    used, pred = set(), t_lift
    for grp in TITLE_OVERLAP:
        hit = [k for k in grp if k in present]
        if hit:
            pred += max(contrib.get(k, 0.0) for k in hit)
            used |= set(hit)
    pred += sum(contrib.get(k, 0.0) for k in present if k not in used)
    score = int(max(0, min(100, round(50 + 125 * pred))))
    sugg = []
    for k, tpl in TITLE_AVOID.items():
        if k in present and contrib.get(k, 0) < 0:
            sugg.append((-contrib[k], tpl.format(x=f"{10 ** contrib[k]:.2f}")))
    for k, c in sorted(contrib.items(), key=lambda kv: -kv[1]):
        if k not in present and c > 0.01 and k in TITLE_SUGGEST:
            if k == "t_why_how" and "t_starts_why_how" in contrib:
                continue
            sugg.append((c, f"{TITLE_SUGGEST[k]} (measured x{10 ** c:.2f})"))
    if t_lift < -0.02:
        sugg.append((-t_lift, f"Topic '{topic}' measures x{10 ** t_lift:.2f}: wrap the mechanism in a human act or a rule being broken."))
    if f["t_chars"] > 60:
        sugg.append((0.01, f"{f['t_chars']} characters: put the key words in the first ~40 (mobile feeds cut long titles; convention, not measured here)."))
    if f["t_hashtag"]:
        sugg.append((0.005, "Hashtags in the title measured neutral; put them in the description."))
    return {"title": title, "features": present, "topic": topic, "topic_lift": _r(t_lift, 4),
            "contributions": {k: _r(v, 4) for k, v in contrib.items()}, "predicted_lift": _r(pred, 4),
            "predicted_x_views": _r(10 ** pred, 2), "score": score, "chars": f["t_chars"], "words": f["t_words"],
            "suggestions": [x for _, x in sorted(sugg, key=lambda x: -x[0])][:5],
            "style_examples": ev["examples"][:5], "evidence_sources": ev["sources"]}


def titlecheck_text(r: dict) -> str:
    L = [f"Title: {r['title']}", f"Score {r['score']}/100  (predicted x{r['predicted_x_views']} views vs channel norm; "
         f"CI-weighted, correlational)", f"Topic: {r['topic']} ({r['topic_lift']:+.3f})  |  {r['chars']} chars, {r['words']} words", "",
         "Features present: " + (", ".join(f"{k} ({r['contributions'].get(k, 0):+.3f})" for k in r["features"]) or "none"), "",
         "Suggestions:"] + ([f"  - {x}" for x in r["suggestions"]] or ["  - none"])
    if r["style_examples"]:
        L += ["", "Titles of the style's reference channel: " + " | ".join(r["style_examples"])]
    L += ["", "Evidence: " + ", ".join(r["evidence_sources"])]
    return "\n".join(L)
