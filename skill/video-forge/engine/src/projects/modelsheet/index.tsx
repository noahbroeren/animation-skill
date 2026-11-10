/**
 * Model sheet: every expression + key poses of a cast, for look-dev and consistency checks.
 *   node tools/render.mjs --project modelsheet --format long --stills 0
 * Edit CAST to show a production's characters (import them from its bible).
 */
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CharacterSpec, drawCharacter, Expression, Pose, Viseme, walkPose } from "../../lib/characters/toon";
import { ProjectDef } from "../../lib/project";
import { FONTS } from "../../lib/two/text";

export const CAST: CharacterSpec[] = [
  { id: "worker", style: "toonworld", skin: "#fef4ee", hair: { color: "#5b3a24", style: "short" }, top: { color: "#f08a24" }, bottom: { color: "#3a4a78" }, hat: { style: "cap", color: "#e8b923" } },
  { id: "mayor", style: "toonworld", skin: "#fef4ee", top: { color: "#2f3a5c", style: "coat", accent: "#d8b04a" }, bottom: { color: "#23293d" }, hat: { style: "top", color: "#1d1f2b" }, build: "stout" },
  { id: "founder", style: "toonworld", skin: "#fef4ee", hair: { color: "#d9d4cc", style: "bald" }, beard: "#e6e1d8", top: { color: "#8a4b2e" }, bottom: { color: "#4b3a2e" }, build: "slim" },
  { id: "classic", skin: "#f3c9a4", hair: { color: "#5a3420", style: "short" }, top: { color: "#e2493b", accent: "#ffd23f" }, bottom: { color: "#2f4a7a" } },
];
const EXPR: Expression[] = ["neutral", "happy", "laugh", "shock", "nervous", "sad", "angry", "whistle", "smug", "think"];

const Cell: React.FC<{ spec: CharacterSpec; pose: Pose; w: number; h: number; label: string }> = ({ spec, pose, w, h, label }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  useLayoutEffect(() => { const g = ref.current!.getContext("2d")!; drawCharacter(g, spec, pose, w, h); }, [frame, spec, pose, w, h]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <canvas ref={ref} width={w} height={h} style={{ width: w, height: h }} />
      <div style={{ fontFamily: FONTS.mono, fontSize: 18, color: "#333" }}>{label}</div>
    </div>
  );
};

const Sheet: React.FC = () => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const rows = CAST.length;
  const ch = Math.floor((height - 60) / rows) - 24, cw = Math.floor(ch * 0.72);
  const page = Number(new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("page") ?? 0);
  const VIS: Viseme[] = ["A", "E", "I", "O", "U", "M", "F", "L", "W"];
  const poses: [string, Pose][] = frame < 30
    ? [...EXPR.map((e) => [e, { expr: e }] as [string, Pose]), ["walk", walkPose(frame + 7, fps)], ["book", { prop: "book", expr: "think" }], ["talk", { mouth: 0.8 }]]
    : [...VIS.map((v) => ["viseme " + v, { viseme: v }] as [string, Pose]), ["side", { view: "side" }], ["side walk", { ...walkPose(frame + 7, fps), view: "side" }], ["side talk", { view: "side", viseme: "O" }]];
  void page;
  const cols = Math.min(poses.length, Math.floor(width / (cw + 8)));
  return (
    <AbsoluteFill style={{ background: "#efe9df", padding: 20, gap: 4 }}>
      <div style={{ fontFamily: FONTS.display, fontSize: 26, color: "#222" }}>MODEL SHEET · {CAST.map((c) => `${c.id} (${c.style ?? "classic"})`).join(" · ")}</div>
      {CAST.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 8 }}>
          {poses.slice(0, cols).map(([lab, p]) => <Cell key={lab} spec={c} pose={p} w={cw} h={ch} label={lab} />)}
        </div>
      ))}
    </AbsoluteFill>
  );
};

export const modelsheet: ProjectDef = {
  id: "modelsheet", title: "Model sheet", defaultFormat: "long", fps: 30,
  scenes: ({ fps }) => [{ id: "sheet", frames: 2 * fps, render: () => <Sheet /> }],
};
