/**
 * Extra faces: expressions, eye kinds, mouths, face effects and skin marks / conditions. kinds.ts merges EX_X into its
 * expression table and calls the draw hooks; each hook returns false (or draws nothing) for names it does not know.
 *
 * Conventions: everything is deterministic (no Math.random; fixed layouts or a seeded LCG). Eyes and mouths are drawn
 * in a local unit space (origin at the feature centre, 1 unit = the eye size S or the mouth unit U, lines in L = lw / unit),
 * face effects in face-box widths W, skin in head diameters d. Gross-out effects stay cartoon-clean (flat colours, no gore).
 */
import type { EyeCtx, ExprDefX, FaceFxCtx, MouthCtx, SkinCtx, V2 } from "./kit";

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const MDARK = "#4a1a22", TONGUE = "#e0707a", RED = "#ff3b5c", GOLD = "#ffd23f", WATER = "#a8dcff", GREEN$ = "#159a4a";

// ================================================================ expressions
export const FACE_X_EXPRS = [
  "wink", "asleep", "dizzy", "love", "starstruck", "ko", "rage", "terrified", "confused", "skeptical", "bored", "crazy",
  "sick", "sneeze", "yawn", "kiss", "grimace", "pout", "proud", "relieved", "suspicious", "amazed", "lol", "money",
  "shy", "scream", "hungry", "freezing", "hot", "awkward", "giddy", "panic", "sleepy", "pained", "focused", "mischief",
  "tongue", "sulky",
  // round 2: more faces
  "nauseous", "vomit", "burp", "hiccup", "sneaky", "worried", "guilty", "hopeful", "pleading", "smitten", "lovesick",
  "bashful", "furious", "horrified", "disappointed", "unimpressed", "mindblown", "eureka", "fiery", "confident", "grumpy",
  "bawling", "cringe", "mortified", "flirty", "evilLaugh", "nervousLaugh", "chewing", "sipping", "singing", "shouting",
  "whispering", "sunburnt", "iced", "stinky", "gross", "starving", "stuffed", "woozy", "zombie", "robotic", "innocent",
  "heartbroken", "secret", "gloomy", "frustrated", "exhausted", "hypnotized", "sniffly", "snooze", "speechless",
  "presneeze", "cheeky", "content", "anxious", "rageCry", "sour", "spicy", "eyeroll", "goofy", "startled", "sighing",
  "possessed", "touched",
] as const;
export type FaceXExpr = (typeof FACE_X_EXPRS)[number];

/** Expressions that open the eyes wide: the brand's `shock` eye spec is used and no resting lid is applied
 *  (kinds.ts already does this for "shock" and "nervous"). Eye kinds drawn by faces.ts also get bigger with it. */
export const WIDE_X: string[] = [
  "terrified", "amazed", "panic", "scream", "starstruck", "love", "money", "crazy", "grimace", "hiccup", "horrified",
  "mindblown", "mortified", "anxious", "startled",
];

/** Expression definitions for FACE_X_EXPRS (missing ones fall back to neutral).
 *  `eye.shape` = a faces.ts eye kind for both eyes with no resting lid (brand baseLid is skipped); `eyeLR` = per eye. */
export const EX_X: Partial<Record<FaceXExpr, ExprDefX>> = {
  wink: { brow: -6, up: 0.2, asym: -0.25, eyeLR: [null, "wink"], eye: { bot: 0.18 }, mouth: "smile", fx: ["twinkle"] },
  asleep: { brow: 8, up: -0.05, eye: { shape: "closed" }, mouth: "smallO", fx: ["zzz"] },
  dizzy: { brow: 14, up: 0.15, asym: 0.35, eye: { shape: "spiral" }, mouth: "wobble", fx: ["stars"], tilt: 9 },
  love: { brow: 12, up: 0.35, eye: { shape: "heart" }, mouth: "bigsmile", fx: ["hearts", "blush"] },
  starstruck: { brow: 10, up: 0.6, eye: { shape: "star" }, mouth: "bigsmile", fx: ["sparkles"] },
  ko: { brow: 0, up: 0.1, eye: { shape: "x" }, mouth: "ko", fx: ["stars"], skin: ["bump"] },
  rage: { brow: -34, up: -0.3, eye: { shape: "fury" }, mouth: "roar", fx: ["steam", "vein"], skin: ["fuming"], act: { scale: 1.06 } },
  terrified: { brow: 32, up: 0.3, eye: { pupil: 0.3, size: 1.1 }, mouth: "grimace", fx: ["shiver", "sweatdrop"], skin: ["pale"], act: { squash: 0.94 } },
  confused: { brow: 10, up: 0.3, asym: 0.65, eye: { lid: 0.1 }, look: [0.3, -0.4], mouth: "zigzag", fx: ["question"], tilt: -7 },
  skeptical: { brow: -10, up: 0, asym: 0.75, eye: { lid: 0.5, bot: 0.18 }, look: [0.5, 0], mouth: "skew" },
  bored: { brow: 6, up: -0.25, eye: { lid: 0.66, bot: 0.06 }, look: [0.35, 0.2], mouth: "meh", fx: ["puff"] },
  crazy: { brow: 6, up: 0.25, asym: 0.9, eyeLR: ["tiny", "bigwhite"], look: [0.25, -0.25], mouth: "toothygrin" },
  sick: { brow: 22, up: 0.05, eye: { lid: 0.55, tilt: -10 }, mouth: "puff", fx: ["sweatdrop"], skin: ["sick"] },
  sneeze: { brow: 24, up: 0.3, eye: { shape: "squint" }, mouth: "sneeze", fx: ["spray"], act: { squash: 0.94 } },
  yawn: { brow: 16, up: 0.35, eye: { shape: "closed" }, mouth: "yawn", fx: ["teardrop"] },
  kiss: { brow: 8, up: 0.25, eye: { shape: "closed" }, mouth: "kiss", fx: ["heart1", "blush"] },
  grimace: { brow: 22, up: 0.2, eye: { pupil: 0.6 }, look: [0.55, 0], mouth: "grimace", fx: ["sweatdrop"] },
  pout: { brow: 18, up: 0.15, eye: { lid: 0.2, bot: 0.15 }, look: [-0.5, -0.2], mouth: "pout", fx: ["blush"] },
  proud: { brow: -8, up: 0.3, eye: { shape: "closed" }, mouth: "smile", fx: ["sparkles"], tilt: -5 },
  relieved: { brow: 20, up: 0.2, eye: { shape: "closed" }, mouth: "smallsmile", fx: ["sweatdrop", "puff"] },
  suspicious: { brow: -16, up: -0.1, eye: { shape: "sideeye" }, look: [0.9, 0], mouth: "side" },
  amazed: { brow: 10, up: 0.85, eye: { shape: "sparkle" }, mouth: "gasp", fx: ["sparkles"] },
  lol: { brow: -4, up: 0.45, eye: { shape: "squint" }, mouth: "bigsmile", fx: ["tearsjoy"], act: { squash: 0.94 } },
  money: { brow: -4, up: 0.45, eye: { shape: "dollar" }, mouth: "toothygrin", fx: ["sparkles"] },
  shy: { brow: 20, up: 0.2, eye: { lid: 0.3, bot: 0.2, pupil: 0.9 }, look: [-0.6, 0.55], mouth: "smallsmile", fx: ["blush"], tilt: 6 },
  scream: { brow: 34, up: 0.38, eye: { pupil: 0.3, size: 1.12 }, mouth: "scream", fx: ["pop"], act: { squash: 1.08 } },
  hungry: { brow: 14, up: 0.45, eye: { shape: "sparkle" }, look: [0.4, -0.2], mouth: "lick", fx: ["drip"] },
  freezing: { brow: 26, up: 0.15, eye: { lid: 0.35, tilt: -8 }, mouth: "chatter", fx: ["shiver", "snow"], skin: ["frozen"] },
  hot: { brow: 22, up: 0.05, eye: { lid: 0.6, tilt: -8 }, mouth: "pant", fx: ["heat", "sweatdrop"], skin: ["flushed", "sweaty"] },
  awkward: { brow: 16, up: 0.3, eye: { lid: 0.25 }, look: [0.7, 0], mouth: "cheesy", fx: ["sweatdrop"] },
  giddy: { brow: 12, up: 0.45, eye: { shape: "happy" }, mouth: "bigsmile", fx: ["blush", "sparkles"], act: { squash: 0.96 } },
  panic: { brow: 30, up: 0.3, eye: { shape: "tiny" }, look: [0.3, 0], mouth: "panic", fx: ["sweatdrops", "shiver"] },
  sleepy: { brow: 12, up: -0.1, eye: { shape: "halfmoon" }, mouth: "smallO", fx: ["z"], skin: ["sleepy"] },
  pained: { brow: 28, up: 0.1, eyeLR: ["squint", null], eye: { lid: 0.5, tilt: -10 }, mouth: "grimaceside", fx: ["sweatdrop"] },
  focused: { brow: -16, up: -0.2, eye: { lid: 0.45, bot: 0.28, tilt: 6 }, look: [0, 0.15], mouth: "tongueside" },
  mischief: { brow: -22, up: -0.05, asym: 0.3, eye: { lid: 0.5, tilt: 16, bot: 0.24 }, look: [0.45, 0], mouth: "sly" },
  tongue: { brow: -2, up: 0.25, eye: { shape: "squint" }, mouth: "raspberry", fx: ["spit"] },
  sulky: { brow: 16, up: -0.15, eye: { lid: 0.58, bot: 0.12 }, look: [-0.7, 0.35], mouth: "puffcheek", tilt: 5 },
  // ---- round 2
  nauseous: { brow: 24, up: 0.1, eye: { lid: 0.55, tilt: -14 }, mouth: "wobble", fx: ["sweatdrop"], skin: ["queasy"] },
  vomit: { brow: 28, up: 0.15, eye: { shape: "squint" }, mouth: "vomit", skin: ["sick"], act: { squash: 0.95 } },
  burp: { brow: 4, up: 0.2, eye: { lid: 0.62 }, mouth: "burp", fx: ["burpcloud"] },
  hiccup: { brow: 12, up: 0.4, eye: { pupil: 0.55 }, mouth: "smallO", fx: ["bubbles", "pop"] },
  sneaky: { brow: -14, up: -0.05, asym: 0.45, eye: { shape: "sideeye" }, look: [-0.9, 0], mouth: "smirk" },
  worried: { brow: 26, up: 0.25, eye: { lid: 0.3, tilt: -6, pupil: 0.85 }, look: [0.25, 0.25], mouth: "wobble", fx: ["sweatdrop"] },
  guilty: { brow: 22, up: 0.1, eye: { shape: "sideeye" }, look: [-0.9, 0.3], mouth: "bitelip", fx: ["sweatdrop"] },
  hopeful: { brow: 22, up: 0.55, eye: { shape: "sparkle" }, look: [0, -0.5], mouth: "smallsmile", tilt: -4 },
  pleading: { brow: 32, up: 0.45, eye: { shape: "teary" }, mouth: "wobble" },
  smitten: { brow: 14, up: 0.3, eye: { shape: "happy" }, mouth: "smile", fx: ["hearts", "blush"], skin: ["flushed"] },
  lovesick: { brow: 22, up: 0.1, eye: { shape: "heart", lid: 0.45 }, mouth: "smallsmile", fx: ["heart1", "blush"] },
  bashful: { brow: 18, up: 0.2, eye: { shape: "closed" }, mouth: "cat", fx: ["blush", "lines"], tilt: 6 },
  furious: { brow: -36, up: -0.3, eye: { lid: 0.42, tilt: 30, bot: 0.15 }, mouth: "roar", fx: ["angerpop", "spit"], act: { scale: 1.06 } },
  horrified: { brow: 36, up: 0.4, eye: { pupil: 0.22, size: 1.2 }, mouth: "gasplong", fx: ["gloom"], skin: ["pale", "gloom"] },
  disappointed: { brow: 16, up: -0.2, eye: { lid: 0.6 }, look: [0, 0.5], mouth: "frown", fx: ["dots"] },
  unimpressed: { brow: 0, up: -0.3, asym: 0.25, eye: { lid: 0.58, bot: 0.28 }, look: [0.35, 0], mouth: "flat" },
  mindblown: { brow: 14, up: 0.5, eye: { pupil: 0.4, size: 1.18 }, mouth: "gasp", fx: ["mindblown"] },
  eureka: { brow: 4, up: 0.7, eye: { shape: "sparkle" }, mouth: "bigsmile", fx: ["idea"] },
  fiery: { brow: -28, up: -0.15, eye: { shape: "flame" }, mouth: "firm", fx: ["fire"] },
  confident: { brow: -10, up: 0.1, asym: 0.3, eye: { lid: 0.45, bot: 0.2 }, mouth: "cheesy", fx: ["glint"] },
  grumpy: { brow: -20, up: -0.3, eye: { lid: 0.55, tilt: 12, bot: 0.1 }, mouth: "frown" },
  bawling: { brow: 32, up: 0.15, eye: { shape: "squint" }, mouth: "wail", fx: ["tearstream"], act: { squash: 0.92 } },
  cringe: { brow: 24, up: 0.2, eye: { shape: "squint" }, mouth: "grimace", fx: ["shiver"], act: { squash: 0.92 } },
  mortified: { brow: 28, up: 0.25, eye: { pupil: 0.4 }, mouth: "wobble", fx: ["steamtop"], skin: ["beet"] },
  flirty: { brow: -6, up: 0.15, asym: 0.4, eyeLR: [null, "wink"], eye: { lid: 0.5, bot: 0.15 }, mouth: "smirk", fx: ["heart1"] },
  evilLaugh: { brow: -28, up: -0.05, eye: { shape: "glow" }, mouth: "cackle", skin: ["villain"], act: { squash: 0.96 } },
  nervousLaugh: { brow: 24, up: 0.3, eye: { shape: "happy" }, mouth: "cheesy", fx: ["sweatdrop"] },
  chewing: { brow: 2, up: 0, eye: { lid: 0.5 }, look: [0.3, 0], mouth: "chew", fx: ["crumbs"] },
  sipping: { brow: 4, up: 0.1, eye: { lid: 0.55 }, look: [0, 0.4], mouth: "sip" },
  singing: { brow: 18, up: 0.45, eye: { shape: "closed" }, mouth: "sing", fx: ["notes"] },
  shouting: { brow: -18, up: 0.05, eye: { lid: 0.15, tilt: 12 }, mouth: "shout", fx: ["spit", "pop"] },
  whispering: { brow: 12, up: 0.25, eye: { lid: 0.45 }, look: [0.8, 0], mouth: "whisper" },
  sunburnt: { brow: 24, up: 0.2, eye: { lid: 0.5, tilt: -8 }, mouth: "grimace", fx: ["heat", "sweatdrop"], skin: ["sunburn"] },
  iced: { brow: 6, up: 0.1, eye: { shape: "dots" }, mouth: "icicle", fx: ["snow"], skin: ["frozen"] },
  stinky: { brow: 14, up: 0.15, look: [-0.5, 0], mouth: "smallsmile", fx: ["stink", "flies"], skin: ["dirty"] },
  gross: { brow: -18, up: -0.05, asym: 0.35, eye: { lid: 0.42, bot: 0.4 }, mouth: "grossed", fx: ["shiver"], skin: ["queasy"] },
  starving: { brow: 26, up: 0.05, eye: { lid: 0.6, tilt: -12 }, mouth: "slack", fx: ["drip"], skin: ["pale", "sleepy"] },
  stuffed: { brow: 6, up: 0.15, eye: { shape: "closed" }, mouth: "stuffed", fx: ["crumbs"], act: { squash: 0.95 } },
  woozy: { brow: 16, up: 0.2, asym: 0.4, eyeLR: ["small", "halfmoon"], mouth: "wobble", fx: ["bubbles"], skin: ["rosy"], tilt: 10 },
  zombie: { brow: 4, up: -0.2, asym: 0.4, eyeLR: ["blank", "tiny"], eye: { lid: 0.3 }, mouth: "slack", fx: ["flies"], skin: ["zombie"] },
  robotic: { brow: 0, up: 0, eye: { shape: "robot" }, mouth: "robot" },
  innocent: { brow: 18, up: 0.4, eye: { shape: "teary" }, mouth: "cat", fx: ["halo"], tilt: 6 },
  heartbroken: { brow: 30, up: 0.15, eye: { shape: "teary" }, mouth: "wobble", fx: ["heartbreak", "tears"] },
  secret: { brow: -6, up: 0.15, asym: 0.35, eye: { lid: 0.45, bot: 0.15 }, look: [0.5, -0.2], mouth: "zipped" },
  gloomy: { brow: 22, up: -0.2, eye: { lid: 0.6, tilt: -12 }, look: [0, 0.45], mouth: "frown", fx: ["gloom", "raincloud"], skin: ["gloom"] },
  frustrated: { brow: -24, up: -0.1, eye: { shape: "tight" }, mouth: "grit", fx: ["scribble"] },
  exhausted: { brow: 22, up: -0.05, eye: { shape: "halfmoon" }, mouth: "pant", fx: ["sweatdrop"], skin: ["sleepy", "sweaty"] },
  hypnotized: { brow: 4, up: 0.2, eye: { shape: "spiral" }, mouth: "slack" },
  sniffly: { brow: 22, up: 0.1, eye: { lid: 0.55, tilt: -8 }, mouth: "wobble", fx: ["snot"], skin: ["rednose"] },
  snooze: { brow: 6, up: 0, eye: { shape: "closed" }, mouth: "drool", fx: ["snot"] },
  speechless: { brow: 8, up: 0.5, eye: { shape: "dots" }, mouth: "slack", fx: ["dots"] },
  presneeze: { brow: 26, up: 0.45, eye: { lid: 0.55, tilt: -10, bot: 0.2 }, mouth: "gasp" },
  cheeky: { brow: -6, up: 0.2, eyeLR: [null, "wink"], mouth: "blep", tilt: -5 },
  content: { brow: 6, up: 0.1, eye: { shape: "closed" }, mouth: "smile", fx: ["blush"] },
  anxious: { brow: 28, up: 0.22, eye: { pupil: 0.45 }, look: [0.4, 0.2], mouth: "wobble", fx: ["sweatdrops"] },
  rageCry: { brow: -22, up: -0.1, eye: { shape: "squint" }, mouth: "grit", fx: ["tears", "vein"] },
  sour: { brow: 20, up: 0.1, eye: { shape: "tight" }, mouth: "sour", fx: ["shiver"], act: { squash: 0.94 } },
  spicy: { brow: 26, up: 0.3, eye: { shape: "squint" }, mouth: "firebreath", fx: ["sweatdrops"], skin: ["fuming", "sweaty"] },
  eyeroll: { brow: 8, up: 0.3, asym: 0.2, eye: { shape: "rolled", lid: 0.35 }, mouth: "skew" },
  goofy: { brow: 14, up: 0.5, asym: 0.5, eye: { shape: "crossed" }, mouth: "buck" },
  startled: { brow: 10, up: 0.35, asym: 0.25, eye: { pupil: 0.5 }, mouth: "smallO", fx: ["exclaim"] },
  sighing: { brow: 14, up: 0, eye: { shape: "closed" }, mouth: "sigh", fx: ["puff"] },
  possessed: { brow: -10, up: -0.1, eye: { shape: "glow" }, mouth: "flat", skin: ["villain"] },
  touched: { brow: 26, up: 0.3, eye: { shape: "teary" }, mouth: "smallsmile", fx: ["sparkles"] },
};

