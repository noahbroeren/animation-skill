/**
 * OUR CAST (brand ours-v1): the channel's recurring characters, a large role library and an extras generator.
 *
 * Every character wears `BRANDS.ours` (one face card, black ink limbs, lidded eyes with a catchlight, combed hair);
 * identity comes from the role layers only: hair or hat, one torso colour (+ pattern), one detail, one prop, at most
 * one face accessory, marks, build and height (character-design.md, identity budget).
 *
 * Use on a board:   cast: { milo: castEntry("milo"), boss: castEntry("bigsby") }   (Board.brand = BRANDS.ours)
 * Background people: cast: { ex1: { spec: extra(1), height: 1.7 } }
 */
import { BOBBLE_POSES, BobbleSpec, BRANDS, KExpr, KPose, StickHold } from "./kinds";

export type CastGroup = "core" | "everyday" | "work" | "care" | "history" | "fantasy" | "sport" | "family";
export type CastMember = {
  spec: BobbleSpec;
  name: string;
  /** what the character is for in a story */
  role: string;
  group: CastGroup;
  /** three words of personality */
  traits: string;
  /** resting face */
  rest: KExpr;
  /** signature pose (BOBBLE_POSES key) and prop */
  pose: keyof typeof BOBBLE_POSES;
  prop?: StickHold;
  /** height in metres (adults 1.55-1.85; kids 1.0-1.3) */
  height: number;
  /** voice direction for TTS casting (no voice ids) */
  voice: string;
};

const B = BRANDS.ours;
const KID = 2.55, TEEN = 2.95; /* the same head on a shorter body (kids ~0.7x of the adult body) */
type Look = Omit<BobbleSpec, "id" | "kind" | "skin" | "brand">;
const mk = (id: string, look: Look): BobbleSpec => ({ id, kind: "bobble", skin: "#ffffff", brand: B, legs: "#2f3442", shoes: "#1c1a20", ...look });
function M(id: string, name: string, group: CastGroup, role: string, traits: string, rest: KExpr, height: number, voice: string, look: Look, pose: keyof typeof BOBBLE_POSES = "idle", prop?: StickHold): [string, CastMember] {
  return [id, { spec: mk(id, look), name, role, group, traits, rest, pose, prop, height, voice }];
}

// hair colours
const H = { black: "#1f1a22", dark: "#3b2a20", brown: "#6a3d22", chestnut: "#8a4a26", auburn: "#a0482a", ginger: "#c8642c", blonde: "#d9b25a", platinum: "#ece2c0",
  grey: "#b9b4c4", white: "#ecebf0", blue: "#3f6fd6", pink: "#e07aa8", purple: "#7a4fc9", green: "#4caf7a" };

