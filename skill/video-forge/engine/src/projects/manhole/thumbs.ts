/**
 * Thumbnail variants for "Why manhole covers are round" (lib/thumbs.tsx, render with tools/thumbs.mjs).
 * Each one sells ONE moment of the story with one focal point and <= 3 words; they are deliberately different
 * (face / object / place / diagram / A-vs-B) so a test-and-compare has real choices.
 * The scene is the bare World (no captions); frames come from the VO-synced cues in timing().
 */
import React from "react";
import type { ThumbVariant } from "../../lib/thumbs";
import type { timing } from "./index";

type T = ReturnType<typeof timing>;
/** the project's bare World (no captions); Diagram is passed for variants that want the in-video explainer overlay */
type Parts = { World: React.FC; Diagram?: React.FC };

// top-down square-with-diagonal vs hole (vector, for the 16:9 diagram thumb)
const DIAGONAL_SVG = `
  <rect x="40" y="40" width="320" height="320" rx="14" fill="#8b93a6" stroke="#0b0b10" stroke-width="16"/>
  <g stroke="#2f3442" stroke-width="7" opacity="0.55">
    <path d="M40 120H360M40 200H360M40 280H360M120 40V360M200 40V360M280 40V360"/></g>
  <path d="M58 342L342 58" stroke="#0b0b10" stroke-width="40" stroke-linecap="round"/>
  <path d="M58 342L342 58" stroke="#ffd23f" stroke-width="24" stroke-linecap="round"/>
  <text x="225" y="185" font-family="Arial Black, sans-serif" font-weight="900" font-size="92" fill="#ffd23f" stroke="#0b0b10" stroke-width="14" paint-order="stroke fill" transform="rotate(-45 225 185)">1.41</text>
  <path d="M40 410H360" stroke="#0b0b10" stroke-width="30" stroke-linecap="round"/>
  <path d="M40 410H360" stroke="#ffffff" stroke-width="16" stroke-linecap="round"/>
  <text x="200" y="500" text-anchor="middle" font-family="Arial Black, sans-serif" font-weight="900" font-size="80" fill="#ffffff" stroke="#0b0b10" stroke-width="14" paint-order="stroke fill">1.00</text>`;

export function manholeThumbs(T: T, { World }: Parts): ThumbVariant[] {
  const world = () => React.createElement(World);
  return [
    {
      id: "wait-shock", note: "huge shocked face on the 'Wait, what?' cut + the question", scene: world,
      frame: T.wait + 8, cam: { dolly: 0.95, shift: [0.34, 0.09] },
      text: { text: "WHY|ROUND?", highlight: "round" }, layout: "left", focus: [0.72, 0.5], pop: 0.7, scrim: 0.5,
      accents: [{ type: "burst", at: [0.55, 0.2], r: 0.09, glyph: "!", rot: -12 }],
      byKind: { short: { cam: { dolly: 1.0, shift: [0, -0.06] }, layout: "top", focus: [0.5, 0.62], accents: [{ type: "burst", at: [0.84, 0.43], r: 0.13, glyph: "!" }] } },
    },
    {
      id: "slip", note: "the square cover tilted on its diagonal, slipping into its own hole", scene: world,
      frame: T.slips + 6, cam: { dolly: 1.12, orbit: -4, shift: [0.13, 0.02] },
      text: { text: "IT|FITS?!", highlight: "fits", pill: "#ff2d2d", size: 0.24 }, blur: 12, layout: "left", focus: [0.68, 0.5], pop: 0.65,
      byKind: { short: { cam: { dolly: 1.25, shift: [-0.12, -0.12] }, layout: "top", focus: [0.5, 0.6], text: { text: "IT FITS?!", highlight: "fits", pill: "#ff2d2d" } } },
    },
    {
      id: "gone", note: "looking down the shaft at the splash: the cover is gone", scene: world,
      frame: T.hole + 3, cam: { pos: [0.2, 1.0, 0.24], look: [0, -2.4, 0], fov: 52, pan: [0.17, 0] },
      text: { text: "GONE." }, layout: "left", focus: [0.7, 0.5], pop: 0.7,
      accents: [{ type: "arrow", from: [0.28, 0.8], to: [0.6, 0.6], bend: 0.3 }],
      byKind: { short: { cam: { pos: [0.2, 1.0, 0.24], look: [0, -2.4, 0], fov: 52, pan: [0, -0.06] }, layout: "top", focus: [0.5, 0.6], accents: [] } },
    },
    {
      id: "laugh", note: "the old founder laughing at the square idea", scene: world,
      frame: T.squareQ + 12, cam: { dolly: 0.55, shift: [-0.11, 0.01], lift: -4 },
      text: { text: "SQUARE?!", highlight: "square", pill: "#ff2d2d" }, layout: "right", focus: [0.3, 0.5], pop: 0.6,
      byKind: { short: { cam: { dolly: 0.7, shift: [0, -0.05] }, layout: "top", focus: [0.5, 0.6] } },
    },
    {
      id: "diagonal", note: "the explanation: the thinking worker + a square's diagonal is 1.41x its side", scene: world,
      frame: T.wait + 60, cam: { dolly: 1.3, shift: [0.33, 0] }, layout: "left", focus: [0.6, 0.5], pop: 0.6,
      accents: [{ type: "svg", at: [0.24, 0.47], size: 0.62, viewBox: "0 0 400 520", markup: DIAGONAL_SVG }],
      byKind: { short: { cam: { dolly: 2.5, shift: [0.04, -0.17] }, focus: [0.5, 0.7], accents: [{ type: "svg", at: [0.5, 0.24], size: 0.62, viewBox: "0 0 400 520", markup: DIAGONAL_SVG }] } },
    },
    {
      id: "vs", note: "square vs round from above, X and check", scene: world,
      frame: T.square1 - 20, cam: { pos: [0.18, 1.75, 0.95], look: [0, 0.0, 0.03], fov: 36 },
      split: { frame: T.summer + 40, cam: { pos: [0.18, 1.75, 0.95], look: [0, 0.0, 0.03], fov: 36 }, tint: ["#ff3030", "#30ff70"] },
      text: { text: "WHY?" }, layout: "top", pop: 0.7, scrim: 0.35, focus: [0.5, 0.55],
      accents: [{ type: "x", at: [0.25, 0.8], r: 0.09 }, { type: "check", at: [0.75, 0.8], r: 0.1 }],
      byKind: { short: { cam: { pos: [0.3, 2.6, 1.3], look: [0, 0.0, 0.03], fov: 46, shift: [0, -0.1] }, split: { frame: T.summer + 40, cam: { pos: [0.3, 2.6, 1.3], look: [0, 0.0, 0.03], fov: 46 }, tint: ["#ff3030", "#30ff70"] },
        accents: [{ type: "x", at: [0.84, 0.42], r: 0.08 }, { type: "check", at: [0.84, 0.92], r: 0.09 }], layout: "top" } },
    },
    {
      id: "payoff", note: "the founder wins: PRICES x2 sign", scene: world,
      frame: T.doubled + 14, cam: { dolly: 0.62, shift: [0.11, 0] },
      text: { text: "HE WAS|RIGHT", highlight: "right" }, layout: "left", focus: [0.68, 0.5], pop: 0.6,
      byKind: { short: { cam: { dolly: 0.85, shift: [0, -0.1] }, layout: "top", focus: [0.5, 0.62] } },
    },
  ];
}