/** Permanent marks (BobbleSpec.marks) and temporary conditions (KPose.skin, ExprDefX.skin). */
export const SKIN_X = [
  "freckles", "stubble", "wrinkles", "eyebags", "mole", "scar", "bandaid", "lashes", "lipstick", "rosy",
  "sunburn", "sick", "pale", "frozen", "flushed", "soot", "blackeye", "bump", "spots", "sweaty", "nosebleed",
  // marks
  "beautymark", "cheekscar", "dimples", "birthmark", "eyeshadow", "makeup", "eyeblack", "warpaint", "starsticker",
  "stitches", "pimple",
  // conditions
  "queasy", "fuming", "beet", "dirty", "mud", "bruise", "sleepy", "glow", "tan", "goggletan", "beesting", "rednose",
  "paint", "chocolate", "wet", "gloom", "villain", "zombie", "kissed", "scratches",
] as const;
export type SkinX = (typeof SKIN_X)[number];

/** Eye kinds drawn by drawEyeX (use them as `eye.shape`, `eyeX` or in `eyeLR`). */
export const EYE_X = [
  "closed", "wink", "spiral", "x", "heart", "star", "dollar", "squint", "tiny", "bigwhite", "small", "dots", "teary",
  "sparkle", "halfmoon", "sideeye", "fury", "glow", "wavy", "dash", "robot", "blank", "rolled", "crossed", "flame",
] as const;
/** Mouths drawn by drawMouthX (besides the kinds.ts set). */
export const MOUTH_X = [
  "yawn", "grimace", "grimaceside", "pout", "kiss", "drool", "scream", "chatter", "puff", "puffcheek", "vomit", "sneeze",
  "cat", "zigzag", "smallO", "toothygrin", "wobble", "tongueside", "bitelip", "sigh", "gasp", "gasplong", "chew", "sip",
  "sing", "shout", "whisper", "bigsmile", "slack", "ko", "roar", "cheesy", "zipped", "stuffed", "pant", "lick", "blep",
  "raspberry", "burp", "robot", "buck", "sly", "cackle", "meh", "skew", "smallsmile", "panic", "icicle", "firebreath",
  "sour", "grossed",
] as const;
/** Face effects drawn by drawFaceFx (besides kinds.ts's sweat / blush / tears / vein / lines). */
export const FX_X = [
  "zzz", "z", "steam", "steamtop", "stars", "question", "exclaim", "sparkles", "hearts", "heart1", "gloom", "sweatdrop",
  "sweatdrops", "snot", "drip", "spit", "flies", "stink", "shiver", "idea", "notes", "spray", "smoke", "angerpop",
  "tearstream", "tearsjoy", "teardrop", "pop", "dots", "puff", "burpcloud", "bubbles", "raincloud", "fire", "heat", "snow",
  "crumbs", "glint", "twinkle", "halo", "heartbreak", "scribble", "mindblown",
] as const;

// ================================================================ shared geometry
const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); return p; };
const poly = (pts: V2[], close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
const rrect = (x: number, y: number, w: number, h: number, r: number) => {
  const p = new Path2D(), q = Math.min(r, w / 2, h / 2);
  p.moveTo(x + q, y); p.arcTo(x + w, y, x + w, y + h, q); p.arcTo(x + w, y + h, x, y + h, q); p.arcTo(x, y + h, x, y, q); p.arcTo(x, y, x + w, y, q); p.closePath(); return p;
};
const dot = (g: G, x: number, y: number, r: number, col: string) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, TAU); g.fill(); };
const fillStroke = (g: G, p: Path2D, fill: string | CanvasGradient | null, ink?: string, lw?: number) => { if (fill) { g.fillStyle = fill; g.fill(p); } if (ink && lw) { g.strokeStyle = ink; g.lineWidth = lw; g.stroke(p); } };
const seg = (g: G, pts: V2[], col: string, w: number) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
/** a chain of quadratic curves: p0, c1, p1, c2, p2, ... */
const quads = (g: G, pts: V2[], col: string, w: number) => {
  g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i + 1 < pts.length; i += 2) g.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  g.stroke();
};
/** heart of half-width ~0.85 s centred at (x, y) (notch at y - 0.38 s, tip at y + 0.9 s) */
function heartPath(x: number, y: number, s: number) {
  const p = new Path2D(); p.moveTo(x, y + 0.9 * s);
  p.bezierCurveTo(x - 1.25 * s, y + 0.05 * s, x - 0.95 * s, y - 0.95 * s, x, y - 0.38 * s);
  p.bezierCurveTo(x + 0.95 * s, y - 0.95 * s, x + 1.25 * s, y + 0.05 * s, x, y + 0.9 * s); p.closePath(); return p;
}
function starPath(x: number, y: number, R: number, r: number, n = 5, rot = -Math.PI / 2) {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, q = i % 2 ? r : R; if (i) p.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else p.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  p.closePath(); return p;
}
/** four-point sparkle (concave sides) */
function sparklePath(x: number, y: number, R: number, k = 0.16) {
  const p = new Path2D(), r = R * k; p.moveTo(x, y - R);
  p.quadraticCurveTo(x + r, y - r, x + R, y); p.quadraticCurveTo(x + r, y + r, x, y + R); p.quadraticCurveTo(x - r, y + r, x - R, y); p.quadraticCurveTo(x - r, y - r, x, y - R);
  p.closePath(); return p;
}
/** a drop at the origin, tip up (body radius r) */
function dropPath(r: number) {
  const p = new Path2D(); p.moveTo(0, -r * 1.9); p.quadraticCurveTo(r * 1.15, -r * 0.2, r * 0.95, r * 0.3); p.arc(0, r * 0.3, r * 0.95, 0, Math.PI); p.quadraticCurveTo(-r * 1.15, -r * 0.2, 0, -r * 1.9); p.closePath(); return p;
}
/** a drop at (x, y) whose tip points along angle `tip` (radians, 0 = +x; -PI/2 = up) */
function drop(g: G, x: number, y: number, r: number, tip: number, fill: string, ink: string, lw: number) {
  g.save(); g.translate(x, y); g.rotate(tip + Math.PI / 2);
  fillStroke(g, dropPath(r), fill, ink, lw);
  g.fillStyle = "rgba(255,255,255,0.85)"; g.fill(ell(-r * 0.35, r * 0.2, r * 0.2, r * 0.34, 0.3));
  g.restore();
}
/** a union of circles with one outline (clouds, steam, smoke) */
function cloud(g: G, cs: [number, number, number][], fill: string, ink: string, lw: number) {
  g.strokeStyle = ink; g.lineWidth = lw * 2;
  for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  g.fillStyle = fill;
  for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
}
/** seeded LCG in 0..1 */
const rng = (seed: number) => { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
function radial(g: G, x: number, y: number, r: number, stops: [number, string][]) { const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(0.01, r)); for (const [k, c] of stops) gr.addColorStop(k, c); return gr; }

// ================================================================ eyes
/** Eye space: origin at the eye centre, 1 unit = S (about the eye's half-width), L = line width in units. */
type EyeFn = (g: G, e: EyeCtx, L: number) => void;
/** a white eyeball with an ink outline, an optional inner drawing (clipped) and a flat upper lid (0..1) */
function whiteEye(g: G, e: EyeCtx, L: number, A: number, B: number, lid: number, inner?: () => void) {
  const E = ell(0, 0, A, B), yl = -B + 2 * B * lid;
  g.save();
  if (lid > 0.02) { g.beginPath(); g.rect(-A - 1, yl, 2 * A + 2, 2 * B + 2); g.clip(); }
  g.fillStyle = "#ffffff"; g.fill(E);
  if (inner) { g.save(); g.clip(E); inner(); g.restore(); }
  g.strokeStyle = e.ink; g.lineWidth = L * 0.95; g.stroke(E);
  g.restore();
  if (lid > 0.02) { const k = yl / B, hw = A * Math.sqrt(Math.max(0, 1 - k * k)); seg(g, [[-hw - L * 0.2, yl], [hw + L * 0.2, yl]], e.ink, L * 1.3); }
}
const pupil = (g: G, e: EyeCtx, x: number, y: number, r: number, light = true) => { dot(g, x, y, r, e.dark); if (light && e.catchlight) dot(g, x + r * 0.36, y - r * 0.4, r * 0.32, "#ffffff"); };
const flamePath = (x: number, y: number, w: number, h: number) => {
  const p = new Path2D(); p.moveTo(x, y - h);
  p.bezierCurveTo(x + w * 0.25, y - h * 0.45, x + w * 1.1, y - h * 0.1, x + w * 0.75, y + h * 0.55);
  p.quadraticCurveTo(x, y + h * 1.05, x - w * 0.75, y + h * 0.55);
  p.bezierCurveTo(x - w * 1.1, y - h * 0.1, x - w * 0.25, y - h * 0.45, x, y - h); p.closePath(); return p;
};

