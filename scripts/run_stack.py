#!/usr/bin/env python3
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    env = os.environ.copy()
    matcher_port = env.get("JOB_MATCHER_PORT", "3000")
    env.setdefault("JOB_MATCHER_HOST", "127.0.0.1")
    env["JOB_MATCHER_PORT"] = matcher_port
    env.setdefault("JOB_MATCHER_BASE_URL", f"http://127.0.0.1:{matcher_port}")

    matcher = subprocess.Popen(
        ["node", "job-matcher/server.mjs"],
        cwd=ROOT,
        env=env,
    )
    api = subprocess.Popen(
        [sys.executable, "backend/server.py"],
        cwd=ROOT,
        env=env,
    )
    processes = [matcher, api]
    requested_stop = False

    def stop(_signum: int | None = None, _frame: object | None = None) -> None:
        nonlocal requested_stop
        requested_stop = True
        for process in processes:
            if process.poll() is None:
                process.terminate()
        deadline = time.monotonic() + 5
        for process in processes:
            if process.poll() is None:
                try:
                    process.wait(timeout=max(0.1, deadline - time.monotonic()))
                except subprocess.TimeoutExpired:
                    process.kill()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while True:
            if requested_stop:
                return 0
            for process in processes:
                code = process.poll()
                if code is not None:
                    stop()
                    return code
            time.sleep(0.25)
    finally:
        stop()


if __name__ == "__main__":
    raise SystemExit(main())
