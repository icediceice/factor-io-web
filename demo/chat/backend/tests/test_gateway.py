"""The gateway as the page sees it (HTTP + SSE) and as Strata sees it (the
request body it receives). Strata is the in-process fake from fake_strata.py."""
import asyncio
import json

import anyio
import httpx
import pytest

import rag
import samples
from fake_strata import make_fake_strata
from gateway import Settings, create_app

KEY = {"Authorization": "Bearer k1"}
STUDIO = "https://studio.factor-io.com"


@pytest.fixture
def anyio_backend():
    return "asyncio"


def build(fake=None, transport=None, **settings):
    fake = fake or make_fake_strata()
    app = create_app(Settings(keys=["k1"], embedder="hash", **settings),
                     llm_transport=transport or httpx.ASGITransport(app=fake),
                     embedder=rag.HashEmbedder())
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gw")
    return client, fake


def events(body: str):
    out = []
    for block in body.split("\n\n"):
        lines = dict(l.split(": ", 1) for l in block.splitlines() if ": " in l)
        if "event" in lines:
            out.append((lines["event"], json.loads(lines["data"])))
    return out


async def new_session(c):
    r = await c.post("/api/session", headers=KEY)
    assert r.status_code == 200
    return {**KEY, "X-Session": r.json()["session"]}


async def upload(c, h, *files):
    r = await c.post("/api/ingest", headers=h, files=[("files", f) for f in files])
    assert r.status_code == 200
    return r.json()


async def ask(c, h, message, **extra):
    r = await c.post("/api/chat", headers=h, json={"message": message, **extra})
    assert r.status_code == 200
    return events(r.text)


def system_prompt(fake, i=-1):
    return fake.state.requests[i]["messages"][0]["content"]


@pytest.mark.anyio
async def test_only_ping_answers_without_the_access_key():
    c, _ = build()
    assert (await c.get("/api/ping")).status_code == 200
    for bad in ({}, {"Authorization": "Bearer wrong"}):
        assert (await c.get("/api/health", headers=bad)).status_code == 401
        assert (await c.post("/api/session", headers=bad)).status_code == 401
        assert (await c.post("/api/chat", headers=bad, json={"message": "hi"})).status_code == 401


@pytest.mark.anyio
async def test_browser_preflight_is_allowed_only_from_listed_origins():
    c, _ = build()
    pre = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,x-session,content-type"}
    ok = await c.options("/api/chat", headers={"Origin": STUDIO, **pre})
    assert ok.headers.get("access-control-allow-origin") == STUDIO
    bad = await c.options("/api/chat", headers={"Origin": "https://evil.example", **pre})
    assert bad.headers.get("access-control-allow-origin") is None


@pytest.mark.anyio
async def test_uploaded_file_reaches_the_model_and_the_answer_streams_after_its_citations():
    c, fake = build()
    h = await new_session(c)
    res = await upload(c, h, ("specs.txt", b"Warranty for model ZX-9 is 39 months from delivery.", "text/plain"))
    assert res["results"][0]["ok"]

    ev = await ask(c, h, "How long is the ZX-9 warranty?")

    assert "39 months" in system_prompt(fake)
    assert fake.state.requests[-1]["messages"][-1] == {"role": "user", "content": "How long is the ZX-9 warranty?"}
    kinds = [e for e, _ in ev]
    assert kinds[0] == "citations" and kinds[-1] == "done"
    assert ev[0][1]["items"][0]["doc"] == "specs.txt"
    answer = "".join(d["t"] for e, d in ev if e == "token")
    assert "39 months" in answer  # the fake quotes source [1]


@pytest.mark.anyio
async def test_thinking_level_is_passed_to_the_model_and_its_reasoning_streams_separately():
    c, fake = build()
    h = await new_session(c)
    ev = await ask(c, h, "Hello", thinking="low")
    assert fake.state.requests[-1]["reasoning_effort"] == "low"
    assert any(e == "reasoning" for e, _ in ev)
    assert "Checking the sources" not in "".join(d["t"] for e, d in ev if e == "token")


@pytest.mark.anyio
async def test_a_mixed_batch_reports_each_file_and_keeps_the_good_ones():
    c, fake = build()
    h = await new_session(c)
    res = await upload(c, h,
                       ("stock.csv", b"sku;qty\nSKU-9;314\n", "text/csv"),
                       ("tool.exe", b"MZ", "application/octet-stream"),
                       ("scan.pdf", samples.pdf([""]), "application/pdf"),
                       ("book.xlsx", samples.xlsx({"Q3": [["Region", "Revenue"], ["North", 4200]]}), "application/vnd.ms-excel"))
    ok = {r["name"]: r["ok"] for r in res["results"]}
    assert ok == {"stock.csv": True, "tool.exe": False, "scan.pdf": False, "book.xlsx": True}
    assert {d["name"] for d in res["docs"]} == {"stock.csv", "book.xlsx"}
    await ask(c, h, "Stock of SKU-9 and North revenue?")
    assert "SKU-9 | 314" in system_prompt(fake) and "North | 4200" in system_prompt(fake)


