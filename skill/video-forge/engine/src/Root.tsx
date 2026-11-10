import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import { metadataFor, ProjectProps, ProjectView } from "./lib/project";
import { PROJECTS } from "./projects";

const calc: CalculateMetadataFunction<ProjectProps> = ({ props }) => {
  const def = PROJECTS.find((p) => p.id === props.project)!;
  const m = metadataFor(def, props);
  return { width: m.width, height: m.height, fps: m.fps, durationInFrames: m.durationInFrames, props: { ...props, plan: m.plan } as ProjectProps };
};

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
  </>
);
