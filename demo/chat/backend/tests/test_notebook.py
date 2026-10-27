"""The operator opens the notebook, presses Run all and sends the link that
appears. These tests run the real code cells in order and fake only what lives
outside the notebook: GPU tools, the start script's process, network probes,
IPython display and Colab's runtime."""
import json
import pathlib
import re
import subprocess
import sys
import types
import urllib.request

import pytest

BACKEND = pathlib.Path(__file__).resolve().parent.parent
NB = BACKEND / "factor_chat_backend.ipynb"
FETCHED = ["colab_start.sh", "gateway.py", "rag.py", "requirements.txt"]
VM_WORK = '"/content/factor-chat"'
LINK = "https://studio.factor-io.com/demo/chat/#api=https://t.trycloudflare.com&key=k"


class Colab:
    """Everything outside the notebook, recorded."""

    def __init__(self, tmp_path, monkeypatch, start_exit=0):
        self.work = tmp_path / "factor-chat"
        self.start_exit = start_exit
        self.started, self.shown, self.probed, self.unassigned = [], [], [], 0
        real_urlopen = urllib.request.urlopen

        def urlopen(url, *a, **kw):
            if str(url).startswith("file:"):  # the fetch cell, served from this checkout
                return real_urlopen(url, *a, **kw)
            self.probed.append(url)
            return types.SimpleNamespace(status=200)

        def unassign():
            self.unassigned += 1

        colab = types.ModuleType("google.colab")
        colab.runtime = types.SimpleNamespace(unassign=unassign)
        google = types.ModuleType("google")
        google.colab = colab
        display = types.ModuleType("IPython.display")
        display.HTML = str
        display.display = self.shown.append
        for name, mod in {"google": google, "google.colab": colab,
                          "IPython": types.ModuleType("IPython"), "IPython.display": display}.items():
            monkeypatch.setitem(sys.modules, name, mod)
        monkeypatch.setattr(urllib.request, "urlopen", urlopen)
        monkeypatch.setattr(subprocess, "run", lambda *a, **kw: subprocess.CompletedProcess(a, 0, stdout="", stderr=""))
        monkeypatch.setattr(subprocess, "Popen", self.start_script)
        monkeypatch.delenv("STRATA_PORT", raising=False)
        monkeypatch.delenv("GATEWAY_PORT", raising=False)

    def start_script(self, args, cwd, env, **kw):
        """colab_start.sh: on success it leaves logs/status.json saying ready."""
        self.started.append({"args": args, "cwd": cwd, "env": env})
        if self.start_exit == 0:
            logs = pathlib.Path(cwd, "logs")
            logs.mkdir(exist_ok=True)
            (logs / "status.json").write_text(json.dumps({
                "state": "ready", "link": LINK, "tunnel": "https://t.trycloudflare.com",
                "gpu": "RTX PRO 6000", "size": "NVFP4"}))
        return types.SimpleNamespace(stdout=iter(["colab_start.sh output\n"]), wait=lambda: self.start_exit)


def cells(work):
    """The notebook's code cells, with its VM work folder moved under tmp_path."""
    nb = json.loads(NB.read_text())
    srcs = ["".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code"]
    assert "\n".join(srcs).count(VM_WORK) == 1
    return [s.replace(VM_WORK, json.dumps(str(work))) for s in srcs]


def run(srcs):
    """Run all: every code cell in order, in one kernel namespace. SOURCE is the
    Settings form field; it points at this checkout instead of the published site."""
    ns = {}
    for i, src in enumerate(srcs):
        exec(compile(src, f"<cell {i}>", "exec"), ns)
        if "SOURCE" in ns and not ns["SOURCE"].startswith("file:"):
            ns["SOURCE"] = BACKEND.as_uri() + "/"
    return ns


def strata_port():
    """The port colab_start.sh starts Strata on unless told otherwise."""
    return re.search(r'STRATA_PORT="\$\{STRATA_PORT:-(\d+)\}"', (BACKEND / "colab_start.sh").read_text()).group(1)


def test_run_all_starts_the_backend_shows_the_link_and_leaves_the_vm_running(tmp_path, monkeypatch):
    colab = Colab(tmp_path, monkeypatch)
    run(cells(colab.work))

    for name in FETCHED:
        assert (colab.work / name).read_bytes() == (BACKEND / name).read_bytes()
    [start] = colab.started
    assert start["args"] == ["bash", "colab_start.sh"] and start["cwd"] == str(colab.work)
    assert start["env"]["MODEL"] == "auto"
    assert any(LINK.replace("&", "&amp;") in str(shown) for shown in colab.shown)
    assert colab.unassigned == 0
    assert f"http://127.0.0.1:{strata_port()}/health" in colab.probed


def test_the_stop_cell_releases_the_vm_once_the_operator_ticks_it(tmp_path, monkeypatch):
    colab = Colab(tmp_path, monkeypatch)
    srcs = cells(colab.work)
    ns = run(srcs)
    # The checkbox is a Colab form field: ticking it rewrites its line.
    ticked = srcs[-1].replace("STOP_DEMO = False", "STOP_DEMO = True")
    assert ticked != srcs[-1]
    exec(compile(ticked, "<stop cell>", "exec"), ns)
    assert colab.unassigned == 1


def test_a_failed_start_ends_run_all_before_any_link_or_stop(tmp_path, monkeypatch):
    colab = Colab(tmp_path, monkeypatch, start_exit=1)
    with pytest.raises(SystemExit):
        run(cells(colab.work))
    assert colab.shown == [] and colab.unassigned == 0