@pytest.mark.anyio
async def test_oversize_files_are_refused_and_not_stored():
    c, _ = build(max_file_mb=1)
    h = await new_session(c)
    res = await upload(c, h, ("big.txt", b"x" * (1024 * 1024 + 10), "text/plain"))
    assert not res["results"][0]["ok"] and "1 MB" in res["results"][0]["error"]
    assert res["docs"] == []


@pytest.mark.anyio
async def test_one_customer_never_sees_another_customers_documents():
    c, fake = build()
    a, b = await new_session(c), await new_session(c)
    await upload(c, a, ("a.txt", b"Customer A margin is 31 percent.", "text/plain"))
    ev = await ask(c, b, "What is the margin?")
    assert "31 percent" not in system_prompt(fake)
    assert ev[0][1]["items"] == []
    assert (await c.get("/api/docs", headers=b)).json()["docs"] == []


@pytest.mark.anyio
async def test_a_removed_document_no_longer_reaches_the_model():
    c, fake = build()
    h = await new_session(c)
    res = await upload(c, h, ("old.txt", b"Price list 2024: widget 40 THB.", "text/plain"),
                       ("new.txt", b"Price list 2026: widget 55 THB.", "text/plain"))
    old_id = next(d["id"] for d in res["docs"] if d["name"] == "old.txt")
    assert (await c.delete(f"/api/docs/{old_id}", headers=h)).status_code == 200
    await ask(c, h, "Widget price?")
    assert "55 THB" in system_prompt(fake) and "40 THB" not in system_prompt(fake)


@pytest.mark.anyio
async def test_a_large_upload_sends_the_model_only_the_relevant_passages():
    c, fake = build(stuff_tokens=300, top_k=3)
    h = await new_session(c)
    # ~80 KB, so ~33 chunks: three of them are a small slice of the whole.
    paras = [f"Clause {i}. Standard delivery and packaging terms, revision {i}." for i in range(1200)]
    paras.insert(777, "Invoice INV-77421 for Siam Logistics totals 8,950 THB.")
    corpus = "\n\n".join(paras)
    await upload(c, h, ("ledger.txt", corpus.encode(), "text/plain"))
    ev = await ask(c, h, "What does invoice INV-77421 total?")
    assert ev[0][1]["mode"] == "retrieval" and len(ev[0][1]["items"]) <= 3
    assert "8,950 THB" in system_prompt(fake)
    assert len(system_prompt(fake)) < len(corpus) / 2


@pytest.mark.anyio
async def test_only_the_recent_conversation_is_forwarded():
    c, fake = build(history_turns=3)
    h = await new_session(c)
    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i}"} for i in range(20)]
    await ask(c, h, "latest", history=history)
    sent = fake.state.requests[-1]["messages"]
    assert [m["content"] for m in sent[1:-1]] == [f"turn {i}" for i in range(14, 20)]


@pytest.mark.anyio
async def test_when_the_model_is_busy_a_second_customer_is_told_they_are_queued_then_served():
    c, _ = build(fake=make_fake_strata(delay=0.02, answer="word " * 30), parallel=1)
    h1, h2 = await new_session(c), await new_session(c)
    with anyio.fail_after(10):
        first, second = await asyncio.gather(ask(c, h1, "one"), ask(c, h2, "two"))
    queued = [any(e == "status" and d["state"] == "queued" for e, d in ev) for ev in (first, second)]
    assert queued.count(True) == 1
    assert first[-1][0] == "done" and second[-1][0] == "done"


@pytest.mark.anyio
async def test_a_model_error_reaches_the_page_and_frees_the_slot():
    c, _ = build(fake=make_fake_strata(status=500), parallel=1)
    h = await new_session(c)
    with anyio.fail_after(5):
        for _ in range(2):  # the second would hang if the first leaked the only slot
            ev = await ask(c, h, "hi")
            assert ev[-1][0] == "error" and "500" in ev[-1][1]["message"]
    assert (await c.get("/api/health", headers=KEY)).json()["queue"]["running"] == 0


@pytest.mark.anyio
async def test_health_says_not_ready_while_strata_is_down():
    def refuse(request):
        raise httpx.ConnectError("refused", request=request)
    c, _ = build(transport=httpx.MockTransport(refuse))
    body = (await c.get("/api/health", headers=KEY)).json()
    assert body["ok"] is False and body["model"]["ready"] is False
    assert "not reachable" in body["model"]["detail"]


@pytest.mark.anyio
async def test_an_expired_session_is_refused_with_a_clear_message():
    c, _ = build(session_ttl_s=-1)
    h = await new_session(c)
    r = await c.get("/api/docs", headers=h)
    assert r.status_code == 404 and "upload the files again" in r.json()["detail"]