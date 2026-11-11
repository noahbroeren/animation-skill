import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import { metadataFor, ProjectProps, ProjectView } from "./lib/project";
import { thumbMetadata, ThumbProps, ThumbView } from "./lib/thumbs";
import { PROJECTS } from "./projects";

const calc: CalculateMetadataFunction<ProjectProps> = ({ props }) => {
  const def = PROJECTS.find((p) => p.id === props.project)!;
  const m = metadataFor(def, props);
  return { width: m.width, height: m.height, fps: m.fps, durationInFrames: m.durationInFrames, props: { ...props, plan: m.plan } as ProjectProps };
};

const thumbCalc: CalculateMetadataFunction<ThumbProps> = ({ props }) => thumbMetadata(PROJECTS.find((p) => p.id === props.project)!, props);

export const RemotionRoot: React.FC = () => (
  <>
    {PROJECTS.map((p) => (
      <Composition
        key={p.id}
        id={p.id}
        component={(props: ProjectProps) => <ProjectView def={p} props={props} />}
        width={1440}
        height={2560}
        fps={p.fps}
        durationInFrames={1}
        defaultProps={{ project: p.id, format: p.defaultFormat, fps: p.fps, preview: true } as ProjectProps}
        calculateMetadata={calc}
      />
    ))}
    {PROJECTS.filter((p) => p.thumbnails).map((p) => (
      <Composition
        key={`${p.id}-thumb`}
        id={`${p.id}-thumb`}
        component={(props: ThumbProps) => <ThumbView def={p} props={props} />}
        width={1280}
        height={720}
        fps={p.fps}
        durationInFrames={1}
        defaultProps={{ project: p.id, variant: p.thumbnails!(p.fps)[0]?.id ?? "", kind: "long" } as ThumbProps}
        calculateMetadata={thumbCalc}
      />
    ))}
  </>
);
