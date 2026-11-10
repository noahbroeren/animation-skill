"""Character acting and lip-sync measurement (`vfa pose`).

Engine: MediaPipe Tasks (FaceLandmarker with blendshapes + PoseLandmarker lite; models download
once from storage.googleapis.com/mediapipe-models into ~/.cache/vfa). Fallback without MediaPipe:
OpenCV Haar face boxes + motion energy in the lower third of the face (mouth proxy). Always added:
the analyzer's camera-compensated "activity" series vs the speech envelope (works on any art style).

Per sampled frame: face found?, mouth openness (blendshape jawOpen, else inner-lip gap / face
height), blink score, pose found?, upper-body gesture speed (nose, shoulders, elbows, wrists;
normalised by shoulder width). Outputs:
- coverage: % of sampled frames with a detectable face / body (cartoons often defeat detectors:
  low coverage is reported, not hidden)
- lip-sync: Pearson correlation between mouth openness and the speech envelope (vocals stem if
  `vfa stems` ran, else the mix) on face frames, best lag in frames (+ = mouth lags the audio)
- blink rate per minute of face-visible time
- per shot: coverage, gesture activity, mouth-speech correlation
"""
from __future__ import annotations

import os

import cv2
import numpy as np

from .extutil import download, fmt, load_fp, load_frames, optional, resolve, save, stats
from .mediaio import iter_frames, probe, read_audio

FACE_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
UPPER = [0, 11, 12, 13, 14, 15, 16]


def _speech_env(vid: str, adir: str, fps: float, n: int) -> np.ndarray:
    voc = os.path.join(adir, "stems", "vocals.wav")
    if os.path.exists(voc):
        from .stems import _read_wav
        a = _read_wav(voc).mean(1)
        sr = 44100
    else:
        sr = 16000
        a = read_audio(vid, sr)
    hop = sr / fps
    env = np.zeros(n)
    for i in range(n):
        s = a[int(i * hop): int((i + 1) * hop)]
        env[i] = 10 * np.log10((s ** 2).mean() + 1e-10) if len(s) else -100
    return np.clip(env, -60, 0)


def _corr_lag(x: np.ndarray, y: np.ndarray, max_lag: int) -> tuple[float | None, int | None, float | None]:
    """Pearson r at lag 0, best lag (x lags y by +k) and r at best lag. NaNs in x are skipped."""
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 20 or np.std(x[ok]) < 1e-6:
        return None, None, None
    r0 = float(np.corrcoef(x[ok], y[ok])[0, 1])
    best, bk = -2.0, 0
    for k in range(-max_lag, max_lag + 1):
        xs = x[max(0, k): len(x) + min(0, k)]
        ys = y[max(0, -k): len(y) - max(0, k)]
        m = np.isfinite(xs) & np.isfinite(ys)
        if m.sum() < 20 or np.std(xs[m]) < 1e-6:
            continue
        r = float(np.corrcoef(xs[m], ys[m])[0, 1])
        if r > best:
            best, bk = r, k
    return r0, bk, best


def _mediapipe():
    mp, err = optional("mediapipe")
    if mp is None:
        return None, err
    try:
        from mediapipe.tasks.python import BaseOptions, vision
        face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=download(FACE_URL, "face_landmarker.task")),
            running_mode=vision.RunningMode.VIDEO, num_faces=1, output_face_blendshapes=True,
            min_face_detection_confidence=0.4, min_face_presence_confidence=0.4))
        pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=download(POSE_URL, "pose_landmarker_lite.task")),
            running_mode=vision.RunningMode.VIDEO, num_poses=1,
            min_pose_detection_confidence=0.4, min_pose_presence_confidence=0.4))
        return (mp, face, pose), None
    except Exception as e:
        return None, f"mediapipe init failed ({type(e).__name__}: {str(e)[:160]})"


