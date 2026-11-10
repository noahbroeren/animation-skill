"""CLIP image embeddings: zero-shot style tags (`vfa embed`) and style similarity (`vfa similar`).

Model: open_clip ViT-B-32 (laion2b_s34b_b79k) by default; override with VFA_CLIP_MODEL="ARCH:TAG".
Weights download once from the Hugging Face hub (~600 MB). GPU when torch has CUDA.

- Frames: one every `every` s (1 s for shorts) + each shot keyframe from the analysis; assigned
  to shots by time. Embeddings are cached in <analysis>/embeddings.npz (model-tagged).
- Tags: zero-shot softmax (logit scale 100) per prompt group, averaged over frames: render style,
  lighting, shot type. Per-shot top tags are also stored.
- Similar: per-shot nearest-neighbour cosine (each of our frames vs its closest reference frame,
  averaged per shot; measures shared scenes/content), centroid cosine, tag-distribution overlap and
  a 0-100 style-similarity score from the centroid cosine. HEURISTIC anchors measured with CLIP B/32:
  1.0 same video; ~0.83-0.88 two shorts of the same cartoon channel (their frame NN cosine is only
  ~0.55-0.6 because the scenes differ); lower for other looks.
  score = 100 * clip((centroid_cos - 0.6) / 0.35, 0, 1).
"""
from __future__ import annotations

import os

import numpy as np

from .extutil import load_fp, optional, resolve, save, torch_device, unavailable
from .mediaio import iter_frames, probe

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

GROUPS = {
    "style": {
        "2D cartoon": "a western 2D cartoon with simple characters and bold outlines",
        "3D render": "a 3D animated movie render, CGI like Pixar",
        "flat vector": "a flat vector illustration with simple shapes", "photoreal": "a photorealistic image",
        "anime": "a Japanese anime screenshot", "pixel art": "pixel art", "low poly": "a low poly 3D render",
        "clay": "a claymation stop-motion frame", "paper cutout": "a paper cutout animation",
        "live action": "a live action video still of real people", "whiteboard": "a whiteboard sketch animation",
    },
    "lighting": {
        "day": "a scene in bright daylight", "golden hour": "a scene at golden hour with warm sunset light",
        "night": "a scene at night in the dark", "interior": "an indoor interior scene with artificial light",
    },
    "shot": {
        "close-up": "a close-up shot of a face or object", "medium": "a medium shot of a character from the waist up",
        "wide": "a wide establishing shot of a whole scene", "aerial": "an aerial drone view from high above",
    },
}


def _model_id() -> tuple[str, str]:
    m = os.environ.get("VFA_CLIP_MODEL", "ViT-B-32:laion2b_s34b_b79k")
    arch, _, tag = m.partition(":")
    return arch, tag or "laion2b_s34b_b79k"


_CACHE: dict = {}


def _load():
    if "m" in _CACHE:
        return _CACHE["m"]
    oc, err = optional("open_clip")
    torch, err2 = optional("torch")
    if oc is None or torch is None:
        raise RuntimeError(err or err2)
    arch, tag = _model_id()
    dev = torch_device()
    model, _, preprocess = oc.create_model_and_transforms(arch, pretrained=tag, device=dev)
    model.eval()
    tok = oc.get_tokenizer(arch)
    _CACHE["m"] = (torch, model, preprocess, tok, dev, f"{arch}:{tag}")
    return _CACHE["m"]


def _encode_images(imgs: list[np.ndarray]) -> np.ndarray:
    torch, model, preprocess, _, dev, _ = _load()
    from PIL import Image
    out = []
    with torch.no_grad():
        for i in range(0, len(imgs), 32):
            batch = torch.stack([preprocess(Image.fromarray(im)) for im in imgs[i:i + 32]]).to(dev)
            f = model.encode_image(batch).float()
            out.append((f / f.norm(dim=-1, keepdim=True)).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0, 512), np.float32)


