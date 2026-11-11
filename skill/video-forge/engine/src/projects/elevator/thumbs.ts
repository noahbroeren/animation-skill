/**
 * Thumbnail variants for "Why Elevators Don't Fall" (lib/thumbs.tsx, render with tools/thumbs.mjs).
 * One moment per variant, one focal point, <= 3 words; deliberately different (act / face / mechanism / payoff).
 */
import React from "react";
import type { ThumbVariant } from "../../lib/thumbs";
import type { timing } from "./index";

type T = ReturnType<typeof timing>;
type Parts = { World: React.FC };

export function elevatorThumbs(T: T, { World }: Parts): ThumbVariant[] {
  const world = () => React.createElement(World);
  return [
    {
      id: "axe", note: "the axe about to hit the only rope while a man stands high on the platform", scene: world,
      frame: T.snapped - 6, cam: { pos: [4.3, 1.0, 4.9], look: [1.6, 2.7, 0.2], fov: 52 }, // sheet v1: subject only 13.5 % -> closer
      text: { text: "CUT IT.", highlight: "cut" }, layout: "left", focus: [0.62, 0.5], pop: 0.65,
      accents: [{ type: "arrow", from: [0.3, 0.75], to: [0.58, 0.62], bend: 0.3 }],
      byKind: { short: { cam: { pos: [4.6, 0.9, 6.2], look: [1.2, 3.6, 0], fov: 56 }, layout: "top", focus: [0.5, 0.62] } },
    },
    {
      id: "shock", note: "the crowd's shocked faces on 'Wait, what?'", scene: world,
      frame: T.wait + 8, cam: { dolly: 0.85 },
      text: { text: "IT|STOPPED?!", highlight: "stopped", pill: "#ff2d2d" }, layout: "top", focus: [0.5, 0.62], pop: 0.7, scrim: 0.45,
      accents: [{ type: "burst", at: [0.82, 0.3], r: 0.1, glyph: "!" }],
    },
    {
      id: "drop", note: "the platform dropping on the cut rope, Otis braced", scene: world,
      frame: T.dropped + 1, cam: { dolly: 1.05 },
      text: { text: "NO|FALL?", highlight: "fall" }, layout: "top", focus: [0.5, 0.6], pop: 0.65,
    },
    {
      id: "skyline", note: "old Otis, hat to his chest, under the skyline he never saw", scene: world,
      // sheet v1 used the shot camera: houses hid the skyline and Otis was tiny -> low angle past his shoulder
      frame: T.possible, cam: { pos: [80 + 3.1, 1.15, 6.6], look: [80 + 0.6, 13, -40], fov: 56 },
      text: { text: "HE NEVER|SAW IT", highlight: "never" }, layout: "top", focus: [0.5, 0.6], pop: 0.6,
    },
  ];
}
