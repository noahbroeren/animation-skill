# Characters: which kinds are possible, and what works

How this was built (2026-11-10):
- Web research: channel stats, design and perception papers, lip-sync tooling docs.
- Combined with our own measured study of @RicksClips3000 (`references/styles/toonworld-explainer.md`) and the engine as it exists (`engine/src/lib/characters/toon.ts`: styles `classic` and `toonworld`, 10 expressions, float `mouth`, `blinkAt`, `mouthAt`, `walkPose`, `idlePose`).

Read the numbers with care:
- **Subscriber and view counts** come from third-party trackers (vidIQ, OutlierKit, CreatorDB, HypeAuditor, AIR) or Wikipedia. They are snapshots from different dates and often disagree by 5-15 %. Each figure has its source and date next to it.
- **[unverified]** marks claims I could not confirm from a primary or reasonably reliable source.
- **Correlation is not causation.** Big channels with a given style show that the style *can* carry an audience, not that it causes views. Across all the evidence, the same three things matter more than the style itself:
  - a consistent, recurring, instantly readable cast
  - a script or hook formula
  - production cadence

---

## 1. Executive summary

### 1.1 What the evidence says, in one paragraph

Realism does not buy appeal. In a controlled perception study (Zell et al., SIGGRAPH Asia 2015, [TU Dortmund](https://ls7-gv.cs.tu-dortmund.de/publications/2015-stylize.page/)):
- shape stylization drove perceived realism
- **material** realism drove appeal and eeriness, and realistic materials generally *reduced* appeal
- realism was a poor predictor of appeal

On YouTube, extremely simple characters sit at the top of the subscriber charts:
- stick figures: Alan Becker, 32.4 M subs ([AIR, Feb 2026](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026))
- big-head storytime: TheOdd1sOut 20.7 M, Jaiden Animations 15.3 M ([Wikipedia, Sep 2026](https://en.wikipedia.org/wiki/Jaiden_Animations))
- pencil doodles: Pencilmation, 20.4 M ([Wikipedia](https://en.wikipedia.org/wiki/Pencilmation))

Next to them sits one realistic-3D outlier with the biggest fact-short audience: Zack D. Films, about 27-29 M subs and 71.8 B views ([vidIQ, Oct 2026](https://vidiq.com/youtube-stats/channel/%40zackdfilms/), [OutlierKit](https://outlierkit.com/channel/zackdfilms)).

So two different strategies win:
1. **cheap, readable, expressive 2D** that ships often
2. **visceral "it's happening to a body" 3D**, which wins because the topic is physical and the hook is "what would it feel like"

### 1.2 Ranked for SHORT-FORM (vertical, 20-70 s, video-forge fit included)

| # | Type | Why it ranks here |
|---|---|---|
| 1 | **Flat bean in 3D world** (`toonworld`, exists) | Measured: 418.7 M views over 149 shorts, median about 8 M in the current era. Our engine already matches about half its metrics. Fully parametric and cheap. |
| 2 | **Object characters / face-on-anything** | The strongest hook per pixel: "the manhole cover explains itself". Proven by Annoying Orange (13.6 M subs, [AIR](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026)) and Skibidi Toilet (DaFuq!?Boom!, over 41 M subs by May 2024, [Looper](https://www.looper.com/1577914/origins-of-skibidi-toilet-explained)). A face rig on any Path2D or mesh is a small build. |
| 3 | **Realistic / semi-real 3D humans + x-ray** | The highest ceiling for body, physics and "what if" facts (Zack D. Films). Expensive: needs a GLTF path, rigs and mocap clips. Uncanny risk. |
| 4 | **Anthropomorphic animals / critters** | A universal appeal tool: Kindchenschema plus species shorthand. Simon's Cat (about 6.1 M, [Guinness](https://www.guinnessworldrecords.com/world-records/436544-most-subscribers-for-an-animated-animal-on-youtube)), Peppa Pig (44.2 M, [vidIQ](https://vidiq.com/youtube-stats/channel/@peppapigofficial/)), Lucas the Spider (66 M views on 6 clips of 30 s in 2018, [Tubefilter](https://tubefilter.com/2018/03/12/lucas-the-spider-viral-youtube-acclaim/)). |
| 5 | **Stick figures** | The fastest to make and pure motion readability. Alan Becker has 32.4 M. Weak for faces and dialogue. |
| 6 | **Mascot / blob** | Endlessly expressive with squash & stretch. Oddbods has about 20-28 M ([Wikipedia](https://www.wikipedia.org/wiki/Oddbods)). A good channel host or brand face. |
| 7 | **Skeleton / x-ray anatomical** | A current Shorts format. One unnamed channel is claimed at 228 M views over 59 videos ([vendor blog, unverified](https://aituber-marketing.pages.dev/blog/what-happens-to-your-body-video-format)). Can be done stylized in 2D cheaply. |
| 8 | **Cells / organs / microbes** | The best fit for biology topics. Blob tech reused. |
| 9 | **Chibi / big-head storytime** | Strong appeal and a strong face read at phone size. More of a long-form channel identity. |

### 1.3 Ranked for LONG-FORM (8-25 min, 16:9)

| # | Type | Why |
|---|---|---|
| 1 | **Flat vector people + mascot animal** (Kurzgesagt-like) | Kurzgesagt about 25 M subs ([CreatorDB](https://creatordb.app/creatorstats/kurzgesagt-in-a-nutshell/)), TED-Ed 22.4 M. Faces are minimal, so the narration carries the video. Scales to hundreds of shots. |
| 2 | **Big-head storytime** (Jaiden, Odd1sOut, Domics 7.2 M) | Narrator-as-character builds parasocial loyalty over long runtimes. |
| 3 | **Simple caricature history figures** (OverSimplified) | About 10 M subs ([CreatorDB, Jul 2026](https://creatordb.app/creatorstats/oversimplified/)) from about 6 videos a year ([case study](https://becomeviral.com/blog/oversimplified-case-study)). Comedy comes from brows and mouths on simple heads. |
| 4 | **Toonworld bean in 3D** | Reuses everything we built. Camera-driven, so it survives long runtimes. |
| 5 | **Whiteboard / sketch** | An evergreen explainer format. The RSA Animate "Changing Education Paradigms" video is claimed at over 50 M views ([VideoScribe, vendor](https://blog.videoscribe.co/this-scribe-could-change-your-classroom-forever)). The learning-benefit evidence is mixed ([Wikipedia](https://en.wikipedia.org/wiki/Whiteboard_animation)). |
| 6 | **Stylized 3D** (Glitch) | The Amazing Digital Circus pilot passed 100 M views in a month ([Glitch](https://glitchprod.com/digital-circus/-Official-website)). Studio-scale effort, not a code-first target. |

### 1.4 What to build next (detail in section 5)

1. A shared **FaceRig + visemes** module, used by every style.
2. Then nine new styles, in this order: `object`, `critter`, `blob`, `stick`, `chibi`, `flatvec`, `microbe`, `sketch`, `rubberhose`.
3. Then one 3D path: `gltf` (stylized or realistic humans, with an x-ray material).

---

## 2. Taxonomy (25 types)

**Effort scale** (for one developer on our stack, through to a style that can be animated and reused):
- **S** = 1 day or less
- **M** = 2-4 days
- **L** = 1-2 weeks
- **XL** = more than 2 weeks, or external assets or tools needed

**"Phone read"** means how well the face and pose read at 1080x1920 when the character is about 25-40 % of frame height.

### 2.1 Flat bean, 2D-in-3D (toonworld). EXISTS

- **Look:**
  - 3.5-head bean people
  - single-stroke ink limbs and dot hands
  - lidded half-disc eyes
  - plum thick-thin outline
  - cel crescent shading lit by the 3D scene
  - billboards in an inked, painted 3D town
- **Examples:** @RicksClips3000. Our own measurement: 149 shorts, 418.7 M views; current-era median about 8 M, top 33 M (`styles/toonworld-explainer.md`).
- **Why it works:**
  - the face reads at phone size because eyes and mouth are high-contrast black on skin
  - a 2D card costs nothing to pose
  - the 3D world gives parallax and camera glides, the real retention engine of that channel
  - fits any history or science topic
- **Weak:**
  - billboards break at more than about 35° camera yaw
  - no side or back views yet
  - limited hand acting (dot hands)
- **Animation needs:** blink (4 f lid), mouth openness, walk 2.6 steps/s, swaps hidden by a blink, props carry jokes.
- **Our stack:** done (`style: "toonworld"`). Missing pieces:
  - visemes (section 4)
  - `view: front | 3q | side` drawings
  - per-hand poses (open, point, fist) instead of dots
  - Effort for these: M.

### 2.2 Stick figures

- **Look:**
  - circle head, single lines for spine and limbs
  - often no face, or dot eyes
  - colour codes identity (Alan Becker's orange, blue, green, yellow and red figures)
- **Examples:**
  - Alan Becker, 32.4 M subs ([AIR, Feb 2026](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026)); Animator vs. Animation started in 2006 ([Wikipedia](https://www.wikipedia.org/wiki/Alan_Becker))
  - Explosm / Cyanide & Happiness (stick-adjacent: big round heads, thin bodies), 12.8 M ([vidIQ, Jul 2025](https://vidiq.com/youtube-stats/channel/UCWXCrItCF6ZgXrdozUS-Idw))
- **Why it works:**
  - zero design friction
  - pose and motion ARE the acting
  - silhouettes read perfectly at any size
  - the fastest to animate (5-9 joints)
  - viewers project themselves onto them
- **Weak:**
  - little facial range
  - hard to tell characters apart without colour or props
  - looks "cheap" in serious documentary contexts
- **Animation needs:**
  - strong key poses, arcs, smears and impact frames
  - walk and run cycles with real weight
  - lip sync optional (a simple mouth line, or none)
- **Our stack:** Canvas2D. Use a 2-bone IK limb helper (shoulder→elbow→hand, hip→knee→foot) with round caps. The face is optional, using FaceRig in "minimal" mode. Effort: **S-M** (IK and pose library is the M part).

### 2.3 Chibi / big-head storytime

- **Look:**
  - head 40-50 % of body height (2-2.5 heads)
  - tiny body, stubby limbs
  - huge eyes, small or no nose
  - YouTube storytime variant: flat colours, thick outline, simple hoodie bodies (Jaiden, TheOdd1sOut, Domics)
- **Examples:**
  - Jaiden Animations 15.3 M subs / 3.2 B views ([Wikipedia, Sep 2026](https://en.wikipedia.org/wiki/Jaiden_Animations))
  - TheOdd1sOut 20.7 M, Domics 7.2 M ([AIR](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026))
  - Chibi as a convention: 2-3 heads tall ([Clip Studio tips](https://tips.clip-studio.com/en-us/articles/4953))
- **Why it works:**
  - maximum face area, so the best emotional read at phone size
  - baby-schema cuteness (section 3.4)
  - a cheap body; a narrator avatar
- **Weak:**
  - weak at physical action and real-world scale
  - everything looks childlike; can trivialise serious topics
- **Animation needs:**
  - many expressions (12-16)
  - full visemes (because the face is big)
  - head bobs, hops instead of walks, "take" reactions
- **Our stack:** a Canvas2D style `chibi`, reusing the toon.ts body code with `heightHeads` 2-2.5. Larger eye set (oval whites + pupils + catchlight), an optional hood or hair shell. Effort: **M**.

### 2.4 Mascot / blob

- **Look:** one main volume (sphere, bean, drop, marshmallow) with face, tiny or no limbs, often furry or plush.
- **Examples:**
  - Oddbods: round-bodied creatures in fuzzy suits, wordless; about 20-28 M subs depending on date ([Wikipedia](https://www.wikipedia.org/wiki/Oddbods), [Google blog](https://blog.google/topics/google-asia/oddbods))
  - Kurzgesagt's duck-like birds as a recurring mascot ([Wikipedia](https://www.wikipedia.org/wiki/Kurzgesagt))
  - Duolingo's characters use a parametric mouth system ([Duolingo blog](https://blog.duolingo.com/world-character-visemes))
- **Why it works:**
  - the circle shape language reads as friendly
  - squash & stretch shows clearly on a single volume
  - silhouettes stay unique when ears or antennae are added
  - no anatomy to get wrong; works wordless (good for global audiences)
- **Weak:**
  - no hands means no gestures unless you add nubs
  - can feel generic unless you give it one strong feature (colour, horn, scar)
- **Animation needs:** squash & stretch (volume-preserving), bounce locomotion, eye-only acting, optional visemes.
- **Our stack:**
  - Canvas2D superellipse body (reuse `beanHead()` at body scale)
  - spring-driven jiggle on 2-4 attachment points (ears, antennae, tufts)
  - FaceRig
  - Effort: **S-M**

### 2.5 Anthropomorphic animals / critters

- **Look:** animal heads and bodies with human acting. The range runs from four-legged and natural (Simon's Cat) to two-legged and clothed (Peppa, Bluey, Zootopia).
- **Examples:**
  - Simon's Cat: hand-drawn black-and-white, about 6.1 M subs (undated), Guinness "most subscribers for an animated animal" entry ([Guinness](https://www.guinnessworldrecords.com/world-records/436544-most-subscribers-for-an-animated-animal-on-youtube), [Tubefilter](https://www.tubefilter.com/2015/04/16/simons-cat-off-to-the-vet-color-crowdfunding/amp/))
  - Peppa Pig official, 44.2 M ([vidIQ](https://vidiq.com/youtube-stats/channel/@peppapigofficial/))
  - Lucas the Spider: a Pixar-trained animator, a stylized CG jumping spider; 66 M views on six 30 s clips ([Tubefilter 2018](https://tubefilter.com/2018/03/12/lucas-the-spider-viral-youtube-acclaim/))
- **Why it works:**
  - species gives personality for free (cat = aloof, dog = loyal)
  - sidesteps human representation issues
  - the cuteness lever is strong
  - very wide topic fit (nature facts, fables, kids)
- **Weak:**
  - every species needs its own head drawing, turnarounds and possibly a quadruped walk
  - the furry or uncanny risk in realistic 3D
- **Animation needs:**
  - two-legged critters reuse the human walk
  - four-legged critters need a 4-beat walk (LH-LF-RH-RF) or a 2-beat trot
  - tails, ears and whiskers as secondary motion
  - species-specific idles (pecking, tail flick)
- **Our stack:**
  - Canvas2D style `critter` with species presets
  - Effort: **M** per first species, **S** per extra species once the preset system exists

### 2.6 Object characters (talking items)

- **Look:** a real object (fruit, toilet, coin, organ, planet, manhole cover) with eyes and a mouth, sometimes limbs (BFDI: thin black limbs on objects).
- **Examples:**
  - Annoying Orange, 13.6 M ([AIR](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026)); over 1 B views by Jan 2012 ([Tubefilter](https://www.tubefilter.com/2012/01/27/the-annoying-orange-joins-the-billion-views-club/amp/))
  - Skibidi Toilet (Source Filmmaker heads in toilets): over 41 M subs by May 2024 ([Looper](https://www.looper.com/1577914/origins-of-skibidi-toilet-explained)); over 65 B franchise views by Nov 2023 ([Wikipedia](https://www.wikipedia.com/wiki/Skibidi_Toilet))
  - Battle for Dream Island (jacknjellify), about 2.5 M subs / 1.8 B views ([Wikipedia mirror, weak](https://wiki.riteme.site/wiki/Wikipedia:OSC))
- **Why it works:**
  - an instant hook: the subject of the video IS the narrator ("I'm a manhole cover, and I'm round for a reason")
  - zero character-design debt, since the object is already iconic
  - perfect topic fit for explainers
  - an absurdity pattern-interrupt in the feed
- **Weak:**
  - acting range is limited by the object's rigidity, so lean on squash, tilt and face
  - can read as cheap if the object rendering is poor
- **Animation needs:** face (eyes, brows, mouth) with visemes; squash & stretch of the whole object; hop locomotion; optional noodle limbs.
- **Our stack:**
  - **2D:** FaceRig drawn on top of any Path2D or image, with automatic face placement (centroid plus an upper-third offset).
  - **3D:** render the FaceRig to a CanvasTexture and apply it as a decal or plane on the mesh. Either the 3D object or a toon-shaded GLTF prop gets eyes.
  - Effort: **S** (2D) / **M** (3D decal).
  - The highest value-for-effort item in this document.

### 2.7 Kurzgesagt-style flat vector (birds and faceless people)

- **Look:**
  - no outlines; flat colour fields with 1-2 tone shading
  - long-shadow or rim highlights
  - people are simple capsules with dot or no eyes and often no mouth
  - signature birds
  - a saturated, dark-background palette
- **Examples:**
  - Kurzgesagt about 25 M subs ([CreatorDB](https://creatordb.app/creatorstats/kurzgesagt-in-a-nutshell/)), described as flat design with a recurring bird cast ([Wikipedia](https://www.wikipedia.org/wiki/Kurzgesagt))
  - Pipeline: Illustrator art animated in After Effects ([Toolfarm](https://www.toolfarm.com/?p=77543)); rigged with the Duik plug-in ([unverified, Reddit claim](https://nyc1.lr.ggtyler.dev/r/AfterEffects/comments/1gfsfmz/can_anyone_help_me_to_create_motion_graphics_like))
  - Also The Infographics Show / Bright Side (Bright Side about 44.7 M, [Wikipedia](https://en.wikipedia.org/wiki/Bright_Side_(YouTube_channel)); style description of both is my observation, unverified)
- **Why it works:**
  - extremely scalable (hundreds of shots per video)
  - matches abstract science
  - faceless people put focus on ideas
  - a brand-coherent palette
- **Weak:**
  - weak emotional close-ups
  - generic "corporate flat" if the palette is undisciplined
- **Animation needs:** mostly transforms (position, scale, rotation), simple 2-joint limbs, blink only; mouth rarely.
- **Our stack:** Canvas2D or SVG style `flatvec` (no ink, 2-tone fill, optional rim light, long shadow). Works as flat 2D scenes or as billboards. Effort: **S-M**.

### 2.8 Minimalist emoji faces

- **Look:** a yellow (or any) disc with an iconic face: dot eyes, arc mouth, emoji-standard brows and tears.
- **Examples:** reaction overlays in countless Shorts. No single big channel verified **[unverified]**.
- **Why it works:**
  - universally pre-learned expressions, so zero teaching cost
  - perfect phone read
  - great as a *secondary* layer (narrator reaction in a corner, over-the-head icons)
- **Weak:** no body or identity; feels low-effort as a lead; possible trademark issues if you copy specific vendor emoji art.
- **Animation needs:** expression swaps with a pop (scale 1.15→1); visemes optional (3-state).
- **Our stack:** FaceRig on a disc. Effort: **S** (a by-product of FaceRig).

### 2.9 Rubber-hose 1930s

- **Look:**
  - boneless noodle limbs, white gloves
  - pie-cut eyes, black bodies
  - bouncy constant motion
- **Examples:**
  - Cuphead (Studio MDHR) revived it ([Cartoon Brew](https://www.cartoonbrew.com/cartoon-study/the-rubber-hose-classics-that-inspired-the-cuphead-show-213700.html))
  - historically the first standardized American animation style, credited to Bill Nolan ([Wikipedia](https://www.wikipedia.com/wiki/Rubberhose_animation))
  - YouTube channels in this style were not verified with numbers **[unverified]**
- **Why it works:**
  - nostalgia and novelty in a feed of flat-vector content
  - extremely expressive motion
  - limbs as single bezier curves are trivial in code
  - pairs with jazz or ragtime music
- **Weak:**
  - strongly dated; associated with old racial caricature (avoid those motifs: big white lips, minstrel features)
  - its typical horror-cute twist does not suit every topic
- **Animation needs:**
  - constant 2-beat bounce (rubber-hose "bounce walk")
  - smear frames
  - squash & stretch on everything
  - grain and gate-weave post-processing
  - often on twos
- **Our stack:**
  - Canvas2D style `rubberhose`: limbs as cubic beziers with a `bendiness` parameter, glove hands (4-finger cartoon glove), pie eyes
  - post effects: sepia or monochrome grade, film grain, 1-2 px gate weave
  - Effort: **M**

### 2.10 Anime-lite

- **Look:**
  - 5-7 heads tall
  - large detailed eyes high in the face, small mouth and nose
  - cel shading with hard 2-tone shadows; hair as clumped shapes
- **Examples:**
  - Gacha Life / Gacha Club user videos: chibi-anime avatars from a free game; channels from about 0.4 M to 1.9 M subs ([Social Blade](https://socialblade.com/youtube/handle/gachagameryoutube))
  - Note the UK safeguarding warning about the sexualised "Gacha Heat" subset ([Hwb](https://hwb.gov.wales/keeping-safe-online/in-the-know/gacha-life))
  - Live2D VTubers (see 2.20)
- **Why it works:** a huge built-in global audience; eyes carry emotion; limited animation (holds, on twos or threes) is part of the look, so it is cheap.
- **Weak:**
  - quality bar is high: bad anatomy is noticed immediately
  - hair and eyes need many drawings
  - fan communities are critical of "fake anime"
- **Animation needs:**
  - holds with tiny moving parts (hair, eyes)
  - 3-mouth flap (closed, half, open) is genre-standard
  - speed lines, impact frames
- **Our stack:** Canvas2D possible but hard to make look good; Live2D or Rive puppets are better (2.20). Effort: **L-XL**. Low priority.

### 2.11 Pixel art

- **Look:** low-resolution sprites (16-64 px tall) scaled with nearest-neighbour, limited palettes, dithering.
- **Examples:** I could not verify any large pixel-art *animated series* channel. The large pixel channels found are tutorial or gaming channels (MortMort 166 K, [Beacons](https://beacons.ai/i/blog/pixel-art-youtubers)). **The evidence for Shorts performance is weak.**
- **Why it works:** gaming nostalgia; a strong niche identity; tiny assets; a readable silhouette is forced by the resolution.
- **Weak:**
  - faces are only a few pixels, so expressions are weak at phone size unless the zoom is huge
  - smooth 3D camera moves fight the pixel grid
- **Animation needs:** sprite-sheet frames (4-8 per cycle), on twos or threes, sub-pixel motion forbidden (snap to the grid).
- **Our stack:**
  - draw any existing Canvas2D style into a 48-64 px offscreen canvas, quantize to a palette, upscale with `imageSmoothingEnabled = false`
  - this "pixelize" pass gives pixel versions of all our styles for free
  - Effort: **S** (the pass) / **L** (hand-quality sprites)

### 2.12 Paper cutout

- **Look:**
  - flat paper shapes with slightly irregular cut edges
  - visible paper grain, small drop shadows between layers
  - limbs pinned at joints; stop-motion stepping (on twos or threes)
- **Examples:**
  - South Park (originally construction-paper cutout; now digital) **[unverified here; widely documented elsewhere]**
  - Terry Gilliam's Monty Python animations
  - Lotte Reiniger's cutouts (also see 2.18; [BFI](https://www.bfi.org.uk/news-opinion/sight-sound-magazine/archives/lotte-reiniger-scissors-make-films-cut-out-animation-process-description-1936))
- **Why it works:**
  - handmade warmth
  - hides the lack of in-betweens (stepped motion is the style)
  - very cheap: rigid parts rotating around pins
  - archival photo-collage fits history topics (Gilliam-style heads on cutout bodies)
- **Weak:** limited facial acting unless you swap mouths and eyes; can look like a slideshow.
- **Animation needs:** replacement mouths (visemes as cut pieces), stepped timing (12 fps hold-2), jitter of ±0.5-1 px and ±0.5° per redraw.
- **Our stack:**
  - a *render-mode* post pass over any 2D style: rough edge (noise-displaced path), paper texture fill, 2-4 px offset soft shadow per layer, stepped time `floor(frame/2)*2`
  - Effort: **S-M**

### 2.13 Claymation look

- **Look:**
  - plasticine forms with fingerprints and slight lumps
  - soft subsurface look
  - boiling surface between frames, stepped motion at 12 fps
- **Examples:**
  - Aardman (Wallace & Gromit, Morph)
  - YouTube: Clay Mixer about 4.7 M subs / 97 M views ([vidIQ, Jul 2025](https://vidiq.com/youtube-stats/channel/UCoaQyWkyU2juENnwone6uuQ)); Clay Anim Shorts 318 K subs / over 1 B views ([vidIQ, Oct 2026](https://vidiq.com/youtube-stats/channel/@clayanimat/))
  - Many "claymation" Shorts are now AI-faked ([Opus blog](https://www.opus.pro/blog/claymation-ai))
- **Why it works:** a tactile, premium "someone made this by hand" signal, which helps against "AI slop" fatigue (my inference); a forgiving look.
- **Weak:** real clay is very slow; a fake CG clay look has to be convincing (fingerprint normals, imperfection) or it reads as cheap 3D.
- **Animation needs:**
  - stepped 12 fps
  - per-frame surface boil (noise-displaced normals)
  - replacement mouths
  - squash is natural
- **Our stack:**
  - three.js: low-subdivision rounded meshes, `MeshPhysicalMaterial` (roughness 0.6-0.8, sheen 0.2), a triplanar fingerprint normal map, vertex-noise displacement re-seeded every 2 frames, stepped animation time
  - or 2D: blob or chibi styles with a soft gradient + noise + boil pass
  - Effort: **M** (3D look) / **S** (2D fake)

### 2.14 Low-poly 3D

- **Look:** faceted flat-shaded meshes (100s-1000s of tris), vertex colours, simple faces (often texture-swapped).
- **Examples:**
  - GameToons (game-parody 3D; over 12 M subs, undated, [Beacons](https://home.beacons.ai/blog/gametoons-bio); a shift from 2D to 3D per a [weak wiki](https://cf-inc.shapes.inc/fandom/gametoons))
  - ExplodingTNT, Minecraft-styled, 4.95 M ([AIR](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026))
  - Voxel or block characters are a sub-type (2.25)
- **Why it works:**
  - real 3D turnarounds for free
  - cheap free assets (Quaternius CC0, Kenney CC0)
  - gaming audiences read it natively
  - faces as swappable textures keep the 2D expressiveness
- **Weak:** generic "asset-flip" look; flat-shaded faces can look dead; needs rigs.
- **Animation needs:** skeletal clips (walk, run, idle, gestures from Mixamo or Quaternius); face texture swap for expressions and visemes.
- **Our stack:**
  - GLTF + `AnimationMixer`
  - face = CanvasTexture from FaceRig on the head's front material or a decal plane
  - `MeshToonMaterial` or flat shading
  - Effort: **M** once the GLTF path exists (**L** including that path)

### 2.15 Stylized 3D (Pixar-like)

- **Look:**
  - 3-6 heads
  - large eyes with real eyeball geometry, soft skin shading
  - appealing shape design, rich materials, subsurface
- **Examples:**
  - Cocomelon, about 200 M subs, #3 most subscribed ([Wikipedia, Apr 2026](https://en.wikipedia.org/wiki/Cocomelon))
  - The Amazing Digital Circus (Glitch), pilot over 100 M views in a month ([Glitch](https://glitchprod.com/digital-circus/-Official-website))
  - Lucas the Spider ([Tubefilter](https://tubefilter.com/2018/03/12/lucas-the-spider-viral-youtube-acclaim/))
- **Why it works:** the highest emotional range and "premium" perception; kids' content dominance; full camera freedom.
- **Weak:**
  - very expensive to model, rig (face blendshapes) and animate well
  - mediocre execution falls into the uncanny or "cheap kids' 3D" zone
  - realistic *materials* reduce appeal ([Zell 2015](https://ls7-gv.cs.tu-dortmund.de/publications/2015-stylize.page/))
- **Animation needs:** full body animation, facial blendshapes (about 52 ARKit-style or a 15-viseme set), eye darts, secondary motion.
- **Our stack:**
  - GLTF with morph targets; drive `morphTargetInfluences` from viseme tracks ([three.js forum](https://discourse.threejs.org/t/add-lip-sync-to-existing-3d-model-of-head/49943))
  - sources: VRoid Studio → VRM via `@pixiv/three-vrm` (presets aa, ih, ou, ee, oh, blink and emotions; [Qiita](https://qiita.com/nobrin/items/9085fed1ef5b8b508290), [VRM expressions](https://not-elm.github.io/desktop_homunculus/mod-development/sdk/vrm/expressions))
  - Ready Player Me is **gone**: external services shut on 2026-01-31 after the Netflix acquisition ([Genies](https://genies.com/blog/ready-player-me-shutdown), [PocketGamer](https://www.pocketgamer.biz/netflix-acquires-avatar-creation-platform-ready-player-me))
  - Effort: **XL**

### 2.16 Realistic 3D humans (Zack D. Films style)

- **Look:**
  - near-photoreal humans with somewhat stiff, game-like animation
  - big-pore close-ups, dramatic injuries or body effects
  - a narrator over 20-60 s "what happens if" or "how it works" scenarios
- **Examples:**
  - Zack D. Films: about 29.3 M subs ([vidIQ, Oct 2026](https://vidiq.com/youtube-stats/channel/%40zackdfilms/)), 71.8 B views ([OutlierKit](https://outlierkit.com/channel/zackdfilms)); started June 2021
  - Hires contract 3D animators for 20-45 s clips ([job post](https://quickdrawanimation.ca/opportunities/job-postings/zack-d-films-animator-wanted)); Blender pipeline per a studio listing **[unverified]**
- **Why it works:**
  - visceral empathy ("that could be me")
  - realism makes body and physics claims feel true
  - the stiffness is accepted because the content is informational
  - very strong thumbnail-free first frame
- **Weak:**
  - heavy production
  - uncanny valley on faces (they mostly avoid long facial acting)
  - asset licensing for realistic humans; gore limits
- **Animation needs:**
  - mocap or library clips
  - little lip sync (often none: a narrator-only pattern)
  - camera does the work: macro push-ins, x-ray cross-sections
- **Our stack:**
  - GLTF humans (Mixamo characters and animations are royalty-free for commercial use, [Adobe FAQ](https://helpx.adobe.com/be_en/creative-cloud/faq/mixamo-faq.html); alternatives: AccuRIG, Quaternius CC0 library, [Cinevva guide](https://app.cinevva.com/guides/free-character-animations-rigging))
  - PBR + three.js `MeshPhysicalMaterial` skin with SSS approximation, DOF
  - **Recommendation:** use narrator-only, faces at a distance or in profile; no close lip sync
  - Effort: **XL**

### 2.17 Skeleton / x-ray anatomical

- **Look:**
  - translucent body shell (fresnel blue-white) with a glowing skeleton or organs
  - or a cartoon skeleton character (skull face with eye sockets)
- **Examples:**
  - The current "AI skeleton what-if" Shorts format; one unnamed channel claimed at 228 M views over 59 videos, about 3.9 M/video ([vendor blog, unverified](https://aituber-marketing.pages.dev/blog/what-happens-to-your-body-video-format))
  - x-ray inserts are a staple of Zack D. Films **[observation]**
- **Why it works:**
  - shows the invisible mechanism (the "You see," beat in our script formula)
  - morbid-curiosity hook
  - skeletons are universally readable and identity-free (no representation issues)
- **Weak:** anatomical accuracy is expected, so errors get called out; can get creepy for kids' audiences.
- **Animation needs:** the same skeleton as the body rig; organ pulses (heartbeat scale), flow particles.
- **Our stack:**
  - **3D:** an x-ray material = additive fresnel shell (`1 - dot(N, V)`)^2.5 plus an emissive bone mesh parented to the same skeleton. CC0 skeleton GLTFs exist **[unverified which]**.
  - **2D:** a Canvas2D `skeleton` overlay drawn from the stick-figure IK joints (bones as rounded capsules plus a skull with big sockets), cartoon and cheap.
  - Effort: **S** (2D) / **M** (3D shell once GLTF exists)

### 2.18 Silhouette / shadow puppet

- **Look:** solid black (or single-colour) figures against bright or gradient backgrounds; detail lives only in the contour (lace, profiles).
- **Examples:**
  - Lotte Reiniger, *The Adventures of Prince Achmed*: cut card and lead figures shot frame by frame ([BFI](https://www.bfi.org.uk/news-opinion/sight-sound-magazine/archives/lotte-reiniger-scissors-make-films-cut-out-animation-process-description-1936))
  - the games Limbo and Inside **[general knowledge]**
- **Why it works:**
  - the ultimate silhouette test, so it always reads
  - moody and mythic; the history and folklore fit is excellent
  - anonymity handles sensitive or true-crime stories
  - the cheapest render
- **Weak:** no facial expression (profile mouth and eye highlights only); all posing must read in profile.
- **Animation needs:** profile-only poses, clear negative space between limbs, strong arcs.
- **Our stack:** a render mode on any 2D style: fill everything with ink, drop interior lines, optional coloured rim from the backlight. In 3D, a black unlit material on GLTF. Effort: **S**.

### 2.19 Hand-drawn sketch / whiteboard hands

- **Look:**
  - pencil or marker line on white or paper
  - lines "boil" (redrawn each 2-3 frames)
  - the whiteboard variant shows a hand drawing the scene in real time
- **Examples:**
  - Pencilmation, 20.4 M ([Wikipedia](https://en.wikipedia.org/wiki/Pencilmation))
  - Simon's Cat (6.1 M)
  - RSA Animate "Changing Education Paradigms" (over 50 M per [VideoScribe](https://blog.videoscribe.co/this-scribe-could-change-your-classroom-forever), vendor)
  - Whiteboard learning benefits are not clearly proven ([Wikipedia](https://en.wikipedia.org/wiki/Whiteboard_animation))
- **Why it works:**
  - the "reveal" is a natural retention device: viewers wait to see what the drawing becomes
  - authenticity
  - cheap: line art only
- **Weak:** the boil is distracting if overdone; a hand that is always drawing is slow pacing for Shorts.
- **Animation needs:**
  - stroke-reveal (path dash offset)
  - a boil loop (3 jittered versions at 8-12 fps)
  - optional hand sprite following the stroke tip
- **Our stack:**
  - a Canvas2D `sketch` render mode: convert paths to rough strokes (multi-pass, ±0.6 px noise, variable width), a boil seed `floor(frame/3)`, stroke-reveal through `setLineDash`
  - hand = a photo sprite (licensed) or a drawn one
  - Effort: **S-M**

### 2.20 Live2D / Rive vector puppets

- **Look:** illustrated 2D art deformed with meshes, so a 2D drawing turns ±30° and breathes. The VTuber look; Duolingo-style app mascots.
- **Examples:**
  - Duolingo animates its 10 World Characters with Rive state machines plus 20+ designed mouth shapes driven by phoneme timings ([Duolingo blog](https://blog.duolingo.com/world-character-visemes), [Rive blog](https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life))
  - VTubers (Live2D)
- **Why it works:** 2D appeal with pseudo-3D head turns; proven at Duolingo scale for automatic lip sync; tiny runtime files.
- **Weak:**
  - authoring happens in an external editor (Rive or Live2D Cubism), not in code, so it is harder to keep fully parametric
  - licensing:
    - Live2D: free indie below about ¥10 M annual revenue, otherwise a paid release licence ([Live2D help](https://help.live2d.com/en/sdk))
    - Spine runtimes need a Spine licence ([Esoteric](https://eu.esotericsoftware.com/spine-runtimes-license))
    - Rive's runtime is open source **[unverified licence details]**
- **Animation needs:** a state machine (idle, talk, react), viseme inputs, head-turn parameters, blink.
- **Our stack:**
  - **Rive is directly usable**: `@remotion/rive` `RemotionRiveCanvas` syncs Rive to Remotion time ([Remotion docs](https://www.remotion.dev/docs/rive/remotionrivecanvas))
  - drive inputs (viseme number, expression, lookX) from our tracks
  - Effort: **M** for the integration, plus artist time per character

### 2.21 Cardboard / papercraft 3D

- **Look:** folded-paper or cardboard 3D forms with visible creases, corrugated edges, tape, a matte material, stop-motion stepping.
- **Examples:** Tearaway and Paper Mario (games). YouTube channel numbers were not verified **[unverified]**.
- **Why it works:** handmade charm in real 3D, so the camera can orbit; low-poly geometry is the *point*; hides imperfect animation.
- **Weak:** a niche look; faces must be printed or drawn on, so emotions are flatter (use FaceRig textures).
- **Animation needs:** stepped motion (12 fps), hinge-like rigid parts, paper flutter.
- **Our stack:**
  - low-poly three.js geometry
  - `MeshLambertMaterial` with a paper albedo plus a crease normal map
  - edge strips with corrugation texture, stepped time
  - FaceRig as a texture
  - Effort: **M**

### 2.22 Tiny people in a giant world (scale play)

- **Look:**
  - small characters (any style) in an oversized everyday environment (kitchen, inside a phone, on a coin)
  - macro DOF, giant props
- **Examples:** the "what if you were shrunk" Shorts genre, Pikmin, *Honey, I Shrunk the Kids*. No channel numbers verified **[unverified]**.
- **Why it works:** scale contrast is an instant visual hook; shallow DOF reads as "miniature"; turns any household object into a set.
- **Weak:** needs a convincing large-scale environment (textures, DOF); the character is small on a phone, so cut to close-ups for faces.
- **Animation needs:** the same as the base style plus a scale-appropriate camera (low, macro lens, heavy DOF, slow-motion-ish physics).
- **Our stack:**
  - not a character style but a **scene mode**: toonworld or GLTF characters at 1/50 scale, f-stop of about 1.4-2 equivalent DOF, props at 50x
  - Effort: **S** (camera and DOF presets)

### 2.23 Cells / organs / microbes

- **Look:**
  - blobs with membranes (an outline plus a lighter inner ring), organelles visible inside
  - cute faces; organs with limbs (heart, lungs)
- **Examples:**
  - Amoeba Sisters (two amoeba hosts; about 1 M+ subs per one catalog source, [DCMP](https://dcmp.org/series/712-the-amoeba-sisters), **[subs unverified]**)
  - Kurzgesagt immune-system videos; *Cells at Work!* (anime)
- **Why it works:** the best topic fit for biology and health; blob appeal; personification makes processes memorable ("the white blood cell hunts").
- **Weak:** scientific accuracy expectations; many look-alike blobs need colour and shape coding.
- **Animation needs:** wobble (membrane noise), cytoplasm drift, division (metaball split), squash on contact.
- **Our stack:** Canvas2D `microbe`, a blob variant: a radial-noise membrane, inner ring, organelle dots, flagella as sine strokes, FaceRig. Effort: **S-M** (shares the blob code).

### 2.24 Simple caricature figures (OverSimplified-style)

- **Look:**
  - simple round heads with large, expressive brows and mouths, often no nose or ears
  - small bodies; historical costume pieces as identity
- **Examples:** OverSimplified, about 10 M ([CreatorDB](https://creatordb.app/creatorstats/oversimplified/)). Style description from a fan source **[weak]** and my observation.
- **Why it works:**
  - brows and mouth deliver comedy at any size
  - costume and hat make historical figures recognisable through silhouette
  - very cheap per character
- **Weak:** comedy-dependent; caricature of real people needs care (no ethnic caricature).
- **Our stack:** `chibi` or `classic` body with `heightHeads` 3, oversized brows (width ×1.6, thickness ×2), mouth ×1.3, a hat and costume library. Effort: **S** on top of `chibi`.

### 2.25 Voxel / block characters

- **Look:** Minecraft-like cubes, pixel-texture faces.
- **Examples:** ExplodingTNT 4.95 M ([AIR](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026)); the wider Minecraft animation scene.
- **Why it works:** a huge gaming audience; the most trivial 3D rig (boxes on pivots); faces as tiny textures.
- **Weak:** strongly tied to one game's IP look; the expression range is small.
- **Our stack:** three.js `BoxGeometry` parts in a hierarchy, `NearestFilter` pixel textures, FaceRig rendered at 8x8 or 16x16 through the pixelize pass. Effort: **S-M**.

---

## 3. Design principles that measurably matter

### 3.1 Shape language

| Shape | Reads as | Use for |
|---|---|---|
| circle | friendly, safe, cute | heroes for kids, mascots, victims |
| square | stable, strong, stubborn | mentors, authority, "the wall" |
| triangle | dynamic, dangerous, sly | villains, rivals |

- Mixing shapes shifts the read: circle + triangle = energetic, circle + square = gentle and trustworthy ([Pixune](https://pixune.com/blog/shape-language-technique/), [CG Wire](https://blog.cg-wire.com/character-shape-language/)). These are craft conventions, not lab results.
- In a parametric system, expose shape language as numbers:
  - superellipse exponent (2 = circle, 4+ = square-ish)
  - corner radius
  - taper (top/bottom width ratio < 1 = triangle)

### 3.2 Silhouette test (make it a QA check)

- Method: fill the character solid black, remove interior lines, view it at final size and as a thumbnail. Can you tell who it is and what they are doing? ([Mike Dawson](https://mikedawson.substack.com/p/the-silhouette-test), [Walt Disney Family Museum PDF](https://www.waltdisney.org/sites/default/files/2020-05/T%26T_Silhouette-final2.pdf)).
- Key poses need negative space between limbs and body. Each cast member needs one unique contour feature (hat, hair, ears, tail, prop).
- **QA idea for video-forge:** render each cast member's alpha mask. Then check two things:
  - mask-IoU against every other cast member (flag if over 0.85, too similar)
  - mask-area convexity per key pose (arms pressed into the body = low negative space)

### 3.3 Head-to-body ratios by style

| Style | Heads tall | Source |
|---|---|---|
| realistic adult | 7-7.5 (heroic 8+) | [Clip Studio](https://tips.clip-studio.com/en-us/articles/4953), [Sydney Padua](https://sydneypadua.com/2dgoggles/?p=785) |
| anime-lite | 5-7 | convention **[approx.]** |
| stylized 3D (Pixar-like) | 3-6 | **[approx., unmeasured]** |
| Mario-type cartoon | 3-4 | [Clip Studio](https://tips.clip-studio.com/en-us/articles/4953) |
| **toonworld adult / kid** | **3.5 / 2.7-3.0** | our measurement |
| OverSimplified-ish caricature | about 3 | **[estimate]** |
| big-head storytime | 2-2.5 | **[estimate]** |
| chibi | 2-2.5 (range 1.5-4) | [Clip Studio](https://tips.clip-studio.com/en-us/articles/4953) |
| blob / mascot / object | 1-1.5 (the head is the body) | — |

Rule: the fewer heads tall, the bigger the face on a phone, and the cuter and more comedic the read; the more heads tall, the more action and dignity.

### 3.4 Eyes: size, position, expressiveness

- **Baby schema:** large eyes, round face, small nose and mouth. Glocker et al. (2009) parametrically manipulated these features in real infant photos. Higher baby-schema faces were rated cuter and raised caretaking motivation ([paper PDF](https://www.cceb.upenn.edu/csa/assets/user-content/documents/BabySchemainInfantFacesInducesCutenessPerceptionandMotivationforCaretakinginAdults.pdf)).
- **Eye size alone** measurably changes perceived cuteness (Yao et al., [Frontiers in Psychology](https://www.frontiersin.org/articles/10.3389/fpsyg.2021.674456/full)).
- **Position:** on realistic heads the eyes sit at about 50 % of head height. Moving them lower (55-62 % from the top) plus a bigger cranium reads as younger and cuter. Toonworld puts eyes at about 52 % and 26 % of head width apart (measured).
- **Solid black eyes vs whites + pupils:**
  - Solid black (toonworld) reads at tiny sizes and is consistent. Emotion then lives in lids, brows and shape changes (half-disc, arc, squint).
  - Whites + pupils allow gaze direction and "shock" pupils (we already switch to whites for `shock`).
  - Rule: use solid black when the face is under about 60 px tall on screen. Whites become worth it above about 120 px.
- **Brows** carry about half the emotion in simple faces (OverSimplified, emoji). Always keep brows, even on dot-eye styles. Our `browA` table already does this.

### 3.5 Colour and value contrast against the background

- The character must win the value contrast against its local background. Heuristics (mine; verify with QA):
  - character fill vs background luminance difference ΔL* ≥ 25 (CIELAB)
  - or an ink outline of at least 2 px at 1080 px width when ΔL* < 25
  - face fill (skin) against hair and hat ΔL* ≥ 15 so the face shape reads
- Saturation hierarchy: characters ≥ background saturation; backgrounds about 0.8x character chroma. The toonworld channel measured world saturation of about 0.45-0.5 HSV mean, with characters at the brighter end.
- Never put the lead character's main colour on the background's dominant hue.

### 3.6 Line weight

- Outline about 4-6 % of head width (toonworld measured about 5 %). Minimum 2 px at 1080 px wide (3 px at 1440).
- Thick-thin: thicker on the shadow side and toward the ground (already in toonworld).
- Interior lines should be about 60-70 % of outline weight.
- Flat-vector and Kurzgesagt styles: no outline. They must then pass the ΔL* rule through fill contrast alone.

### 3.7 Readability at 1080x1920 on a phone

- Shorts UI overlays (third-party estimates, no official spec):
  - bottom about 300-400 px (title, buttons)
  - right about 15 % (action buttons)
  - top about 120-200 px
  - Sources: [Reap](https://reap.video/blog/short-form-video-safe-zones), [ToolNudge](https://tool-nudge.pages.dev/youtube-shorts-safe-zone)
  - Keep faces in the central column, roughly y 15-65 %.
- Heuristic size thresholds (mine; derive real values from the reference study before relying on them):
  - head ≥ 7 % of frame height (about 135 px at 1920) for expressions to read
  - ≥ 15 % for lip sync to matter
  - below that, use only 3-state mouth flaps
- Faces should be centred and large in the hook frame ([Opus](https://opus.pro/blog/ideal-youtube-shorts-length-format-retention)). Retention data focuses on the first 1-3 s ([Bytecap](https://www.bytecap.io/research/youtube-shorts-retention-benchmarks)), so the character's first frame must already read.

### 3.8 How many expressions?

| Tier | Expressions | Who needs it |
|---|---|---|
| minimum | 6: neutral, happy, sad, angry, shock, think | mascots, objects, flat-vector |
| standard (current toon.ts) | 10: adds laugh, nervous, whistle, smug | explainer leads |
| storytime / chibi lead | 14-16: adds disgust, determined, embarrassed (blush), crying, deadpan, scheming | narrator-hosts |

- Plus orthogonal modifiers that combine with any expression: blink, look direction, sweat drop, blush, tears, "?" and "!" icons.
- Duolingo's lesson: design each shape set *in motion*, per character ([Duolingo blog](https://blog.duolingo.com/world-character-visemes)).

### 3.9 Consistency across a series

- One `CharacterSpec` per character in the series bible. Never re-describe a character in prose per episode.
- Seeded asymmetry (`hash32(id)`, as `beanHead` does) gives individuality that is reproducible.
- Lock per character:
  - palette (3-5 colours + ink)
  - heightHeads
  - signature feature
  - eye type
  - default pose
  - walk speed
  - voice
- Run the fingerprint drift check per chapter (exists in QA) on character colour histograms.

### 3.10 Appeal

Appeal is Disney's 12th principle: a design the viewer *wants* to look at. Practical levers:
- clear shape language (3.1)
- contrast of sizes (big/small, straight against curved)
- asymmetry (the beanHead asymmetry and tilt)
- simplified detail
- a strong silhouette
- baby-schema dials (3.4)

### 3.11 Diversity and representation

- Skin palettes:
  - provide a range of 8-12 tones (light to deep) with *matching* shadow multipliers
  - deep skin needs a less-darkening, more-saturating shadow: use the toonworld crescent (×[.96,.86,.84]) for light skin and about ×[.82,.74,.78] for deep skin **[tune by eye]**
- Avoid stereotyped facial features. Ethnicity is carried by skin, hair style or texture (coils, locs, straight), clothing and names, not by exaggerated lips or eyes.
- Vary age (heightHeads, posture, hair colour), body type (`build`) and disability (wheelchair or cane props) in background extras by default.
- Rubber-hose and caricature styles carry historical racist imagery. Never use minstrel motifs.

### 3.12 Avoiding the uncanny valley

- Keep shape and material in the same stylization band. Realistic materials on stylized shapes lower appeal ([Zell 2015](https://ls7-gv.cs.tu-dortmund.de/publications/2015-stylize.page/)).
- Realistic 3D humans: avoid lingering facial close-ups, dead eyes (always add saccades and blinks) and bad lip sync. Prefer a narrator over on-screen talking (the Zack D. pattern).
- In 2D, the uncanny valley is rarely an issue. The "creepy" risk instead comes from realistic teeth, gums and eyelashes on simple faces. Keep mouth interiors flat (dark plus a tongue shape, as toon.ts does).

---

## 4. Animation craft per type

### 4.1 Conventions table

| Type | Blink | Talk | Walk / locomotion | Acting | Squash & stretch | Timing |
|---|---|---|---|---|---|---|
| toonworld bean | 4 f lid, 0.5-2.3 s gaps (measured) | 9-viseme or openness | 2.6 steps/s, bob 5 % | key-word gestures, props | light (≤ 6 %) | ones |
| stick | dot squash or none | optional line mouth | full IK walk/run | pose-to-pose, smears | limb stretch on impacts | ones (action), twos (talk) |
| chibi / storytime | 3-4 f, a "double blink" on surprise | 9 visemes | hop-walk 2-3 steps/s, big bob 8-10 % | many takes, head tilts | strong (10-20 %) | twos |
| blob / mascot / microbe | squash-blink (whole eye scale y) | 5 visemes | hop or roll; jiggle | eye-only acting | very strong (20-35 %) | ones |
| critter (two-legged) | 4 f | 6 visemes (beak or snout: fewer) | human walk with species tweaks | species idles | medium | ones/twos |
| critter (four-legged) | 4 f | 3-state | 4-beat walk, about 1.5-2 strides/s **[approx.]** | ears and tail | light | ones |
| object | squash-blink | 9 visemes (the mouth is the star) | hop: anticipation 3 f, air 6-8 f, land squash 2 f | tilt and lean | strong | ones |
| flatvec | 3 f | none or 3-state | sliding, 2-joint legs | transforms | light | ones |
| rubber hose | pie-eye lid | 6 visemes | constant bounce-walk on the beat | everything bounces | extreme | twos |
| sketch / whiteboard | redraw | 3-state | minimal | reveal-driven | n/a | boil on threes |
| paper cutout / clay / cardboard | replacement eyes | replacement mouths, 6 visemes | stepped | holds plus snaps | clay: strong; paper: none | twos/threes |
| low-poly / voxel 3D | texture swap | texture-swap visemes | Mixamo/Quaternius clips | clip blending | none (rigid) | ones |
| stylized / realistic 3D | eyelid blendshape, plus saccades | 15 Oculus visemes / VRM 5 vowels | mocap | full | stylized only | ones |
| silhouette | none | profile jaw only | profile walk | pose clarity | light | twos |

### 4.2 Mouth shapes: which set?

Candidate sets:
- **2-3 states** (closed, half, open): anime and limited animation, tiny faces.
- **Preston Blair's 9-10** (A/I, E, O, U, C/D/G/K…, F/V, L/Th, M/B/P, W/Q, rest): the classic animator chart; sources disagree on whether W/Q is separate ([Frameo](https://frameo.ai/en/learn/animation-mouth-chart)).
- **Rhubarb Lip Sync, 6 basic + 3 extended**:
  - A = closed M/B/P
  - B = slightly open, clenched teeth: most consonants (K, S, T…) and EE
  - C = open (EH, AE; in-between)
  - D = wide open (AA)
  - E = slightly rounded (AO, ER)
  - F = puckered (UW, OW, W)
  - G = F/V, teeth on lip
  - H = long L, tongue up
  - X = idle/rest
  - Output: timestamped cues, in TSV or JSON ([Rhubarb README](https://github.com/DanielSWolf/rhubarb-lip-sync)).
- **Oculus/Meta 15**: sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, I, O, U ([Meta docs](https://developers.meta.com/horizon/documentation/unity/audio-ovrlipsync-viseme-reference/); the plugin is end-of-life, replaced by Movement SDK). Best for 3D blendshapes.
- **VRM 5 vowels**: aa, ih, ou, ee, oh. The minimum for VRoid/three-vrm models.
- **Duolingo**: "20+ mouths" per character, mapped from phonemes in-house ([Duolingo blog](https://blog.duolingo.com/world-character-visemes)).

**Recommendation:** make **Rhubarb's 9 (A-H + X) the canonical internal set**.
- It is the smallest set that covers the lip closure for M/B/P, F/V teeth-on-lip, rounding and L.
- An offline tool exists (Rhubarb) that outputs exactly these letters.
- Every simpler style can *reduce* it (4.4), and 3D can *expand* it (4.5).

### 4.3 Phoneme → viseme mapping (ARPAbet, as in CMUdict and most aligners)

| Viseme | Meaning | ARPAbet phonemes |
|---|---|---|
| **A** | lips pressed | M, B, P |
| **B** | teeth together, slightly open | T, D, N\*, S, Z, K, G, NG, Y, HH, CH, JH, SH, ZH, IY, IH\*\* |
| **C** | open | EH, AE, AH, EY (first part), IH\*\* |
| **D** | wide open | AA, AY (first part), AW (first part) |
| **E** | slightly rounded | AO, ER, R\*\*\*, OY (first part), OW (first part) |
| **F** | puckered | UW, UH, OW (second part), AW (second part), W |
| **G** | upper teeth on lower lip | F, V |
| **H** | tongue up, open | L, TH\*\*\*\*, DH\*\*\*\* |
| **X** | rest | silence, pauses ≥ 120 ms |

Notes:
- Diphthongs split into two cues at about 60/40 of their duration: AY = D→B, AW = D→F, OY = E→B, EY = C→B, OW = E→F.
- \* N can use H when the face is large (the tongue is visible); B is fine otherwise.
- \*\* IH sits between B and C. Use C when stressed, B when unstressed.
- \*\*\* R → E is my choice, since English R is lip-rounded. Rhubarb's own internal mapping may differ.
- \*\*\*\* Rhubarb leaves TH unassigned among the basic shapes. Use H when the style shows a tongue, otherwise B.

Oculus-15 → canonical:

| Oculus | Canonical |
|---|---|
| sil | X |
| PP | A |
| FF | G |
| TH | H |
| DD | B |
| kk | B |
| CH | B |
| SS | B |
| nn | H |
| RR | E |
| aa | D |
| E | C |
| I | B |
| O | E |
| U | F |

**Grapheme fallback.** Use it when we only have text plus word or character timings (ElevenLabs `/with-timestamps` returns per-character start and end seconds, [docs](https://elevenlabs.io/docs/api-reference/streaming-with-timestamps); Whisper gives words):
1. Lowercase the word and walk left to right with longest-match rules:
   - `th`→H; `ph`→G; `sh|ch|tch|ge|dge`→B
   - `oo|ew|ue|ou(gh)?|w|wh`→F
   - `aw|au|or|ar(?=r)`→E; `er|ir|ur`→E
   - `ee|ea|ie|y$`→B; `ai|ay|a_e`→C→B
   - `igh|i_e`→D→B; `ow$`→E→F; `oy|oi`→E→B
   - `a`→D if followed by `r|h|l(m|f)` else C
   - `e|i`→C; `o`→E; `u`→C
   - `m|b|p`→A; `f|v`→G; `l`→H
   - any other consonant→B
2. Distribute the word's duration across the resulting cues, weighting vowels ×2 and consonants ×1. With character timings, use each character's own time instead.
3. Insert X between words when the gap is ≥ 120 ms, else hold the last shape.

### 4.4 Reductions for simpler styles

| Canonical | 5-state (`chibi`, `critter`, `rubberhose`, cutout) | 3-state (`flatvec`, `sketch`, anime-lite, tiny faces) | 2-state (`stick`, emoji) |
|---|---|---|---|
| A (MBP), X | closed | closed | closed |
| B, G | teeth | half | open |
| C, H | open | open | open |
| D | wide | open | open |
| E, F | round | half | open |

The current float `mouth` maps to the 3-state set: 0 = closed, 0.5 = half, 0.9 = open.

### 4.5 Expansion for 3D

- **Canonical → Oculus blendshape weights**, two weights per cue:
  - A→PP 1.0; B→DD 0.6 + SS 0.4; C→E 1.0; D→aa 1.0
  - E→O 1.0; F→U 1.0; G→FF 1.0; H→nn 0.6 + TH 0.4; X→sil
- **Canonical → VRM vowels:**
  - A/X → all 0
  - B→ih 0.5; C→ee 0.4 + aa 0.4; D→aa 1.0
  - E→oh 1.0; F→ou 1.0; G→ih 0.3 (VRM has no F/V shape); H→aa 0.5

### 4.6 Timing rules for lip sync

- Lead the audio by 1-2 frames at 30 fps (`mouthAt` already uses lead = 2). The eye perceives the mouth shape slightly before the sound.
- Minimum hold of 2 frames at 30 fps (3 at 60 fps). Merge shorter cues into the neighbour with the larger opening, **except** A (M/B/P) and G (F/V): lip contacts must always show, even for 1 frame. This is a common animator convention **[craft knowledge]**.
- Do not animate every consonant in fast speech (3.6 words/s in toonworld). Vowel opening dominates; consonants mostly appear as closures.
- On 2D styles, change mouth shapes on twos even if the body moves on ones. This cuts flicker.
- Blend in 3D: crossfade weights over 2-3 frames (more than one viseme active during transitions, [three.js forum](https://discourse.threejs.org/t/add-lip-sync-to-existing-3d-model-of-head/49943)).
- **Tooling:** Rhubarb runs offline on our WAV files and outputs the canonical letters directly. Pass the script text through its dialog option to improve recognition ([README](https://github.com/DanielSWolf/rhubarb-lip-sync)). Fall back to the grapheme rules (4.3) when Rhubarb is not installed.

### 4.7 Secondary motion and squash & stretch

- **Secondary parts** (ears, antennae, hair tufts, tails, whiskers, membranes): damped spring per part, follow-through lag 2-4 frames.
  - Suggested defaults: stiffness about 120, damping about 14 at 60 fps-equivalent **[tune]**
  - Inputs: parent acceleration plus the lean angle
- **Squash & stretch:**
  - always volume-preserving (`sx = 1/√sq` or toon.ts's `1/sq^0.6`)
  - anticipation squash 3 f before a jump, stretch in the air along the velocity, impact squash 2 f, overshoot settle 4-6 f
  - suitability: blob/object/microbe/rubber-hose/chibi high; human toon medium; realistic 3D none
- **Blinks:** keep the measured toonworld lid curve [0.5, 1, 1, 0.5]. Blob styles blink by scaling the eye y to 0.1 instead of a lid. Hide expression swaps under a blink (exists).
- **Idle:** in measured stylized references, characters do NOT breathe or sway. The world, camera and FX carry the life (`craft.md`). Exceptions where idle *is* the style: blob jiggle, microbe membrane wobble, sketch boil, clay boil.

---

## 5. Recommendations for video-forge

### 5.1 Build order

| # | Item | Kind | Effort | Unlocks |
|---|---|---|---|---|
| 0 | `FaceRig` + `Viseme` module shared by all 2D styles; `Pose.viseme`, `Pose.view` | infra | M | everything below; upgrades toonworld lip sync |
| 1 | `object` (face-on-anything, 2D + 3D decal) | style | S-M | talking-subject hooks for any explainer |
| 2 | `critter` (species presets, hand-drawn views) | style | M (+S/species) | animal characters, kids, nature |
| 3 | `blob` (mascot) | style | S-M | channel host/mascot, wordless shorts |
| 4 | `stick` (IK stick figures + optional skeleton overlay) | style | S-M | action explainers, x-ray in 2D |
| 5 | `chibi` (big-head storytime / caricature) | style | M | long-form narrator-host, history comedy |
| 6 | `flatvec` (Kurzgesagt-like, no ink) | style | S-M | long-form science |
| 7 | `microbe` (cells/organs) | style | S (after blob) | biology/health |
| 8 | render modes: `sketch`, `cutout`, `silhouette`, `pixelize` | post-passes over any style | S each | 4 more looks from 1 code path |
| 9 | `rubberhose` | style | M | novelty or nostalgia series |
| 10 | `gltf` path (VRM/Mixamo/Quaternius) + `xray` material + FaceRig texture face | 3D | L-XL | stylized or realistic 3D, low-poly, voxel |

Skip or defer:
- anime-lite: low code-fit
- realistic close-up talking humans: uncanny risk and cost
- claymation: do it as a 3D material later
- Rive/Live2D: worthwhile only when an artist supplies a puppet; integrate through `@remotion/rive` when needed

### 5.2 Shared types (proposed additions to toon.ts or a new `face.ts`)

```ts
export type Viseme = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "X"; // Rhubarb canonical
export type View = "front" | "q3" | "side" | "back";                     // hand-drawn views, never mirrored rotation
export type MouthTier = 2 | 3 | 5 | 9;

export type FaceSpec = {
  eyes: "solid" | "dot" | "whites" | "pie" | "lidded" | "none";
  eyeSize: number;        // fraction of face width, per eye (solid 0.09, chibi whites 0.16-0.22)
  eyeSpacing: number;     // centre-to-centre / face width (toonworld 0.26, chibi 0.36-0.42)
  eyeY: number;           // 0 top .. 1 bottom of face box (realistic 0.5, cute 0.55-0.62)
  brows: "line" | "thick" | "none";
  browScale?: number;     // 1 default, caricature 1.6
  mouthTier: MouthTier;
  mouthWidth: number;     // / face width (0.17 toonworld, 0.25 chibi, 0.35 object)
  mouthY: number;         // 0..1 in face box
  beakOrSnout?: "beak" | "snout" | "muzzle"; // critters: mouth drawn on/under it
  ink: string; lineW: number; // lineW as fraction of face width (0.045-0.06)
  blush?: boolean; catchlight?: boolean;
};

export type FacePose = { expr: Expression; viseme?: Viseme; blink: number; look: [number, number]; view: View };

/** Draw a face into a box on any canvas (used by every style and by 3D CanvasTexture faces). */
export function drawFace(g: CanvasRenderingContext2D, f: FaceSpec, p: FacePose, box: { x: number; y: number; w: number; h: number; rot?: number }): void;

/** Viseme track from Rhubarb JSON, from ElevenLabs character alignment, or from Whisper words (grapheme rules 4.3). */
export function visemeTrack(src: RhubarbCues | CharAlignment | Word[], fps: number, opts?: { lead?: number; minHold?: number }): (frame: number) => Viseme;
export const reduceViseme: (v: Viseme, tier: MouthTier) => number; // index into the style's mouth set
```

- Add `viseme?: Viseme` and `view?: View` to `Pose`. Keep `mouth` as the fallback: when `viseme` is set it wins; otherwise the openness float maps to the 3-state set.
- Add `Expression` members `disgust | determined | embarrassed | cry | deadpan` for the chibi tier (section 3.8). Styles that lack a drawing fall back through a table: `embarrassed→nervous`, `cry→sad`, `deadpan→neutral`, `determined→angry`, `disgust→angry`.

### 5.3 Style specs

Every style is `CharacterSpec.style = "<name>"` plus the style-specific `CharacterSpec.<name>` sub-object. All styles must:
- draw at least `front` and `q3` views as **separate drawings** (side where marked)
- support the 10 current expressions
- consume `Pose.viseme` through `reduceViseme`

#### A) `object`: face-on-anything

```ts
object: {
  body: "path" | "image" | "preset";      // custom Path2D, a bitmap (photo/illustration), or preset
  preset?: "disc" | "box" | "can" | "fruit" | "drop" | "planet" | "coin" | "toilet" | "cover";
  bodyColor?: string; material?: "flat" | "toon" | "photo";
  faceBox?: [number, number, number, number]; // x,y,w,h in body-normalised 0..1; default auto = centroid, upper 55 %
  face: FaceSpec;                         // default eyes "whites", eyeSize .18, spacing .38, mouthTier 9, mouthWidth .35
  limbs?: "none" | "noodle" | "bfdi";     // bfdi = thin black stroke arms/legs, ink-dot hands
  rigidity: number;                       // 0 = jelly .. 1 = steel (scales squash amplitude: maxSquash = 0.3*(1-rigidity))
}
```

- Defaults: outline = toonworld ink at 5 % of face width; `photo` material keeps the image and adds only face + contact shadow.
- Poses: `hop` (anticipation 3 f / air 7 f / land 2 f), `tilt` ±12°, `lean` toward the listener on key words.
- 3D: render `drawFace` into a 512² CanvasTexture and apply it to a camera-facing decal plane at faceBox, offset 1 % along the surface normal. Re-render only when face state changes.

#### B) `critter`: anthropomorphic animals (user rule: solid black eyes, thin lines, hand-drawn views)

```ts
critter: {
  species: "bird" | "cat" | "dog" | "bear" | "rabbit" | "mouse" | "frog" | "fox" | "owl" | "pig";
  stance: "biped" | "quadruped";
  heightHeads: number;          // biped 2.6-3.2, quadruped body length 2.2-2.8 heads
  headShape: { n: number; egg: number; squashY: number }; // superellipse params per species preset
  ears?: { kind: "pointed" | "round" | "floppy" | "long" | "none"; size: number; spring: true };
  tail?: { kind: "stub" | "curl" | "long" | "fluffy" | "fan"; spring: true };
  muzzle?: "beak" | "snout" | "muzzle" | "none"; // mouth drawn on it; beak = 5-state as upper/lower beak opening
  pattern?: { kind: "solid" | "patch" | "stripe" | "belly"; colors: string[] };
  palette: { body: string; belly?: string; accent?: string; ink: string };
  face: FaceSpec;               // default eyes "solid", eyeSize .085, eyeSpacing by species (prey .40, predator .28), mouthTier 5
  lineW: 0.035;                 // thin lines (fraction of head width), thinner than toonworld
  views: ("front" | "q3" | "side")[]; // each a separate drawing function per species; never flip q3 to make side
  clothes?: CharacterSpec["top"]; // biped only
}
```

- Locomotion: biped uses `walkPose` (bird preset: head-bob locked to steps, 3 steps/s). Quadruped needs a new `walk4Pose`: 4-beat order LH→LF→RH→RF, duty factor 0.65, body bob 2 %, tail counter-sway.
- Species idles: bird peck (head dip 6 f), cat tail flick, dog pant (mouth tier open, 4 Hz), rabbit nose twitch.
- Phone-read rule: species identity must pass the silhouette test from ears, beak or snout and tail alone.

#### C) `blob`: mascot

```ts
blob: {
  shape: { n: number; egg: number; aspect: number }; // n 2.0 circle .. 3.5 squircle; egg -0.15 pear .. +0.15 drop; aspect H/W 0.8-1.3
  color: string; belly?: string; fur?: number;       // fur 0..1 => fringe noise on the outline
  attachments?: { kind: "ear" | "antenna" | "horn" | "tuft" | "leaf"; at: number /*angle deg*/; len: number; spring: true }[];
  nubs?: { arms: boolean; feet: boolean };           // tiny stub limbs (ellipses 0.12 body W)
  face: FaceSpec;            // default eyes "whites", eyeSize .2, spacing .42, eyeY .45, mouthTier 5
  jiggle: number;            // 0..1 secondary wobble amplitude on motion
  maxSquash: 0.3;
}
```

- Poses: `bounce` locomotion (hop height 0.4 body H, 2 hops/s), `melt` (sad: squash 0.75, widen), `puff` (angry: scale 1.1, triangle brows), `wobble-idle` allowed.
- Outline: toonworld ink, or none in flat mode (`ink: "none"` forces fill contrast ΔL* ≥ 25).

#### D) `stick`: stick figures (plus 2D skeleton overlay)

```ts
stick: {
  heightHeads: 6;              // 5-7; head is a circle
  lineW: 0.12;                 // limb stroke in head diameters (thick for phone read; Becker-like)
  color: string;               // identity colour (one per cast member)
  joints: "ik2";               // shoulder-elbow-hand, hip-knee-foot via 2-bone IK
  face: FaceSpec | null;       // default null; minimal = eyes "dot", mouthTier 2, brows "line"
  hands?: "none" | "dot" | "mitten";
  skeletonOverlay?: boolean;   // draw bones as capsules + skull (x-ray beats)
}
```

- Poses come from a target-based library (`hand targets + foot targets + hip`): `idle`, `point`, `shrug`, `facepalm`, `run`, `jump`, `fall`, `punch`, `think`. Walk 2.2 steps/s; run 3.5 steps/s with a 15° lean.
- Smear: on angular velocity above a threshold, draw the limb with 2-3 ghost strokes at 35 % alpha.

**Stick cast with accessories (1.3, built for the elevator proof short).** Bare stick figures all read the same at feed
size, so identity comes from the silhouette ABOVE the shoulders and one torso shape. `StickSpec` adds:

| field | values | reads as |
|---|---|---|
| `head` | colour | a head fill that differs from the limbs (classic white-head stickman) |
| `hat` | `top` `bowler` `cap` `boater` `hardhat` `beanie` (+ `color`, `band`) | era and job at a glance; the strongest identity cue |
| `hair` | `tuft` `side` `spikes` `bun` `long` `curly` | age / gender without a body |
| `stache`, `beard`, `glasses` | colour | the face cue that survives 120 px |
| `neckwear` | `bow` `tie` `scarf` | one accent colour per character |
| `coat` | `color`, `tails`, `buttons`, `collar` | frock coat with tails = 19th-century gentleman |
| `skirt`, `build` (`slim`/`regular`/`stout`), `cheeks` | | body shape and warmth |

Pose extras (`KPose`): `hold: { item: "axe" | "cane" | "hat" | "flag" | "lever" | "bag", hand, angle, len }` draws a prop
along the forearm (behind the arm when that arm is the far one); `hatLift` (head units) + `hatTilt` (deg) do a hat tip.
Presets: `stickGent`, `stickWorker`, `stickLady`, `stickKid`, `stickProf` (charsheet page 6:
`render.mjs --project charsheet --format long --stills 160`). Rules learned on the proof short:
- Give every speaking or acting character a different hat or hair silhouette; colour alone is not enough at 120 px.
- Props and big gestures leave the 1.08 x height card: build the card with `pad` (`new CharacterCard(spec, h, px, sun,
  undefined, { top: 0.55, x: 0.45 })` for a raised axe) or the prop is clipped at the card edge.
- Never cover the mouth of a speaking character with a gesture (a hand at the chin hid the heckler's lip-sync):
  point AWAY from the face on the line.
- A held hat goes to the chest (`limbs.handR ~ [0.55, 0.95]`); held at shoulder height it covers the face.

#### E) `chibi`: big-head storytime and caricature

```ts
chibi: {
  heightHeads: 2.3;            // 2-2.5 storytime; caricature 3
  headShape: { n: 2.2; egg: -0.05; widthToHeight: 1.08 };
  body: "hoodie" | "shirt" | "dress" | "coat" | "costume";
  limbs: "stub" | "noodle";    // stub = rounded capsules 0.18 head W
  face: FaceSpec;              // default eyes "whites", eyeSize .19, spacing .40, eyeY .56, catchlight true,
                               // brows "thick", mouthTier 9, mouthWidth .26, lineW .055
  caricature?: { browScale: 1.6; mouthScale: 1.3; noseless: true }; // OverSimplified-ish preset
  hair: CharacterSpec["hair"]; hat?: CharacterSpec["hat"];
  outline: { color: string; w: 0.05 };   // thicker, uniform (storytime look)
}
```

- 16 expressions (section 3.8). "Take" reaction: 2 f anticipation squash, 3 f stretch with eyes ×1.3, settle 5 f. Hop-walk: bob 9 %, 2.4 steps/s.
- Narrator mode: a waist-up framing preset with the head at 18-22 % of frame height (lip sync tier 9 active).

#### F) `flatvec`: Kurzgesagt-like flat vector

```ts
flatvec: {
  kind: "person" | "bird" | "creature";
  heightHeads: 3.2;            // persons: capsule body, head = circle
  palette: { base: string; shade: string; rim?: string };  // shade = base * 0.78 luminance, hue shifted -8° toward blue
  ink: "none";                 // no outlines
  shading: "two-tone" | "long-shadow"; rimLight?: number;  // 0..1
  face: FaceSpec;              // default eyes "dot", eyeSize .07, mouthTier 3 (often hidden: mouth only when talking)
  limbs: "capsule2";           // 2-segment capsules, no hands or simple dots
}
```

- Bird preset: body = egg superellipse (n 2.1, egg +0.12), beak triangle, dot eye, wing as a teardrop rotating ±25° on flaps. Walk = hop 3/s.
- Background rule: dark, desaturated backgrounds (L* 10-25) under saturated characters (chroma ×1.25 vs background).

#### G) `microbe`: cells, organs, microbes

```ts
microbe: {
  kind: "cell" | "bacterium" | "virus" | "rbc" | "wbc" | "neuron" | "organ";
  organ?: "heart" | "lung" | "brain" | "stomach" | "liver" | "kidney"; // organ silhouettes as presets
  membrane: { color: string; inner: string; noise: number /*0..0.08 radial*/; wobbleHz: 0.6 };
  organelles?: { count: number; colors: string[]; drift: number };
  appendages?: { kind: "flagella" | "cilia" | "spikes" | "pseudopod"; count: number };
  face: FaceSpec;              // default eyes "whites", eyeSize .16, mouthTier 5
}
```

- Motion: membrane wobble always on (style-intrinsic idle), flagella as travelling sine strokes, division by metaball split over 24 f, engulf = radial expand + overlap.

#### H) Render modes (post-passes usable on ANY 2D style)

```ts
renderMode?: "normal" | "sketch" | "cutout" | "silhouette" | "pixelize";
sketch:     { passes: 2; jitterPx: 0.6; boilEvery: 3 /*frames*/; paper: "#f7f3ea"; inkColor: "#2a2a2a"; reveal?: number /*0..1 stroke draw-on*/ };
cutout:     { edgeNoise: 0.6 /*px*/; paperTexture: true; layerShadow: { dx: 2, dy: 3, blur: 3, alpha: .35 }; stepFrames: 2; jitter: { px: .7, deg: .5 } };
silhouette: { fill: string /*ink*/; rim?: { color: string; widthPx: 2 }; keepEyes?: boolean /*eye glints*/ };
pixelize:   { heightPx: 56; palette: string[] /*<=16*/; dither: "none" | "bayer4"; outline1px: true };
```

#### I) `rubberhose`: 1930s

```ts
rubberhose: {
  heightHeads: 3; bodyColor: "#141414"; faceColor: "#f2dcc0";
  limbs: { bendiness: 0.8 /*bezier control offset*/; width: 0.09 };     // no elbows/knees: cubic beziers
  hands: "glove4";             // white 4-finger glove, cuffs
  feet: "bigshoe";
  face: FaceSpec;              // eyes "pie", eyeSize .14 tall ovals, mouthTier 5, brows "none"
  post: { grade: "sepia" | "mono"; grain: 0.25; gateWeavePx: 1.5; flicker: 0.04; fps: 12 /*twos*/ };
}
```

- Every pose gets a 2-beat bounce: `bob = 0.06 * |sin(π * beat)|`, limbs swinging in phase with the music tempo (pull the tempo from `music.py` sections).

#### J) 3D path `gltf` (stylized, realistic, low-poly, voxel) with an x-ray option

```ts
gltf: {
  src: string;                         // .glb / .vrm (VRoid), Mixamo/Quaternius/AccuRIG rigs
  kind: "vrm" | "arkit52" | "oculus15" | "faceTexture" | "none"; // how the face is driven
  clips: Record<"idle" | "walk" | "run" | "talk" | string, string>; // FBX→GLB converted clips, retargeted
  material: "original" | "toon" | "flat" | "clay" | "paper" | "xray";
  toon?: { steps: 2 | 3; outline: { color: string; px: 3 } };      // inverted-hull outline, ink drawn before DOF
  xray?: { shell: string /*#9fd8ff*/; fresnelPow: 2.5; bones: string /*#ffffff emissive*/; organs?: boolean };
  faceTexture?: FaceSpec;              // low-poly/voxel: drawFace -> CanvasTexture on head front
  scale?: number;                      // tiny-people mode: 0.02 + camera preset "macro" (DOF f/1.4-2)
}
```

- Lip sync goes through 4.5 (Oculus or VRM weights); blink plus 0.2-0.6 s saccades are mandatory on any 3D face.
- Realistic humans: default to narrator-only, keep faces at ≤ 25 % of frame height or in profile, and keep facial acting below 1.5 s per shot (uncanny guard, section 3.12).
- Ready Player Me can no longer be used (shut down 2026-01-31). Use VRoid (VRM), Mixamo (royalty-free, [Adobe](https://helpx.adobe.com/be_en/creative-cloud/faq/mixamo-faq.html)), and Quaternius CC0 or AccuRIG ([guide](https://app.cinevva.com/guides/free-character-animations-rigging)).

### 5.4 Palette rules (all styles)

- 3-5 fills plus ink per character.
- Lead hue ≥ 40° away from the scene's dominant hue.
- ΔL* ≥ 25 to the local background (QA-checked).
- Skin: the 8-12 tone ramp with tone-specific shadow multipliers (section 3.11).
- Shadows cool-shifted (toonworld `darken` / `mulHex`).
- No pure black fills except ink, solid eyes and the rubber-hose body.

### 5.5 QA hooks to add (one line each)

- **silhouette-IoU** between cast members ≤ 0.85
- **ΔL\*** character vs background ≥ 25 (or outline present)
- **head height** ≥ 7 % of frame when an expression change happens
- **viseme coverage**: every M/B/P in the transcript shows an A frame, every F/V a G frame
- **face inside the Shorts safe area** (central column, y 15-65 %)

---

## Sources

The main sources are listed below; everything else is cited inline.

**Channel and franchise figures:**
- [vidIQ: Zack D. Films](https://vidiq.com/youtube-stats/channel/%40zackdfilms/)
- [OutlierKit: Zack D. Films](https://outlierkit.com/channel/zackdfilms)
- [Zack D. Films job post](https://quickdrawanimation.ca/opportunities/job-postings/zack-d-films-animator-wanted)
- [AIR: 10 most popular animation channels 2026](https://air.io/en/trending/10-most-popular-animation-channels-on-youtube-in-2026)
- [Wikipedia: Jaiden Animations](https://en.wikipedia.org/wiki/Jaiden_Animations)
- [Wikipedia: Pencilmation](https://en.wikipedia.org/wiki/Pencilmation)
- [Wikipedia: Cocomelon](https://en.wikipedia.org/wiki/Cocomelon)
- [Wikipedia: Kurzgesagt](https://www.wikipedia.org/wiki/Kurzgesagt)
- [CreatorDB: Kurzgesagt](https://creatordb.app/creatorstats/kurzgesagt-in-a-nutshell/)
- [CreatorDB: OverSimplified](https://creatordb.app/creatorstats/oversimplified/)
- [Looper: Skibidi Toilet](https://www.looper.com/1577914/origins-of-skibidi-toilet-explained)
- [Guinness: Simon's Cat](https://www.guinnessworldrecords.com/world-records/436544-most-subscribers-for-an-animated-animal-on-youtube)
- [vidIQ: Peppa Pig](https://vidiq.com/youtube-stats/channel/@peppapigofficial/)
- [Tubefilter: Lucas the Spider](https://tubefilter.com/2018/03/12/lucas-the-spider-viral-youtube-acclaim/)
- [Wikipedia: Oddbods](https://www.wikipedia.org/wiki/Oddbods)
- [Glitch: The Amazing Digital Circus](https://glitchprod.com/digital-circus/-Official-website)
- [vidIQ: Clay Mixer](https://vidiq.com/youtube-stats/channel/UCoaQyWkyU2juENnwone6uuQ)
- [vidIQ: Explosm](https://vidiq.com/youtube-stats/channel/UCWXCrItCF6ZgXrdozUS-Idw)

**Perception and design:**
- [Zell et al. 2015](https://ls7-gv.cs.tu-dortmund.de/publications/2015-stylize.page/)
- [Glocker et al. 2009](https://www.cceb.upenn.edu/csa/assets/user-content/documents/BabySchemainInfantFacesInducesCutenessPerceptionandMotivationforCaretakinginAdults.pdf)
- [Yao et al., eye size](https://www.frontiersin.org/articles/10.3389/fpsyg.2021.674456/full)
- [Shape language: Pixune](https://pixune.com/blog/shape-language-technique/)
- [Silhouette test: Mike Dawson](https://mikedawson.substack.com/p/the-silhouette-test)
- [Proportions: Clip Studio](https://tips.clip-studio.com/en-us/articles/4953)
- [Safe zones: Reap](https://reap.video/blog/short-form-video-safe-zones)

**Lip sync and tech:**
- [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync)
- [Meta OVR viseme reference](https://developers.meta.com/horizon/documentation/unity/audio-ovrlipsync-viseme-reference/)
- [Duolingo visemes](https://blog.duolingo.com/world-character-visemes)
- [Remotion Rive](https://www.remotion.dev/docs/rive/remotionrivecanvas)
- [three-vrm expressions](https://qiita.com/nobrin/items/9085fed1ef5b8b508290)
- [ElevenLabs timestamps](https://elevenlabs.io/docs/api-reference/streaming-with-timestamps)
- [Mixamo FAQ](https://helpx.adobe.com/be_en/creative-cloud/faq/mixamo-faq.html)
- [Ready Player Me shutdown](https://genies.com/blog/ready-player-me-shutdown)
- [Live2D SDK licence](https://help.live2d.com/en/sdk)
- [Spine runtimes licence](https://eu.esotericsoftware.com/spine-runtimes-license)
