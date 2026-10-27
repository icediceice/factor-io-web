"""What a customer's file turns into, and whether the right passage is found."""
import pytest

import rag
import samples


def text_of(name, data):
    return "\n".join(s.text for s in rag.extract(name, data))


def test_pdf_pages_are_read_and_labelled_by_page():
    secs = rag.extract("contract.pdf", samples.pdf(["Term is 24 months", "Fee is 1200 USD"]))
    assert [(s.ref, s.text) for s in secs] == [("p. 1", "Term is 24 months"), ("p. 2", "Fee is 1200 USD")]


def test_pdf_without_a_text_layer_is_reported_not_silently_empty():
    with pytest.raises(rag.EmptyDocument, match="OCR"):
        rag.extract("scan.pdf", samples.pdf(["", ""]))


def test_docx_paragraphs_and_tables_are_read():
    t = text_of("policy.docx", samples.docx(["Leave policy", "Staff get 15 days."], [["Grade", "Days"], ["G7", "20"]]))
    assert "Staff get 15 days." in t and "G7 | 20" in t


def test_every_spreadsheet_sheet_is_read_with_its_name():
    data = samples.xlsx({"Sales": [["Region", "Q3"], ["North", 4200]], "Costs": [["Item", "THB"], ["Rent", 90000]]})
    secs = rag.extract("book.xlsx", data)
    assert {s.ref for s in secs} == {"sheet Sales", "sheet Costs"}
    assert "North | 4200" in text_of("book.xlsx", data) and "Rent | 90000" in text_of("book.xlsx", data)


def test_semicolon_csv_keeps_its_columns():
    assert "SKU-1 | 12,50 | Bangkok" in text_of("stock.csv", b"sku;price;city\nSKU-1;12,50;Bangkok\n")


def test_html_drops_scripts_and_keeps_text():
    t = text_of("page.html", b"<html><script>var secret=1</script><p>Opening hours 9-18</p></html>")
    assert "Opening hours 9-18" in t and "secret" not in t


def test_thai_text_exported_in_windows_codepage_is_decoded():
    assert "ราคา" in text_of("notes.txt", "ราคา 500 บาท".encode("cp874"))


def test_unsupported_type_is_refused_by_name():
    with pytest.raises(rag.UnsupportedFile, match="setup.exe"):
        rag.extract("setup.exe", b"MZ")


def test_a_sentence_straddling_a_chunk_boundary_survives_whole_in_some_chunk():
    filler = "Background paragraph about unrelated matters. " * 50  # ~2350 chars
    fact = "The service level agreement guarantees 99.95 percent monthly uptime."
    store = rag.DocStore(rag.HashEmbedder())
    store.add_document("sla.txt", (filler + fact + " " + filler).encode())
    assert any(fact in c.text for c in store.chunks.values())
    assert all(len(c.text) <= rag.CHUNK_CHARS + rag.CHUNK_OVERLAP + 2 for c in store.chunks.values())


def _corpus_store():
    store = rag.DocStore(rag.HashEmbedder())
    paras = [f"Section {i}. General terms about delivery schedules and packaging rules number {i}." for i in range(80)]
    paras.insert(37, "Invoice INV-77421 was issued to Siam Logistics with a total of 8,950 THB.")
    store.add_document("ledger.txt", "\n\n".join(paras).encode())
    return store


def test_exact_identifier_finds_its_passage_among_many():
    hits = _corpus_store().search("What is the total on INV-77421?", k=3)
    assert "8,950 THB" in hits[0].text


def test_thai_question_finds_the_thai_passage():
    store = rag.DocStore(rag.HashEmbedder())
    paras = [f"หัวข้อที่ {i} เรื่องการจัดส่งสินค้าและการบรรจุหีบห่อตามมาตรฐานบริษัท" for i in range(40)]
    paras.insert(21, "นโยบายการลาพักร้อน พนักงานมีสิทธิ์ลาพักร้อนได้ 12 วันต่อปี")
    store.add_document("hr.txt", "\n\n".join(paras).encode())
    assert any("12 วันต่อปี" in c.text for c in store.search("พนักงานลาพักร้อนได้กี่วัน", k=3))


def test_small_uploads_go_to_the_model_whole_and_large_ones_by_retrieval():
    small = rag.DocStore(rag.HashEmbedder())
    small.add_document("a.txt", b"Alpha fact.")
    small.add_document("b.txt", b"Beta fact.")
    mode, chunks = small.select("anything", stuff_tokens=1000, top_k=2, budget_tokens=500)
    assert mode == "full" and {c.doc_name for c in chunks} == {"a.txt", "b.txt"}

    mode, chunks = _corpus_store().select("INV-77421 total", stuff_tokens=200, top_k=4, budget_tokens=10_000)
    assert mode == "retrieval" and len(chunks) <= 4
    assert any("8,950 THB" in c.text for c in chunks)