const EYES: Record<string, EyeFn> = {
  closed: (g, e, L) => { g.strokeStyle = e.dark; g.lineWidth = L * 1.5; g.beginPath(); g.ellipse(0, -0.25, 0.95, 0.6, 0, Math.PI * 0.12, Math.PI * 0.88); g.stroke(); },
  wink: (g, e, L) => {
    g.strokeStyle = e.dark; g.lineWidth = L * 1.6; g.beginPath(); g.ellipse(0, 0.4, 0.95, 0.7, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    seg(g, [[e.s * 0.86, 0.14], [e.s * 1.2, -0.08]], e.dark, L * 1.2);
  },
  spiral: (g, e, L) => whiteEye(g, e, L, 1.05, 1.15, 0, () => {
    g.strokeStyle = e.dark; g.lineWidth = L * 0.8; g.beginPath();
    for (let i = 0; i <= 80; i++) { const t = i / 80, a = e.s * t * 2.3 * TAU, rr = 0.92 * t; const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 1.08; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }),
  x: (g, e, L) => { seg(g, [[-0.72, -0.72], [0.72, 0.72]], e.dark, L * 1.6); seg(g, [[0.72, -0.72], [-0.72, 0.72]], e.dark, L * 1.6); },
  heart: (g, e, L) => {
    const lid = e.lid > 0.02 ? e.lid : 0, yl = -0.75 + 1.75 * lid, H = heartPath(0, 0.05, 1.18);
    g.save(); if (lid) { g.beginPath(); g.rect(-2, yl, 4, 4); g.clip(); }
    fillStroke(g, H, RED, e.ink, L * 0.85); g.fillStyle = "rgba(255,255,255,0.9)"; g.fill(ell(-0.45, -0.3, 0.2, 0.13, -0.6));
    g.restore();
    if (lid) seg(g, [[-0.95, yl], [0.95, yl]], e.ink, L * 1.25);
  },
  star: (g, e, L) => { fillStroke(g, starPath(0, 0.08, 1.32, 0.6), GOLD, e.ink, L * 0.85); dot(g, -0.28, -0.22, 0.16, "#ffffff"); },
  dollar: (g, e, L) => whiteEye(g, e, L, 0.95, 1.15, 0, () => {
    const k = 0.62; g.strokeStyle = GREEN$; g.lineWidth = L * 0.95; g.beginPath();
    g.arc(0, -0.5 * k, 0.5 * k, -Math.PI * 0.15, Math.PI * 0.5, true); g.arc(0, 0.5 * k, 0.5 * k, -Math.PI * 0.5, Math.PI * 0.85, false); g.stroke();
    seg(g, [[0, -1.25 * k], [0, 1.25 * k]], GREEN$, L * 0.75);
  }),
  squint: (g, e, L) => seg(g, [[e.s * 1.0, -0.72], [-e.s * 0.75, 0], [e.s * 1.0, 0.72]], e.dark, L * 1.6),
  tiny: (g, e, L) => whiteEye(g, e, L, 1.05, 1.22, 0, () => dot(g, e.look[0] * 0.35, e.look[1] * 0.3, 0.17, e.dark)),
  bigwhite: (g, e, L) => whiteEye(g, e, L, 1.32, 1.45, 0, () => pupil(g, e, e.look[0] * 0.45, e.look[1] * 0.4, 0.34)),
  small: (g, e) => pupil(g, e, 0, 0.05, 0.45),
  dots: (g, e) => dot(g, 0, 0, 0.26, e.dark),
  teary: (g, e, L) => {
    const E = ell(0, 0, 1.08, 1.3); g.fillStyle = e.dark; g.fill(E);
    g.save(); g.clip(E);
    const w = new Path2D(); w.moveTo(-1.2, 0.55); for (let i = 0; i <= 12; i++) { const x = -1.2 + (2.4 * i) / 12; w.lineTo(x, 0.5 + 0.07 * Math.sin(x * 7)); } w.lineTo(1.2, 1.6); w.lineTo(-1.2, 1.6); w.closePath();
    g.fillStyle = "rgba(110,180,255,0.6)"; g.fill(w);
    dot(g, 0.35, -0.42, 0.36, "#ffffff"); dot(g, -0.38, 0.3, 0.15, "#ffffff"); dot(g, 0.14, 0.66, 0.09, "#ffffff");
    g.restore();
    g.strokeStyle = "rgba(120,190,255,0.95)"; g.lineWidth = L * 0.9; g.beginPath(); g.ellipse(0, 0, 1.08 + L * 0.45, 1.3 + L * 0.45, 0, Math.PI * 0.14, Math.PI * 0.86); g.stroke();
  },
  sparkle: (g, e) => {
    const E = ell(0, 0, 1.05, 1.28); g.fillStyle = e.dark; g.fill(E);
    g.save(); g.clip(E); g.fillStyle = "#ffffff"; g.fill(sparklePath(0.3, -0.36, 0.56)); dot(g, -0.36, 0.42, 0.13, "#ffffff"); g.restore();
  },
  halfmoon: (g, e, L) => {
    const s = e.s, a: V2 = [-s * 1.12, -0.14], c: V2 = [0, -0.24], b: V2 = [s * 1.18, 0.14];
    const K = new Path2D(); K.moveTo(a[0], a[1]); K.quadraticCurveTo(c[0], c[1], b[0], b[1]); K.lineTo(b[0], 2); K.lineTo(a[0], 2); K.closePath();
    g.save(); g.clip(K); g.fillStyle = e.dark; g.fill(ell(0, 0, 1.0, 1.2)); if (e.catchlight) dot(g, 0.32, 0.32, 0.17, "#ffffff"); g.restore();
    quads(g, [a, c, b], e.ink, L * 1.35);
  },
  sideeye: (g, e, L) => {
    const A = 1.15, B = 1.0, y0 = 0.15, t = Math.asin(0.3), P = new Path2D();
    P.ellipse(0, y0, A, B, 0, -t, Math.PI + t, false); P.closePath();
    const dir = e.look[0] < 0 ? -1 : 1;
    g.fillStyle = "#ffffff"; g.fill(P);
    g.save(); g.clip(P); pupil(g, e, dir * 0.62, 0.22 + e.look[1] * 0.2, 0.46); g.restore();
    g.strokeStyle = e.ink; g.lineWidth = L * 0.9; g.stroke(P);
    seg(g, [[-A * 0.954 - 0.12, -0.15], [A * 0.954 + 0.12, -0.15]], e.ink, L * 1.4);
  },
  fury: (g, e, L) => {
    const s = e.s, P = new Path2D(); P.moveTo(s * 1.05, -0.62); P.lineTo(-s * 1.0, 0.02); P.quadraticCurveTo(-s * 0.25, 1.0, s * 1.05, 0.28); P.quadraticCurveTo(s * 1.25, -0.2, s * 1.05, -0.62); P.closePath();
    fillStroke(g, P, "#ffffff", e.ink, L * 0.95); seg(g, [[s * 1.14, -0.67], [-s * 1.08, 0.05]], e.ink, L * 1.5);
  },
  glow: (g, e, L) => {
    g.fillStyle = radial(g, 0, 0, 2.1, [[0, "rgba(255,110,40,0.9)"], [0.35, "rgba(255,60,40,0.45)"], [1, "rgba(255,40,40,0)"]]); g.beginPath(); g.arc(0, 0, 2.1, 0, TAU); g.fill();
    const s = e.s, P = new Path2D(); P.moveTo(s * 1.05, -0.5); P.quadraticCurveTo(0, -0.28, -s * 0.98, 0.14); P.quadraticCurveTo(-s * 0.05, 0.75, s * 1.05, -0.5); P.closePath();
    fillStroke(g, P, "#fff6b0", "#ff7a2a", L * 0.5);
  },
  wavy: (g, e, L) => { g.strokeStyle = e.dark; g.lineWidth = L * 1.45; g.beginPath(); for (let i = 0; i <= 24; i++) { const t = i / 24, x = -1 + 2 * t, y = 0.26 * Math.sin(t * 3 * Math.PI); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); },
  dash: (g, e, L) => seg(g, [[-0.9, 0.05], [0.9, 0.05]], e.dark, L * 1.8),
  robot: (g, e, L) => {
    g.fillStyle = radial(g, 0, 0, 1.8, [[0, "rgba(80,240,255,0.45)"], [1, "rgba(80,240,255,0)"]]); g.beginPath(); g.arc(0, 0, 1.8, 0, TAU); g.fill();
    fillStroke(g, rrect(-1.05, -0.62, 2.1, 1.24, 0.3), "#20242c", e.ink, L * 0.8);
    g.fillStyle = "#55f0ff"; g.fill(rrect(-0.78, -0.3, 1.56, 0.6, 0.28)); seg(g, [[-0.55, -0.14], [0.35, -0.14]], "rgba(255,255,255,0.85)", L * 0.45);
  },
  blank: (g, e, L) => whiteEye(g, e, L, 1.0, 1.2, e.lid),
  rolled: (g, e, L) => whiteEye(g, e, L, 1.0, 1.2, e.lid * 0.5, () => dot(g, 0, -1.02, 0.44, e.dark)),
  crossed: (g, e, L) => whiteEye(g, e, L, 1.0, 1.2, 0, () => pupil(g, e, -e.s * 0.48, 0.08, 0.38)),
  flame: (g, e, L) => whiteEye(g, e, L, 1.0, 1.2, 0, () => {
    g.fillStyle = "#ff6a1a"; g.fill(flamePath(0, 0.1, 0.62, 0.95)); g.fillStyle = GOLD; g.fill(flamePath(0, 0.42, 0.36, 0.55)); dot(g, 0, 0.42, 0.2, e.dark);
  }),
};
/** kinds that close to the plain lid arc when blinking (the others are poses, not eyes) */
const BLINKS = new Set(["tiny", "bigwhite", "small", "dots", "teary", "sparkle", "sideeye", "blank", "rolled", "crossed", "flame", "dollar", "heart", "star"]);

/** Draw an eye kind; false = not handled (kinds.ts draws its own). */
export function drawEyeX(g: CanvasRenderingContext2D, kind: string, e: EyeCtx): boolean {
  const fn = EYES[kind];
  if (!fn) return false;
  if (e.blink > 0.86 && BLINKS.has(kind)) return false; // kinds.ts draws the closed lid
  const S = Math.max(e.rx, e.ry * 0.85, e.lw * 2.4);
  g.save(); g.translate(e.x, e.y); g.scale(S, S); g.lineCap = "round"; g.lineJoin = "round";
  fn(g, e, e.lw / S);
  g.restore();
  return true;
}

// ================================================================ mouths
/** Mouth space: origin at the mouth centre, 1 unit = U (about the mouth half-width), L = line width in units. */
type MouthFn = (g: G, m: MouthCtx, L: number) => void;
/** a dark mouth cavity: tongue ellipse, white teeth bands [y0, y1], then the ink outline */
function cavity(g: G, m: MouthCtx, L: number, p: Path2D, o: { top?: [number, number]; bot?: [number, number]; tongue?: [number, number, number, number] } = {}) {
  g.fillStyle = MDARK; g.fill(p);
  g.save(); g.clip(p);
  if (o.tongue) { const [x, y, rx, ry] = o.tongue; g.fillStyle = TONGUE; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
  g.fillStyle = "#ffffff";
  if (o.top) g.fillRect(-3, o.top[0], 6, o.top[1] - o.top[0]);
  if (o.bot) g.fillRect(-3, o.bot[0], 6, o.bot[1] - o.bot[0]);
  g.restore();
  g.strokeStyle = m.ink; g.lineWidth = L * 1.15; g.stroke(p);
}
/** a D-shaped mouth: top edge at `top` (dipping `dip` in the middle), lowest point at `bot` */
const dShape = (w: number, top: number, bot: number, dip = 0.1) => { const p = new Path2D(); p.moveTo(-w, top); p.quadraticCurveTo(0, top - dip, w, top); p.quadraticCurveTo(0, bot * 2 - top, -w, top); p.closePath(); return p; };
const tongueU = (g: G, m: MouthCtx, L: number, x: number, y0: number, w: number, len: number) => {
  const t = new Path2D(); t.moveTo(x - w, y0); t.lineTo(x - w, y0 + len - w); t.arc(x, y0 + len - w, w, Math.PI, 0, true); t.lineTo(x + w, y0); t.closePath();
  fillStroke(g, t, TONGUE, m.ink, L * 0.85); seg(g, [[x, y0 + w * 0.4], [x, y0 + len - w * 0.9]], "rgba(150,40,60,0.6)", L * 0.55);
};
function grimaceShape(g: G, m: MouthCtx, L: number) {
  const p = new Path2D(), r = 0.2; const P: V2[] = [[-0.95, -0.32], [0.95, -0.32], [1.12, 0.36], [-1.12, 0.36]];
  p.moveTo(0, -0.32); for (let i = 1; i <= 4; i++) { const a = P[i % 4], b = P[(i + 1) % 4]; p.arcTo(a[0], a[1], b[0], b[1], r); } p.closePath();
  g.fillStyle = "#ffffff"; g.fill(p);
  g.save(); g.clip(p); g.strokeStyle = m.ink; g.lineWidth = L * 0.55; g.beginPath(); g.moveTo(-1.2, 0.02); g.lineTo(1.2, 0.02);
  for (const x of [-0.68, -0.34, 0, 0.34, 0.68]) { g.moveTo(x, -0.4); g.lineTo(x * 1.06, 0.45); } g.stroke(); g.restore();
  g.strokeStyle = m.ink; g.lineWidth = L * 1.15; g.stroke(p);
}
/** y of a quadratic edge from (-1, y0) via (0, yc) to (1, y0) at x */
const qEdge = (x: number, y0: number, yc: number) => { const t = (x + 1) / 2; return y0 * ((1 - t) * (1 - t) + t * t) + 2 * yc * t * (1 - t); };
const MOUTHS: Record<string, MouthFn> = {
  yawn: (g, m, L) => cavity(g, m, L, ell(0, 0.4, 0.58, 0.95), { top: [-0.6, -0.42], tongue: [0, 1.2, 0.42, 0.3] }),
  grimace: (g, m, L) => grimaceShape(g, m, L),
  grimaceside: (g, m, L) => { g.transform(1, -0.24, 0, 1, 0, 0); g.scale(0.88, 1); grimaceShape(g, m, L); },
  pout: (g, m, L) => { quads(g, [[-0.48, 0.12], [0, -0.28], [0.48, 0.12]], m.ink, L * 1.3); quads(g, [[-0.26, 0.24], [0, 0.48], [0.26, 0.24]], m.ink, L * 1.0); },
  kiss: (g, m, L) => {
    g.fillStyle = "rgba(255,120,150,0.55)"; g.fill(ell(0.1, 0, 0.32, 0.44));
    quads(g, [[-0.08, -0.44], [0.46, -0.42], [0.12, -0.02], [0.46, 0.4], [-0.08, 0.44]], m.ink, L * 1.3);
  },
  drool: (g, m, L) => {
    cavity(g, m, L, dShape(0.62, -0.1, 0.32), { tongue: [0, 0.3, 0.32, 0.16] });
    seg(g, [[0.46, 0.06], [0.54, 0.62]], m.ink, L * 1.5); seg(g, [[0.46, 0.06], [0.54, 0.62]], WATER, L * 0.7);
    drop(g, 0.55, 0.78, 0.14, -Math.PI / 2, WATER, m.ink, L * 0.6);
  },
  scream: (g, m, L) => {
    const p = ell(0, 0.45, 0.74, 1.08); cavity(g, m, L, p, { top: [-0.7, -0.4], bot: [1.3, 1.7], tongue: [0, 1.2, 0.48, 0.3] });
    g.save(); g.clip(p); g.fillStyle = "#c4505e"; g.fill(ell(0, -0.28, 0.1, 0.17)); g.restore();
  },
  chatter: (g, m, L) => {
    const p = rrect(-0.85, -0.32, 1.7, 0.64, 0.2); g.fillStyle = "#ffffff"; g.fill(p);
    g.save(); g.clip(p); g.strokeStyle = m.ink; g.lineWidth = L * 0.75; g.beginPath(); for (let i = 0; i <= 10; i++) { const x = -0.85 + 0.17 * i, y = i % 2 ? -0.13 : 0.13; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.restore();
    g.strokeStyle = m.ink; g.lineWidth = L * 1.1; g.stroke(p);
  },
  puff: (g, m, L) => {
    for (const sg of [-1, 1]) {
      g.fillStyle = "rgba(60,120,40,0.2)"; g.fill(ell(sg * 0.86, -0.12, 0.6, 0.52));
      g.strokeStyle = m.ink; g.lineWidth = L * 0.85; g.beginPath(); g.ellipse(sg * 0.86, -0.12, 0.6, 0.52, 0, sg > 0 ? -Math.PI * 0.42 : Math.PI * 0.58, sg > 0 ? Math.PI * 0.42 : Math.PI * 1.42); g.stroke();
    }
    quads(g, [[-0.32, 0.04], [-0.16, -0.06], [0, 0.04], [0.16, 0.12], [0.32, 0.02]], m.ink, L * 1.35);
  },
  puffcheek: (g, m, L) => {
    g.fillStyle = "rgba(255,120,130,0.22)"; g.fill(ell(0.62, -0.08, 0.5, 0.42));
    g.strokeStyle = m.ink; g.lineWidth = L * 0.85; g.beginPath(); g.ellipse(0.62, -0.08, 0.5, 0.42, 0, -Math.PI * 0.45, Math.PI * 0.4); g.stroke();
    quads(g, [[-0.45, 0.1], [-0.05, -0.08], [0.3, 0.06]], m.ink, L * 1.25);
  },
  vomit: (g, m, L) => {
    cavity(g, m, L, dShape(0.72, -0.15, 0.45));
    const p = new Path2D(); p.moveTo(-0.46, 0.0); p.lineTo(0.46, 0.0);
    p.bezierCurveTo(0.62, 1.0, 0.95, 2.4, 0.86, 4.0); p.quadraticCurveTo(0.6, 4.45, 0.3, 4.05); p.quadraticCurveTo(0.0, 4.5, -0.32, 4.05); p.quadraticCurveTo(-0.65, 4.45, -0.9, 4.0);
    p.bezierCurveTo(-1.0, 2.4, -0.62, 1.0, -0.46, 0.0); p.closePath();
    fillStroke(g, p, "#8fd14f", "#3f7a2a", L * 0.85);
    seg(g, [[0.12, 0.5], [0.32, 2.6]], "rgba(255,255,255,0.65)", L * 0.8); seg(g, [[-0.3, 1.4], [-0.42, 2.9]], "rgba(60,120,40,0.45)", L * 0.7);
    dot(g, 0.25, 2.0, 0.09, "#c8ec7a"); dot(g, -0.2, 3.0, 0.11, "#c8ec7a"); dot(g, 0.45, 3.3, 0.07, "#c8ec7a");
    drop(g, 1.05, 4.6, 0.13, -Math.PI / 2, "#8fd14f", "#3f7a2a", L * 0.6); drop(g, -0.7, 4.8, 0.11, -Math.PI / 2, "#8fd14f", "#3f7a2a", L * 0.6);
  },
  sneeze: (g, m, L) => cavity(g, m, L, ell(0.05, 0.08, 0.92, 0.4, -0.12), { top: [-0.5, -0.2], tongue: [0.05, 0.42, 0.4, 0.16] }),
  cat: (g, m, L) => quads(g, [[-0.62, -0.08], [-0.32, 0.46], [0, -0.02], [0.32, 0.46], [0.62, -0.08]], m.ink, L * 1.25),
  zigzag: (g, m, L) => seg(g, [[-0.66, 0.04], [-0.4, -0.12], [-0.13, 0.14], [0.13, -0.12], [0.4, 0.14], [0.66, -0.04]], m.ink, L * 1.2),
  smallO: (g, m, L) => fillStroke(g, ell(0, 0.06, 0.22, 0.28), MDARK, m.ink, L * 1.05),
  toothygrin: (g, m, L) => {
    const p = new Path2D(); p.moveTo(-1.0, -0.2); p.quadraticCurveTo(0, -0.32, 1.0, -0.2); p.quadraticCurveTo(0, 1.25, -1.0, -0.2); p.closePath();
    g.fillStyle = "#ffffff"; g.fill(p);
    g.save(); g.clip(p);
    const gap = new Path2D(); gap.moveTo(-0.95, 0.0); gap.quadraticCurveTo(0, 0.66, 0.95, 0.0); gap.quadraticCurveTo(0, 0.34, -0.95, 0.0); gap.closePath(); g.fillStyle = MDARK; g.fill(gap);
    g.strokeStyle = m.ink; g.lineWidth = L * 0.6; g.beginPath();
    for (const x of [-0.62, -0.31, 0, 0.31, 0.62]) { const k = 1 - (x / 0.95) ** 2; g.moveTo(x, -0.4); g.lineTo(x, 0.17 * k); }
    for (const x of [-0.46, -0.15, 0.15, 0.46]) { const k = 1 - (x / 0.95) ** 2; g.moveTo(x, 0.33 * k); g.lineTo(x, 1.0); }
    g.stroke(); g.restore();
    g.strokeStyle = m.ink; g.lineWidth = L * 1.15; g.stroke(p);
  },
  wobble: (g, m, L) => {
    g.strokeStyle = m.ink; g.lineWidth = L * 1.2; g.beginPath();
    for (let i = 0; i <= 28; i++) { const t = i / 28, xx = -1 + 2 * t, x = xx * 0.62, y = 0.2 * xx * xx - 0.1 + 0.06 * Math.sin(xx * 3 * Math.PI); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  },
  tongueside: (g, m, L) => { fillStroke(g, ell(0.48, 0.16, 0.22, 0.17, 0.5), TONGUE, m.ink, L * 0.85); quads(g, [[-0.6, -0.06], [0, 0.42], [0.6, -0.06]], m.ink, L * 1.25); },
  bitelip: (g, m, L) => {
    quads(g, [[-0.58, -0.02], [0, 0.28], [0.58, -0.02]], m.ink, L * 1.25);
    const t = rrect(-0.22, 0.02, 0.44, 0.24, 0.06); fillStroke(g, t, "#ffffff", m.ink, L * 0.8); seg(g, [[0, 0.04], [0, 0.24]], m.ink, L * 0.55);
  },
  sigh: (g, m, L) => fillStroke(g, ell(0.18, 0.05, 0.22, 0.15), MDARK, m.ink, L * 1.0),
  gasp: (g, m, L) => cavity(g, m, L, ell(0, 0.22, 0.5, 0.68), { tongue: [0, 0.78, 0.34, 0.2] }),
  gasplong: (g, m, L) => cavity(g, m, L, ell(0, 0.55, 0.36, 1.1), { tongue: [0, 1.5, 0.26, 0.22] }),
  chew: (g, m, L) => {
    g.fillStyle = "rgba(255,120,130,0.18)"; g.fill(ell(0.62, -0.12, 0.42, 0.36));
    g.strokeStyle = m.ink; g.lineWidth = L * 0.85; g.beginPath(); g.ellipse(0.62, -0.12, 0.42, 0.36, 0, -Math.PI * 0.42, Math.PI * 0.42); g.stroke();
    quads(g, [[-0.5, 0.0], [-0.12, 0.2], [0.24, -0.04]], m.ink, L * 1.25);
  },
  sip: (g, m, L) => { fillStroke(g, ell(0, 0, 0.17, 0.17), MDARK); g.strokeStyle = m.ink; g.lineWidth = L * 1.35; g.stroke(ell(0, 0, 0.3, 0.27)); seg(g, [[-0.48, -0.06], [-0.4, 0.02]], m.ink, L * 0.6); seg(g, [[0.48, -0.06], [0.4, 0.02]], m.ink, L * 0.6); },
  sing: (g, m, L) => cavity(g, m, L, dShape(0.6, -0.12, 0.6, 0.12), { top: [-0.3, -0.06], tongue: [0, 0.62, 0.36, 0.2] }),
  shout: (g, m, L) => {
    const p = new Path2D(); p.moveTo(-0.95, -0.34); p.quadraticCurveTo(0, -0.5, 0.95, -0.34);
    p.bezierCurveTo(0.9, 0.4, 0.5, 0.98, 0, 0.98); p.bezierCurveTo(-0.5, 0.98, -0.9, 0.4, -0.95, -0.34); p.closePath();
    cavity(g, m, L, p, { top: [-0.6, -0.16], tongue: [0, 0.82, 0.48, 0.26] });
  },
  whisper: (g, m, L) => { fillStroke(g, ell(0.32, 0.02, 0.2, 0.13), MDARK, m.ink, L * 1.0); seg(g, [[-0.42, 0.06], [0.1, 0.03]], m.ink, L * 1.15); },
  bigsmile: (g, m, L) => cavity(g, m, L, dShape(0.95, -0.18, 0.58, 0.12), { top: [-0.4, -0.02], tongue: [0, 0.6, 0.5, 0.25] }),
  slack: (g, m, L) => cavity(g, m, L, ell(0.05, 0.4, 0.42, 0.62, 0.18), { tongue: [0.05, 0.85, 0.3, 0.2] }),
  ko: (g, m, L) => {
    cavity(g, m, L, ell(0, 0.3, 0.46, 0.5, 0.1));
    const t = new Path2D(); t.moveTo(0.02, 0.45); t.quadraticCurveTo(0.2, 1.35, 0.55, 1.25); t.quadraticCurveTo(0.8, 1.05, 0.42, 0.42); t.closePath();
    fillStroke(g, t, TONGUE, m.ink, L * 0.85); seg(g, [[0.26, 0.6], [0.42, 1.05]], "rgba(150,40,60,0.6)", L * 0.55);
  },
  roar: (g, m, L) => {
    const top = new Path2D(); top.moveTo(-1.0, -0.25); top.quadraticCurveTo(0, -0.62, 1.0, -0.25);
    const p = new Path2D(); p.moveTo(-1.0, -0.25); p.quadraticCurveTo(0, -0.62, 1.0, -0.25); p.bezierCurveTo(0.95, 0.5, 0.5, 0.95, 0, 0.95); p.bezierCurveTo(-0.5, 0.95, -0.95, 0.5, -1.0, -0.25); p.closePath();
    g.fillStyle = MDARK; g.fill(p);
    g.save(); g.clip(p);
    g.fillStyle = TONGUE; g.fill(ell(0, 0.42, 0.42, 0.2));
    g.strokeStyle = "#ffffff"; g.lineWidth = 0.5; g.stroke(top);
    const bot = new Path2D(); bot.moveTo(-0.92, 0.3); bot.bezierCurveTo(-0.6, 1.0, 0.6, 1.0, 0.92, 0.3); g.lineWidth = 0.42; g.stroke(bot);
    g.strokeStyle = m.ink; g.lineWidth = L * 0.55; g.beginPath();
    for (const x of [-0.5, 0, 0.5]) { const y = qEdge(x, -0.25, -0.62); g.moveTo(x, y - 0.1); g.lineTo(x, y + 0.25); }
    for (const x of [-0.4, 0, 0.4]) { g.moveTo(x, 0.62); g.lineTo(x, 1.0); }
    g.stroke(); g.restore();
    g.strokeStyle = m.ink; g.lineWidth = L * 1.15; g.stroke(p);
  },
  cheesy: (g, m, L) => {
    const p = new Path2D(); p.moveTo(-1.0, -0.15); p.quadraticCurveTo(0, 0.22, 1.0, -0.15); p.quadraticCurveTo(0, 0.85, -1.0, -0.15); p.closePath();
    g.fillStyle = "#ffffff"; g.fill(p);
    g.save(); g.clip(p); g.strokeStyle = m.ink; g.lineWidth = L * 0.6; g.beginPath(); g.moveTo(-1.0, -0.15); g.quadraticCurveTo(0, 0.55, 1.0, -0.15);
    for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) { g.moveTo(x, -0.2); g.lineTo(x, 0.7); } g.stroke(); g.restore();
    g.strokeStyle = m.ink; g.lineWidth = L * 1.15; g.stroke(p);
  },
  zipped: (g, m, L) => {
    seg(g, [[-0.62, 0], [0.55, 0]], m.ink, L * 1.15);
    g.strokeStyle = m.ink; g.lineWidth = L * 0.6; g.beginPath(); for (let x = -0.5; x <= 0.46; x += 0.16) { g.moveTo(x, -0.12); g.lineTo(x, 0.12); } g.stroke();
    fillStroke(g, rrect(0.55, -0.06, 0.2, 0.32, 0.06), "#c9ced8", m.ink, L * 0.7);
  },
  stuffed: (g, m, L) => {
    g.fillStyle = "rgba(255,120,130,0.2)"; g.fill(ell(-0.78, -0.12, 0.48, 0.42)); g.fill(ell(0.78, -0.12, 0.48, 0.42));
    g.strokeStyle = m.ink; g.lineWidth = L * 0.85;
    g.beginPath(); g.ellipse(-0.78, -0.12, 0.48, 0.42, 0, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
    g.beginPath(); g.ellipse(0.78, -0.12, 0.48, 0.42, 0, -Math.PI * 0.4, Math.PI * 0.4); g.stroke();
    quads(g, [[-0.3, 0.04], [-0.15, -0.06], [0, 0.04], [0.15, 0.12], [0.3, 0.02]], m.ink, L * 1.25);
  },
  pant: (g, m, L) => { cavity(g, m, L, dShape(0.62, -0.1, 0.42), { top: [-0.3, -0.04] }); tongueU(g, m, L, 0.05, 0.12, 0.27, 0.95); },
  lick: (g, m, L) => { fillStroke(g, ell(0.5, -0.12, 0.2, 0.28, 0.5), TONGUE, m.ink, L * 0.85); quads(g, [[-0.62, -0.06], [0, 0.42], [0.62, -0.06]], m.ink, L * 1.25); },
  blep: (g, m, L) => { tongueU(g, m, L, 0.02, 0.06, 0.2, 0.42); quads(g, [[-0.52, 0], [0, 0.16], [0.52, 0]], m.ink, L * 1.25); },
  raspberry: (g, m, L) => { cavity(g, m, L, ell(0, 0.04, 0.5, 0.16)); tongueU(g, m, L, 0, 0.04, 0.34, 0.95); },
  burp: (g, m, L) => cavity(g, m, L, ell(0.08, 0.15, 0.62, 0.42, 0.18), { tongue: [0.1, 0.5, 0.36, 0.18] }),
  robot: (g, m, L) => {
    const p = rrect(-0.78, -0.26, 1.56, 0.52, 0.1); fillStroke(g, p, "#2b2f3a", m.ink, L * 1.0);
    g.strokeStyle = "#55f0ff"; g.lineWidth = L * 0.6; g.beginPath(); for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) { g.moveTo(x, -0.14); g.lineTo(x, 0.14); } g.stroke();
  },
  buck: (g, m, L) => {
    quads(g, [[-0.66, -0.08], [0, 0.36], [0.66, -0.08]], m.ink, L * 1.25);
    fillStroke(g, poly([[-0.21, 0.1], [0.21, 0.1], [0.21, 0.46], [-0.21, 0.46]]), "#ffffff", m.ink, L * 0.8); seg(g, [[0, 0.12], [0, 0.46]], m.ink, L * 0.6);
  },
  sly: (g, m, L) => {
    const p = new Path2D(); p.moveTo(-0.72, -0.02); p.quadraticCurveTo(0.08, 0.6, 0.84, -0.34); p.quadraticCurveTo(0.12, 0.22, -0.72, -0.02); p.closePath();
    g.fillStyle = "#ffffff"; g.fill(p); g.save(); g.clip(p); quads(g, [[-0.7, 0.0], [0.1, 0.42], [0.82, -0.3]], m.ink, L * 0.55); g.restore();
    g.strokeStyle = m.ink; g.lineWidth = L * 1.15; g.stroke(p);
  },
  cackle: (g, m, L) => {
    const top = new Path2D(); top.moveTo(-1.0, -0.35); top.quadraticCurveTo(0, 0.02, 1.0, -0.35);
    const p = new Path2D(); p.moveTo(-1.0, -0.35); p.quadraticCurveTo(0, 0.02, 1.0, -0.35); p.bezierCurveTo(0.95, 0.6, 0.45, 1.18, 0, 1.18); p.bezierCurveTo(-0.45, 1.18, -0.95, 0.6, -1.0, -0.35); p.closePath();
    g.fillStyle = MDARK; g.fill(p);
    g.save(); g.clip(p); g.fillStyle = TONGUE; g.fill(ell(0, 0.92, 0.5, 0.26));
    g.strokeStyle = "#ffffff"; g.lineWidth = 0.42; g.stroke(top);
    g.strokeStyle = m.ink; g.lineWidth = L * 0.55; g.beginPath(); for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) { const y = qEdge(x, -0.35, 0.02); g.moveTo(x, y - 0.1); g.lineTo(x, y + 0.2); } g.stroke();
    g.restore(); g.strokeStyle = m.ink; g.lineWidth = L * 1.15; g.stroke(p);
  },
  meh: (g, m, L) => quads(g, [[-0.6, 0.1], [0, -0.06], [0.6, 0.1]], m.ink, L * 1.25),
  skew: (g, m, L) => { quads(g, [[-0.55, 0.08], [0.05, 0.08], [0.62, -0.14]], m.ink, L * 1.25); seg(g, [[-0.55, 0.08], [-0.68, 0.2]], m.ink, L * 1.0); },
  smallsmile: (g, m, L) => quads(g, [[-0.46, -0.04], [0, 0.3], [0.46, -0.04]], m.ink, L * 1.3),
  panic: (g, m, L) => {
    const p = new Path2D(), N = 28;
    for (let i = 0; i <= N; i++) { const t = i / N, x = -0.78 + 1.56 * t, y = -0.2 * Math.sin(Math.PI * t) - 0.02 + 0.06 * Math.sin(8 * Math.PI * t); if (i) p.lineTo(x, y); else p.moveTo(x, y); }
    for (let i = N; i >= 0; i--) { const t = i / N, x = -0.78 + 1.56 * t, y = 0.72 * Math.sin(Math.PI * t) - 0.02 + 0.06 * Math.sin(8 * Math.PI * t); p.lineTo(x, y); }
    p.closePath(); cavity(g, m, L, p, { tongue: [0, 0.65, 0.4, 0.2] });
  },
  icicle: (g, m, L) => {
    for (const [x, len] of [[-0.26, 0.6], [0.06, 0.95], [0.32, 0.5]] as V2[]) { fillStroke(g, poly([[x - 0.12, 0.02], [x + 0.12, 0.02], [x + 0.01, 0.02 + len]]), "#dff3ff", "#5aa0d8", L * 0.6); seg(g, [[x - 0.03, 0.08], [x - 0.01, len * 0.6]], "#ffffff", L * 0.45); }
    seg(g, [[-0.52, 0.02], [0.52, 0.02]], m.ink, L * 1.25);
  },
  firebreath: (g, m, L) => {
    const f = new Path2D(); f.moveTo(0.1, -0.25); f.bezierCurveTo(0.9, -0.85, 1.5, -0.25, 2.7, -0.75); f.bezierCurveTo(2.1, -0.15, 2.5, 0.15, 3.0, 0.3); f.bezierCurveTo(2.0, 0.65, 1.2, 0.95, 0.1, 0.55); f.closePath();
    fillStroke(g, f, "#ff6a1a", "#c2410c", L * 0.6);
    const f2 = new Path2D(); f2.moveTo(0.2, -0.05); f2.bezierCurveTo(0.8, -0.4, 1.3, -0.05, 2.0, -0.3); f2.bezierCurveTo(1.6, 0.1, 1.9, 0.2, 2.2, 0.28); f2.bezierCurveTo(1.4, 0.5, 0.9, 0.62, 0.2, 0.4); f2.closePath();
    g.fillStyle = GOLD; g.fill(f2);
    cavity(g, m, L, ell(0, 0.15, 0.42, 0.5));
  },
  sour: (g, m, L) => {
    dot(g, 0, 0, 0.15, MDARK); g.strokeStyle = m.ink; g.lineWidth = L * 1.2; g.stroke(ell(0, 0, 0.2, 0.2));
    g.lineWidth = L * 0.6; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; g.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3); g.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46); } g.stroke();
  },
  grossed: (g, m, L) => {
    tongueU(g, m, L, -0.18, 0.04, 0.17, 0.42);
    g.strokeStyle = m.ink; g.lineWidth = L * 1.2; g.beginPath();
    for (let i = 0; i <= 24; i++) { const t = i / 24, xx = -1 + 2 * t, x = xx * 0.6, y = 0.12 * xx * xx - 0.06 + 0.07 * Math.sin(xx * 2.5 * Math.PI); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  },
};

/** size per mouth over the face's mouth width (the brand mouth is small: a scream has to open past it) */
const MK: Record<string, number> = {
  yawn: 1.5, scream: 1.5, grimace: 1.55, grimaceside: 1.55, chatter: 1.55, panic: 1.45, shout: 1.4, roar: 1.45, cackle: 1.45,
  bigsmile: 1.45, toothygrin: 1.5, cheesy: 1.5, gasp: 1.3, gasplong: 1.25, sneeze: 1.35, sing: 1.3, pant: 1.3, slack: 1.3, ko: 1.3,
  vomit: 1.35, burp: 1.3, drool: 1.3, raspberry: 1.3, firebreath: 1.25, robot: 1.4, buck: 1.35, sly: 1.4, icicle: 1.3, stuffed: 1.2,
  puff: 1.25, puffcheek: 1.25, chew: 1.25, tongueside: 1.35, lick: 1.35, blep: 1.35, grossed: 1.35, bitelip: 1.4, zipped: 1.35,
  wobble: 1.3, zigzag: 1.3, cat: 1.3, pout: 1.3, kiss: 1.25, sour: 1.35, smallO: 1.2, whisper: 1.2, sigh: 1.2, sip: 1.25, smallsmile: 1.2,
};
/** Draw a mouth; false = not handled. */
export function drawMouthX(g: CanvasRenderingContext2D, shape: string, m: MouthCtx): boolean {
  const fn = MOUTHS[shape];
  if (!fn) return false;
  const U = Math.max(m.m, m.lw * 2.3) * (MK[shape] ?? 1.15);
  g.save(); g.translate(m.x, m.y); g.scale(U, U); g.lineCap = "round"; g.lineJoin = "round";
  fn(g, m, m.lw / U);
  g.restore();
  return true;
}

// ================================================================ face effects
/** cx = the head centre (three-quarter: the face box minus fxDx), fx = the face centre */
type FxGeo = { W: number; R: number; top: number; cx: number; fx: number; cy: number; lw: number; ink: string; mx: number; my: number; mw: number; ey: number };
type FxFn = (g: G, f: FaceFxCtx, q: FxGeo) => void;
/** a "Z" glyph */
const zee = (g: G, x: number, y: number, s: number, col: string, w: number) => { g.save(); g.translate(x, y); g.rotate(-0.2); seg(g, [[-s, -s], [s, -s], [-s, s], [s, s]], "#ffffff", w * 2.2); seg(g, [[-s, -s], [s, -s], [-s, s], [s, s]], col, w); g.restore(); };
const note = (g: G, x: number, y: number, s: number, ink: string, lw: number) => {
  g.fillStyle = ink; g.fill(ell(x, y, s * 0.55, s * 0.4, -0.4)); seg(g, [[x + s * 0.48, y - s * 0.1], [x + s * 0.48, y - s * 1.7]], ink, lw * 0.75);
  quads(g, [[x + s * 0.48, y - s * 1.7], [x + s * 1.2, y - s * 1.3], [x + s * 1.0, y - s * 0.75]], ink, lw * 0.75);
};
/** an approximate head outline (front squircle) to keep effects off the face */
const headApprox = (q: FxGeo, k = 1) => { const p = new Path2D(), n = 3, R = q.R * k, Ry = q.R * 0.95 * k; for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, c = Math.cos(a), s = Math.sin(a); const x = q.cx + R * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = q.cy + Ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / n); if (i) p.lineTo(x, y); else p.moveTo(x, y); } p.closePath(); return p; };
const clipOutsideHead = (g: G, q: FxGeo) => { const p = new Path2D(); p.rect(q.cx - q.W * 4, q.cy - q.W * 4, q.W * 8, q.W * 8); p.addPath(headApprox(q, 1.02)); g.clip(p, "evenodd"); };

