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

## 2026-11-11 - elevator

- change: iter2 (elevator proof short, stick cast): 3 cuts -> camera travels (16 f whip-crane, 28 f push-in, 34 f crane), grade from the gap table (highlights +R/-G, shadows less magenta, sat 1.14), DOF on all day shots, bunting sway, master -1.5 dBTP
- note: measured vs the shipped fingerprint; iter1 used the same aggregate
- match score: 53.1 -> 75.0
- improved: true peak gap 1.1 -> 0.6 (ours -0.9 -> -1.4, ref -2)
- improved: frames with camera motion gap 1.52 -> 0.58 (ours 0.8349 -> 0.9289, ref 0.9873)
- improved: frames with fast camera motion gap 6.62 -> 6.07 (ours 0.2231 -> 0.2503, ref 0.5539)
- regressed: glide length (frames) gap 3.4 -> 4.2 (ours 27 -> 23, ref 44)
- improved: camera jerk gap 3.07 -> 0.21 (ours 2.3 -> 27.6, ref 29.48)
- regressed: move ease-out frames gap 0.62 -> 0.88 (ours 9 -> 8, ref 11.5)
- improved: colorfulness gap 1.06 -> 0.34 (ours 0.3266 -> 0.3051, ref 0.2948)
- improved: highlight tint a gap 5.69 -> 0.68 (ours -9.439 -> 3.29, ref 1.936)
- regressed: highlight tint b gap 0.7 -> 3.02 (ours 7.207 -> -0.2335, ref 5.806)
- regressed: black floor (p1) gap 0.0 -> 0.78 (ours 0.09804 -> 0.1137, ref 0.09804)
- improved: contrast gap 0.95 -> 0.3 (ours 0.1807 -> 0.2121, ref 0.2046)
- improved: saturation gap 1.4 -> 0.32 (ours 0.536 -> 0.4927, ref 0.48)
- regressed: shadow tint b (blue-/yellow+) gap 0.16 -> 0.46 (ours -5.045 -> -4.455, ref -5.367)
- regressed: warmth (R-B) gap 1.76 -> 2.11 (ours 0.001936 -> -0.006704, ref 0.04604)
- improved: average shot length gap 10.19 -> 6.64 (ours 10.09 -> 20.19, ref 16.21)
- improved: cuts per minute gap 0.76 -> 0.23 (ours 4.953 -> 1.981, ref 2.667)
- improved: DOF centre/border sharpness gap 2.74 -> 2.4 (ours 1.128 -> 1.231, ref 1.952)
- improved: edge density (detail) gap 1.17 -> 0.75 (ours 0.04304 -> 0.04942, ref 0.06065)
- regressed: ink lines on edges gap 0.02 -> 0.6 (ours 0.3494 -> 0.3034, ref 0.351)

## 2026-11-11 - elevator

- change: iter3: warmer highs [.03,-.004,-.03], DOF maxBlur 9, motes() dust in hall+street, hook re-framed after the shot audit, longer travels (20/36 f)
- note: motes did NOT move micro-animation (.0070 -> .0070): the metric is motion-compensated residual energy, it scales with character PIXEL AREA; thin stick casts read ~1/3 of bean-head cards. Don't chase it with particles; use bigger gestures/closer framing or accept the style difference.
- match score: 75.0 -> 78.1
- improved: frames with fast camera motion gap 6.07 -> 5.53 (ours 0.2503 -> 0.2773, ref 0.5539)
- regressed: glide length (frames) gap 4.2 -> 5.1 (ours 23 -> 18.5, ref 44)
- regressed: camera jerk gap 0.21 -> 1.91 (ours 27.6 -> 12.55, ref 29.48)
- improved: highlight tint b gap 3.02 -> 0.19 (ours -0.2335 -> 6.186, ref 5.806)
- improved: shadow tint a (green-/magenta+) gap 1.87 -> 1.53 (ours 14.31 -> 13.62, ref 10.57)
- regressed: shadow tint b (blue-/yellow+) gap 0.46 -> 0.9 (ours -4.455 -> -3.564, ref -5.367)
- improved: warmth (R-B) gap 2.11 -> 0.64 (ours -0.006704 -> 0.03005, ref 0.04604)

## 2026-11-11 - coins

- change: travel instead of cuts inside a place, settle after cuts, DOF by shot size, interior lift, warmer office key, three-quarter dialogue, den restaged out of the clipper's own shadow
- match score: 50.0 -> 50.0
- regressed: move ease-in frames gap 0.75 -> 1.25 (ours 6 -> 4, ref 9)
- improved: frames with fast camera motion gap 7.01 -> 5.37 (ours 0.2035 -> 0.2854, ref 0.5539)
- regressed: glide length (frames) gap 4.0 -> 5.2 (ours 24 -> 18, ref 44)
- improved: camera jerk gap 2.87 -> 1.27 (ours 4.084 -> 18.24, ref 29.48)
- regressed: move ease-out frames gap 1.12 -> 1.62 (ours 7 -> 5, ref 11.5)
- improved: colorfulness gap 3.55 -> 3.05 (ours 0.1884 -> 0.2033, ref 0.2948)
- regressed: highlight tint a gap 1.58 -> 2.5 (ours 5.091 -> 6.94, ref 1.936)
- improved: highlight tint b gap 3.97 -> 1.78 (ours -2.14 -> 2.238, ref 5.806)
- improved: mean brightness gap 3.48 -> 1.56 (ours 0.3255 -> 0.4025, ref 0.4649)
- improved: black floor (p1) gap 0.98 -> 0.2 (ours 0.07843 -> 0.102, ref 0.09804)
- regressed: saturation gap 1.43 -> 1.87 (ours 0.4226 -> 0.4054, ref 0.48)
- regressed: shadow tint a (green-/magenta+) gap 0.19 -> 0.48 (ours 10.94 -> 11.52, ref 10.57)
- improved: warmth (R-B) gap 1.27 -> 0.16 (ours 0.01429 -> 0.04211, ref 0.04604)
- improved: average shot length gap 22.9 -> 20.7 (ours 2.47 -> 3.787, ref 16.21)
- improved: cuts per minute gap 6.86 -> 4.04 (ours 23.24 -> 14.79, ref 2.667)
- improved: DOF centre/border sharpness gap 2.99 -> 2.0 (ours 1.055 -> 1.351, ref 1.952)
- regressed: edge density (detail) gap 1.19 -> 1.83 (ours 0.04281 -> 0.03327, ref 0.06065)