def run(target: str, video: str | None = None, stride: int | None = None, out_name: str = "pose") -> dict:
    vid, adir = resolve(target, video)
    pr = probe(vid)
    fps = pr.fps
    if stride is None:
        stride = 1 if pr.duration <= 180 else (2 if pr.duration <= 900 else 4)
    eng, why = _mediapipe()
    method = "mediapipe face+pose landmarker" if eng else "fallback: OpenCV Haar face + mouth-region motion energy"
    haar = None
    if eng is None:
        haar = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")) \
            if hasattr(cv2, "data") else None
    idx, face_ok, pose_ok, mouth, blink, gest = [], [], [], [], [], []
    prev_pose, prev_mouth_crop = None, None
    for i, rgb in enumerate(iter_frames(vid, 480)):
        if i % stride:
            continue
        idx.append(i)
        mo = bl = ge = np.nan
        f_ok = p_ok = False
        if eng is not None:
            mp, face, pose = eng
            im = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
            ts = int(round(i * 1000 / fps))
            fr = face.detect_for_video(im, ts)
            if fr.face_landmarks:
                f_ok = True
                bs = {c.category_name: c.score for c in (fr.face_blendshapes[0] if fr.face_blendshapes else [])}
                if "jawOpen" in bs:
                    mo = bs["jawOpen"]
                    bl = 0.5 * (bs.get("eyeBlinkLeft", 0) + bs.get("eyeBlinkRight", 0))
                else:
                    L = fr.face_landmarks[0]
                    mo = abs(L[14].y - L[13].y) / max(1e-4, abs(L[152].y - L[10].y))
            pr_ = pose.detect_for_video(im, ts)
            if pr_.pose_landmarks:
                P = np.array([[l.x, l.y, l.visibility] for l in pr_.pose_landmarks[0]])
                if P[UPPER, 2].mean() > 0.5:
                    p_ok = True
                    sw = max(0.02, float(np.hypot(*(P[11, :2] - P[12, :2]))))
                    if prev_pose is not None:
                        ge = float(np.linalg.norm(P[UPPER, :2] - prev_pose[UPPER, :2], axis=1).mean() / sw)
                    prev_pose = P
            if not p_ok:
                prev_pose = None
        elif haar is not None:
            g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
            faces = haar.detectMultiScale(g, 1.15, 5, minSize=(40, 40))
            if len(faces):
                f_ok = True
                x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
                crop = cv2.resize(g[y + 2 * h // 3: y + h, x + w // 4: x + 3 * w // 4], (48, 24)).astype(np.float32)
                if prev_mouth_crop is not None:
                    mo = float(np.abs(crop - prev_mouth_crop).mean() / 255)
                prev_mouth_crop = crop
            else:
                prev_mouth_crop = None
        face_ok.append(f_ok)
        pose_ok.append(p_ok)
        mouth.append(mo)
        blink.append(bl)
        gest.append(ge)
    if eng is not None:
        eng[1].close()
        eng[2].close()
    idx = np.asarray(idx)
    face_ok, pose_ok = np.asarray(face_ok), np.asarray(pose_ok)
    mouth, blink, gest = map(lambda v: np.asarray(v, np.float64), (mouth, blink, gest))
    n = int(idx[-1]) + 1 if len(idx) else 0
    env = _speech_env(vid, adir, fps, n)[idx] if pr.has_audio and n else np.full(len(idx), np.nan)
    max_lag = max(2, int(round(0.33 * fps / stride)))
    r0, lag, rbest = _corr_lag(np.where(face_ok, mouth, np.nan), env, max_lag)
    # blinks: rising edges above 0.5 on face frames
    bl_ok = np.where(face_ok, blink, np.nan)
    rises = int(np.sum((bl_ok[1:] > 0.5) & ~(bl_ok[:-1] > 0.5))) if np.isfinite(bl_ok).any() else 0
    face_minutes = face_ok.sum() * stride / fps / 60
    # whole-frame animation vs speech (art-style agnostic), from frames.npz
    npz = load_frames(adir)
    anim_corr = None
    if npz is not None and "activity" in npz and pr.has_audio:
        act = npz["activity"][: n] if n else npz["activity"]
        e2 = _speech_env(vid, adir, fps, len(act))
        r_a, lag_a, rb_a = _corr_lag(act.astype(np.float64), e2, max(2, int(0.33 * fps)))
        anim_corr = {"r": None if r_a is None else round(r_a, 3), "best_lag_frames": lag_a,
                     "r_at_lag": None if rb_a is None else round(rb_a, 3)}
    fp = load_fp(adir)
    shots = fp.get("shots") or [{"start": 0, "end": n}]
    per_shot = []
    for k, s in enumerate(shots):
        m = (idx >= s["start"]) & (idx < s["end"])
        if not m.any():
            continue
        rr = _corr_lag(np.where(face_ok[m], mouth[m], np.nan), env[m], max_lag)[0] if m.sum() >= 20 else None
        per_shot.append({"shot": k, "face_coverage": round(float(face_ok[m].mean()), 3),
                         "body_coverage": round(float(pose_ok[m].mean()), 3),
                         "gesture_activity": None if not np.isfinite(gest[m]).any() else round(float(np.nanmedian(gest[m])) * fps / stride, 4),
                         "mouth_speech_r": None if rr is None else round(rr, 3),
                         "activity_median": s.get("activity_median")})
    coverage = round(float((face_ok | pose_ok).mean()), 3) if len(idx) else 0.0
    data = {"schema": "vfa.pose/1", "available": True, "method": method, "engine_note": why, "stride": stride,
            "sampled_frames": int(len(idx)),
            "coverage": {"character_any": coverage, "face": round(float(face_ok.mean()), 3) if len(idx) else 0.0,
                         "body": round(float(pose_ok.mean()), 3) if len(idx) else 0.0},
            "lip_sync": {"r": None if r0 is None else round(r0, 3), "best_lag_frames": None if lag is None else lag * stride,
                         "r_at_best_lag": None if rbest is None else round(rbest, 3),
                         "speech_source": "vocals stem" if os.path.exists(os.path.join(adir, "stems", "vocals.wav")) else "mix"},
            "mouth_openness": stats(mouth[face_ok], 3) if face_ok.any() else None,
            "blink_rate_per_min": round(rises / face_minutes, 1) if face_minutes > 0.1 else None,
            "gesture_activity": stats(gest[np.isfinite(gest)] * fps / stride, 4),
            "animation_vs_speech": anim_corr, "per_shot": per_shot,
            "honesty": "Detectors are trained on real faces/bodies; stylised cartoon characters are often missed. "
                       "Low coverage means 'not measurable', not 'no character'."}
    gmed = data["gesture_activity"]["median"]
    if gmed is not None and gmed > 3.0:
        data["warning"] = (f"gesture speed median {gmed:.1f} shoulder-widths/s is implausible for acting: body landmarks are "
                           "jittering (likely unstable or false detections on stylised art); treat body metrics as unreliable")
    data["summary"] = {"available": True, "method": method, "warning": data.get("warning"), "coverage": coverage, "face_coverage": data["coverage"]["face"],
                       "lip_sync_r": data["lip_sync"]["r"], "lip_sync_lag_frames": data["lip_sync"]["best_lag_frames"],
                       "blink_rate_per_min": data["blink_rate_per_min"],
                       "gesture_activity_median": data["gesture_activity"]["median"],
                       "animation_speech_r": (anim_corr or {}).get("r")}
    save(adir, out_name, data, md_section(data))
    return data


def md_section(d: dict) -> str:
    c, ls = d["coverage"], d["lip_sync"]
    a = d.get("animation_vs_speech") or {}
    return "\n".join([
        "## Acting and lip-sync", "",
        f"- Method: {d['method']}; {d['sampled_frames']} frames sampled (stride {d['stride']})",
        f"- Coverage: character detected in **{c['character_any']:.0%}** of frames (face {c['face']:.0%}, body {c['body']:.0%})",
        f"- Lip-sync: mouth vs speech r = {fmt(ls['r'], '{:.2f}')} (best {fmt(ls['r_at_best_lag'], '{:.2f}')} at lag {ls['best_lag_frames']} f, {ls['speech_source']}); "
        f"blink rate {fmt(d['blink_rate_per_min'], '{:.1f}')}/min",
        f"- Gesture activity (upper body, shoulder-widths/s) median {fmt(d['gesture_activity']['median'], '{:.3f}')}",
        f"- Whole-frame animation vs speech envelope: r = {fmt(a.get('r'), '{:.2f}')} (lag {a.get('best_lag_frames')} f) -- style-agnostic proxy",
        *([f"- WARNING: {d['warning']}"] if d.get("warning") else []),
        f"_{d['honesty']}_"])
