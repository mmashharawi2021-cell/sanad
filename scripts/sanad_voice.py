"""Sanad voice sidecar — natural neural voices (online) and FastConformer Arabic speech-to-text (offline).

Spawned and managed by src/voiceSidecar.ts with vendor/py (see scripts/voice-setup.ps1).
Protocol: one JSON object per line on stdin, one JSON reply per line on stdout (matched by "id").
  {"id": "1", "op": "ping"}
  {"id": "2", "op": "tts", "text": "...", "voice": "ar-SA-HamedNeural", "out": "C:/.../x.mp3"}
  {"id": "3", "op": "stt", "wav": "C:/.../speech.wav"}
Replies: {"id": "...", "ok": true, ...} or {"id": "...", "ok": false, "error": "..."}
Requests are handled concurrently (TTS is network-bound), so the UI can prefetch the next sentence.
"""
import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FASTCONFORMER_DIR = ROOT / "vendor" / "stt" / "fastconformer"
TTS_TIMEOUT_SEC = 12

_stt_model = None
_stt_lock = asyncio.Lock()


def reply(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _load_stt():
    global _stt_model
    if _stt_model is None:
        import onnx_asr  # imported lazily: only needed when listening

        _stt_model = onnx_asr.load_model("nemo-conformer-ctc", str(FASTCONFORMER_DIR))
    return _stt_model


def _recognize(path: str) -> str:
    import numpy as np
    import soundfile as sf

    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    if rate != 16000:
        n = int(len(mono) * 16000 / rate)
        mono = np.interp(np.linspace(0, len(mono) - 1, n), np.arange(len(mono)), mono).astype(np.float32)
    return str(_load_stt().recognize(mono, sample_rate=16000))


async def op_stt(req: dict) -> dict:
    loop = asyncio.get_running_loop()
    async with _stt_lock:  # one recognition at a time (CPU-bound)
        t = time.perf_counter()
        text = await loop.run_in_executor(None, _recognize, req["wav"])
    return {"text": text, "ms": round((time.perf_counter() - t) * 1000)}


async def op_warm(_req: dict) -> dict:
    """Load the STT model ahead of the first utterance (first load can take tens of seconds cold)."""
    loop = asyncio.get_running_loop()
    async with _stt_lock:
        t = time.perf_counter()
        already = _stt_model is not None
        await loop.run_in_executor(None, _load_stt)
    return {"ms": round((time.perf_counter() - t) * 1000), "alreadyLoaded": already}


async def op_unload_stt(_req: dict) -> dict:
    """Free the FastConformer model (~0.8 GB) when the user switches the recognizer to whisper."""
    global _stt_model
    async with _stt_lock:
        was_loaded = _stt_model is not None
        _stt_model = None
        import gc

        gc.collect()
    return {"unloaded": was_loaded}


async def op_tts(req: dict) -> dict:
    import edge_tts

    t = time.perf_counter()
    out = Path(req["out"])
    tmp = out.with_suffix(out.suffix + ".part")

    async def run():
        got = 0
        with open(tmp, "wb") as f:
            async for chunk in edge_tts.Communicate(req["text"], req["voice"]).stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                    got += len(chunk["data"])
        return got

    try:
        size = await asyncio.wait_for(run(), TTS_TIMEOUT_SEC)
        if size == 0:
            raise RuntimeError("no audio returned")
        tmp.replace(out)  # atomic: a cache file is either complete or absent
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
    return {"ms": round((time.perf_counter() - t) * 1000), "bytes": size}


async def handle(req: dict) -> None:
    rid = req.get("id")
    try:
        op = req.get("op")
        if op == "ping":
            result = {"pong": True}
        elif op == "stt":
            result = await op_stt(req)
        elif op == "warm":
            result = await op_warm(req)
        elif op == "unload_stt":
            result = await op_unload_stt(req)
        elif op == "tts":
            result = await op_tts(req)
        else:
            raise ValueError(f"unknown op: {op}")
        reply({"id": rid, "ok": True, **result})
    except Exception as exc:  # report and keep serving
        reply({"id": rid, "ok": False, "error": f"{type(exc).__name__}: {exc}"})


def _preload_native_libraries() -> None:
    """Import every native-extension module here, in the main thread, BEFORE stdin is read.

    On Windows a pending synchronous read on the stdin pipe (the reader thread below) blocks
    DLL initialisation in other threads, so importing onnxruntime lazily inside a worker thread
    hung until the next request line arrived (measured: >60 s stuck vs 1.6 s when lines kept
    arriving). Loading the DLLs up front avoids that entirely.
    """
    import numpy  # noqa: F401
    import soundfile  # noqa: F401
    import onnxruntime  # noqa: F401
    import onnx_asr  # noqa: F401
    import edge_tts  # noqa: F401


async def main() -> None:
    loop = asyncio.get_running_loop()
    _preload_native_libraries()
    reply({"id": None, "ok": True, "ready": True})
    tasks = set()
    while True:
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:  # parent closed stdin → exit
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            reply({"id": None, "ok": False, "error": "bad json"})
            continue
        task = asyncio.create_task(handle(req))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