## 2026-11-11 - coins

- change: longer travels (24 f), bigger settle and pushes, more saturated room palettes and grade, stronger idle micro-motion, depth of field off on wides
- match score: 50.0 -> 50.0
- improved: frames with fast camera motion gap 5.37 -> 4.78 (ours 0.2854 -> 0.3149, ref 0.5539)
- improved: glide length (frames) gap 5.2 -> 4.8 (ours 18 -> 20, ref 44)
- regressed: camera jerk gap 1.27 -> 2.16 (ours 18.24 -> 10.42, ref 29.48)
- improved: move ease-out frames gap 1.62 -> 1.12 (ours 5 -> 7, ref 11.5)
- improved: colorfulness gap 3.05 -> 2.22 (ours 0.2033 -> 0.2283, ref 0.2948)
- regressed: highlight tint a gap 2.5 -> 3.1 (ours 6.94 -> 8.128, ref 1.936)
- improved: highlight tint b gap 1.78 -> 1.19 (ours 2.238 -> 3.435, ref 5.806)
- improved: saturation gap 1.87 -> 0.9 (ours 0.4054 -> 0.444, ref 0.48)
- regressed: shadow tint a (green-/magenta+) gap 0.48 -> 1.05 (ours 11.52 -> 12.67, ref 10.57)
- improved: shadow tint b (blue-/yellow+) gap 0.82 -> 0.57 (ours -3.723 -> -4.233, ref -5.367)
- regressed: warmth (R-B) gap 0.16 -> 0.75 (ours 0.04211 -> 0.06471, ref 0.04604)
- regressed: average shot length gap 20.7 -> 23.07 (ours 3.787 -> 2.367, ref 16.21)
- regressed: cuts per minute gap 4.04 -> 7.21 (ours 14.79 -> 24.3, ref 2.667)
- regressed: DOF centre/border sharpness gap 2.0 -> 2.34 (ours 1.351 -> 1.249, ref 1.952)

## 2026-11-11 - coins

- change: travels handed over cleanly (no mid-travel jump), soft cuts (4 f), gentle settle, eye-trace side kept across cuts
- match score: 50.0 -> 50.0
- improved: move ease-in frames gap 1.25 -> 0.75 (ours 4 -> 6, ref 9)
- improved: frames with camera motion gap 0.89 -> 0.59 (ours 0.8988 -> 0.9284, ref 0.9873)
- improved: frames with fast camera motion gap 4.78 -> 3.91 (ours 0.3149 -> 0.3582, ref 0.5539)
- improved: glide length (frames) gap 4.8 -> 3.4 (ours 20 -> 27, ref 44)
- improved: camera jerk gap 2.16 -> 1.01 (ours 10.42 -> 38.4, ref 29.48)
- regressed: move ease-out frames gap 1.12 -> 1.62 (ours 7 -> 5, ref 11.5)
- improved: highlight tint a gap 3.1 -> 2.81 (ours 8.128 -> 7.555, ref 1.936)
- regressed: shadow tint a (green-/magenta+) gap 1.05 -> 1.34 (ours 12.67 -> 13.26, ref 10.57)
- improved: average shot length gap 23.07 -> 20.7 (ours 2.367 -> 3.787, ref 16.21)
- improved: cuts per minute gap 7.21 -> 4.04 (ours 24.3 -> 14.79, ref 2.667)
- improved: micro-animation activity gap 2.16 -> 1.72 (ours 0.01164 -> 0.01339, ref 0.02028)

## 2026-11-11 - coins

- change: follow shots end where the subject ends, whips are planned soft transitions, no blur drop-out on fast travels
- match score: 50.0 -> 56.2
- improved: move ease-in frames gap 0.75 -> 0.0 (ours 6 -> 9, ref 9)
- regressed: frames with fast camera motion gap 3.91 -> 4.42 (ours 0.3582 -> 0.3331, ref 0.5539)
- improved: camera jerk gap 1.01 -> 0.44 (ours 38.4 -> 25.55, ref 29.48)
- improved: shadow tint a (green-/magenta+) gap 1.34 -> 0.98 (ours 13.26 -> 12.53, ref 10.57)
- improved: average shot length gap 20.7 -> 20.25 (ours 3.787 -> 4.057, ref 16.21)
- improved: cuts per minute gap 4.04 -> 3.69 (ours 14.79 -> 13.73, ref 2.667)

## 2026-11-11 - coins

- change: plan: whips and travels declared (no picture change)
- match score: 56.2 -> 56.2
- regressed: move ease-in frames gap 0.0 -> 0.5 (ours 9 -> 7, ref 9)
- regressed: glide length (frames) gap 3.4 -> 5.1 (ours 27 -> 18.5, ref 44)

