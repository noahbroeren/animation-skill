# Learnings: toonworld-explainer

Appended automatically by `vfa_loop.py learn` after each measured iteration. A change counts only if the numbers moved.

## 2026-11-10 - manhole

- change: iter2: 11-area judge fixes (44f travels on cues, per-sentence moves, dissolve on time jump, cut on Wait, no blur across cuts; cooler highs/white cards; golden front key; ink thresholds x0.6; plaster/tile texture; haze; captions on onset; SFX levelling fix for <400ms sounds, word-duck, music -6/-8/-6)
- match score: 50.0 -> 59.4
- improved: sound onset rate gap 1.03 -> 0.49 (ours 3.002 -> 3.909, ref 3.618)
- improved: move ease-in frames gap 0.88 -> 0.5 (ours 5.5 -> 11, ref 9)
- improved: frames with camera motion gap 1.21 -> 0.19 (ours 0.8661 -> 0.9685, ref 0.9873)
- improved: frames with fast camera motion gap 7.17 -> 6.03 (ours 0.1952 -> 0.2526, ref 0.5539)
- improved: glide length (frames) gap 3.1 -> 2.2 (ours 28.5 -> 33, ref 44)
- regressed: camera jerk gap 0.62 -> 3.78 (ours 24.01 -> 62.9, ref 29.48)
- regressed: push-in shot fraction gap 0.0 -> 4.44 (ours 1 -> 0.3333, ref 1)
- improved: move ease-out frames gap 1.38 -> 0.12 (ours 6 -> 11, ref 11.5)
- improved: highlight tint a gap 2.51 -> 0.83 (ours 6.952 -> 0.2789, ref 1.936)
- improved: highlight tint b gap 3.24 -> 2.99 (ours 12.28 -> 11.79, ref 5.806)
- improved: mean brightness gap 1.04 -> 0.09 (ours 0.4234 -> 0.4684, ref 0.4649)
- regressed: black floor (p1) gap 0.98 -> 1.37 (ours 0.1176 -> 0.1255, ref 0.09804)
- improved: white ceiling (p99) gap 1.96 -> 0.92 (ours 0.8902 -> 0.9216, ref 0.949)
- regressed: saturation gap 0.01 -> 0.49 (ours 0.4805 -> 0.4605, ref 0.48)
- improved: shadow tint a (green-/magenta+) gap 1.28 -> 0.73 (ours 13.12 -> 12.02, ref 10.57)
- regressed: shadow tint b (blue-/yellow+) gap 0.01 -> 1.08 (ours -5.346 -> -7.535, ref -5.367)
- improved: warmth (R-B) gap 4.06 -> 2.75 (ours 0.1475 -> 0.1147, ref 0.04604)
- improved: average shot length gap 9.53 -> 3.42 (ours 10.49 -> 14.16, ref 16.21)
- improved: cuts per minute gap 0.54 -> 0.05 (ours 4.289 -> 2.826, ref 2.667)
- improved: micro-animation activity gap 3.55 -> 2.78 (ours 0.006072 -> 0.009151, ref 0.02028)
- improved: DOF centre/border sharpness gap 0.62 -> 0.07 (ours 2.136 -> 1.972, ref 1.952)

## 2026-11-10 - manhole

- change: iter3: Bezier arc (via) on the two 23 m travels (flicker from near objects), day blackPoint .06->.045, cooler highs [-.03,-.004,.05], sat 1.26, golden shadow b .1->.08, idle breathing/sway/bob x1.6
- match score: 59.4 -> 62.5
- regressed: move ease-in frames gap 0.5 -> 1.0 (ours 11 -> 5, ref 9)
- regressed: glide length (frames) gap 2.2 -> 4.0 (ours 33 -> 24, ref 44)
- improved: camera jerk gap 3.78 -> 2.25 (ours 62.9 -> 49.4, ref 29.48)
- improved: push-in shot fraction gap 4.44 -> 2.22 (ours 0.3333 -> 0.6667, ref 1)
- improved: colorfulness gap 0.86 -> 0.57 (ours 0.2689 -> 0.2776, ref 0.2948)
- improved: highlight tint a gap 0.83 -> 0.55 (ours 0.2789 -> 0.8367, ref 1.936)
- improved: highlight tint b gap 2.99 -> 2.6 (ours 11.79 -> 11, ref 5.806)
- improved: black floor (p1) gap 1.37 -> 0.98 (ours 0.1255 -> 0.1176, ref 0.09804)
- regressed: shadow tint a (green-/magenta+) gap 0.73 -> 0.99 (ours 12.02 -> 12.56, ref 10.57)

## 2026-11-10 - manhole

- change: iter4: measured grammar (vfa transitions/stems on 3 hero shorts): 5 place changes as 10 f in-world dissolves instead of 44 f flights, music back to ~15 LU under VO and playing except under the splash, caption outline 0.06 em; render defaults c4/medium/crf14
- match score: 62.5 -> 65.6
- improved: sound onset rate gap 0.49 -> 0.05 (ours 3.909 -> 3.65, ref 3.618)
- improved: move ease-in frames gap 1.0 -> 0.75 (ours 5 -> 6, ref 9)
- regressed: frames with fast camera motion gap 6.07 -> 8.01 (ours 0.2502 -> 0.1534, ref 0.5539)
- improved: glide length (frames) gap 4.0 -> 3.0 (ours 24 -> 29, ref 44)
- improved: camera jerk gap 2.25 -> 0.23 (ours 49.4 -> 27.41, ref 29.48)
- regressed: push-in shot fraction gap 2.22 -> 4.44 (ours 0.6667 -> 0.3333, ref 1)
- regressed: highlight tint b gap 2.6 -> 4.12 (ours 11 -> 14.04, ref 5.806)
- improved: contrast gap 0.56 -> 0.05 (ours 0.1905 -> 0.2059, ref 0.2046)
- regressed: shadow tint a (green-/magenta+) gap 0.99 -> 1.42 (ours 12.56 -> 13.4, ref 10.57)
- regressed: micro-animation activity gap 2.72 -> 3.3 (ours 0.009391 -> 0.00709, ref 0.02028)

