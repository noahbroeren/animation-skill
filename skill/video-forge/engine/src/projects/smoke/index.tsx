/** Smoke test: one inked 3D village shot with a character card, camera glide and captions. */
import React from "react";
import { cameraRig } from "../../lib/camera";
import { CharacterSpec, blinkAt, idlePose, mergePose } from "../../lib/characters/toon";
import { resolveLook } from "../../lib/look";
import { ProjectDef } from "../../lib/project";
import { CharacterCard } from "../../lib/three/cast";
import { Stage3D } from "../../lib/three/Stage3D";
import { cloudCard, ground, house, lights, rock, skyFor, tree } from "../../lib/three/world";
import { Captions } from "../../lib/two/text";

const kid: CharacterSpec = { id: "kid", skin: "#f3c9a4", hair: { color: "#5a3420", style: "short" }, top: { color: "#e2493b", accent: "#ffd23f" }, bottom: { color: "#2f4a7a" } };

const Shot: React.FC = () => {
  const rig = cameraRig([
    { f: 0, pos: [6, 2.2, 10], look: [0, 1.2, 0], fov: 32 },
    { f: 75, pos: [2.5, 1.6, 6], look: [0, 1.1, 0], fov: 30, glide: 50 },
  ], { creep: 0.012 });
  return (
    <Stage3D
      look={resolveLook("cartoon-ink")}
      build={({ scene }) => {
        skyFor(scene, "day");

        ground(scene, 300);
        const h1 = house({ w: 6, d: 5, h: 5, seed: "a" }); h1.position.set(-5, 0, -6); scene.add(h1);
        const h2 = house({ w: 5, d: 5, h: 7, seed: "b", floors: 2 }); h2.position.set(4, 0, -9); h2.rotation.y = -0.4; scene.add(h2);
        for (let i = 0; i < 6; i++) { const t = tree({ seed: "t" + i }); t.position.set(-12 + i * 5, 0, -16 - (i % 2) * 4); scene.add(t); }
        const r = rock({ seed: "r" }); r.position.set(3.5, 0, -2.5); scene.add(r);
        const c = cloudCard({ seed: "c1", w: 36 }); c.position.set(-20, 40, -120); scene.add(c);
        const L = lights(scene, "day", { shadowSize: 30 });
        const card = new CharacterCard(kid, 1.25, 1400, L.sun);
        scene.add(card.group);
        return { card, cloud: c };
      }}
      update={(w, f, { fps }) => {
        const cam = rig.at(f, fps);
        w.card.setPose(mergePose(idlePose(f, fps, 1), { expr: f > 60 ? "happy" : "neutral", blink: blinkAt(f, fps, "kid", [60]) }));
        w.card.place(0, 0, 0, cam.pos);
        w.cloud.lookAt(...cam.pos);
        return cam;
      }}
    />
  );
};

const words = [
  { word: "This", start: 0.3, end: 0.55 }, { word: "is", start: 0.55, end: 0.7 }, { word: "rendered", start: 0.7, end: 1.2 },
  { word: "natively", start: 1.25, end: 1.8 }, { word: "in", start: 1.8, end: 1.9 }, { word: "3D.", start: 1.9, end: 2.4 },
];

export const smoke: ProjectDef = {
  id: "smoke", title: "Engine smoke test", defaultFormat: "short", fps: 30,
  scenes: ({ fps }) => [{ id: "village", frames: Math.round(4 * fps), render: () => <><Shot /><Captions words={words} /></> }],
};