export const OUR_CAST: Record<string, CastMember> = Object.fromEntries([
  // ---------------------------------------------------------------- CORE: the recurring ensemble
  M("milo", "Milo", "core", "the everyman hero: curious, unlucky, asks what the viewer asks", "curious, deadpan, stubborn", "neutral", 1.74, "young adult male, dry, understated",
    { hair: { style: "spiky", color: H.dark }, top: { color: "#2a9d8f", style: "hoodie" } }, "phone", { item: "phone" }),
  M("juno", "Juno", "core", "the best friend: fearless, jumps in first, cheers the hero on", "energetic, loyal, loud", "happy", 1.66, "young adult female, bright, fast",
    { hair: { style: "highpony", color: H.auburn }, top: { color: "#ee6352", style: "jacket", accent: "#fff3e0" }, marks: ["freckles"] }, "cheer", { item: "coffee" }),
  M("ada", "Dr. Ada Vale", "core", "the expert: knows how it works and explains the mechanism", "brilliant, precise, impatient", "smug", 1.68, "adult female, crisp, warm authority",
    { hair: { style: "bun", color: H.grey }, glasses: "#2b2230", top: { color: "#eef2f6", style: "labcoat", accent: "#7b4fc9" }, marks: ["lashes"] }, "think", { item: "testtube" }),
  M("bigsby", "Mr. Bigsby", "core", "the rich boss: owns the factory, the bank or the kingdom", "greedy, loud, vain", "smug", 1.7, "older male, booming, pompous",
    { hat: { style: "top", color: "#22252e", accent: "#8e2b3d" }, stache: "#e9e6ee", top: { color: "#8e2b3d", style: "suit" }, neck: { style: "tie", color: "#e0b33a" }, build: "stout" }, "hips", { item: "money" }),
  M("vex", "Vex", "core", "the schemer: con artist, cheat, the one who games the system", "sly, charming, sneaky", "mischief", 1.82, "adult male, smooth, whispery",
    { hair: { style: "slick", color: H.black }, shades: "#14121a", top: { color: "#5b3f8c", style: "trench" }, build: "slim" }, "shrug", { item: "briefcase" }),
  M("gus", "Gus", "core", "the builder: fixes, builds and breaks things with his hands", "practical, calm, strong", "neutral", 1.78, "adult male, low, slow, friendly",
    { hat: { style: "hardhat", color: "#f5c21b" }, beard: "#5a3a26", top: { color: "#e8862e", style: "overall", accent: "#3f6fb5" }, build: "stout" }, "carry", { item: "wrench" }),
  M("pip", "Pip", "core", "the kid: little brother, asks why, gets into everything", "curious, cheeky, fast", "happy", 1.16, "child, high, excited",
    { hair: { style: "curl", color: H.blonde }, top: { color: "#7cc242", style: "jersey", accent: "#ffffff", pattern: "number", patternColor: "#ffffff" }, heightHeads: KID }, "wave", { item: "ball" }),
  M("rose", "Nana Rose", "core", "the elder: remembers how it used to be, tells the history", "kind, sharp, nosy", "happy", 1.55, "elderly female, warm, slow, wry",
    { hair: { style: "beehive", color: H.white }, top: { color: "#d46a8a", style: "cardigan", accent: "#f4efe6" }, neck: { style: "pearls", color: "#f6f1e8" }, marks: ["wrinkles", "rosy"] }, "idle", { item: "cane" }),
  M("dee", "Officer Dee", "core", "the rules: police, inspector, referee, the one who says no", "strict, honest, tired", "skeptical", 1.76, "adult female, firm, clipped",
    { hat: { style: "police", color: "#22305a", accent: "#f1c94a" }, hair: { style: "braids", color: H.black }, top: { color: "#2c3f78", style: "uniform", accent: "#f1c94a" } }, "hips", { item: "paper" }),
  M("sal", "Chef Sal", "core", "the merchant: cook, shopkeeper, seller of whatever the story needs", "proud, dramatic, generous", "happy", 1.72, "adult male, theatrical, hearty",
    { hat: { style: "chef", color: "#fbfaf6" }, stache: "#2a2228", top: { color: "#f4f1ea", style: "chefcoat", accent: "#d8344e" }, neck: { style: "scarf", color: "#d8344e" }, build: "stout" }, "point", { item: "pizza" }),
  M("kai", "Kai", "core", "the teen: online, tech, games, trends", "bored, clever, sarcastic", "deadpan", 1.7, "teen, flat, quick",
    { hair: { style: "undercut", color: H.blue }, top: { color: "#3a3f8f", style: "sweater" }, neck: { style: "lanyard", color: "#f08a24" }, build: "slim" }, "carry", { item: "laptop" }),
  M("hal", "Professor Hal", "core", "the historian: old stories, dates, maps and dusty books", "wise, absent-minded, gentle", "neutral", 1.7, "elderly male, soft, storyteller",
    { hair: { style: "horseshoe", color: H.white }, glasses: "#2b2230", top: { color: "#c9a13a", style: "cardigan", accent: "#8a6a4a" }, neck: { style: "bow", color: "#b3263a" }, marks: ["wrinkles", "eyebags"] }, "think", { item: "book" }),
  M("luz", "Dr. Luz", "core", "the doctor: the body, health, what happens inside", "caring, fast, blunt", "neutral", 1.66, "adult female, calm, precise",
    { hair: { style: "sidebraid", color: H.black }, top: { color: "#5b9bd5", style: "scrubs" }, neck: { style: "stethoscope", color: "#3a3f5c" } }, "idle", { item: "clipboard" }),
  M("rook", "Rook", "core", "the adventurer: explorer, pilot, the one who goes to the place", "brave, reckless, cheerful", "smug", 1.8, "adult male, gravelly, upbeat",
    { hat: { style: "safari", color: "#d8c08a", accent: "#7a5a3a" }, top: { color: "#b59a62", style: "shirt" }, neck: { style: "bandanaNeck", color: "#c0392b" }, marks: ["stubble"] }, "point", { item: "binoculars" }),

  // ---------------------------------------------------------------- EVERYDAY
  M("shopkeeper", "Mo", "everyday", "shopkeeper / cashier", "patient, chatty, sharp", "happy", 1.68, "adult male, friendly",
    { hair: { style: "combover", color: H.dark }, top: { color: "#3f8a5a", style: "apron", accent: "#f4efe6" }, build: "stout" }, "idle", { item: "coin" }),
  M("waiter", "Theo", "everyday", "waiter", "polite, stiff, tired", "deadpan", 1.78, "adult male, formal",
    { hair: { style: "slick", color: H.brown }, top: { color: "#22252e", style: "waistcoat", accent: "#ffffff" }, neck: { style: "bow", color: "#1c1a20" } }, "idle", { item: "tray" }),
  M("barista", "Noor", "everyday", "barista", "cheerful, quick, nosy", "happy", 1.64, "adult female, upbeat",
    { hair: { style: "puffs", color: H.black }, top: { color: "#7a5a3a", style: "barista", accent: "#e9dcc6" } }, "idle", { item: "coffee" }),
  M("courier", "Dex", "everyday", "delivery driver / mail carrier", "rushed, upbeat, lost", "nervous", 1.76, "adult male, out of breath",
    { hat: { style: "cap", color: "#f08a24", accent: "#22252e" }, top: { color: "#f5a524", style: "polo" }, build: "slim" }, "carry", { item: "letter" }),
  M("office", "Priya", "everyday", "office worker", "busy, organised, sarcastic", "deadpan", 1.64, "adult female, dry",
    { hair: { style: "bob", color: H.black }, top: { color: "#5b6fa8", style: "blazer", accent: "#ffffff" }, glasses: "#2b2230" }, "phone", { item: "file" }),
  M("banker", "Mr. Penn", "everyday", "banker / accountant", "careful, nervous, exact", "nervous", 1.74, "adult male, thin, precise",
    { hair: { style: "side", color: H.grey }, top: { color: "#2b3a55", style: "suit" }, neck: { style: "tie", color: "#3f8a5a" }, glasses: "#2b2230", build: "slim" }, "idle", { item: "briefcase" }),
  M("teacher", "Ms. Okafor", "everyday", "teacher", "warm, firm, tired", "skeptical", 1.68, "adult female, clear",
    { hair: { style: "afro", color: H.black }, top: { color: "#b3263a", style: "cardigan", accent: "#f4efe6" }, glasses: "#b3263a" }, "point", { item: "book" }),
  M("student", "Lena", "everyday", "student", "curious, distracted, sweet", "think", 1.62, "young female, soft",
    { hair: { style: "pigtails", color: H.chestnut }, top: { color: "#8fc6e8", style: "sweater", pattern: "hstripes", patternColor: "#ffffff" } }, "think", { item: "pen" }),
  M("reporter", "Jules", "everyday", "reporter / news anchor", "fast, dramatic, nosy", "happy", 1.7, "adult, broadcast voice",
    { hair: { style: "curtains", color: H.blonde }, top: { color: "#e2483a", style: "blazer", accent: "#ffffff" } }, "point", { item: "mic" }),
  M("tourist", "Bev", "everyday", "tourist", "lost, excited, loud", "happy", 1.62, "older female, loud",
    { hat: { style: "sunhat", color: "#f0d58a", accent: "#e07aa8" }, top: { color: "#2fb3a6", style: "hawaiian", pattern: "flowers", patternColor: "#f5c21b" }, marks: ["sunburn"] }, "phone", { item: "camera" }),
  M("gamer", "Zed", "everyday", "gamer / streamer", "intense, loud, sleepy", "deadpan", 1.72, "young male, hyped",
    { hair: { style: "messy", color: H.green }, hat: { style: "headphones", color: "#22252e", accent: "#e2483a" }, top: { color: "#22252e", style: "hoodie" }, marks: ["eyebags"] }, "carry", { item: "laptop" }),
  M("influencer", "Mia", "everyday", "influencer", "bubbly, vain, quick", "smug", 1.66, "young female, upbeat",
    { hair: { style: "wavy", color: H.platinum }, top: { color: "#e07aa8", style: "tank" }, neck: { style: "necklace", color: "#f5c21b" }, marks: ["lashes", "lipstick"] }, "phone", { item: "selfie" }),
  M("dad", "Dad", "family", "father", "tired, punny, proud", "happy", 1.8, "adult male, warm",
    { hair: { style: "combover", color: H.brown }, top: { color: "#4f78b0", style: "polo" }, glasses: "#2b2230", build: "stout", marks: ["stubble"] }, "hips", { item: "spatula" }),
  M("mom", "Mom", "family", "mother", "busy, caring, sharp", "skeptical", 1.68, "adult female, warm",
    { hair: { style: "wavy", color: H.chestnut }, top: { color: "#3f8a5a", style: "cardigan", accent: "#f4efe6" } }, "hips", { item: "mug" }),
  M("grandpa", "Grandpa Joe", "family", "grandfather", "grumpy, funny, slow", "skeptical", 1.68, "elderly male, raspy",
    { hair: { style: "horseshoe", color: H.grey }, top: { color: "#7a5a3a", style: "vest", accent: "#f4efe6" }, stache: "#e9e6ee", marks: ["wrinkles"] }, "idle", { item: "newspaper" }),
  M("girl", "Tilly", "family", "little girl", "bold, bossy, sweet", "mischief", 1.12, "child, high",
    { hair: { style: "spacebuns", color: H.ginger }, top: { color: "#a77bd0", style: "dress", accent: "#f4efe6", pattern: "dots", patternColor: "#ffffff" }, heightHeads: KID, marks: ["freckles"] }, "wave", { item: "balloon" }),
  M("boy", "Benji", "family", "little boy", "shy, clever, messy", "shy", 1.1, "child, soft",
    { hair: { style: "afro", color: H.black }, top: { color: "#f39a2b", style: "tee", accent: "#ffffff" }, heightHeads: KID }, "idle", { item: "teddy" }),
  M("teen", "Ava", "family", "teenager", "moody, smart, funny", "deadpan", 1.62, "teen female, dry",
    { hair: { style: "emo", color: H.purple }, top: { color: "#22252e", style: "hoodie" }, heightHeads: TEEN }, "phone", { item: "phone" }),

  // ---------------------------------------------------------------- WORK
  M("mechanic", "Vic", "work", "mechanic", "gruff, handy, honest", "deadpan", 1.76, "adult male, gravel",
    { hair: { style: "buzz", color: H.dark }, top: { color: "#5a6b7a", style: "coverall", accent: "#e9dcc6" }, marks: ["soot"] }, "carry", { item: "wrench" }),
  M("farmer", "Old Mae", "work", "farmer", "tough, dry, early", "deadpan", 1.64, "older female, country",
    { hat: { style: "boater", color: "#f0d58a", accent: "#8a5a34" }, hair: { style: "braids", color: H.grey }, top: { color: "#4f78b0", style: "overall", accent: "#c0392b" }, marks: ["sunburn"] }, "idle", { item: "rake" }),
  M("fisher", "Bo", "work", "fisherman / sailor", "patient, salty, calm", "neutral", 1.78, "older male, slow",
    { hat: { style: "captain", color: "#f4f6fa", accent: "#22305a" }, beard: "#b9b4c4", top: { color: "#2c3f78", style: "sweater", pattern: "hstripes", patternColor: "#f4f6fa" } }, "idle", { item: "fishingrod" }),
  M("miner", "Rocco", "work", "miner", "strong, quiet, dusty", "neutral", 1.74, "adult male, deep",
    { hat: { style: "miner", color: "#f5c21b" }, top: { color: "#6b5a4a", style: "overall", accent: "#3a3f5c" }, marks: ["soot"] }, "carry", { item: "pickaxe" }),
  M("firefighter", "Kat", "work", "firefighter", "brave, fast, kind", "determined", 1.74, "adult female, strong",
    { hat: { style: "firefighter", color: "#c0392b", accent: "#f1c94a" }, top: { color: "#2b2b33", style: "coat", accent: "#f1c94a" }, marks: ["soot"] }, "point"),
  M("pilot", "Captain Ray", "work", "pilot", "smooth, calm, proud", "smug", 1.8, "adult male, radio calm",
    { hat: { style: "captain", color: "#22305a", accent: "#f1c94a" }, top: { color: "#22305a", style: "pilot", accent: "#f1c94a" }, shades: "#14121a" }, "idle"),
  M("astronaut", "Nova", "work", "astronaut", "focused, brave, nerdy", "happy", 1.7, "adult female, clear",
    { hat: { style: "astronaut", color: "#f4f6fa", accent: "#8fc6e8" }, top: { color: "#f4f6fa", style: "spacesuit", accent: "#e2483a" } }, "wave", { item: "flag" }),
  M("scientist", "Igor", "work", "lab scientist / inventor", "excitable, odd, brilliant", "crazy", 1.72, "adult male, eccentric",
    { hair: { style: "messy", color: H.white }, glasses: "#2b2230", top: { color: "#eef2f6", style: "labcoat", accent: "#3f8a5a" } }, "think", { item: "flask" }),
  M("judge", "Judge Hart", "work", "judge", "stern, slow, fair", "skeptical", 1.7, "older female, grave",
    { hair: { style: "ringlets", color: H.white }, top: { color: "#1c1a20", style: "judge" }, glasses: "#2b2230" }, "idle", { item: "gavel" }),
  M("lawyer", "Ms. Lark", "work", "lawyer", "sharp, fast, confident", "smug", 1.7, "adult female, quick",
    { hair: { style: "bob", color: H.blonde }, top: { color: "#3a3f5c", style: "suit" }, neck: { style: "tie", color: "#c8323a" } }, "point", { item: "briefcase" }),
  M("nurse", "Nurse Ben", "care", "nurse", "gentle, steady, funny", "happy", 1.76, "adult male, soft",
    { hat: { style: "nurse", color: "#ffffff", accent: "#e2483a" }, top: { color: "#7fc7b7", style: "scrubs" } }, "idle", { item: "clipboard" }),
  M("paramedic", "Sam", "care", "paramedic", "calm, quick, practical", "focused", 1.74, "adult, steady",
    { hair: { style: "undercut", color: H.brown }, top: { color: "#2b6b4a", style: "jacket", accent: "#f1c94a" } }, "carry", { item: "medkit" }),
  M("vet", "Dr. Fern", "care", "vet / zookeeper", "gentle, outdoorsy, patient", "happy", 1.68, "adult female, kind",
    { hair: { style: "braids", color: H.auburn }, top: { color: "#7d8a55", style: "shirt" } }, "idle", { item: "carrot" }),
  M("builder2", "Tess", "work", "construction worker", "tough, funny, loud", "happy", 1.72, "adult female, loud",
    { hat: { style: "hardhat", color: "#f08a24" }, hair: { style: "highpony", color: H.dark }, top: { color: "#f5c21b", style: "vest", accent: "#5a6b7a" } }, "carry", { item: "hammer" }),
  M("cleaner", "Gil", "work", "janitor / cleaner", "quiet, observant, wise", "deadpan", 1.7, "older male, mumbly",
    { hat: { style: "flatcap", color: "#5a6b7a" }, top: { color: "#5a6b7a", style: "coverall", accent: "#e9dcc6" }, stache: "#5a3a26" }, "idle", { item: "broom" }),

  // ---------------------------------------------------------------- SPORT
  M("athlete", "Dash", "sport", "runner / athlete", "competitive, fast, cocky", "determined", 1.82, "young male, breathless",
    { hair: { style: "flattop", color: H.black }, hat: { style: "headband", color: "#e2483a" }, top: { color: "#f4f6fa", style: "tank", accent: "#e2483a" }, build: "slim" }, "cheer", { item: "trophy" }),
  M("footballer", "Rafa", "sport", "football player", "dramatic, quick, proud", "smug", 1.76, "young male, excited",
    { hair: { style: "mohawk", color: H.dark }, top: { color: "#2a7de1", style: "jersey", accent: "#ffffff", pattern: "number", patternColor: "#ffffff" } }, "cheer", { item: "ball" }),
  M("coach", "Coach Bear", "sport", "coach", "loud, tough, soft inside", "angry", 1.8, "adult male, shouting",
    { hat: { style: "cap", color: "#c0392b", accent: "#f4f6fa" }, top: { color: "#3a3f5c", style: "jacket", accent: "#c0392b" }, build: "stout", marks: ["stubble"] }, "point", { item: "stopwatch" }),
  M("referee", "Ref", "sport", "referee", "strict, alert, unloved", "skeptical", 1.76, "adult, whistle sharp",
    { hair: { style: "buzz", color: H.grey }, top: { color: "#f4f6fa", style: "tee", pattern: "stripes", patternColor: "#1c1a20" }, neck: { style: "whistle", color: "#c9ced8" } }, "point"),
  M("lifeguard", "Kira", "sport", "lifeguard / swimmer", "alert, sporty, cool", "neutral", 1.7, "young female, cool",
    { hair: { style: "highpony", color: H.blonde }, top: { color: "#e2483a", style: "tank" }, shades: "#14121a", neck: { style: "whistle", color: "#f5c21b" }, marks: ["sunburn"] }, "idle"),

  // ---------------------------------------------------------------- HISTORY
  M("king", "King Aldric", "history", "king", "vain, grand, childish", "smug", 1.78, "older male, regal",
    { hat: { style: "crown", color: "#f5c21b" }, beard: "#6a3d22", top: { color: "#b3263a", style: "royal", accent: "#f5c21b" } }, "point"),
  M("queen", "Queen Ida", "history", "queen", "clever, cold, elegant", "skeptical", 1.7, "older female, regal",
    { hat: { style: "tiara", color: "#f5c21b" }, hair: { style: "ringlets", color: H.auburn }, top: { color: "#5b3f8c", style: "gown", accent: "#f5c21b" }, neck: { style: "pearls", color: "#f6f1e8" } }, "idle", { item: "rose" }),
  M("knight", "Sir Gareth", "history", "knight", "brave, dim, loyal", "determined", 1.8, "adult male, booming",
    { hat: { style: "knight", color: "#b7c0ce" }, top: { color: "#b7c0ce", style: "armor", accent: "#b3263a" } }, "idle", { item: "sword" }),
  M("peasant", "Wat", "history", "peasant / villager", "poor, hopeful, funny", "happy", 1.68, "adult male, rustic",
    { hair: { style: "shag", color: H.brown }, top: { color: "#8a7a5a", style: "tunic" }, marks: ["soot"] }, "carry", { item: "sack" }),
  M("pharaoh", "Pharaoh Neb", "history", "pharaoh / ancient ruler", "proud, strange, grand", "smug", 1.76, "adult male, echoing",
    { hat: { style: "nemes", color: "#f5c21b", accent: "#2a7de1" }, top: { color: "#f4efe6", style: "pharaoh", accent: "#f5c21b" }, neck: { style: "collar", color: "#2a7de1" } }, "idle"),
  M("roman", "Marcus", "history", "Roman soldier / citizen", "disciplined, proud, sweaty", "focused", 1.76, "adult male, firm",
    { hat: { style: "roman", color: "#c9a13a", accent: "#c0392b" }, top: { color: "#c0392b", style: "armor", accent: "#c9a13a" } }, "idle", { item: "shield" }),
  M("viking", "Sigrid", "history", "viking", "fierce, loud, hungry", "determined", 1.76, "adult female, roaring",
    { hat: { style: "viking", color: "#b7c0ce", accent: "#ece2c0" }, hair: { style: "braids", color: H.platinum }, top: { color: "#7a5a3a", style: "tunic" } }, "cheer", { item: "axe" }),
  M("pirate", "Captain Mags", "history", "pirate captain", "greedy, funny, wild", "mischief", 1.74, "adult female, raspy",
    { hat: { style: "tricorn", color: "#22252e", accent: "#ece2c0" }, hair: { style: "wavy", color: H.black }, top: { color: "#8e2b3d", style: "trench", accent: "#f1c94a" }, marks: ["scar"] }, "point", { item: "telescope" }),
  M("cowboy", "Sheriff Clay", "history", "cowboy / sheriff", "slow, brave, dusty", "deadpan", 1.82, "adult male, drawl",
    { hat: { style: "cowboy", color: "#8a5a34", accent: "#3a2a20" }, top: { color: "#a85a3a", style: "vest", accent: "#e9dcc6" }, stache: "#3b2a20", marks: ["stubble"] }, "hips", { item: "lantern" }),
  M("inventor", "Mr. Cogsworth", "history", "Victorian inventor / gentleman", "proper, curious, fussy", "think", 1.76, "older male, posh",
    { hat: { style: "top", color: "#3b2f2a", accent: "#8a6a4a" }, stache: "#8a6a4a", top: { color: "#5a4a3a", style: "coat", accent: "#f1c94a" }, neck: { style: "bow", color: "#22252e" } }, "think", { item: "lightbulb" }),
  M("monk", "Brother Tobias", "history", "monk / scribe", "quiet, patient, serene", "content", 1.7, "adult male, hushed",
    { hair: { style: "horseshoe", color: H.brown }, top: { color: "#7a5a3a", style: "monk", accent: "#e9dcc6" } }, "idle", { item: "candle" }),
  M("caveman", "Ug", "history", "caveman / early human", "curious, simple, brave", "deadpan", 1.7, "adult male, grunting",
    { hair: { style: "shag", color: H.dark }, beard: "#3b2a20", top: { color: "#a0743a", style: "caveman" } }, "carry", { item: "bone" }),
  M("flapper", "Dot", "history", "1920s jazz singer", "glamorous, bold, funny", "smug", 1.66, "adult female, sultry",
    { hair: { style: "bangs", color: H.black }, hat: { style: "headband", color: "#f5c21b" }, top: { color: "#2fb3a6", style: "dress", accent: "#f5c21b" }, neck: { style: "pearls", color: "#f6f1e8" }, marks: ["lipstick"] }, "cheer", { item: "mic" }),

  // ---------------------------------------------------------------- FANTASY and costumes
  M("wizard", "Morwen", "fantasy", "wizard", "mysterious, old, grumpy", "suspicious", 1.74, "elderly, deep, slow",
    { hat: { style: "wizard", color: "#3f4fa8", accent: "#f5c21b" }, beard: "#ecebf0", top: { color: "#3f4fa8", style: "robe", accent: "#f5c21b", pattern: "stars", patternColor: "#f5c21b" } }, "point", { item: "wand" }),
  M("witch", "Hazel", "fantasy", "witch", "cackling, clever, chaotic", "mischief", 1.68, "adult female, cackling",
    { hat: { style: "witch", color: "#2b2230", accent: "#7a4fc9" }, hair: { style: "long", color: H.green }, top: { color: "#2b2230", style: "robe", accent: "#7a4fc9" } }, "point", { item: "broom" }),
  M("hero", "Captain Bolt", "fantasy", "superhero", "proud, kind, clumsy", "smug", 1.84, "adult male, heroic",
    { hair: { style: "pompadour", color: H.black }, top: { color: "#2a7de1", style: "supersuit", accent: "#f5c21b" }, build: "regular" }, "hips"),
  M("villain", "Dr. Gloom", "fantasy", "villain", "dramatic, petty, evil", "scheming", 1.8, "adult male, hissing",
    { hair: { style: "slick", color: H.white }, top: { color: "#1c1a20", style: "cape", accent: "#b3263a" }, glasses: "#b3263a", marks: ["scar", "eyebags"] }, "shrug"),
  M("elf", "Twig", "fantasy", "elf / helper", "cheerful, tiny, busy", "happy", 1.2, "child-like, squeaky",
    { hat: { style: "elf", color: "#3f8a5a", accent: "#c0392b" }, hair: { style: "pixie", color: H.ginger }, top: { color: "#3f8a5a", style: "tunic", accent: "#c0392b" }, heightHeads: KID, marks: ["freckles"] }, "wave", { item: "gift" }),
  M("santa", "Father Frost", "fantasy", "winter gift-bringer", "jolly, warm, tired", "happy", 1.76, "elderly male, jolly",
    { hat: { style: "santa", color: "#c0392b", accent: "#ffffff" }, beard: "#ffffff", top: { color: "#c0392b", style: "coat", accent: "#ffffff" }, build: "stout", marks: ["rosy"] }, "carry", { item: "gift" }),
  M("zombie", "Gary", "fantasy", "zombie (Halloween)", "slow, hungry, sad", "zombie", 1.74, "adult male, groaning",
    { hair: { style: "messy", color: H.dark }, top: { color: "#6b7a5a", style: "shirt" }, marks: ["scar", "eyebags"] }, "idle"),
  M("party", "Birthday Max", "fantasy", "party guest", "excited, sugary, loud", "happy", 1.14, "child, shrieking",
    { hat: { style: "party", color: "#e07aa8", accent: "#f5c21b" }, hair: { style: "curl", color: H.brown }, top: { color: "#f5c21b", style: "tee", pattern: "dots", patternColor: "#e2483a" }, heightHeads: KID }, "cheer", { item: "balloon" }),

  // ---------------------------------------------------------------- MORE EVERYDAY
  M("barber", "Lou", "everyday", "barber / hairdresser", "chatty, vain, precise", "smug", 1.74, "adult male, smooth talker",
    { hair: { style: "pompadour", color: H.black }, stache: "#1f1a22", top: { color: "#e9dcc6", style: "suspenders", accent: "#8e2b3d" } }, "idle", { item: "shears" }),
  M("librarian", "Mrs. Page", "everyday", "librarian", "quiet, strict, kind", "skeptical", 1.64, "older female, hushed",
    { hair: { style: "sidebun", color: H.auburn }, glasses: "#2b2230", top: { color: "#2a7f86", style: "cardigan", accent: "#f4efe6" } }, "idle", { item: "book" }),
  M("neighbor", "Hank", "everyday", "the neighbour", "loud, friendly, nosy", "happy", 1.8, "adult male, loud",
    { hair: { style: "mullet", color: H.chestnut }, top: { color: "#f4f6fa", style: "tank" }, build: "stout", marks: ["stubble", "sunburn"] }, "idle", { item: "mug" }),
  M("musician", "Jaz", "everyday", "street musician", "cool, dreamy, broke", "content", 1.76, "adult, warm, husky",
    { hair: { style: "dreads", color: H.black }, top: { color: "#6d4fc2", style: "varsity", accent: "#f4efe6" } }, "idle", { item: "guitar" }),
  M("skater", "Rio", "everyday", "skater teen", "chill, daring, funny", "mischief", 1.6, "teen male, laid back",
    { hair: { style: "fauxhawk", color: H.blonde }, top: { color: "#f39a2b", style: "tee", pattern: "ringer", patternColor: "#22252e" }, heightHeads: TEEN }, "idle", { item: "lollipop" }),
  M("abuela", "Abuela Ines", "family", "grandmother", "warm, bossy, feeds everyone", "happy", 1.52, "elderly female, warm",
    { hair: { style: "bun", color: H.grey }, top: { color: "#c0392b", style: "dress", accent: "#f4efe6", pattern: "flowers", patternColor: "#f5c21b" }, neck: { style: "scarf", color: "#2a7f86" }, marks: ["wrinkles", "rosy"] }, "idle", { item: "rollingpin" }),
  M("nerd", "Ollie", "everyday", "the nerd", "brainy, awkward, honest", "shy", 1.68, "young male, nasal",
    { hair: { style: "bowl", color: H.ginger }, glasses: "#2b2230", top: { color: "#4f78b0", style: "vest", accent: "#f4efe6", pattern: "argyle", patternColor: "#f5c21b" }, neck: { style: "bow", color: "#c0392b" }, marks: ["freckles"] }, "think", { item: "calculator" }),
  M("gymbro", "Brock", "everyday", "bodybuilder / gym coach", "proud, loud, sweet", "smug", 1.84, "adult male, booming",
    { hair: { style: "crew", color: H.dark }, top: { color: "#e2483a", style: "tank" }, build: "stout" }, "hips", { item: "banana" }),
  M("baker", "Bea", "everyday", "baker", "early, cheerful, floury", "happy", 1.64, "adult female, sing-song",
    { hat: { style: "chefcap", color: "#fbfaf6" }, hair: { style: "braids", color: H.chestnut }, top: { color: "#e07aa8", style: "apron", accent: "#f4efe6" }, marks: ["rosy"] }, "idle", { item: "baguette" }),
  M("taxi", "Ravi", "everyday", "taxi / bus driver", "fast, chatty, tired", "deadpan", 1.72, "adult male, fast",
    { hat: { style: "flatcap", color: "#3a3f5c" }, stache: "#1f1a22", top: { color: "#f5c21b", style: "polo" } }, "idle", { item: "key" }),
  M("detective", "Inspector Grey", "work", "detective", "sharp, cold, curious", "suspicious", 1.8, "adult male, dry, slow",
    { hat: { style: "deerstalker", color: "#8a7a5a", accent: "#5a4a3a" }, top: { color: "#8a6a4a", style: "trench", accent: "#5a4a3a" }, build: "slim" }, "think", { item: "magnifier" }),
  M("spy", "Agent Kay", "work", "secret agent", "cool, silent, smug", "smug", 1.78, "adult, low, clipped",
    { hair: { style: "slick", color: H.dark }, shades: "#14121a", top: { color: "#22252e", style: "tux" } }, "idle", { item: "briefcase" }),
  M("singer", "Lyra", "everyday", "singer / performer", "dramatic, kind, loud", "proud", 1.68, "adult female, singing",
    { hair: { style: "halfup", color: H.auburn }, top: { color: "#8e2b6b", style: "gown", accent: "#f5c21b" }, marks: ["lashes", "lipstick"] }, "idle", { item: "mic" }),
  M("painter", "Remy", "everyday", "painter / artist", "dreamy, messy, proud", "content", 1.72, "adult male, soft",
    { hat: { style: "beret", color: "#2b2230" }, hair: { style: "shag", color: H.dark }, top: { color: "#f4f6fa", style: "tee", pattern: "dots", patternColor: "#e2483a" }, marks: ["paint"] }, "idle", { item: "paintbrush" }),
  M("magician", "Zara", "fantasy", "magician", "showy, sly, charming", "mischief", 1.72, "adult female, theatrical",
    { hat: { style: "top", color: "#3a1f5c", accent: "#f5c21b" }, top: { color: "#22252e", style: "cloak", accent: "#8e2b6b" } }, "point", { item: "wand" }),
  M("clown", "Bingo", "fantasy", "clown / entertainer", "silly, loud, sad inside", "happy", 1.74, "adult male, honky",
    { hair: { style: "afro", color: H.blue }, top: { color: "#f5c21b", style: "jersey", pattern: "dots", patternColor: "#e2483a" }, neck: { style: "ruff", color: "#f4f6fa" }, marks: ["rednose"] }, "cheer", { item: "balloon" }),
  M("toddler", "Bub", "family", "toddler", "curious, sticky, loud", "happy", 0.95, "toddler, babbling",
    { hair: { style: "babycurl", color: H.blonde }, top: { color: "#8fc6e8", style: "pajamas", pattern: "stars", patternColor: "#f5c21b" }, heightHeads: 2.25, marks: ["rosy"] }, "idle", { item: "teddy" }),
  M("hipster", "Finn", "everyday", "hipster / start-up founder", "smug, kind, trendy", "smug", 1.8, "adult male, mellow",
    { hair: { style: "manbun", color: H.brown }, beard: "#6a3d22", top: { color: "#c9a13a", style: "cardigan", accent: "#f4efe6" } }, "idle", { item: "coffee" }),
  M("punk", "Spike", "everyday", "punk / rebel", "loud, loyal, rebellious", "mischief", 1.74, "young, raspy",
    { hair: { style: "punk", color: H.pink }, top: { color: "#22252e", style: "jacket", accent: "#c9ced8" }, neck: { style: "chain", color: "#c9ced8" } }, "shrug", { item: "mic" }),
  M("retiree", "Old Ken", "family", "retiree", "slow, wise, grumpy", "deadpan", 1.7, "elderly male, slow",
    { hair: { style: "receding", color: H.white }, top: { color: "#8a9a7a", style: "sweater" }, glasses: "#2b2230", marks: ["wrinkles", "eyebags"] }, "idle", { item: "newspaper" }),
  M("beekeeper", "Hon", "work", "beekeeper / gardener", "calm, slow, patient", "content", 1.7, "adult, calm",
    { hat: { style: "beekeeper", color: "#f4f1ea", accent: "#3a3f5c" }, top: { color: "#f4f1ea", style: "coverall", accent: "#c9a13a" } }, "idle", { item: "wateringcan" }),
  M("diver", "Marina", "work", "diver / marine biologist", "brave, nerdy, calm", "happy", 1.68, "adult female, bubbly",
    { hat: { style: "divemask", color: "#2a9d8f", accent: "#8fc6e8" }, hair: { style: "wavy", color: H.black }, top: { color: "#22305a", style: "wetsuit", accent: "#2a9d8f" } }, "idle", { item: "net" }),
  M("scout", "Sunny", "family", "scout / camper kid", "brave, eager, lost", "happy", 1.2, "child, eager",
    { hat: { style: "backcap", color: "#3f8a5a" }, hair: { style: "pigtails", color: H.chestnut }, top: { color: "#7d8a55", style: "polo" }, neck: { style: "neckerchief", color: "#f08a24" }, heightHeads: KID, marks: ["freckles"] }, "point", { item: "binoculars" }),
  // ---------------------------------------------------------------- MORE HISTORY
  M("philosopher", "Sophos", "history", "ancient philosopher / teacher", "wise, slow, curious", "think", 1.72, "elderly male, calm",
    { hat: { style: "laurel", color: "#6a8a3a" }, hair: { style: "receding", color: H.white }, beard: "#ecebf0", top: { color: "#f4efe6", style: "toga", accent: "#2a7de1" } }, "think", { item: "scroll" }),
  M("princess", "Princess Elin", "history", "princess", "brave, curious, polite", "happy", 1.62, "young female, bright",
    { hat: { style: "tiara", color: "#f5c21b" }, hair: { style: "hime", color: H.black }, top: { color: "#e07aa8", style: "gown", accent: "#f5c21b" } }, "idle", { item: "rose" }),
  M("maid", "Molly", "history", "maid / servant", "busy, clever, cheeky", "deadpan", 1.62, "young female, quick",
    { hat: { style: "bonnet", color: "#f4f6fa", accent: "#22252e" }, hair: { style: "bun", color: H.auburn }, top: { color: "#22252e", style: "dress", accent: "#f4f6fa" } }, "idle", { item: "broom" }),
  M("frontier", "Belle", "history", "frontier pioneer", "tough, proper, brave", "skeptical", 1.66, "adult female, drawl",
    { hat: { style: "bonnet", color: "#d8c08a", accent: "#8a5a34" }, hair: { style: "ringlets", color: H.blonde }, top: { color: "#4f78b0", style: "dress", accent: "#f4efe6", pattern: "check", patternColor: "#f4efe6" } }, "idle", { item: "basket" }),
  M("soldier", "Private Lee", "history", "soldier (any era, generic)", "young, scared, brave", "nervous", 1.76, "young male, tense",
    { hat: { style: "helmet", color: "#6b7a4a" }, top: { color: "#6b7a4a", style: "uniform", accent: "#c9a13a" }, neck: { style: "medal", color: "#f5c21b" } }, "idle"),
  M("deckhand", "Scurvy Sam", "history", "pirate deckhand / sailor", "loyal, dim, salty", "happy", 1.7, "adult male, gravel",
    { hat: { style: "bandana", color: "#c0392b" }, top: { color: "#f4f6fa", style: "tunic", pattern: "hstripes", patternColor: "#22305a" }, marks: ["stubble", "scar"] }, "carry", { item: "oar" }),
  M("admiral", "Admiral Brae", "history", "navigator / ship captain", "proud, brave, stubborn", "smug", 1.78, "older male, commanding",
    { hat: { style: "tricorn", color: "#22305a", accent: "#f5c21b" }, hair: { style: "ringlets", color: H.white }, top: { color: "#22305a", style: "coat", accent: "#f5c21b" } }, "point", { item: "map" }),
  M("jester", "Motley", "history", "jester / court fool", "silly, sharp, brave", "mischief", 1.66, "adult, squeaky",
    { hat: { style: "jester", color: "#c0392b", accent: "#f5c21b" }, top: { color: "#3f6fd6", style: "tunic", pattern: "check", patternColor: "#f5c21b" } }, "cheer", { item: "ball" }),
  M("samurai", "Ronin Kenji", "history", "historical warrior (generic armour)", "calm, proud, loyal", "determined", 1.76, "adult male, low, calm",
    { hat: { style: "kabuto", color: "#2b2230", accent: "#c9a13a" }, top: { color: "#8e2b3d", style: "armor", accent: "#2b2230" } }, "idle"),
  // ---------------------------------------------------------------- MORE COSTUMES
  M("vampire", "Count Nocturne", "fantasy", "vampire (Halloween costume)", "dramatic, polite, spooky", "scheming", 1.82, "adult male, rolling accent",
    { hair: { style: "slick", color: H.black }, top: { color: "#22252e", style: "cloak", accent: "#b3263a" }, neck: { style: "amulet", color: "#b3263a" }, marks: ["eyebags"] }, "shrug", { item: "candle" }),
  M("bunny", "Hoppy", "fantasy", "kid in a bunny costume", "bouncy, sweet, shy", "shy", 1.1, "child, giggly",
    { hat: { style: "bunny", color: "#f4f6fa", accent: "#e07aa8" }, top: { color: "#f4f6fa", style: "pajamas" }, heightHeads: KID, marks: ["rosy"] }, "wave", { item: "carrot" }),
  M("reindeer", "Rudi", "fantasy", "reindeer costume", "jolly, clumsy, warm", "happy", 1.7, "adult, jolly",
    { hat: { style: "antlers", color: "#8a5a34" }, top: { color: "#c0392b", style: "sweater", pattern: "zigzag", patternColor: "#f4f6fa" }, marks: ["rednose"] }, "cheer", { item: "gift" }),
  M("angel", "Gabi", "fantasy", "angel costume / good conscience", "kind, calm, preachy", "content", 1.66, "adult female, soft",
    { hat: { style: "halo", color: "#f5c21b" }, hair: { style: "wavy", color: H.platinum }, top: { color: "#f4f6fa", style: "gown", accent: "#f5c21b" } }, "idle", { item: "lightbulb" }),
  M("devil", "Imp", "fantasy", "devil costume / bad conscience", "tempting, sly, funny", "mischief", 1.6, "adult, whispery",
    { hat: { style: "horns", color: "#c0392b" }, hair: { style: "spiky", color: H.black }, top: { color: "#c0392b", style: "cape", accent: "#22252e" } }, "shrug", { item: "money" }),
  M("heroine", "Volt", "fantasy", "superhero (second hero)", "fast, brave, cheeky", "smug", 1.7, "adult female, upbeat",
    { hair: { style: "highpony", color: H.pink }, top: { color: "#e07aa8", style: "supersuit", accent: "#22252e" } }, "hips"),
].map(([k, v]) => [k, v as CastMember]));