const FX: Record<string, FxFn> = {
  zzz: (g, f, q) => { const c = "#33407a"; zee(g, q.cx + q.W * 0.5, q.top - q.W * 0.08, q.W * 0.06, c, q.lw * 0.95); zee(g, q.cx + q.W * 0.63, q.top - q.W * 0.25, q.W * 0.08, c, q.lw * 1.05); zee(g, q.cx + q.W * 0.76, q.top - q.W * 0.46, q.W * 0.1, c, q.lw * 1.15); },
  z: (g, f, q) => zee(g, q.cx + q.W * 0.54, q.top - q.W * 0.14, q.W * 0.065, "#33407a", q.lw * 0.95),
  steam: (g, f, q) => {
    for (const sg of [-1, 1]) { const bx = q.cx + sg * q.W * 0.56, by = q.cy - q.W * 0.02;
      cloud(g, [[bx, by, q.W * 0.06], [bx + sg * q.W * 0.08, by - q.W * 0.09, q.W * 0.085], [bx + sg * q.W * 0.19, by - q.W * 0.22, q.W * 0.11]], "#ffffff", q.ink, q.lw * 0.75);
      seg(g, [[bx + sg * q.W * 0.05, by + q.W * 0.1], [bx + sg * q.W * 0.16, by + q.W * 0.04]], q.ink, q.lw * 0.6); }
  },
  steamtop: (g, f, q) => { const y = q.top - q.W * 0.06; cloud(g, [[q.cx - q.W * 0.18, y, q.W * 0.1], [q.cx + q.W * 0.02, y - q.W * 0.1, q.W * 0.13], [q.cx + q.W * 0.22, y - q.W * 0.01, q.W * 0.09]], "#ffffff", q.ink, q.lw * 0.75); cloud(g, [[q.cx - q.W * 0.05, y - q.W * 0.34, q.W * 0.07], [q.cx + q.W * 0.06, y - q.W * 0.4, q.W * 0.06]], "#ffffff", q.ink, q.lw * 0.7); },
  stars: (g, f, q) => {
    const oy = q.top - q.W * 0.14, rx = q.W * 0.56, ry = q.W * 0.12;
    g.save(); g.setLineDash([q.lw * 1.2, q.lw * 1.4]); g.strokeStyle = "rgba(40,40,60,0.45)"; g.lineWidth = q.lw * 0.5; g.beginPath(); g.ellipse(q.cx, oy, rx, ry, 0, 0, TAU); g.stroke(); g.restore();
    for (const a of [0.12, 0.88, 1.5].map((k) => k * Math.PI)) { const x = q.cx + Math.cos(a) * rx, y = oy + Math.sin(a) * ry, s = q.W * (0.068 + 0.02 * Math.sin(a)); fillStroke(g, starPath(x, y, s, s * 0.45), GOLD, q.ink, q.lw * 0.6); }
  },
  question: (g, f, q) => {
    const x = q.cx + q.W * 0.56, y = q.top - q.W * 0.2, s = q.W * 0.15;
    for (const [col, w] of [["#ffffff", q.lw * 3.2], [q.ink, q.lw * 1.6]] as [string, number][]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y - s * 0.4, s * 0.42, Math.PI, Math.PI * 2.45, false); g.lineTo(x, y + s * 0.3); g.stroke(); }
    dot(g, x, y + s * 0.74, q.lw * 1.1, q.ink);
  },
  exclaim: (g, f, q) => {
    const x = q.cx + q.W * 0.54, y = q.top - q.W * 0.2, s = q.W * 0.16;
    const p = poly([[x - s * 0.15, y - s * 0.75], [x + s * 0.15, y - s * 0.75], [x + s * 0.06, y + s * 0.28], [x - s * 0.06, y + s * 0.28]]);
    g.lineJoin = "round"; fillStroke(g, p, q.ink, q.ink, q.lw * 0.6); dot(g, x, y + s * 0.58, s * 0.13, q.ink);
  },
  sparkles: (g, f, q) => { for (const [x, y, s] of [[-0.64, -0.3, 0.085], [0.62, -0.42, 0.1], [0.7, 0.12, 0.06], [-0.48, -0.66, 0.055]]) fillStroke(g, sparklePath(q.cx + x * q.W, q.cy + y * q.W, s * q.W), "#ffe066", q.ink, q.lw * 0.55); },
  hearts: (g, f, q) => { for (const [x, y, s, a] of [[0.6, -0.1, 0.075, 0.2], [0.78, -0.32, 0.055, 0.35], [-0.64, -0.12, 0.062, -0.25]]) { g.save(); g.translate(q.cx + x * q.W, q.top + y * q.W); g.rotate(a); fillStroke(g, heartPath(0, 0, s * q.W), RED, q.ink, q.lw * 0.6); g.restore(); } },
  heart1: (g, f, q) => { g.save(); g.translate(q.mx + q.mw * 1.4 + q.W * 0.08, q.my - q.W * 0.12); g.rotate(0.25); fillStroke(g, heartPath(0, 0, q.W * 0.06), RED, q.ink, q.lw * 0.55); g.restore(); },
  gloom: (g, f, q) => {
    g.strokeStyle = "rgba(60,50,130,0.6)"; g.lineWidth = q.lw * 0.6;
    for (let i = 0; i < 7; i++) { const x = q.fx + (-0.33 + 0.11 * i) * q.W, y1 = q.ey + f.ry * (i % 2 ? -0.2 : 0.35); g.beginPath(); g.moveTo(x, q.top + q.W * 0.08); g.lineTo(x, y1); g.stroke(); }
  },
  sweatdrop: (g, f, q) => drop(g, q.cx + q.W * 0.5, q.cy - q.W * 0.1, q.W * 0.068, -Math.PI / 2 - 0.15, WATER, q.ink, q.lw * 0.7),
  sweatdrops: (g, f, q) => { for (const sg of [-1, 1]) for (const [x, y, r] of [[0.6, -0.3, 0.034], [0.7, -0.08, 0.03], [0.62, 0.14, 0.027]]) drop(g, q.cx + sg * x * q.W, q.cy + y * q.W, r * q.W, Math.atan2(-y, -sg * x), WATER, q.ink, q.lw * 0.5); },
  snot: (g, f, q) => {
    const nx = f.side ? q.fx + q.W * 0.42 : q.fx + q.W * 0.03, ny = q.ey + (q.my - q.ey) * 0.5, x = nx + q.W * 0.06, y = ny + q.W * 0.05, r = q.W * 0.075;
    fillStroke(g, ell(x, y, r, r * 0.95), "rgba(185,228,255,0.6)", "#4f8fc0", q.lw * 0.6);
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = q.lw * 0.6; g.beginPath(); g.arc(x, y, r * 0.65, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  },
  drip: (g, f, q) => { const x = q.mx + q.mw * 0.7, y = q.my + q.W * 0.015; seg(g, [[x, y], [x + q.W * 0.004, y + q.W * 0.055]], "rgba(110,170,225,0.95)", q.lw * 0.5); drop(g, x + q.W * 0.005, y + q.W * 0.085, q.W * 0.026, -Math.PI / 2, WATER, q.ink, q.lw * 0.45); },
  spit: (g, f, q) => { for (const [x, y, r] of [[-0.38, -0.06, 1], [-0.48, 0.05, 0.8], [-0.44, -0.18, 0.7], [0.38, -0.04, 1], [0.49, 0.06, 0.8], [0.45, -0.17, 0.7]]) { const X = q.fx + x * q.W, Y = q.my + y * q.W; drop(g, X, Y, q.W * 0.024 * r, Math.atan2(q.my - Y, q.mx - X), WATER, q.ink, q.lw * 0.45); } },
  flies: (g, f, q) => {
    for (const [x, y, k] of [[0.62, -0.62, 1], [-0.66, -0.2, -1], [0.7, 0.22, 1]]) { const fx = q.cx + x * q.W, fy = q.cy + y * q.W;
      g.save(); g.setLineDash([q.lw * 0.7, q.lw * 0.9]); g.strokeStyle = "rgba(40,40,50,0.5)"; g.lineWidth = q.lw * 0.4; g.beginPath(); g.ellipse(fx - k * q.W * 0.05, fy + q.W * 0.02, q.W * 0.07, q.W * 0.045, 0.3 * k, 0, TAU); g.stroke(); g.restore();
      fillStroke(g, ell(fx - q.W * 0.012, fy - q.W * 0.018, q.W * 0.016, q.W * 0.01, -0.5), "rgba(255,255,255,0.9)", q.ink, q.lw * 0.35); fillStroke(g, ell(fx + q.W * 0.012, fy - q.W * 0.018, q.W * 0.016, q.W * 0.01, 0.5), "rgba(255,255,255,0.9)", q.ink, q.lw * 0.35);
      dot(g, fx, fy, q.W * 0.014, q.ink); }
  },
  stink: (g, f, q) => {
    g.strokeStyle = "#78a83a"; g.lineWidth = q.lw * 0.9;
    for (const [x, y0] of [[-0.62, 0.3], [0.64, 0.25], [-0.42, -0.5], [0.46, -0.55]]) { g.beginPath(); for (let i = 0; i <= 16; i++) { const t = i / 16, X = q.cx + (x + 0.04 * Math.sin(t * 3 * Math.PI)) * q.W, Y = q.cy + (y0 - t * 0.32) * q.W; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); } g.stroke(); }
  },
  shiver: (g, f, q) => { for (const sg of [-1, 1]) for (const k of [0, 1]) { const x = q.cx + sg * (0.6 + 0.07 * k) * q.W, h = q.W * (0.14 - 0.04 * k); quads(g, [[x, q.cy - h], [x + sg * q.W * 0.03, q.cy], [x, q.cy + h]], q.ink, q.lw * 0.7); } },
  idea: (g, f, q) => {
    const x = q.cx + q.W * 0.46, y = q.top - q.W * 0.3, r = q.W * 0.125;
    g.strokeStyle = q.ink; g.lineWidth = q.lw * 0.7; g.beginPath(); for (let i = 0; i < 7; i++) { const a = Math.PI * (1.0 + i / 6); g.moveTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45); g.lineTo(x + Math.cos(a) * r * 1.95, y + Math.sin(a) * r * 1.95); } g.stroke();
    fillStroke(g, rrect(x - r * 0.45, y + r * 0.78, r * 0.9, r * 0.62, r * 0.15), "#b8bcc8", q.ink, q.lw * 0.6);
    const b = new Path2D(); b.arc(x, y, r, Math.PI * 0.72, Math.PI * 2.28); b.closePath(); fillStroke(g, b, "#ffe45c", q.ink, q.lw * 0.7);
    seg(g, [[x - r * 0.3, y + r * 0.2], [x - r * 0.12, y - r * 0.15], [x, y + r * 0.2], [x + r * 0.12, y - r * 0.15], [x + r * 0.3, y + r * 0.2]], "#e08a1a", q.lw * 0.5);
    dot(g, x - r * 0.4, y - r * 0.4, r * 0.18, "#ffffff");
  },
  notes: (g, f, q) => { note(g, q.fx + q.W * 0.58, q.my - q.W * 0.02, q.W * 0.075, q.ink, q.lw); note(g, q.fx + q.W * 0.72, q.my - q.W * 0.32, q.W * 0.06, q.ink, q.lw); },
  spray: (g, f, q) => {
    for (const [a, k] of [[-175, 1.6], [-155, 2.3], [-20, 2.3], [-5, 1.6], [12, 2.0], [35, 2.6], [60, 2.1], [95, 2.4], [125, 2.2], [150, 2.5], [172, 1.9], [80, 3.0]]) { const r = a * Math.PI / 180, d = q.mw * k + q.W * 0.04; drop(g, q.mx + Math.cos(r) * d * 1.2, q.my + Math.sin(r) * d * 0.9, q.W * 0.018, r + Math.PI, WATER, q.ink, q.lw * 0.4); }
    g.strokeStyle = q.ink; g.lineWidth = q.lw * 0.6; g.beginPath(); for (const a of [-170, -10, 30, 150, 190]) { const r = a * Math.PI / 180; g.moveTo(q.mx + Math.cos(r) * (q.mw * 1.3 + q.W * 0.02), q.my + Math.sin(r) * q.mw * 1.1); g.lineTo(q.mx + Math.cos(r) * (q.mw * 1.3 + q.W * 0.1), q.my + Math.sin(r) * (q.mw * 1.1 + q.W * 0.06)); } g.stroke();
  },
  smoke: (g, f, q) => { const y = q.top - q.W * 0.08; cloud(g, [[q.cx - q.W * 0.2, y, q.W * 0.1], [q.cx, y - q.W * 0.08, q.W * 0.14], [q.cx + q.W * 0.2, y, q.W * 0.1]], "#8a8f99", q.ink, q.lw * 0.75); cloud(g, [[q.cx + q.W * 0.12, y - q.W * 0.32, q.W * 0.07], [q.cx + q.W * 0.02, y - q.W * 0.3, q.W * 0.05]], "#a9adb6", q.ink, q.lw * 0.65); },
  angerpop: (g, f, q) => {
    const x = q.cx + q.W * 0.56, y = q.top - q.W * 0.14, d = q.W * 0.06;
    for (const [col, w] of [["#ffffff", q.lw * 2.8], ["#e2333f", q.lw * 1.4]] as [string, number][]) { g.strokeStyle = col; g.lineWidth = w; for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; g.beginPath(); g.arc(x + Math.cos(a) * d * 1.5, y + Math.sin(a) * d * 1.5, d, a + Math.PI * 0.6, a + Math.PI * 1.4); g.stroke(); } }
  },
  tearstream: (g, f, q) => {
    const bot = f.box.y + q.W * 0.56;
    for (const [ex, ey, s] of f.eyes) { const o = s * q.W * 0.12, rx = f.rx, t0 = ey + f.ry * 0.35;
      const p = new Path2D(); p.moveTo(ex - rx * 0.45, t0); p.lineTo(ex + rx * 0.45, t0);
      p.bezierCurveTo(ex + rx * 0.55 + o * 0.3, ey + f.ry * 1.6, ex + rx * 0.75 + o, bot - q.W * 0.12, ex + rx * 0.9 + o, bot);
      p.quadraticCurveTo(ex + o, bot + q.W * 0.07, ex - rx * 0.9 + o, bot);
      p.bezierCurveTo(ex - rx * 0.75 + o, bot - q.W * 0.12, ex - rx * 0.55 + o * 0.3, ey + f.ry * 1.6, ex - rx * 0.45, t0); p.closePath();
      fillStroke(g, p, "rgba(130,200,255,0.88)", q.ink, q.lw * 0.55);
      quads(g, [[ex + rx * 0.1, t0 + f.ry * 0.4], [ex + rx * 0.2 + o * 0.4, (t0 + bot) / 2], [ex + rx * 0.3 + o, bot - q.W * 0.06]], "rgba(255,255,255,0.75)", q.lw * 0.6); }
  },
  tearsjoy: (g, f, q) => { for (const [ex, ey, s] of f.eyes) for (const [dx, dy, k] of [[1.5, -0.4, 1], [1.95, 0.3, 0.8]]) drop(g, ex + s * f.rx * dx, ey + f.ry * dy, q.W * 0.03 * k, Math.atan2(-f.ry * dy, -s * f.rx * dx), WATER, q.ink, q.lw * 0.45); },
  teardrop: (g, f, q) => { const [ex, ey, s] = f.eyes[f.eyes.length - 1]; drop(g, ex + s * f.rx * 1.1, ey + f.ry * 0.55, q.W * 0.028, -Math.PI / 2, WATER, q.ink, q.lw * 0.45); },
  pop: (g, f, q) => {
    g.strokeStyle = q.ink; g.lineWidth = q.lw * 0.9; g.beginPath();
    for (const a of [-170, -148, -125, -102, -78, -55, -32, -10, 12, 168]) { const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); g.moveTo(q.cx + c * q.W * 0.68, q.cy - q.W * 0.06 + s * q.W * 0.66); g.lineTo(q.cx + c * q.W * 0.82, q.cy - q.W * 0.06 + s * q.W * 0.8); }
    g.stroke();
  },
  dots: (g, f, q) => { for (let i = 0; i < 3; i++) dot(g, q.cx + q.W * (0.34 + i * 0.13), q.top - q.W * 0.2, q.W * 0.034, q.ink); },
  puff: (g, f, q) => { const x = q.mx + Math.max(q.mw * 1.4, q.W * 0.13) + q.W * 0.05, y = q.my + q.W * 0.01; cloud(g, [[x, y, q.W * 0.04], [x + q.W * 0.07, y - q.W * 0.025, q.W * 0.055], [x + q.W * 0.15, y + q.W * 0.005, q.W * 0.045]], "#ffffff", q.ink, q.lw * 0.6); },
  burpcloud: (g, f, q) => { const x = q.mx + Math.max(q.mw * 1.4, q.W * 0.13) + q.W * 0.08, y = q.my; cloud(g, [[x, y, q.W * 0.05], [x + q.W * 0.09, y - q.W * 0.04, q.W * 0.075], [x + q.W * 0.2, y + q.W * 0.0, q.W * 0.06], [x + q.W * 0.12, y + q.W * 0.05, q.W * 0.05]], "#dde86a", q.ink, q.lw * 0.65); },
  bubbles: (g, f, q) => { for (const [dx, dy, r] of [[0.58, -0.04, 0.04], [0.68, -0.22, 0.06], [0.6, -0.42, 0.045]]) { const x = q.fx + dx * q.W, y = q.my + dy * q.W; fillStroke(g, ell(x, y, r * q.W, r * q.W), "rgba(200,235,255,0.55)", q.ink, q.lw * 0.5); dot(g, x - r * q.W * 0.35, y - r * q.W * 0.35, r * q.W * 0.25, "#ffffff"); } },
  raincloud: (g, f, q) => {
    const y = q.top - q.W * 0.32;
    g.strokeStyle = "#4a90d9"; g.lineWidth = q.lw * 0.7; g.beginPath(); for (const k of [-0.2, -0.08, 0.04, 0.16]) { g.moveTo(q.cx + k * q.W, y + q.W * 0.13); g.lineTo(q.cx + (k - 0.03) * q.W, y + q.W * 0.24); } g.stroke();
    cloud(g, [[q.cx - q.W * 0.17, y + q.W * 0.02, q.W * 0.09], [q.cx, y - q.W * 0.05, q.W * 0.12], [q.cx + q.W * 0.17, y + q.W * 0.02, q.W * 0.09], [q.cx, y + q.W * 0.05, q.W * 0.08]], "#6d7685", q.ink, q.lw * 0.75);
  },
  fire: (g, f, q) => {
    g.save(); clipOutsideHead(g, q);
    for (const [deg, k] of [[-160, 0.7], [-20, 0.7], [-132, 0.95], [-48, 0.95], [-106, 1.15], [-74, 1.15]]) {
      const a = (deg * Math.PI) / 180, R0 = q.R * 0.92, h = q.R * 0.44 * k, w = q.R * 0.25 * (0.8 + 0.2 * k);
      g.save(); g.translate(q.cx + Math.cos(a) * R0, q.cy + Math.sin(a) * R0 * 0.95); g.rotate(a + Math.PI / 2);
      fillStroke(g, flamePath(0, -h * 0.55, w, h), "#ff6a1a", q.ink, q.lw * 0.7); g.fillStyle = GOLD; g.fill(flamePath(0, -h * 0.28, w * 0.55, h * 0.58));
      g.restore();
    }
    g.restore();
  },
  heat: (g, f, q) => { g.strokeStyle = "#ff7043"; g.lineWidth = q.lw * 0.85; for (const k of [-0.2, 0, 0.2]) { g.beginPath(); for (let i = 0; i <= 16; i++) { const t = i / 16, x = q.cx + (k + 0.035 * Math.sin(t * 4 * Math.PI)) * q.W, y = q.top - q.W * (0.1 + t * 0.3); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); } },
  snow: (g, f, q) => { g.strokeStyle = "#5aa8e6"; g.lineWidth = q.lw * 0.6; for (const [x, y, s] of [[-0.66, -0.4, 1], [0.64, -0.5, 0.8], [0.74, 0.0, 1.1], [-0.72, 0.15, 0.8], [0.2, -0.82, 0.9], [-0.3, -0.84, 0.7]]) { const X = q.cx + x * q.W, Y = q.cy + y * q.W, r = q.W * 0.035 * s; g.beginPath(); for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; g.moveTo(X - Math.cos(a) * r, Y - Math.sin(a) * r); g.lineTo(X + Math.cos(a) * r, Y + Math.sin(a) * r); } g.stroke(); } },
  crumbs: (g, f, q) => { for (const [dx, dy, a] of [[-0.15, 0.05, 0.3], [0.16, 0.02, 0.9], [0.11, 0.11, 0.1], [-0.08, 0.13, 1.2], [0.22, -0.05, 0.5]]) { g.save(); g.translate(q.mx + dx * q.W, q.my + dy * q.W); g.rotate(a); fillStroke(g, poly([[-1, -0.8], [1, -1], [0.8, 0.9], [-0.9, 0.7]].map(([x, y]) => [x * q.W * 0.026, y * q.W * 0.026] as V2)), "#e3ad5e", q.ink, q.lw * 0.4); g.restore(); } },
  glint: (g, f, q) => fillStroke(g, sparklePath(q.mx + q.mw * 0.95, q.my - q.mw * 0.3, q.W * 0.06), "#ffffff", q.ink, q.lw * 0.5),
  twinkle: (g, f, q) => { const [ex, ey] = f.eyes[f.eyes.length - 1]; fillStroke(g, sparklePath(ex + f.rx * 1.5, ey - f.ry * 1.05, q.W * 0.055), "#ffe066", q.ink, q.lw * 0.5); },
  halo: (g, f, q) => { const y = q.top - q.W * 0.24; g.strokeStyle = q.ink; g.lineWidth = q.lw * 2.6; g.beginPath(); g.ellipse(q.cx, y, q.W * 0.3, q.W * 0.075, 0, 0, TAU); g.stroke(); g.strokeStyle = GOLD; g.lineWidth = q.lw * 1.3; g.stroke(); },
  heartbreak: (g, f, q) => {
    const x = q.cx + q.W * 0.58, y = q.top - q.W * 0.24, s = q.W * 0.11, H = heartPath(0, 0, s), Z: V2[] = [[0, -0.38 * s], [-0.16 * s, 0], [0.12 * s, 0.3 * s], [-0.08 * s, 0.6 * s], [0, 0.95 * s]];
    for (const sg of [-1, 1]) { g.save(); g.translate(x + sg * q.W * 0.018, y); g.rotate(sg * 0.14); g.clip(poly([...Z, [sg * 2 * s, 1.2 * s], [sg * 2 * s, -1.2 * s]])); fillStroke(g, H, RED, q.ink, q.lw * 0.65); g.restore(); }
  },
  scribble: (g, f, q) => { const x0 = q.cx + q.W * 0.3, y0 = q.top - q.W * 0.24; g.strokeStyle = q.ink; g.lineWidth = q.lw * 0.7; g.beginPath(); for (let i = 0; i <= 90; i++) { const t = i / 90, x = x0 + q.W * (0.28 * t + 0.07 * Math.cos(t * 7 * TAU)), y = y0 + q.W * (0.06 * Math.sin(t * 7 * TAU) + 0.025 * Math.sin(t * 2.3 * TAU)); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); },
  mindblown: (g, f, q) => {
    const x = q.cx, y = q.top - q.W * 0.2;
    fillStroke(g, starPath(x, y, q.W * 0.26, q.W * 0.15, 11, -Math.PI / 2 + 0.1), "#ff8a1a", q.ink, q.lw * 0.8); fillStroke(g, starPath(x, y + q.W * 0.01, q.W * 0.15, q.W * 0.09, 9, -Math.PI / 2), GOLD);
    cloud(g, [[x - q.W * 0.1, y - q.W * 0.3, q.W * 0.06], [x + q.W * 0.03, y - q.W * 0.36, q.W * 0.075]], "#b0b4bc", q.ink, q.lw * 0.6);
    g.strokeStyle = q.ink; g.lineWidth = q.lw * 0.7; g.beginPath(); for (const a of [-160, -125, -55, -20]) { const r = a * Math.PI / 180; g.moveTo(x + Math.cos(r) * q.W * 0.32, y + Math.sin(r) * q.W * 0.3); g.lineTo(x + Math.cos(r) * q.W * 0.42, y + Math.sin(r) * q.W * 0.38); } g.stroke();
  },
};

