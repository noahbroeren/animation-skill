/** Project registry: add a project module here to make it renderable (`node tools/render.mjs --project <id>`). */
import { ProjectDef } from "../lib/project";
import { manholeShort } from "./manhole";
import { modelsheet } from "./modelsheet";
import { lighthouseShort } from "./lighthouse";
import { pendulumLong } from "./pendulum";
import { smoke } from "./smoke";
import { charsheet } from "./charsheet";
import { elevatorShort } from "./elevator";

export const PROJECTS: ProjectDef[] = [manholeShort, modelsheet, smoke, lighthouseShort, pendulumLong, charsheet, elevatorShort];