/** The recurring ensemble in billing order. */
export const CORE_IDS = Object.keys(OUR_CAST).filter((k) => OUR_CAST[k].group === "core");

/** A board cast entry: `cast: { milo: castEntry("milo") }`; `more` overrides look fields for one scene (a wet coat, a hat). */
export function castEntry(id: keyof typeof OUR_CAST | string, more: Partial<BobbleSpec> = {}): { spec: BobbleSpec; height: number } {
  const m = OUR_CAST[id];
  if (!m) throw new Error("unknown cast member " + id);
  return { spec: { ...m.spec, ...more }, height: m.height };
}
/** The signature pose with the character's prop and resting face. */
export function signaturePose(id: string): KPose {
  const m = OUR_CAST[id], base = BOBBLE_POSES[m.pose] ?? {};
  return { ...base, expr: m.rest, ...(m.prop ? { hold: m.prop } : {}) };
}

// ---------------------------------------------------------------- extras: endless background people
const EX_HAIR = ["cap", "side", "spiky", "curly", "long", "bob", "bun", "pony", "buzz", "bald", "afro", "wavy", "messy", "pixie", "braids", "undercut", "curtains", "shag", "puffs", "highpony", "combover", "slick"] as const;
const EX_TOP = ["tee", "shirt", "jacket", "hoodie", "sweater", "coat", "dress", "cardigan", "vest", "polo"] as const;
/** muted, mid-light torso colours so extras sit behind the core cast */
const EX_COL = ["#7a8aa0", "#9a8a72", "#8a9a7a", "#a07a7a", "#7a7a9a", "#9a7a90", "#6f8f8a", "#a08a5a", "#8a8a8a", "#6a7a8a", "#b08a7a", "#7a906a"];
const EX_HCOL = [H.black, H.dark, H.brown, H.chestnut, H.auburn, H.blonde, H.grey, H.white, H.ginger];
/** A deterministic background person (seed = any integer). Same seed, same person. */
export function extra(seed: number): BobbleSpec {
  let x = (seed * 2654435761) >>> 0;
  const pick = <T,>(a: readonly T[]) => { x = (x * 1664525 + 1013904223) >>> 0; return a[x % a.length]; };
  const hair = pick(EX_HAIR), top = pick(EX_TOP), col = pick(EX_COL), hc = pick(EX_HCOL);
  const age = pick(["adult", "adult", "adult", "old", "teen", "kid"] as const);
  const marks = age === "old" ? ["wrinkles"] : pick([[], [], [], ["freckles"], ["stubble"]] as string[][]);
  return mk("extra" + seed, { hair: { style: hair as never, color: age === "old" ? pick([H.grey, H.white]) : hc },
    top: { color: col, style: top as never }, build: pick(["slim", "regular", "regular", "stout"] as const),
    heightHeads: age === "kid" ? KID : age === "teen" ? TEEN : undefined, marks,
    ...(pick([0, 0, 0, 0, 1]) ? { glasses: "#2b2230" } : {}) });
}