/** Face effects beyond kinds.ts's sweat / blush / tears / vein / lines (zzz, steam, stars, question mark, ...). */
export function drawFaceFx(g: CanvasRenderingContext2D, fx: string[], f: FaceFxCtx): void {
  const W = f.box.w, R = W / 1.88, eyes = f.eyes;
  const ey = eyes.length ? eyes.reduce((a, e) => a + e[1], 0) / eyes.length : f.box.y;
  const hd = f.head; /* bobbles pass the real head; other kinds fall back to the face-box estimate */
  const q: FxGeo = { W, R: hd ? hd.r : R, top: f.box.y - f.box.h / 2, cx: hd ? hd.cx : f.box.x + f.fxDx * W, fx: f.box.x, cy: hd ? hd.cy : f.box.y - R * 0.08, lw: f.lw, ink: f.ink, mx: f.mouth[0], my: f.mouth[1], mw: f.mw, ey };
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  for (const n of fx) { const fn = FX[n]; if (fn) { g.save(); fn(g, f, q); g.restore(); } }
  g.restore();
}

// ================================================================ skin marks and conditions
type SkinGeo = { d: number; eL: V2; eR: V2; one: boolean; ey: number; mx: number; my: number; nose: V2; cheeks: V2[]; out: number[]; chin: number; top: number; fx: number };
type SkinFn = (g: G, s: SkinCtx, k: SkinGeo) => void;
const wash = (g: G, s: SkinCtx, fill: string | CanvasGradient) => { g.fillStyle = fill; g.fill(s.head); };
const vgrad = (g: G, y0: number, y1: number, stops: [number, string][]) => { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [k, c] of stops) gr.addColorStop(k, c); return gr; };
/** an irregular blob (union of ellipses) for smudges / splats */
const blob = (x: number, y: number, r: number, seed: number, n = 5) => { const p = new Path2D(), R = rng(seed); p.addPath(ell(x, y, r, r * 0.8, R() * 3)); for (let i = 0; i < n; i++) { const a = R() * TAU, dd = r * (0.4 + R() * 0.5); p.addPath(ell(x + Math.cos(a) * dd, y + Math.sin(a) * dd * 0.8, r * (0.35 + R() * 0.35), r * (0.3 + R() * 0.3), R() * 3)); } return p; };
const splat = (g: G, x: number, y: number, r: number, col: string, seed: number) => {
  const R = rng(seed), p = new Path2D(); p.addPath(ell(x, y, r, r * 0.9));
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + R(), dd = r * (1.15 + R() * 0.5); p.addPath(ell(x + Math.cos(a) * dd, y + Math.sin(a) * dd, r * (0.16 + R() * 0.14), r * (0.16 + R() * 0.14))); }
  p.addPath(rrect(x - r * 0.18, y, r * 0.36, r * 1.7, r * 0.18)); p.addPath(ell(x, y + r * 1.7, r * 0.24, r * 0.26));
  g.fillStyle = col; g.fill(p);
};
const crescentUnder = (g: G, x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = radial(g, x, y + h * 0.15, w, [[0.55, col], [1, "rgba(0,0,0,0)"]]); g.beginPath(); g.ellipse(x, y + h * 0.2, w, h, 0, 0, TAU); g.fill(); };
const lips = (g: G, x: number, y: number, w: number, col: string, rot = 0) => {
  g.save(); g.translate(x, y); g.rotate(rot); const p = new Path2D();
  p.moveTo(-w, 0); p.quadraticCurveTo(-w * 0.5, -w * 0.42, -w * 0.16, -w * 0.36); p.quadraticCurveTo(0, -w * 0.26, w * 0.16, -w * 0.36); p.quadraticCurveTo(w * 0.5, -w * 0.42, w, 0); p.quadraticCurveTo(0, w * 0.62, -w, 0); p.closePath();
  g.fillStyle = col; g.fill(p); g.strokeStyle = "rgba(120,20,40,0.55)"; g.lineWidth = w * 0.08; g.beginPath(); g.moveTo(-w * 0.85, 0.02 * w); g.quadraticCurveTo(0, w * 0.12, w * 0.85, 0.02 * w); g.stroke(); g.restore();
};
const eyesOf = (k: SkinGeo) => (k.one ? [k.eL] : [k.eL, k.eR]);