def _encode_text(texts: list[str]) -> np.ndarray:
    torch, model, _, tok, dev, _ = _load()
    with torch.no_grad():
        f = model.encode_text(tok(texts).to(dev)).float()
        return (f / f.norm(dim=-1, keepdim=True)).cpu().numpy()


def embeddings(vid: str, adir: str, every: float | None = None) -> dict:
    """Compute (or load cached) frame embeddings for an analysis dir."""
    _, _, _, _, _, mid = _load()
    cache = os.path.join(adir, "embeddings.npz")
    if os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(vid):
        z = np.load(cache, allow_pickle=False)
        if str(z["model"]) == mid:
            return {k: z[k] for k in z.files}
    pr = probe(vid)
    fps = pr.fps
    if every is None:
        every = 1.0 if pr.duration <= 300 else max(2.0, pr.duration / 600)
    fp = load_fp(adir)
    shots = fp.get("shots") or [{"start": 0, "end": int(pr.duration * fps)}]
    imgs, times, kinds = [], [], []
    for i, rgb in enumerate(iter_frames(vid, 336, fps=1.0 / every)):
        imgs.append(rgb.copy())
        times.append(i * every + 0.5 * every)
        kinds.append(0)
    import cv2
    for s in shots:
        kf = s.get("keyframe")
        if kf and os.path.exists(kf):
            im = cv2.imread(kf)
            if im is not None:
                h, w = im.shape[:2]
                im = cv2.resize(im, (336, int(336 * h / w)), interpolation=cv2.INTER_AREA)
                imgs.append(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
                times.append((s["start"] + s["end"]) / 2 / fps)
                kinds.append(1)
    emb = _encode_images(imgs)
    t = np.asarray(times)
    starts = np.array([s["start"] / fps for s in shots])
    shot_idx = np.clip(np.searchsorted(starts, t, side="right") - 1, 0, len(shots) - 1)
    z = {"emb": emb.astype(np.float32), "t": t, "shot": shot_idx, "kind": np.asarray(kinds), "model": np.array(mid)}
    np.savez_compressed(cache, **z)
    return z


def _tags(emb: np.ndarray) -> dict:
    res = {}
    for g, prompts in GROUPS.items():
        names = list(prompts)
        T = _encode_text(list(prompts.values()))
        logits = 100.0 * emb @ T.T
        p = np.exp(logits - logits.max(1, keepdims=True))
        p /= p.sum(1, keepdims=True)
        res[g] = (names, p)
    return res


def run(target: str, video: str | None = None, every: float | None = None, out_name: str = "embed") -> dict:
    vid, adir = resolve(target, video)
    try:
        z = embeddings(vid, adir, every)
    except Exception as e:
        d = unavailable("embed", f"{type(e).__name__}: {str(e)[:200]}", "py -m pip install open_clip_torch torch")
        save(adir, out_name, d, "## Style tags (CLIP)\n\n- unavailable: " + d["reason"])
        return d
    emb, shot = z["emb"], z["shot"]
    tg = _tags(emb)
    video_tags = {g: {n: round(float(v), 3) for n, v in sorted(zip(names, p.mean(0)), key=lambda x: -x[1])}
                  for g, (names, p) in tg.items()}
    per_shot = []
    for s in sorted(set(shot.tolist())):
        m = shot == s
        per_shot.append({"shot_index": int(s), "frames": int(m.sum()),
                         **{g: names[int(np.argmax(p[m].mean(0)))] for g, (names, p) in tg.items()}})
    cen = emb.mean(0)
    cen = cen / (np.linalg.norm(cen) + 1e-9)
    spread = float(np.mean(emb @ cen))
    top = {g: next(iter(v)) for g, v in video_tags.items()}
    data = {"schema": "vfa.embed/1", "available": True, "model": str(z["model"]), "frames": int(len(emb)),
            "tags": video_tags, "top": top, "per_shot": per_shot, "self_consistency": round(spread, 4),
            "summary": {"available": True, "model": str(z["model"]), "style": top["style"],
                        "style_p": video_tags["style"][top["style"]], "lighting": top["lighting"], "shot": top["shot"],
                        "shot_mix": video_tags["shot"], "self_consistency": round(spread, 4),
                        "centroid": [round(float(x), 4) for x in cen]}}
    save(adir, out_name, data, md_section(data))
    return data


def similar(ref: str, ours: str, out: str | None = None) -> dict:
    rv, rdir = resolve(ref)
    ov, odir = resolve(ours)
    try:
        R = embeddings(rv, rdir)
        O = embeddings(ov, odir)
    except Exception as e:
        d = unavailable("similar", f"{type(e).__name__}: {str(e)[:200]}", "py -m pip install open_clip_torch torch")
        save(odir, "similar", d, "## Style similarity\n\n- unavailable: " + d["reason"])
        return d
    Re, Oe = R["emb"], O["emb"]
    rows = []
    for s in sorted(set(O["shot"].tolist())):
        S = Oe[O["shot"] == s] @ Re.T                 # every frame of our shot vs every reference frame
        best = S.max(1)
        j = int(np.argmax(S.max(0)))
        rows.append({"shot": int(s), "nn_cos": round(float(best.mean()), 4), "nn_cos_min": round(float(best.min()), 4),
                     "ref_t": round(float(R["t"][j]), 2), "ref_shot": int(R["shot"][j])})
    cen = lambda E: (E.mean(0) / (np.linalg.norm(E.mean(0)) + 1e-9))
    ccos = float(cen(Re) @ cen(Oe))
    nn = float(np.mean([r["nn_cos"] for r in rows])) if rows else 0.0
    tr, to = _tags(Re), _tags(Oe)
    overlap = {g: round(1 - 0.5 * float(np.abs(tr[g][1].mean(0) - to[g][1].mean(0)).sum()), 3) for g in GROUPS}
    score = round(100 * float(np.clip((ccos - 0.6) / 0.35, 0, 1)), 1)
    data = {"schema": "vfa.similar/1", "available": True, "ref": rdir, "ours": odir, "model": str(O["model"]),
            "centroid_cos": round(ccos, 4), "mean_nn_cos": round(nn, 4), "tag_overlap": overlap,
            "style_similarity": score, "per_shot": rows,
            "note": "HEURISTIC score: 100 * clip((centroid_cos - 0.6) / 0.35); anchors in module doc"}
    L = ["## Style similarity (CLIP)", "",
         f"- Reference `{os.path.basename(rdir.rstrip('/\\'))}` vs ours `{os.path.basename(odir.rstrip('/\\'))}`: "
         f"**style similarity {score}/100** (mean per-shot NN cosine {nn:.3f}, centroid cosine {ccos:.3f})",
         f"- Tag-distribution overlap: {overlap}",
         f"- Weakest shots (lowest NN cosine): {sorted(rows, key=lambda r: r['nn_cos'])[:5]}"]
    target = out or os.path.join(odir, "similar")
    save(os.path.dirname(target) or ".", os.path.basename(target), data, "\n".join(L))
    return data


def md_section(d: dict) -> str:
    if not d.get("available"):
        return "## Style tags (CLIP)\n\n- unavailable: " + d.get("reason", "")
    t = d["tags"]
    f = lambda g: ", ".join(f"{k} {v:.0%}" for k, v in list(t[g].items())[:3])
    return "\n".join(["## Style tags (CLIP zero-shot)", "",
                      f"- Render style: **{f('style')}**",
                      f"- Lighting: {f('lighting')}",
                      f"- Shot types: {f('shot')}",
                      f"- {d['frames']} frames, model {d['model']}; self-consistency {d['self_consistency']:.3f} "
                      "(mean cosine to the video centroid; lower = more varied looks)",
                      "_Zero-shot tags are probabilities over the listed prompts only; use them to compare videos, not as ground truth._"])
