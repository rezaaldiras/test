"""Arunika — Mesin ekspor laporan ke CSV, Excel (xlsx) dan PDF.

Laporan datang dalam struktur generik:
    {title, meta[], sections: [{title, columns[], rows[][], footers[][]}]}
Sel numerik (int/float) diekspor sebagai angka; string apa adanya.
"""
from __future__ import annotations

import csv
import io
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _fmt_num(n) -> str:
    """Format angka gaya Indonesia: 1.234.567,89"""
    s = f"{float(n):,.2f}".replace(",", "#").replace(".", ",").replace("#", ".")
    return s


def _file_tag(title: str) -> str:
    keep = [c if c.isalnum() else "-" for c in title.lower()]
    return "".join(keep).replace("--", "-")[:40].strip("-") or "laporan"


# --------------------------------------------------------------------------
# CSV
# --------------------------------------------------------------------------
def build_csv(data: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    w.writerow([data.get("title", "Laporan")])
    for m in data.get("meta", []):
        w.writerow([m])
    w.writerow([])
    for sec in data.get("sections", []):
        if sec.get("title"):
            w.writerow([sec["title"]])
        if sec.get("columns"):
            w.writerow(sec["columns"])
        for row in sec.get("rows", []):
            w.writerow([_cell_csv(c) for c in row])
        for row in sec.get("footers", []):
            w.writerow([_cell_csv(c) for c in row])
        w.writerow([])
    return buf.getvalue().encode("utf-8-sig")


def _cell_csv(c):
    if isinstance(c, (int, float)) and not isinstance(c, bool):
        return _fmt_num(c)
    return c if c is not None else ""


# --------------------------------------------------------------------------
# Excel
# --------------------------------------------------------------------------
def build_xlsx(data: dict) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = (data.get("title") or "Laporan")[:28]
    bold = Font(bold=True)
    row_i = 1
    ws.cell(row=row_i, column=1, value=data.get("title", "Laporan")).font = Font(bold=True, size=14)
    row_i += 1
    for m in data.get("meta", []):
        ws.cell(row=row_i, column=1, value=m)
        row_i += 1
    row_i += 1
    max_cols = 1
    for sec in data.get("sections", []):
        if sec.get("title"):
            ws.cell(row=row_i, column=1, value=sec["title"]).font = bold
            row_i += 1
        cols = sec.get("columns", [])
        max_cols = max(max_cols, len(cols))
        for ci, c in enumerate(cols, start=1):
            cell = ws.cell(row=row_i, column=ci, value=c)
            cell.font = bold
        row_i += 1
        for row in sec.get("rows", []):
            row_i = _xlsx_row(ws, row, row_i)
        for row in sec.get("footers", []):
            row_i = _xlsx_row(ws, row, row_i, bold=True)
        row_i += 1
    # lebar kolom sederhana
    for ci in range(1, max_cols + 1):
        width = 14 if ci > 2 else 28
        ws.column_dimensions[get_column_letter(ci)].width = width
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _xlsx_row(ws, row, row_i, bold=False):
    for ci, c in enumerate(row, start=1):
        if isinstance(c, (int, float)) and not isinstance(c, bool):
            cell = ws.cell(row=row_i, column=ci, value=float(c))
            cell.number_format = "#,##0.00"
        else:
            ws.cell(row=row_i, column=ci, value=c)
    if bold:
        for ci in range(1, len(row) + 1):
            ws.cell(row=row_i, column=ci).font = Font(bold=True)
    return row_i + 1


# --------------------------------------------------------------------------
# PDF
# --------------------------------------------------------------------------
def build_pdf(data: dict) -> bytes:
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm)
    story = [
        Paragraph(escape(data.get("title", "Laporan")), styles["Title"]),
    ]
    for m in data.get("meta", []):
        story.append(Paragraph(escape(m), styles["Normal"]))
    story.append(Spacer(1, 6))

    for sec in data.get("sections", []):
        if sec.get("title"):
            story.append(Spacer(1, 6))
            story.append(Paragraph(escape(sec["title"]), styles["Heading2"]))
        cols = sec.get("columns", [])
        body = [[Paragraph(escape(str(c)), styles["Normal"]) for c in cols]] if cols else []
        for row in sec.get("rows", []):
            body.append([_pdf_cell(c, styles) for c in row])
        for row in sec.get("footers", []):
            body.append([_pdf_cell(c, styles) for c in row])
        if body:
            n_cols = max(len(r) for r in body)
            body = [r + [""] * (n_cols - len(r)) for r in body]
            t = Table(body, repeatRows=1 if cols else 0)
            style = [
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C8C0B3")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F1EA")]),
            ]
            if cols:
                style.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3B5338")))
                style.append(("TEXTCOLOR", (0, 0), (-1, 0), colors.white))
            for fi in range(len(sec.get("footers", []))):
                style.append(("BACKGROUND", (0, len(body) - 1 - fi), (-1, len(body) - 1 - fi),
                              colors.HexColor("#E4EADF")))
            t.setStyle(TableStyle(style))
            story.append(t)
    doc.build(story)
    return buf.getvalue()


def _pdf_cell(c, styles):
    if isinstance(c, (int, float)) and not isinstance(c, bool):
        return Paragraph(escape(_fmt_num(c)), styles["Normal"])
    text = str(c) if c is not None else ""
    if len(text) > 70:
        text = text[:67] + "..."
    return Paragraph(escape(text), styles["Normal"])


# --------------------------------------------------------------------------
# Dispatcher
# --------------------------------------------------------------------------
def build_file(data: dict, fmt: str) -> tuple[bytes, str, str]:
    tag = _file_tag(data.get("title", "laporan"))
    if fmt == "csv":
        return build_csv(data), "text/csv; charset=utf-8", f"{tag}.csv"
    if fmt == "xlsx":
        return build_xlsx(data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"{tag}.xlsx"
    if fmt == "pdf":
        return build_pdf(data), "application/pdf", f"{tag}.pdf"
    raise ValueError(f"Format tidak didukung: {fmt}")
