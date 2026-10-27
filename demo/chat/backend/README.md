# Chat-with-your-data demo — backend (Colab)

The customer-facing page is `demo/chat/` on studio.factor-io.com. This folder
is what runs behind it, **on a Colab GPU VM only**: nothing here runs on the
operator's computer or on light-worker.

```
customer browser ──▶ studio.factor-io.com/demo/chat/   (static page, no login)
                 ──HTTPS──▶ cloudflared quick tunnel    (*.trycloudflare.com, new name every boot)
                 ──▶ gateway.py  :8000                   (sessions, file parsing, retrieval, queue, access key)
                 ──▶ Strata      127.0.0.1:8081          (Qwen3.8-Flash-Next; never exposed)
```

## Run a demo

1. Open `factor_chat_backend.ipynb` in Colab (File → Upload notebook, or open it
   from GitHub).
2. Runtime → Change runtime type → **G4**. G4 comes with high RAM by default.
3. Runtime → **Run all**. The last cells show the **connect link**:
   `https://studio.factor-io.com/demo/chat/#api=<tunnel>&key=<key>`.
4. Send that link. The page reads the backend address and key from it and needs
   no login. You can also paste both into the page's **Connection** panel.
5. When done, run the **Stop** cell (or Runtime → Disconnect and delete runtime).
   That ends the GPU billing, and the link stops working.

The notebook fetches `colab_start.sh`, `gateway.py`, `rag.py` and
`requirements.txt` from the published site, so publish changes here before
expecting a fresh VM to pick them up.

## Model choice

`MODEL=auto` picks from the measured hardware (Strata docs/MODELS.md):

| Pick | When | Download | RAM for all experts |
|---|---|---:|---:|
| `nvfp4` (Strata's NVFP4) | RAM ≥ 100 GB and free disk ≥ 150 GB (G4) | 128 GB | ~80 GB |
| `iq3_s` | RAM ≥ 65 GB and disk ≥ 90 GB (e.g. A100 high-RAM) | ~80 GB | ~55 GB |
| `q2_0` | anything smaller | 66 GB | ~38 GB |

A fresh VM downloads the model every time; that is the start-up wait.

## Behaviour customers will see

- Files: PDF (text layer only; scans need OCR, which is not done), DOCX, XLSX,
  CSV/TSV, TXT/MD/JSON, HTML. At most 25 MB per file and 20 files per session.
- Small uploads (about ≤ 20K tokens in all) go to the model whole; larger ones
  are searched (BM25 + multilingual-e5-small, Thai included) and the best
  passages are sent. Answers cite `[n]` sources, and the page shows them.
- `PARALLEL` answers are generated at once (default 2); further customers see
  "queued" until a slot frees.
- Sessions live in memory and expire after 2 h idle. Files are spooled to the
  VM's temp disk while uploading, and everything is gone when the VM stops.

## Access

The gateway refuses every request without the key from the link (only
`/api/ping` answers without it). The key is in the URL **fragment**, which
browsers never send to a server, and the page removes it from the address bar
after reading it. CORS allows only studio.factor-io.com and the local dev
origins (`ALLOWED_ORIGINS` to change). Anyone holding the link can use the demo
until the VM stops: send it only to the customer in the meeting.

## Develop without a GPU

```
python3 -m venv .venv && .venv/bin/pip install -r requirements-test.txt
.venv/bin/python -m pytest tests -q
.venv/bin/python tests/fake_strata.py --serve-stack   # fake model :8081 + gateway :8000, key "devkey"
python3 -m http.server 8781 --directory ../../..      # page at http://127.0.0.1:8781/demo/chat/
```

Then open `http://127.0.0.1:8781/demo/chat/#api=http://127.0.0.1:8000&key=devkey`.
The fake model quotes the start of source [1], so you can see that the file
reached it.