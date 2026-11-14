/** Project registry: add a project module here to make it renderable (`node tools/render.mjs --project <id>`). */
import { ProjectDef } from "../lib/project";
import { manholeShort } from "./manhole";
import { modelsheet } from "./modelsheet";
import { lighthouseShort } from "./lighthouse";
import { pendulumLong } from "./pendulum";
import { smoke } from "./smoke";
import { charsheet } from "./charsheet";
import { elevatorShort } from "./elevator";
import { setsheet } from "./setsheet";
import { coinShort } from "./coins";
import { propsheet } from "./propsheet";
import { hairsheet } from "./hairsheet";
import { facesheet } from "./facesheet";
import { wardrobesheet } from "./wardrobesheet";
import { castsheet } from "./castsheet";
import { doorphotoBanner, doorphotoShort, doorphotoThumb } from "./doorphoto";
import { channelart } from "./channelart";
import { balloonsShort, balloonsThumb } from "./balloons";
import { bakedtest } from "./bakedtest";

export const PROJECTS: ProjectDef[] = [manholeShort, modelsheet, smoke, lighthouseShort, pendulumLong, charsheet, elevatorShort, setsheet, propsheet, coinShort, hairsheet, facesheet, wardrobesheet, castsheet, doorphotoShort, doorphotoThumb, doorphotoBanner, channelart, balloonsShort, balloonsThumb, bakedtest];