const SKIN: Record<string, SkinFn> = {
  // ---------------- marks
  freckles: (g, s, k) => {
    const pts: V2[] = [[-0.05, -0.02], [0.0, -0.035], [0.045, -0.012], [-0.025, 0.018], [0.022, 0.02], [-0.06, 0.03]];
    k.cheeks.forEach(([x, y], i) => { for (const [dx, dy] of pts) dot(g, x + dx * k.d * k.out[i], y + dy * k.d, k.d * 0.0135, "rgba(176,98,52,0.85)"); });
    if (!k.one) for (const [dx, dy] of [[-0.03, 0], [0.025, -0.008], [0, 0.022]]) dot(g, k.nose[0] + dx * k.d, k.ey + 0.06 * k.d + dy * k.d, k.d * 0.012, "rgba(176,98,52,0.8)");
  },
  stubble: (g, s, k) => {
    const jx = k.mx, jy = k.my + k.d * 0.06, RX = k.d * (k.one ? 0.24 : 0.31), RY = k.d * 0.17, p = new Path2D(); p.addPath(ell(jx, jy, RX, RY)); p.addPath(ell(k.mx, k.my - k.d * 0.03, k.d * 0.13, k.d * 0.05));
    g.fillStyle = "rgba(70,80,105,0.13)"; g.fill(p);
    for (let i = 0; i < 55; i++) { const t = Math.sqrt((i + 0.5) / 55), a = i * 2.39996; dot(g, jx + Math.cos(a) * t * RX * 0.92, jy + Math.sin(a) * t * RY * 0.92, k.d * 0.005, "rgba(40,45,60,0.38)"); }
  },
  wrinkles: (g, s, k) => {
    const c = "rgba(21,23,31,0.42)", w = s.lw * 0.55, d = k.d;
    eyesOf(k).forEach(([x, y], i) => { const o = k.out[i], x0 = x + o * d * 0.115; for (const a of [-0.45, 0, 0.45]) seg(g, [[x0, y + a * d * 0.03], [x0 + o * d * 0.045 * Math.cos(a), y + d * 0.045 * Math.sin(a) + a * d * 0.03]], c, w); quads(g, [[x - d * 0.06, y + d * 0.12], [x, y + d * 0.145], [x + d * 0.06, y + d * 0.12]], c, w); });
    for (const sg of k.one ? [-1] : [-1, 1]) quads(g, [[k.mx + sg * d * 0.08, k.my - d * 0.09], [k.mx + sg * d * 0.13, k.my - d * 0.02], [k.mx + sg * d * 0.11, k.my + d * 0.05]], c, w);
    for (const dy of [0.24, 0.29]) quads(g, [[k.fx - d * 0.16, k.ey - d * dy], [k.fx, k.ey - d * (dy + 0.02)], [k.fx + d * 0.16, k.ey - d * dy]], c, w);
  },
  eyebags: (g, s, k) => eyesOf(k).forEach(([x, y]) => { crescentUnder(g, x, y + k.d * 0.08, k.d * 0.085, k.d * 0.06, "rgba(130,105,150,0.22)"); quads(g, [[x - k.d * 0.065, y + k.d * 0.115], [x, y + k.d * 0.15], [x + k.d * 0.065, y + k.d * 0.115]], "rgba(21,23,31,0.5)", s.lw * 0.55); }),
  mole: (g, s, k) => dot(g, k.eR[0] + k.out[k.out.length - 1] * k.d * 0.05, k.my - k.d * 0.035, k.d * 0.016, "#5a3424"),
  beautymark: (g, s, k) => dot(g, k.mx - k.d * 0.085, k.my - k.d * 0.05, k.d * 0.012, "#1d1418"),
  scar: (g, s, k) => {
    const [x, y] = k.eL, a: V2 = [x - k.d * 0.05, y - k.d * 0.16], b: V2 = [x + k.d * 0.06, y + k.d * 0.15];
    seg(g, [a, b], "#d77f86", s.lw * 1.0); seg(g, [a, b], "#f0b3b6", s.lw * 0.4);
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    for (const t of [0.15, 0.38, 0.62, 0.85]) { const px = a[0] + dx * t, py = a[1] + dy * t; seg(g, [[px - nx * k.d * 0.025, py - ny * k.d * 0.025], [px + nx * k.d * 0.025, py + ny * k.d * 0.025]], "rgba(150,70,80,0.9)", s.lw * 0.45); }
  },
  cheekscar: (g, s, k) => { const [x, y] = k.cheeks[k.cheeks.length - 1], a: V2 = [x - k.d * 0.06, y + k.d * 0.01], b: V2 = [x + k.d * 0.05, y - k.d * 0.03]; seg(g, [a, b], "#d77f86", s.lw * 0.9); for (const t of [0.25, 0.5, 0.75]) { const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t; seg(g, [[px - k.d * 0.008, py - k.d * 0.022], [px + k.d * 0.008, py + k.d * 0.022]], "rgba(150,70,80,0.9)", s.lw * 0.4); } },
  bandaid: (g, s, k) => {
    const [x, y] = k.cheeks[k.cheeks.length - 1]; g.save(); g.translate(x + k.d * 0.01, y - k.d * 0.01); g.rotate(-0.45);
    fillStroke(g, rrect(-k.d * 0.085, -k.d * 0.032, k.d * 0.17, k.d * 0.064, k.d * 0.03), "#efc08f", s.ink, s.lw * 0.55); g.fillStyle = "#f8dcb8"; g.fill(rrect(-k.d * 0.03, -k.d * 0.024, k.d * 0.06, k.d * 0.048, k.d * 0.008));
    for (const dx of [-0.06, -0.045, 0.045, 0.06]) for (const dy of [-0.01, 0.01]) dot(g, dx * k.d, dy * k.d, k.d * 0.004, "rgba(150,100,60,0.6)"); g.restore();
  },
  lashes: (g, s, k) => eyesOf(k).forEach(([x, y], i) => { const o = k.out[i]; for (const [dy, a] of [[-0.05, -0.75], [-0.025, -0.4], [0.0, -0.1]]) { const x0 = x + o * k.d * 0.07, y0 = y + dy * k.d; seg(g, [[x0, y0], [x0 + o * k.d * 0.04 * Math.cos(a), y0 + k.d * 0.04 * Math.sin(a)]], s.ink, s.lw * 0.75); } }),
  lipstick: (g, s, k) => lips(g, k.mx, k.my, k.d * 0.085, "#d8344e"),
  rosy: (g, s, k) => k.cheeks.forEach(([x, y]) => { g.fillStyle = radial(g, x, y, k.d * 0.085, [[0, "rgba(255,105,125,0.45)"], [1, "rgba(255,105,125,0)"]]); g.beginPath(); g.arc(x, y, k.d * 0.085, 0, TAU); g.fill(); }),
  dimples: (g, s, k) => { for (const sg of k.one ? [-1] : [-1, 1]) { g.strokeStyle = "rgba(21,23,31,0.55)"; g.lineWidth = s.lw * 0.55; g.beginPath(); g.arc(k.mx + sg * k.d * 0.14, k.my - k.d * 0.005, k.d * 0.018, sg > 0 ? -Math.PI * 0.4 : Math.PI * 0.6, sg > 0 ? Math.PI * 0.4 : Math.PI * 1.4); g.stroke(); } },
  birthmark: (g, s, k) => { g.fillStyle = "rgba(190,120,90,0.42)"; g.fill(blob(k.cheeks[0][0] - k.d * 0.02, k.cheeks[0][1] + k.d * 0.05, k.d * 0.028, 7, 4)); },
  eyeshadow: (g, s, k) => eyesOf(k).forEach(([x, y]) => { g.fillStyle = radial(g, x, y + k.d * 0.02, k.d * 0.12, [[0.55, "rgba(140,90,210,0.65)"], [1, "rgba(140,90,210,0)"]]); g.beginPath(); g.ellipse(x, y - k.d * 0.03, k.d * 0.11, k.d * 0.1, 0, 0, TAU); g.fill(); }),
  makeup: (g, s, k) => { SKIN.eyeshadow(g, s, k); SKIN.rosy(g, s, k); SKIN.lipstick(g, s, k); SKIN.lashes(g, s, k); },
  eyeblack: (g, s, k) => eyesOf(k).forEach(([x, y]) => { g.fillStyle = "rgba(28,28,34,0.88)"; g.fill(rrect(x - k.d * 0.06, y + k.d * 0.125, k.d * 0.12, k.d * 0.034, k.d * 0.017)); }),
  warpaint: (g, s, k) => k.cheeks.forEach(([x, y], i) => { for (const [dy, c] of [[-0.022, "#d8344e"], [0.022, "#2f6fd6"]] as [number, string][]) seg(g, [[x - k.d * 0.05 * k.out[i], y + dy * k.d], [x + k.d * 0.05 * k.out[i], y + dy * k.d - k.d * 0.012]], c, k.d * 0.022); }),
  starsticker: (g, s, k) => { const [x, y] = k.cheeks[k.cheeks.length - 1]; fillStroke(g, starPath(x, y - k.d * 0.02, k.d * 0.036, k.d * 0.016), GOLD, s.ink, s.lw * 0.45); },
  stitches: (g, s, k) => { const [x, y] = k.cheeks[k.cheeks.length - 1], a: V2 = [x - k.d * 0.07, y + k.d * 0.03], b: V2 = [x + k.d * 0.05, y - k.d * 0.02]; seg(g, [a, b], "rgba(150,70,80,0.9)", s.lw * 0.55); for (const t of [0.15, 0.4, 0.65, 0.9]) { const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t; seg(g, [[px - k.d * 0.012, py - k.d * 0.022], [px + k.d * 0.012, py + k.d * 0.022]], s.ink, s.lw * 0.5); } },
  pimple: (g, s, k) => { const x = k.mx - k.d * 0.12, y = k.my + k.d * 0.1; g.fillStyle = radial(g, x, y, k.d * 0.045, [[0, "rgba(240,90,100,0.7)"], [1, "rgba(240,90,100,0)"]]); g.beginPath(); g.arc(x, y, k.d * 0.04, 0, TAU); g.fill(); dot(g, x, y, k.d * 0.021, "#e2475a"); dot(g, x - k.d * 0.004, y - k.d * 0.005, k.d * 0.009, "#fff6e8"); },
  // ---------------- conditions
  sunburn: (g, s, k) => {
    wash(g, s, vgrad(g, k.top, k.chin, [[0, "rgba(235,85,60,0.42)"], [1, "rgba(235,95,70,0.22)"]]));
    g.fillStyle = radial(g, k.fx, k.nose[1], k.d * 0.32, [[0, "rgba(225,50,40,0.4)"], [1, "rgba(225,50,40,0)"]]); g.fill(s.head);
    for (const [x, y, a] of [[k.nose[0] + k.d * 0.02, k.nose[1] - k.d * 0.02, 0.4], [k.cheeks[0][0], k.cheeks[0][1] - k.d * 0.02, 1.3], [k.cheeks[k.cheeks.length - 1][0], k.cheeks[k.cheeks.length - 1][1] + k.d * 0.01, 2.2]]) { g.save(); g.translate(x, y); g.rotate(a); fillStroke(g, poly([[-1, -0.6], [0.9, -0.9], [1.1, 0.5], [-0.2, 0.9], [-0.9, 0.4]].map(([px, py]) => [px * k.d * 0.018, py * k.d * 0.018] as V2)), "rgba(255,240,230,0.92)", "rgba(180,60,50,0.6)", s.lw * 0.3); g.restore(); }
  },
  sick: (g, s, k) => {
    wash(g, s, "rgba(160,215,120,0.2)");
    wash(g, s, vgrad(g, k.chin, k.ey - k.d * 0.08, [[0, "rgba(90,165,55,0.82)"], [0.55, "rgba(120,190,80,0.5)"], [1, "rgba(150,210,100,0)"]]));
    eyesOf(k).forEach(([x, y]) => crescentUnder(g, x, y + k.d * 0.08, k.d * 0.08, k.d * 0.055, "rgba(60,120,45,0.35)"));
  },
  queasy: (g, s, k) => { wash(g, s, vgrad(g, k.chin, k.ey, [[0, "rgba(120,190,80,0.6)"], [1, "rgba(150,210,100,0)"]])); eyesOf(k).forEach(([x, y]) => crescentUnder(g, x, y + k.d * 0.08, k.d * 0.07, k.d * 0.05, "rgba(90,140,70,0.25)")); },
  pale: (g, s, k) => { wash(g, s, "rgba(198,214,234,0.55)"); eyesOf(k).forEach(([x, y]) => crescentUnder(g, x, y + k.d * 0.08, k.d * 0.08, k.d * 0.055, "rgba(110,120,170,0.3)")); },
  frozen: (g, s, k) => {
    wash(g, s, vgrad(g, k.top, k.chin, [[0, "rgba(130,195,255,0.72)"], [1, "rgba(160,212,255,0.45)"]]));
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = k.d * 0.075; g.stroke(s.head);
    g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = s.lw * 0.5;
    for (const [x, y, r] of [[k.cheeks[0][0] - k.d * 0.02, k.cheeks[0][1] + k.d * 0.06, 1], [k.cheeks[k.cheeks.length - 1][0] + k.d * 0.03, k.cheeks[k.cheeks.length - 1][1] - k.d * 0.05, 0.8], [k.fx + k.d * 0.2, k.ey - k.d * 0.15, 0.7]]) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; g.moveTo(x - Math.cos(a) * k.d * 0.03 * r, y - Math.sin(a) * k.d * 0.03 * r); g.lineTo(x + Math.cos(a) * k.d * 0.03 * r, y + Math.sin(a) * k.d * 0.03 * r); } g.stroke(); }
  },
  flushed: (g, s, k) => { g.save(); g.translate(k.fx, k.cheeks[0][1] - k.d * 0.01); g.scale(1, 0.42); g.fillStyle = radial(g, 0, 0, k.d * 0.45, [[0, "rgba(255,60,85,0.52)"], [0.6, "rgba(255,60,85,0.38)"], [1, "rgba(255,60,85,0)"]]); g.beginPath(); g.arc(0, 0, k.d * 0.45, 0, TAU); g.fill(); g.restore(); wash(g, s, "rgba(255,90,100,0.1)"); },
  beet: (g, s, k) => { wash(g, s, vgrad(g, k.top, k.chin, [[0, "rgba(240,70,90,0.38)"], [1, "rgba(240,60,85,0.58)"]])); SKIN.flushed(g, s, k); },
  fuming: (g, s, k) => wash(g, s, vgrad(g, k.chin, k.top, [[0, "rgba(225,35,35,0.72)"], [0.55, "rgba(230,45,45,0.45)"], [1, "rgba(230,50,50,0.12)"]])),
  soot: (g, s, k) => { g.fillStyle = "rgba(45,42,48,0.55)"; for (const [x, y, r, sd] of [[k.cheeks[0][0], k.cheeks[0][1], 0.06, 3], [k.fx + k.d * 0.2, k.ey - k.d * 0.17, 0.05, 5], [k.nose[0] + k.d * 0.02, k.nose[1] + k.d * 0.01, 0.03, 8], [k.mx + k.d * 0.18, k.my + k.d * 0.08, 0.05, 11]]) g.fill(blob(x, y, r * k.d, sd)); const R = rng(41); for (let i = 0; i < 14; i++) dot(g, k.fx + (R() - 0.5) * k.d * 0.8, k.ey + (R() - 0.35) * k.d * 0.5, k.d * (0.006 + R() * 0.008), "rgba(40,38,44,0.6)"); },
  dirty: (g, s, k) => { g.fillStyle = "rgba(120,85,50,0.42)"; for (const [x, y, r, sd] of [[k.cheeks[k.cheeks.length - 1][0], k.cheeks[k.cheeks.length - 1][1] + k.d * 0.02, 0.055, 13], [k.fx - k.d * 0.22, k.ey - k.d * 0.15, 0.045, 17], [k.mx - k.d * 0.12, k.my + k.d * 0.1, 0.04, 19]]) g.fill(blob(x, y, r * k.d, sd)); },
  mud: (g, s, k) => { splat(g, k.cheeks[0][0], k.cheeks[0][1] - k.d * 0.01, k.d * 0.05, "rgba(112,78,45,0.93)", 23); splat(g, k.mx + k.d * 0.2, k.my + k.d * 0.05, k.d * 0.04, "rgba(112,78,45,0.93)", 29); const R = rng(31); for (let i = 0; i < 8; i++) dot(g, k.fx + (R() - 0.5) * k.d * 0.7, k.ey + (R() - 0.3) * k.d * 0.45, k.d * (0.008 + R() * 0.01), "rgba(112,78,45,0.9)"); },
  blackeye: (g, s, k) => { const [x, y] = k.eR; g.fillStyle = radial(g, x, y, k.d * 0.16, [[0.35, "rgba(80,30,110,0.85)"], [0.65, "rgba(115,65,150,0.6)"], [0.86, "rgba(175,165,80,0.32)"], [1, "rgba(175,165,80,0)"]]); g.beginPath(); g.ellipse(x, y + k.d * 0.01, k.d * 0.15, k.d * 0.16, 0, 0, TAU); g.fill(); },
  bruise: (g, s, k) => { const [x, y] = k.cheeks[0]; g.fillStyle = radial(g, x, y, k.d * 0.07, [[0, "rgba(90,60,150,0.6)"], [0.6, "rgba(120,80,160,0.4)"], [0.85, "rgba(180,170,80,0.28)"], [1, "rgba(180,170,80,0)"]]); g.fill(ell(x, y, k.d * 0.075, k.d * 0.06, 0.4)); },
  bump: (g, s, k) => {
    const x = k.eR[0] + k.out[k.out.length - 1] * k.d * 0.19, y = k.ey - k.d * 0.11, r = k.d * 0.068;
    fillStroke(g, ell(x, y, r, r * 0.9), radial(g, x - r * 0.2, y - r * 0.3, r * 1.2, [[0, "#ffd0d6"], [1, "#ff8e9c"]]), "rgba(21,23,31,0.55)", s.lw * 0.55); dot(g, x - r * 0.35, y - r * 0.35, r * 0.2, "#ffffff");
  },
  spots: (g, s, k) => { for (const [dx, dy] of [[-0.33, 0.1], [-0.24, 0.22], [-0.05, 0.12], [0.08, 0.31], [0.24, 0.2], [0.34, 0.07], [0.2, -0.13], [-0.24, -0.13], [0.0, -0.17], [-0.13, 0.33], [0.3, 0.3], [-0.37, -0.02]]) { const x = k.fx + dx * k.d * (k.one ? 0.6 : 1), y = k.ey + dy * k.d; dot(g, x, y, k.d * 0.018, "#e2475a"); dot(g, x - k.d * 0.004, y - k.d * 0.004, k.d * 0.007, "#ff9aa5"); } },
  sweaty: (g, s, k) => {
    g.fillStyle = "rgba(255,255,255,0.55)"; g.fill(ell(k.fx - k.d * 0.12, k.ey - k.d * 0.16, k.d * 0.06, k.d * 0.018, -0.2)); g.fill(ell(k.nose[0] + k.d * 0.015, k.nose[1] - k.d * 0.02, k.d * 0.012, k.d * 0.022)); g.fill(ell(k.cheeks[0][0] - k.d * 0.02, k.cheeks[0][1] - k.d * 0.03, k.d * 0.025, k.d * 0.01, -0.5));
    for (const [dx, dy, r] of [[-0.3, -0.12, 1], [0.3, -0.16, 0.9], [0.37, 0.12, 0.8], [-0.24, 0.27, 0.75]]) drop(g, k.fx + dx * k.d, k.ey + dy * k.d, k.d * 0.018 * r, -Math.PI / 2, WATER, s.ink, s.lw * 0.4);
  },
  nosebleed: (g, s, k) => { const [x, y] = k.nose; for (const sg of [-1, 1]) { const x0 = x + sg * k.d * 0.014; quads(g, [[x0, y], [x0 + sg * k.d * 0.006, y + (k.my - y) * 0.5], [x0 + sg * k.d * 0.002, k.my - k.d * 0.035]], "#d9202e", s.lw * 0.8); } dot(g, x + k.d * 0.016, k.my - k.d * 0.03, k.d * 0.011, "#d9202e"); },
  sleepy: (g, s, k) => eyesOf(k).forEach(([x, y]) => crescentUnder(g, x, y + k.d * 0.075, k.d * 0.09, k.d * 0.075, "rgba(115,85,150,0.3)")),
  glow: (g, s, k) => { wash(g, s, radial(g, k.fx, k.ey + k.d * 0.06, k.d * 0.5, [[0, "rgba(255,246,215,0.65)"], [1, "rgba(255,240,200,0)"]])); for (const [x, y] of k.cheeks) fillStroke(g, sparklePath(x + k.d * 0.02, y - k.d * 0.02, k.d * 0.03), "#ffffff", "rgba(230,170,40,0.8)", s.lw * 0.35); },
  tan: (g, s) => wash(g, s, "rgba(196,128,72,0.38)"),
  goggletan: (g, s, k) => { const p = new Path2D(); p.rect(s.cx - s.r * 1.5, s.cy - s.r * 1.5, s.r * 3, s.r * 3); for (const [x, y] of eyesOf(k)) p.addPath(ell(x, y, k.d * 0.135, k.d * 0.125)); g.fillStyle = "rgba(205,110,70,0.45)"; g.fill(p, "evenodd"); },
  beesting: (g, s, k) => { const [x0, y0] = k.cheeks[k.cheeks.length - 1], x = x0, y = y0 - k.d * 0.02; g.fillStyle = radial(g, x, y, k.d * 0.085, [[0, "rgba(255,95,95,0.8)"], [0.7, "rgba(255,120,120,0.45)"], [1, "rgba(255,130,130,0)"]]); g.fill(ell(x, y, k.d * 0.085, k.d * 0.08)); g.strokeStyle = "rgba(21,23,31,0.45)"; g.lineWidth = s.lw * 0.5; g.beginPath(); g.ellipse(x, y, k.d * 0.07, k.d * 0.065, 0, -Math.PI * 0.6, Math.PI * 0.35); g.stroke(); dot(g, x, y, k.d * 0.008, "#2a1a1a"); },
  rednose: (g, s, k) => { const [x, y] = k.nose; fillStroke(g, ell(x, y, k.d * 0.052, k.d * 0.047), "#e8506a", s.ink, s.lw * 0.6); dot(g, x - k.d * 0.017, y - k.d * 0.017, k.d * 0.013, "#ffffff"); },
  paint: (g, s, k) => { splat(g, k.cheeks[0][0], k.cheeks[0][1] - k.d * 0.01, k.d * 0.04, "#3d7be0", 43); splat(g, k.mx - k.d * 0.04, k.my + k.d * 0.13, k.d * 0.032, "#f2c230", 47); splat(g, k.cheeks[k.cheeks.length - 1][0], k.cheeks[k.cheeks.length - 1][1] - k.d * 0.02, k.d * 0.034, "#e8508a", 53); },
  chocolate: (g, s, k) => {
    const p = new Path2D(); p.addPath(ell(k.mx, k.my + k.d * 0.01, k.d * 0.12, k.d * 0.06)); p.addPath(ell(k.mx + k.d * 0.07, k.my + k.d * 0.04, k.d * 0.05, k.d * 0.04)); p.addPath(rrect(k.mx - k.d * 0.045, k.my + k.d * 0.03, k.d * 0.026, k.d * 0.08, k.d * 0.013)); p.addPath(ell(k.mx - k.d * 0.032, k.my + k.d * 0.11, k.d * 0.018, k.d * 0.02));
    g.fillStyle = "rgba(107,61,34,0.88)"; g.fill(p); g.fillStyle = "rgba(107,61,34,0.6)"; g.fill(blob(k.cheeks[k.cheeks.length - 1][0], k.cheeks[k.cheeks.length - 1][1], k.d * 0.03, 61, 3));
  },
  wet: (g, s, k) => { wash(g, s, vgrad(g, k.top, k.ey + k.d * 0.1, [[0, "rgba(110,180,255,0.32)"], [1, "rgba(110,180,255,0)"]])); for (const [dx, dy, r] of [[-0.3, -0.06, 1], [0.32, -0.1, 0.9], [0.36, 0.18, 0.8], [-0.26, 0.24, 0.85], [0.06, -0.2, 0.7], [-0.08, 0.34, 0.7]]) drop(g, k.fx + dx * k.d, k.ey + dy * k.d, k.d * 0.02 * r, -Math.PI / 2, WATER, "#4f8fc0", s.lw * 0.4); g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = s.lw * 0.5; g.beginPath(); g.moveTo(k.fx - k.d * 0.36, k.ey - k.d * 0.2); g.lineTo(k.fx - k.d * 0.37, k.ey - k.d * 0.05); g.stroke(); },
  gloom: (g, s, k) => wash(g, s, vgrad(g, k.top, k.ey + k.d * 0.04, [[0, "rgba(60,50,130,0.66)"], [0.6, "rgba(70,60,140,0.38)"], [1, "rgba(70,60,140,0)"]])),
  villain: (g, s, k) => wash(g, s, vgrad(g, k.top, k.ey + k.d * 0.14, [[0, "rgba(35,18,60,0.95)"], [0.62, "rgba(35,18,60,0.86)"], [1, "rgba(35,18,60,0)"]])),
  zombie: (g, s, k) => { wash(g, s, "rgba(120,160,115,0.55)"); SKIN.sleepy(g, s, k); const a: V2 = [k.fx - k.d * 0.28, k.ey - k.d * 0.2], b: V2 = [k.fx - k.d * 0.06, k.ey - k.d * 0.25]; seg(g, [a, b], "rgba(70,40,50,0.8)", s.lw * 0.5); for (const t of [0.2, 0.5, 0.8]) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; seg(g, [[x - k.d * 0.006, y - k.d * 0.022], [x + k.d * 0.006, y + k.d * 0.022]], s.ink, s.lw * 0.45); } },
  kissed: (g, s, k) => { lips(g, k.cheeks[0][0], k.cheeks[0][1], k.d * 0.075, "rgba(216,52,78,0.85)", -0.35); if (!k.one) lips(g, k.cheeks[1][0], k.cheeks[1][1] - k.d * 0.01, k.d * 0.065, "rgba(216,52,78,0.8)", 0.3); },
  scratches: (g, s, k) => { const [x, y] = k.cheeks[0]; for (const o of [-1, 0, 1]) { const a: V2 = [x - k.d * 0.06 + o * k.d * 0.025, y - k.d * 0.05], b: V2 = [x + k.d * 0.02 + o * k.d * 0.025, y + k.d * 0.06]; seg(g, [a, b], "#d9505e", s.lw * 0.65); seg(g, [a, b], "#ffb0b8", s.lw * 0.22); } },
};
/** washes: drawn first, so marks (freckles, scars, ...) stay on top of a sunburn or a green face */
const COND = new Set(["sunburn", "sick", "queasy", "pale", "frozen", "flushed", "beet", "fuming", "tan", "goggletan", "glow", "gloom", "villain", "zombie", "wet"]);

