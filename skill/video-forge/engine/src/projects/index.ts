/** Project registry: add a project module here to make it renderable (`node tools/render.mjs --project <id>`). */
import { ProjectDef } from "../lib/project";
import { lighthouseShort } from "./lighthouse";
import { pendulumLong } from "./pendulum";
import { smoke } from "./smoke";

export const PROJECTS: ProjectDef[] = [smoke, lighthouseShort, pendulumLong];
