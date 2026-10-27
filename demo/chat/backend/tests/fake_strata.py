"""A stand-in for Strata's OpenAI endpoint: no weights, no GPU.

Used two ways:
  - by the tests, mounted in-process through httpx.ASGITransport;
  - `python tests/fake_strata.py --serve-stack` runs this on 127.0.0.1:8081 and
    the real gateway on 127.0.0.1:8000 (access key "devkey", hash embeddings)
    so the page can be exercised in a browser without spending Colab time.

It answers by quoting the start of source [1] from the prompt it received, so
a browser check can see that the uploaded file really reached the model.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse


def _echo_answer(body: dict) -> str:
    system = body["messages"][0]["content"]
    m = re.search(r"\[1\] \(([^)]*)\)\n(.{0,160})", system, re.S)
    if not m:
        return "No documents are uploaded yet, so I can only answer in general terms."
    snippet = " ".join(m.group(2).split())
    return f"(fake model) According to [1] ({m.group(1)}): {snippet}"


def make_fake_strata(delay: float = 0.0, status: int = 200, answer: str | None = None) -> FastAPI:
    app = FastAPI()
    app.state.requests = []

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/v1/chat/completions")
    async def chat(request: Request):
        body = await request.json()
        app.state.requests.append(body)
        if status != 200:
            return JSONResponse({"error": {"message": "fake failure"}}, status_code=status)
        text = answer if answer is not None else _echo_answer(body)

        def frame(delta: dict) -> bytes:
            return f"data: {json.dumps({'choices': [{'index': 0, 'delta': delta}]})}\n\n".encode()

        async def gen():
            if body.get("reasoning_effort", "none") != "none":
                yield frame({"reasoning_content": "Checking the sources. "})
            for piece in re.findall(r"\S+\s*", text):
                if delay:
                    await asyncio.sleep(delay)
                yield frame({"content": piece})
            yield b"data: [DONE]\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream")

    return app


async def _serve_stack(delay: float):
    import uvicorn
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from gateway import Settings, create_app
    import rag

    fake = make_fake_strata(delay=delay)
    gw = create_app(Settings(keys=["devkey"], embedder="hash", model_label="fake model (dev stack)"),
                    embedder=rag.HashEmbedder())
    servers = [
        uvicorn.Server(uvicorn.Config(fake, host="127.0.0.1", port=8081, log_level="warning")),
        uvicorn.Server(uvicorn.Config(gw, host="127.0.0.1", port=8000, log_level="info")),
    ]
    print("fake Strata on :8081, gateway on :8000, access key 'devkey'", flush=True)
    await asyncio.gather(*(s.serve() for s in servers))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve-stack", action="store_true")
    ap.add_argument("--delay", type=float, default=0.04)
    args = ap.parse_args()
    if args.serve_stack:
        asyncio.run(_serve_stack(args.delay))
    else:
        ap.print_help()