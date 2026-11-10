"""`vfa analyze --deep`: run every installed extra and collect compact summaries for fingerprint["deep"].

Each extra is isolated: a missing optional dependency or a crash is recorded as
{"available": False, "reason": ...} and never aborts the main analysis.
"""
from __future__ import annotations

import importlib
import os
import time
import traceback

EXTRAS = ["transitions", "ocr", "stems", "embed", "pose"]   # stems before pose: pose uses the vocals stem


def run_deep(out_dir: str, skip: list[str] | None = None, quiet: bool = False) -> tuple[dict, str]:
    skip = set(skip or [])
    deep: dict = {}
    md: list[str] = ["", "# Deep analysis (`--deep`)", ""]
    for name in EXTRAS:
        if name in skip:
            deep[name] = {"available": False, "reason": "skipped (--deep-skip)"}
            continue
        t0 = time.time()
        try:
            mod = importlib.import_module(f".{name}", __package__)
            res = mod.run(out_dir)
            summ = dict(res.get("summary") or {})
            summ["seconds"] = round(time.time() - t0, 1)
            deep[name] = summ
            p = os.path.join(out_dir, f"{name}.md")
            if os.path.exists(p):
                md.append(open(p, encoding="utf-8").read().strip())
                md.append("")
        except BaseException as e:  # SystemExit from helpers included: never kill the main analysis
            if isinstance(e, KeyboardInterrupt):
                raise
            deep[name] = {"available": False, "reason": f"{type(e).__name__}: {str(e)[:300]}",
                          "trace": traceback.format_exc()[-800:]}
            md += [f"## {name}", "", f"- failed: {type(e).__name__}: {str(e)[:200]}", ""]
        if not quiet:
            print(f"[vfa] deep/{name}: {'ok' if deep[name].get('available') else deep[name].get('reason')} "
                  f"({time.time() - t0:.0f}s)")
    return deep, "\n".join(md)
