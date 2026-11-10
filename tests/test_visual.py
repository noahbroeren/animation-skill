"""Visual regression tests for the engine: render fixed frames of every demo and compare with baselines.

  py tests/test_visual.py            # compare (fails if any frame drifts)
  py tests/test_visual.py --update   # accept the current renders as the new baselines (after a deliberate look change)

Each case renders a still at scale 0.25 (fast) and compares it with tests/visual/baselines/<case>.png using SSIM on
luma plus mean colour shift. Thresholds tolerate GPU/driver noise but catch real regressions (wrong-side shading,
missing ink, broken shaders, black frames, moved cameras). Baselines are machine-specific: refresh with --update
on a new machine and review the images first.
"""
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(HERE, "..", "skill", "video-forge", "engine")
BASE = os.path.join(HERE, "visual", "baselines")
CASES = [  # (name, project, format, frame)
    ("smoke_100", "smoke", "short", 100),
    ("lighthouse_215", "lighthouse", "short", 215),
    ("lighthouse_470", "lighthouse", "short", 470),
    ("pendulum_330", "pendulum", "long", 330),
    ("pendulum_760", "pendulum", "long", 760),
    ("manhole_20", "manhole", "short", 20),
    ("manhole_560", "manhole", "short", 560),
    ("manhole_880", "manhole", "short", 880),
    ("modelsheet_0", "modelsheet", "long", 0),
]
SSIM_MIN, SHIFT_MAX = 0.93, 6.0


def ssim(a, b):
    a, b = a.astype(np.float64), b.astype(np.float64)
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    mu_a, mu_b = cv2.GaussianBlur(a, (11, 11), 1.5), cv2.GaussianBlur(b, (11, 11), 1.5)
    sa = cv2.GaussianBlur(a * a, (11, 11), 1.5) - mu_a ** 2
    sb = cv2.GaussianBlur(b * b, (11, 11), 1.5) - mu_b ** 2
    sab = cv2.GaussianBlur(a * b, (11, 11), 1.5) - mu_a * mu_b
    m = ((2 * mu_a * mu_b + C1) * (2 * sab + C2)) / ((mu_a ** 2 + mu_b ** 2 + C1) * (sa + sb + C2))
    return float(m.mean())


def render(project, fmt, frame, out):
    r = subprocess.run(["node", os.path.join(ENGINE, "tools", "render.mjs"), "--project", project, "--format", fmt, "--stills", str(frame),
                        "--scale", "0.25", "--out", out], cwd=ENGINE, capture_output=True, text=True)
    p = os.path.join(out, "stills", f"f{frame:06d}.png")
    if r.returncode != 0 or not os.path.exists(p):
        raise RuntimeError(f"render failed for {project}@{frame}: {r.stderr[-800:]}")
    return p


def main(update=False):
    os.makedirs(BASE, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="vf_visual_")
    bad = []
    by_proj: dict = {}
    for name, proj, fmt, fr in CASES:  # group frames per project: one bundle per project
        by_proj.setdefault((proj, fmt), []).append((name, fr))
    for (proj, fmt), items in by_proj.items():
        out = os.path.join(tmp, proj)
        frames = ",".join(str(fr) for _, fr in items)
        r = subprocess.run(["node", os.path.join(ENGINE, "tools", "render.mjs"), "--project", proj, "--format", fmt, "--stills", frames,
                            "--scale", "0.25", "--out", out], cwd=ENGINE, capture_output=True, text=True)
        for name, fr in items:
            p = os.path.join(out, "stills", f"f{fr:06d}.png")
            if not os.path.exists(p):
                bad.append((name, "render failed", r.stderr[-300:]))
                continue
            bp = os.path.join(BASE, f"{name}.png")
            if update or not os.path.exists(bp):
                shutil.copy(p, bp)
                print(f"baseline {'updated' if update else 'created'}: {name}")
                continue
            cur, ref = cv2.imread(p), cv2.imread(bp)
            if cur.shape != ref.shape:
                bad.append((name, f"size {cur.shape} vs {ref.shape}", ""))
                continue
            s = ssim(cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY), cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY))
            shift = float(np.abs(cur.astype(float).mean((0, 1)) - ref.astype(float).mean((0, 1))).max())
            ok = s >= SSIM_MIN and shift <= SHIFT_MAX
            print(f"{'ok ' if ok else 'BAD'} {name}: SSIM {s:.4f}, colour shift {shift:.2f}")
            if not ok:
                cv2.imwrite(os.path.join(tmp, f"{name}_diff.png"), np.hstack([ref, cur, cv2.absdiff(ref, cur) * 4]))
                bad.append((name, f"SSIM {s:.4f}, shift {shift:.2f}", os.path.join(tmp, f"{name}_diff.png")))
    if bad:
        print("\nREGRESSIONS:")
        for b in bad:
            print(" -", *b)
        sys.exit(1)
    print("all visual cases match baselines")


if __name__ == "__main__":
    main("--update" in sys.argv)
