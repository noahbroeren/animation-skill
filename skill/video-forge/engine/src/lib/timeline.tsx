/**
 * Timeline: an ordered list of scenes with transitions -> Remotion Sequences.
 *
 * Transitions overlap the previous scene's tail by `frames`. Editing grammar from the
 * reference studies: prefer travelling the camera into the next moment (soft
 * transitions / motion transitions) over bare hard cuts; when you cut, cut on
 * action or on a beat.
 *
 * plan() returns the edit decision list (scene starts, planned hard cuts incl.
 * in-scene camera cuts). The render tool writes it to timeline.json and `vfa qa
 * --plan` uses it to tell intended cuts from glitches.
 */
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, ease } from "./time";

export type TransitionType = "cut" | "crossfade" | "dip" | "whip" | "zoom" | "wipe" | "flash" | "slide-up";
export type Transition = { type: TransitionType; frames?: number; color?: string };

export type SceneDef = {
  id: string;
  frames: number;
  render: () => React.ReactNode;
  transition?: Transition; // INTO this scene
  innerCuts?: number[]; // local frames of hard cuts inside the scene (camera cuts)
  innerSoft?: number[]; // local frames of in-world dissolves (rig dissolve keys): soft transitions
  events?: number[]; // local frames of intended big visual changes (graphic slams, flashes) -> QA won't call them glitches
  cues?: Record<string, number>; // named local frames (story beats) -> timeline.json "cues" -> sound design reads them
  chapter?: string;
  /** sound cue sheet from the picture (lib/board.tsx): local frames -> timeline.json -> audio/score.py */
  sounds?: { f: number; name: string; lu?: number; pan?: number; anchor?: number; on_word?: boolean }[];
  music?: { f: number; mode: string }[];
  rain?: { f: number; amount: number }[];
  places?: { f: number; set: string; interior: boolean }[];
};

const DEF_FRAMES: Record<TransitionType, number> = { cut: 0, crossfade: 14, dip: 18, whip: 10, zoom: 14, wipe: 16, flash: 8, "slide-up": 12 };
const tf = (t?: Transition) => (t && t.type !== "cut" ? t.frames ?? DEF_FRAMES[t.type] : 0);

export function plan(scenes: SceneDef[]) {
  let at = 0;
  const out: { id: string; start: number; frames: number; transition: string; chapter?: string }[] = [];
  const cuts: number[] = [];
  const soft: number[] = [];
  const events: number[] = [];
  const cues: Record<string, number> = {};
  const sounds: NonNullable<SceneDef["sounds"]> = [], music: NonNullable<SceneDef["music"]> = [], rain: NonNullable<SceneDef["rain"]> = [], places: NonNullable<SceneDef["places"]> = [];
  scenes.forEach((s, i) => {
    const ov = i === 0 ? 0 : tf(s.transition);
    const start = i === 0 ? 0 : at - ov;
    out.push({ id: s.id, start, frames: s.frames, transition: s.transition?.type ?? "cut", chapter: s.chapter });
    if (i > 0) ((s.transition?.type ?? "cut") === "cut" || s.transition?.type === "flash" ? cuts : soft).push(start + (s.transition?.type === "flash" ? Math.round(ov / 2) : 0));
    for (const c of s.innerCuts ?? []) cuts.push(start + c);
    for (const c of s.innerSoft ?? []) soft.push(start + c);
    for (const e of s.events ?? []) events.push(start + e);
    for (const [k, v] of Object.entries(s.cues ?? {})) cues[`${s.id}.${k}`] = start + v;
    for (const x of s.sounds ?? []) sounds.push({ ...x, f: start + x.f });
    for (const x of s.music ?? []) music.push({ ...x, f: start + x.f });
    for (const x of s.rain ?? []) rain.push({ ...x, f: start + x.f });
    for (const x of s.places ?? []) places.push({ ...x, f: start + x.f });
    at = start + s.frames;
  });
  return { totalFrames: at, scenes: out, cuts: cuts.sort((a, b) => a - b), soft, events: events.sort((a, b) => a - b), cues, ...(sounds.length ? { sounds, music, rain, places } : {}) };
}

const Wrap: React.FC<{ children: React.ReactNode; enter?: Transition; exit?: Transition; frames: number }> = ({ children, enter, exit, frames }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ef = tf(enter), xf = tf(exit);
  const p = ef ? clamp(f / ef) : 1; // entering progress
  const q = xf ? clamp((f - (frames - xf)) / xf) : 0; // exiting progress (next scene's transition)
  let style: React.CSSProperties = {};
  let overlay: React.ReactNode = null;
  const e = ease.inOutCubic(p);
  if (enter && p < 1) {
    switch (enter.type) {
      case "crossfade": style.opacity = e; break;
      case "dip": style.opacity = p < 0.5 ? 0 : ease.smooth((p - 0.5) * 2);
        overlay = <AbsoluteFill style={{ background: enter.color ?? "#000", opacity: 1 - Math.abs(2 * p - 1) }} />; break;
      case "whip": style.transform = `translateX(${(1 - e) * width}px)`; style.filter = `blur(${Math.sin(p * Math.PI) * width * 0.012}px)`; break;
      case "zoom": style.transform = `scale(${0.75 + 0.25 * e})`; style.opacity = e; style.filter = `blur(${(1 - e) * width * 0.006}px)`; break;
      case "wipe": style.clipPath = `inset(0 0 0 ${(1 - e) * 100}%)`; break;
      case "slide-up": style.transform = `translateY(${(1 - e) * height}px)`; break;
      case "flash": style.opacity = p < 0.5 ? 0 : 1; overlay = <AbsoluteFill style={{ background: enter.color ?? "#fff", opacity: 1 - Math.abs(2 * p - 1) }} />; break;
    }
  }
  if (exit && q > 0) {
    const x = ease.inOutCubic(q);
    switch (exit.type) {
      case "whip": style.transform = `translateX(${-x * width}px)`; style.filter = `blur(${Math.sin(q * Math.PI) * width * 0.012}px)`; break;
      case "zoom": style.transform = `scale(${1 + 1.6 * x})`; style.opacity = 1 - x; break;
      case "slide-up": style.transform = `translateY(${-x * height * 0.3}px)`; break;
      default: break; // crossfade/dip/wipe/flash are drawn by the entering scene on top
    }
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={style}>{children}</AbsoluteFill>
      {overlay}
    </AbsoluteFill>
  );
};

export const Timeline: React.FC<{ scenes: SceneDef[] }> = ({ scenes }) => {
  const pl = plan(scenes);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {scenes.map((s, i) => (
        <Sequence key={s.id} from={pl.scenes[i].start} durationInFrames={s.frames} name={s.id}>
          <Wrap enter={i ? s.transition : undefined} exit={scenes[i + 1]?.transition} frames={s.frames}>{s.render()}</Wrap>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
