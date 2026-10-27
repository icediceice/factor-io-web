"""Factor IO chat demo gateway: runs on the Colab VM between the tunnel and Strata.

    page (studio.factor-io.com) --HTTPS--> cloudflared --> this app :8000 --> Strata 127.0.0.1:8081/v1

Strata itself is never tunnelled. This app is the only thing the internet can
reach, and it holds what Strata has no notion of: per-customer sessions,
document parsing and retrieval, a queue in front of the model's few slots,
upload limits, and the access key carried in the operator's connect link.

Start it with the factory (it reads the environment):
    uvicorn gateway:app_from_env --factory --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import asyncio
import hmac
import json
import os
import re
import secrets
import time
import uuid
from dataclasses import dataclass, field
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import rag

VERSION = "1.0.0"
DEFAULT_ORIGINS = "https://studio.factor-io.com,http://127.0.0.1:8781,http://localhost:8781"
SESSION_RE = re.compile(r"^[0-9a-f]{32}$")


@dataclass
class Settings:
    keys: list[str] = field(default_factory=list)
    origins: list[str] = field(default_factory=lambda: DEFAULT_ORIGINS.split(","))
    llm_base_url: str = "http://127.0.0.1:8081/v1"
    llm_model: str = "strata"
    model_label: str = "Qwen3.8-Flash-Next"
    parallel: int = 2
    max_tokens: int = 4096
    embedder: str = "e5"
    stuff_tokens: int = 20000
    retrieval_tokens: int = 12000
    top_k: int = 10
    max_file_mb: int = 25
    max_files: int = 20
    max_session_tokens: int = 1_500_000
    session_ttl_s: int = 7200
    max_sessions: int = 40
    history_turns: int = 6
    status_file: str = ""

    @property
    def llm_health_url(self) -> str:
        root = self.llm_base_url.rstrip("/")
        return (root[:-3] if root.endswith("/v1") else root) + "/health"

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.environ.get
        keys = [k.strip() for k in e("DEMO_KEY", "").split(",") if k.strip()]
        if not keys:
            keys = [secrets.token_urlsafe(18)]
            print(f"[gateway] DEMO_KEY not set; generated access key: {keys[0]}", flush=True)
        origins = [o.strip() for o in e("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
        return cls(
            keys=keys, origins=origins,
            llm_base_url=e("LLM_BASE_URL", cls.llm_base_url),
            llm_model=e("LLM_MODEL", cls.llm_model),
            model_label=e("MODEL_LABEL", cls.model_label),
            parallel=int(e("PARALLEL", cls.parallel)),
            max_tokens=int(e("MAX_TOKENS", cls.max_tokens)),
            embedder=e("EMBEDDER", cls.embedder),
            stuff_tokens=int(e("STUFF_TOKENS", cls.stuff_tokens)),
            retrieval_tokens=int(e("RETRIEVAL_TOKENS", cls.retrieval_tokens)),
            top_k=int(e("TOP_K", cls.top_k)),
            max_file_mb=int(e("MAX_FILE_MB", cls.max_file_mb)),
            max_files=int(e("MAX_FILES", cls.max_files)),
            session_ttl_s=int(e("SESSION_TTL_S", cls.session_ttl_s)),
            max_sessions=int(e("MAX_SESSIONS", cls.max_sessions)),
            status_file=e("STATUS_FILE", ""),
        )


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=20000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[Turn] = Field(default_factory=list, max_length=40)
    thinking: Literal["none", "low", "medium", "high"] = "none"


@dataclass
class Session:
    store: rag.DocStore
    last_used: float = field(default_factory=time.monotonic)
    # Serialises this session's ingest, delete and retrieval: the file limit is
    # checked before parsing awaits, and the indexes change in a worker thread.
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class Queue:
    def __init__(self, parallel: int):
        self.parallel = parallel
        self.sem = asyncio.Semaphore(parallel)
        self.running = 0
        self.waiting = 0


def sse(event: str, data) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def create_app(settings: Settings, llm_transport: httpx.AsyncBaseTransport | None = None,
               embedder=None) -> FastAPI:
    app = FastAPI(title="Factor IO chat demo gateway", version=VERSION, docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Session"],
        max_age=600,
    )
    embedder = embedder or rag.get_embedder(settings.embedder)
    sessions: dict[str, Session] = {}
    queue = Queue(settings.parallel)
    started = time.time()

    def llm_client(**kw) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=llm_transport, **kw)

    # ---- guards

    def require_key(authorization: str = Header(default="")):
        token = authorization[7:] if authorization.lower().startswith("bearer ") else ""
        if not token or not any(hmac.compare_digest(token, k) for k in settings.keys):
            raise HTTPException(401, "Missing or wrong access key. Use the connect link the operator sent, or paste the key in Connection.")

    def expire():
        now = time.monotonic()
        for sid in [s for s, v in sessions.items() if now - v.last_used > settings.session_ttl_s]:
            sessions.pop(sid, None)

    def session(x_session: str = Header(default=""), _=Depends(require_key)) -> Session:
        expire()
        s = sessions.get(x_session)
        if s is None:
            raise HTTPException(404, "Session expired or unknown. The page will start a new one; upload the files again.")
        s.last_used = time.monotonic()
        return s

    # ---- routes

    @app.get("/api/ping")
    async def ping():
        return {"ok": True, "service": "factor-chat-gateway", "version": VERSION}

    @app.get("/api/health", dependencies=[Depends(require_key)])
    async def health():
        expire()
        ready, detail = False, ""
        try:
            async with llm_client(timeout=3) as c:
                r = await c.get(settings.llm_health_url)
                ready = r.status_code == 200
                detail = "" if ready else f"model server answered {r.status_code}"
        except httpx.HTTPError:
            detail = "model server not reachable yet (still loading?)"
        status = {}
        if settings.status_file:
            try:
                with open(settings.status_file) as f:
                    status = json.load(f)
            except (OSError, ValueError):
                pass
        return {
            "ok": ready,
            "version": VERSION,
            "model": {"label": settings.model_label, "ready": ready, "detail": detail,
                      "family": status.get("family"), "size": status.get("size")},
            "host": {k: status.get(k) for k in ("gpu", "vram_gb", "ram_gb", "disk_free_gb") if k in status},
            "queue": {"parallel": queue.parallel, "running": queue.running, "waiting": queue.waiting},
            "limits": {"max_file_mb": settings.max_file_mb, "max_files": settings.max_files,
                       "session_ttl_s": settings.session_ttl_s, "accept": sorted(rag.SUPPORTED_EXT)},
            "embedder": embedder.name,
            "sessions": len(sessions),
            "uptime_s": int(time.time() - started),
        }

    @app.post("/api/session", dependencies=[Depends(require_key)])
    async def new_session():
        expire()
        while len(sessions) >= settings.max_sessions:
            sessions.pop(min(sessions, key=lambda s: sessions[s].last_used))
        sid = uuid.uuid4().hex
        sessions[sid] = Session(rag.DocStore(embedder))
        return {"session": sid, "ttl_s": settings.session_ttl_s}

    @app.delete("/api/session")
    async def end_session(x_session: str = Header(default=""), _=Depends(require_key)):
        sessions.pop(x_session, None)
        return {"ok": True}

    @app.get("/api/docs")
    async def list_docs(s: Session = Depends(session)):
        return {"docs": [d.summary() for d in s.store.docs.values()], "tokens": s.store.total_tokens}

    @app.delete("/api/docs/{doc_id}")
    async def delete_doc(doc_id: str, s: Session = Depends(session)):
        async with s.lock:
            if not s.store.remove_document(doc_id):
                raise HTTPException(404, "No such document in this session.")
        return {"ok": True}

    @app.post("/api/ingest")
    async def ingest(files: list[UploadFile] = File(...), s: Session = Depends(session)):
        async with s.lock:
            return await ingest_locked(files, s)

    async def ingest_locked(files: list[UploadFile], s: Session) -> dict:
        limit = settings.max_file_mb * 1024 * 1024
        results = []
        for up in files:
            name = os.path.basename(up.filename or "upload.txt")[:200]
            if len(s.store.docs) >= settings.max_files:
                results.append({"name": name, "ok": False, "error": f"This demo holds at most {settings.max_files} files per session."})
                continue
            data = await up.read(limit + 1)
            if len(data) > limit:
                results.append({"name": name, "ok": False, "error": f"Larger than {settings.max_file_mb} MB."})
                continue
            if s.store.total_tokens > settings.max_session_tokens:
                results.append({"name": name, "ok": False, "error": "This session already holds as much text as the demo allows."})
                continue
            try:
                doc = await run_in_threadpool(s.store.add_document, name, data)
                results.append({"name": name, "ok": True, "doc": doc.summary()})
            except (rag.UnsupportedFile, rag.EmptyDocument) as exc:
                results.append({"name": name, "ok": False, "error": str(exc)})
            except Exception as exc:  # a malformed file must not fail the rest of the batch
                results.append({"name": name, "ok": False, "error": f"Could not read this file ({type(exc).__name__})."})
        return {"results": results, "docs": [d.summary() for d in s.store.docs.values()],
                "tokens": s.store.total_tokens}

    @app.post("/api/chat")
    async def chat(body: ChatIn, request: Request, s: Session = Depends(session)):
        async with s.lock:
            mode, chunks = await run_in_threadpool(
                s.store.select, body.message, settings.stuff_tokens, settings.top_k, settings.retrieval_tokens)
        history = [t.model_dump() for t in body.history][-2 * settings.history_turns:]
        messages, citations = rag.build_messages(chunks, history, body.message)
        payload = {"model": settings.llm_model, "messages": messages, "stream": True,
                   "max_tokens": settings.max_tokens, "reasoning_effort": body.thinking}
        return StreamingResponse(
            answer(request, payload, citations, mode),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def answer(request: Request, payload: dict, citations: list[dict], mode: str):
        yield sse("citations", {"mode": mode, "items": citations})
        queue.waiting += 1
        try:
            if queue.sem.locked():
                yield sse("status", {"state": "queued", "waiting": queue.waiting, "running": queue.running})
            while True:
                try:
                    await asyncio.wait_for(queue.sem.acquire(), timeout=4)
                    break
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        return
                    yield sse("status", {"state": "queued", "waiting": queue.waiting, "running": queue.running})
        finally:
            queue.waiting -= 1

        queue.running += 1
        t0, first, n_tokens = time.monotonic(), None, 0
        try:
            yield sse("status", {"state": "reading", "sources": len(citations)})
            timeout = httpx.Timeout(connect=10, read=600, write=30, pool=10)
            async with llm_client(timeout=timeout) as c:
                async with c.stream("POST", settings.llm_base_url.rstrip("/") + "/chat/completions", json=payload) as r:
                    if r.status_code != 200:
                        body = (await r.aread()).decode(errors="replace")[:300]
                        yield sse("error", {"message": f"The model server refused the request ({r.status_code}): {body}"})
                        return
                    lines = 0
                    async for line in r.aiter_lines():
                        lines += 1
                        if lines % 16 == 0 and await request.is_disconnected():
                            return  # leaving the stream closes it, which stops Strata generating
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            delta = json.loads(data)["choices"][0].get("delta") or {}
                        except (ValueError, KeyError, IndexError):
                            continue
                        for key, event in (("reasoning_content", "reasoning"), ("content", "token")):
                            piece = delta.get(key)
                            if piece:
                                if first is None:
                                    first = time.monotonic()
                                n_tokens += 1
                                yield sse(event, {"t": piece})
            elapsed = time.monotonic() - t0
            gen = time.monotonic() - (first or t0)
            yield sse("done", {"elapsed_s": round(elapsed, 2),
                               "first_token_s": round((first or t0) - t0, 2),
                               "tokens": n_tokens,
                               "tok_s": round(n_tokens / gen, 1) if gen > 0 and n_tokens > 1 else None})
        except httpx.HTTPError as exc:
            yield sse("error", {"message": f"Lost the model server ({type(exc).__name__}). It may still be loading; try again shortly."})
        finally:
            queue.running -= 1
            queue.sem.release()

    app.state.settings = settings
    app.state.sessions = sessions
    app.state.queue = queue
    return app


def app_from_env() -> FastAPI:
    return create_app(Settings.from_env())