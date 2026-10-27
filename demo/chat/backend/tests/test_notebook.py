"""The operator runs the notebook top to bottom; a syntax error or a fetch of a
file that is not published would only show up in front of a customer."""
import ast
import json
import os
import re

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
NB = os.path.join(BACKEND, "factor_chat_backend.ipynb")


def code_cells():
    nb = json.load(open(NB))
    return ["".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "code"]


def test_every_code_cell_is_valid_python():
    for src in code_cells():
        ast.parse(src)


def test_the_notebook_fetches_only_files_that_exist_beside_it():
    fetched = re.findall(r'"([\w.]+)"', re.search(r"for name in \[([^\]]+)\]", "\n".join(code_cells())).group(1))
    assert fetched and all(os.path.isfile(os.path.join(BACKEND, f)) for f in fetched)
    # and the start script's own imports are among them
    assert {"colab_start.sh", "gateway.py", "rag.py", "requirements.txt"} <= set(fetched)