/** Skin marks and conditions inside the head clip (under the eyes, brows and mouth). */
export function drawSkinFx(g: CanvasRenderingContext2D, list: string[], s: SkinCtx): void {
  const d = s.d, one = s.eyes.length < 2, eL: V2 = s.eyes[0] ?? [s.box.x, s.cy], eR: V2 = s.eyes[s.eyes.length - 1] ?? eL;
  const ey = (eL[1] + eR[1]) / 2, [mx, my] = s.mouth, far = s.three ? 0.7 : 1;
  const nose: V2 = s.side ? [s.cx + s.r * 0.86, ey + (my - ey) * 0.5] : [s.box.x + (s.three ? d * 0.03 : s.turn * d * 0.03), ey + (my - ey) * 0.52];
  const cheeks: V2[] = one ? [[eL[0] - d * 0.06, ey + d * 0.165]] : [[eL[0] - d * 0.06, ey + d * 0.165], [eR[0] + d * 0.06 * far, ey + d * 0.165]];
  const k: SkinGeo = { d, eL, eR, one, ey, mx, my, nose, cheeks, out: one ? [-1] : [-1, 1], chin: s.cy + s.r * s.hw, top: s.cy - s.r * s.hw, fx: s.box.x };
  const order = [...new Set(list)].sort((a, b) => Number(!COND.has(a)) - Number(!COND.has(b)));
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  for (const n of order) { const fn = SKIN[n]; if (fn) { g.save(); fn(g, s, k); g.restore(); } }
  g.restore();
}
