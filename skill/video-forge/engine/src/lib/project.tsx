/**
 * ProjectDef: one video production. Scenes are computed from (fps, format) so the same
 * project renders as 9:16 or 16:9, 2K or 4K, 30 or 60 fps without edits.
 */
import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { FormatId, FORMATS } from "./formats";
import { plan, SceneDef, Timeline } from "./timeline";

export type ProjectCtx = { fps: number; width: number; height: number; format: FormatId; vertical: boolean };
export type ProjectDef = {
  id: string;
  title: string;
  defaultFormat: FormatId;
  formats?: FormatId[]; // supported formats (default: all final formats)
  fps: number;
  scenes: (ctx: ProjectCtx) => SceneDef[];
  /** public/ path of the mixed master for studio preview (renders are muted and muxed by tools/render.mjs) */
  audio?: string;
  overlay?: (ctx: ProjectCtx) => React.ReactNode; // whole-video layers (captions, watermark-free branding, etc.)
};

export type ProjectProps = { project: string; format: FormatId; fps: number; preview?: boolean };

export const ctxFor = (p: ProjectDef, format: FormatId, fps: number): ProjectCtx => {
  const f = FORMATS[format];
  return { fps, width: f.width, height: f.height, format, vertical: f.height > f.width };
};

export function metadataFor(p: ProjectDef, props: ProjectProps) {
  const fps = props.fps || p.fps;
  const format = props.format || p.defaultFormat;
  const ctx = ctxFor(p, format, fps);
  const pl = plan(p.scenes(ctx));
  return { width: ctx.width, height: ctx.height, fps, durationInFrames: pl.totalFrames, plan: pl };
}

export const ProjectView: React.FC<{ def: ProjectDef; props: ProjectProps }> = ({ def, props }) => {
  const ctx = ctxFor(def, props.format || def.defaultFormat, props.fps || def.fps);
  const scenes = def.scenes(ctx);
  return (
    <AbsoluteFill>
      <Timeline scenes={scenes} />
      {def.overlay?.(ctx)}
      {props.preview && def.audio ? <Audio src={staticFile(def.audio)} /> : null}
    </AbsoluteFill>
  );
};
