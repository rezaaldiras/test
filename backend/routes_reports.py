"""Arunika — Dashboard, laporan keuangan & mesin ekspor (CSV/Excel/PDF)."""
from __future__ import annotations

import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends

from auth import require_perm
from db import db
from engine import (AppError, CASH_SUBTYPES, MONTHS_ID, account_map, balance_sheet, cash_flow,
                    clean, fmt_rp, get_settings, general_ledger, income_statement, ledger_balances,
                    oid, round2, today_str, trial_balance)
from exporters import build_file

router = APIRouter()


# --------------------------------------------------------------------------
# Helper periode
# --------------------------------------------------------------------------
def _month_range(ym: str) -> tuple[str, str, str]:
    try:
        y, m = int(ym[:4]), int(ym[5:7])
        assert 1 <= m <= 12
    except Exception:
        raise AppError("Periode tidak valid. Gunakan format TTTT-BB atau TTTT.")
    last = calendar.monthrange(y, m)[1]
    return f"{y}-{m:02d}-01", f"{y}-{m:02d}-{last:02d}", f"{MONTHS_ID[m-1]} {y}"


def _prev_months(ym: str, n: int) -> list[str]:
    y, m = int(ym[:4]), int(ym[5:7])
    out = []
    for i in range(n - 1, -1, -1):
        mm = m - i
        yy = y
        while mm <= 0:
            mm += 12
            yy -= 1
        out.append(f"{yy}-{mm:02d}")
    return out


# --------------------------------------------------------------------------
# DASHBOARD
# --------------------------------------------------------------------------
@router.get("/dashboard")
async def dashboard(month: str | None = None, unit_id: str | None = None,
                    user=Depends(require_perm("dashboard"))):
    month = month or today_str()[:7]
    date_from, date_to, label = _month_range(month + "-01" if len(month) == 7 else f"{month}-01-01")
    if len(month) == 4:  # mode Tahun Ini
        date_from = f"{month}-01-01"
        label = f"Tahun {month}"
    y, m = int(month[:4]), int(month[5:7]) if len(month) > 4 else 12
    ytd_from = f"{month[:4]}-01-01"

    amap = await account_map(db)
    cur = await ledger_balances(db, date_from=date_from, date_to=date_to, unit_id=unit_id)
    ytd = await ledger_balances(db, date_from=ytd_from, date_to=date_to, unit_id=unit_id)
    cashb = await ledger_balances(db, date_to=date_to, unit_id=unit_id, subtypes=CASH_SUBTYPES)

    def split(balances: dict):
        rev = exp = 0.0
        for code, (d, c) in balances.items():
            t = (amap.get(code) or {}).get("type")
            if t == "REVENUE":
                rev = round2(rev + (c - d))
            elif t == "EXPENSE":
                exp = round2(exp + (d - c))
        return rev, exp

    revenue, expense = split(cur)
    revenue_ytd, expense_ytd = split(ytd)
    cash_total = round2(sum(d - c for d, c in cashb.values()))

    ar_q: dict = {"status": {"$in": ["UNPAID", "PARTIAL"]}, "date": {"$lte": date_to}}
    if unit_id:
        ar_q["unit_id"] = unit_id
    ar_out = 0.0
    async for i in db.sales_invoices.find(ar_q):
        ar_out = round2(ar_out + round2(i["total"]) - round2(i.get("paid_amount", 0)))
    ap_out = 0.0
    async for i in db.purchase_invoices.find(ar_q):
        ap_out = round2(ap_out + round2(i["total"]) - round2(i.get("paid_amount", 0)))

    # seri 6 bulan terakhir: pendapatan vs beban & arus kas
    months = _prev_months(month if len(month) == 7 else f"{month}-12", 6)
    rev_series, exp_series, cin_series, cout_series = [], [], [], []
    for mkey in months:
        f, t, _ = _month_range(mkey + "-01")
        b = await ledger_balances(db, date_from=f, date_to=t, unit_id=unit_id)
        r, e = split(b)
        rev_series.append(r)
        exp_series.append(e)
        cb = await ledger_balances(db, date_from=f, date_to=t, unit_id=unit_id, subtypes=CASH_SUBTYPES)
        cin_series.append(round2(sum(d for d, _ in cb.values())))
        cout_series.append(round2(sum(c for _, c in cb.values())))

    today = today_str()
    soon_limit = (date.today() + timedelta(days=7)).isoformat()

    async def due_list(coll, party_field):
        q = {"status": {"$in": ["UNPAID", "PARTIAL"]}, "due_date": {"$lte": soon_limit}}
        if unit_id:
            q["unit_id"] = unit_id
        rows = []
        async for i in coll.find(q).sort("due_date", 1).limit(6):
            remaining = round2(i["total"] - i.get("paid_amount", 0))
            days = (date.fromisoformat(i["due_date"]) - date.fromisoformat(today)).days
            rows.append({"id": str(i["_id"]), "number": i["number"],
                         "party": i.get(party_field, "-"), "remaining": remaining,
                         "due_date": i["due_date"],
                         "overdue_days": max(0, -days), "days_left": max(0, days)})
        return rows

    top_customers = []
    async for r in db.sales_invoices.aggregate([
        {"$match": {"status": {"$ne": "VOID"}, "date": {"$gte": ytd_from, "$lte": date_to}}},
        {"$group": {"_id": "$customer_name", "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
        {"$sort": {"total": -1}}, {"$limit": 5}]):
        top_customers.append({"name": r["_id"] or "-", "total": round2(r["total"]), "count": r["count"]})

    has_accounts = await db.accounts.count_documents({}) > 0
    return clean({
        "month": month, "label": label, "date_to": date_to,
        "kpis": {
            "revenue": revenue, "expense": expense, "profit": round2(revenue - expense),
            "revenue_ytd": revenue_ytd, "profit_ytd": round2(revenue_ytd - expense_ytd),
            "cash_total": cash_total, "ar_outstanding": ar_out, "ap_outstanding": ap_out,
        },
        "series": {"months": months, "revenue": rev_series, "expense": exp_series,
                   "cash_in": cin_series, "cash_out": cout_series},
        "due_sales": await due_list(db.sales_invoices, "customer_name"),
        "due_purchases": await due_list(db.purchase_invoices, "supplier_name"),
        "top_customers": top_customers,
        "has_accounts": has_accounts,
    })


# --------------------------------------------------------------------------
# LAPORAN
# --------------------------------------------------------------------------
@router.get("/reports/trial-balance")
async def r_trial_balance(to: str | None = None, unit_id: str | None = None,
                          user=Depends(require_perm("reports"))):
    return clean(await trial_balance(db, date_to=to or today_str(), unit_id=unit_id))


@router.get("/reports/general-ledger")
async def r_gl(account_code: str, date_from: str | None = None, date_to: str | None = None,
               unit_id: str | None = None, user=Depends(require_perm("reports"))):
    return clean(await general_ledger(db, account_code=account_code,
                                      date_from=date_from or f"{today_str()[:4]}-01-01",
                                      date_to=date_to or today_str(), unit_id=unit_id))


@router.get("/reports/income-statement")
async def r_income(date_from: str | None = None, date_to: str | None = None, unit_id: str | None = None,
                   user=Depends(require_perm("reports"))):
    return clean(await income_statement(db, date_from=date_from or f"{today_str()[:4]}-01-01",
                                        date_to=date_to or today_str(), unit_id=unit_id))


@router.get("/reports/balance-sheet")
async def r_balance(as_of: str | None = None, unit_id: str | None = None,
                    user=Depends(require_perm("reports"))):
    return clean(await balance_sheet(db, as_of=as_of or today_str(), unit_id=unit_id))


@router.get("/reports/cash-flow")
async def r_cashflow(date_from: str | None = None, date_to: str | None = None, unit_id: str | None = None,
                     user=Depends(require_perm("reports"))):
    return clean(await cash_flow(db, date_from=date_from or f"{today_str()[:4]}-01-01",
                                 date_to=date_to or today_str(), unit_id=unit_id))


async def _aging(coll, party_field, as_of, is_sales: bool = True):
    q = {"status": {"$in": ["UNPAID", "PARTIAL"]}}
    rows, buckets = [], {"current": 0.0, "d1_30": 0.0, "d31_60": 0.0, "d61_90": 0.0, "d90p": 0.0}
    total = 0.0
    async for i in coll.find(q).sort("due_date", 1):
        if as_of and i["date"] > as_of:
            continue
        remaining = round2(i["total"] - i.get("paid_amount", 0))
        if remaining <= 0.009:
            continue
        overdue = (date.fromisoformat(as_of) - date.fromisoformat(i["due_date"] or i["date"])).days
        if overdue <= 0:
            b = "current"
        elif overdue <= 30:
            b = "d1_30"
        elif overdue <= 60:
            b = "d31_60"
        elif overdue <= 90:
            b = "d61_90"
        else:
            b = "d90p"
        buckets[b] = round2(buckets[b] + remaining)
        total = round2(total + remaining)
        rows.append([i["number"], i.get(party_field, "-"), i["due_date"] or i["date"], remaining,
                     overdue if overdue > 0 else 0])
    return {
        "title": "Laporan Umur Piutang" if is_sales else "Laporan Umur Utang",
        "meta": [f"Per {as_of}"],
        "columns": ["No. Faktur", "Pelanggan" if is_sales else "Pemasok",
                    "Jatuh Tempo", "Sisa Tagihan", "Hari Terlambat"],
        "sections": [{"title": None, "rows": rows,
                      "footers": [["TOTAL", "", "", total, ""]]}],
        "buckets": buckets, "total": total,
    }


@router.get("/reports/ar-aging")
async def r_ar_aging(as_of: str | None = None, user=Depends(require_perm("reports"))):
    return clean(await _aging(db.sales_invoices, "customer_name", as_of or today_str(), True))


@router.get("/reports/ap-aging")
async def r_ap_aging(as_of: str | None = None, user=Depends(require_perm("reports"))):
    return clean(await _aging(db.purchase_invoices, "supplier_name", as_of or today_str(), False))


@router.get("/reports/journal-register")
async def r_register(date_from: str | None = None, date_to: str | None = None, unit_id: str | None = None,
                     user=Depends(require_perm("reports"))):
    query: dict = {"status": {"$in": ["POSTED", "VOID"]}}
    rng = {}
    if date_from:
        rng["$gte"] = date_from
    if date_to:
        rng["$lte"] = date_to
    if rng:
        query["date"] = rng
    labels = {"SALES": "Penjualan", "PURCHASE": "Pembelian", "RECEIVE": "Penerimaan", "PAY": "Pembayaran",
              "CASH_IN": "Kas Masuk", "CASH_OUT": "Kas Keluar", "TRANSFER": "Transfer", "MANUAL": "Manual",
              "OPENING": "Saldo Awal", "VOID": "Pembatalan"}
    rows = []
    td = tc = 0.0
    async for j in db.journal_entries.find(query).sort([("date", -1), ("created_at", -1)]).limit(500):
        if unit_id and not any((l.get("business_unit_id") or None) == unit_id for l in j.get("lines", [])):
            continue
        d = round2(sum(l["debit"] for l in j["lines"]))
        c = round2(sum(l["credit"] for l in j["lines"]))
        td, tc = round2(td + d), round2(tc + c)
        rows.append([j["date"], j["number"], j["description"], labels.get(j["source_type"], j["source_type"]),
                     d, c, j["status"]])
    return {
        "title": "Register Jurnal",
        "meta": [f"Periode {date_from or 'awal'} s.d. {date_to or today_str()}"],
        "columns": ["Tanggal", "No. Jurnal", "Keterangan", "Sumber", "Debit", "Kredit", "Status"],
        "sections": [{"title": None, "rows": rows, "footers": [["TOTAL", "", "", "", td, tc, ""]]}],
        "totals": {"debit": td, "credit": tc},
    }


# --------------------------------------------------------------------------
# EKSPOR (CSV / Excel / PDF)
# --------------------------------------------------------------------------
BUILDERS = {
    "trial-balance": lambda p: trial_balance(db, date_to=p.get("to") or today_str(), unit_id=p.get("unit_id")),
    "general-ledger": lambda p: general_ledger(db, account_code=p.get("account_code") or "",
                                               date_from=p.get("from") or f"{today_str()[:4]}-01-01",
                                               date_to=p.get("to") or today_str(), unit_id=p.get("unit_id")),
    "income-statement": lambda p: income_statement(db, date_from=p.get("from") or f"{today_str()[:4]}-01-01",
                                                   date_to=p.get("to") or today_str(), unit_id=p.get("unit_id")),
    "balance-sheet": lambda p: balance_sheet(db, as_of=p.get("as_of") or today_str(), unit_id=p.get("unit_id")),
    "cash-flow": lambda p: cash_flow(db, date_from=p.get("from") or f"{today_str()[:4]}-01-01",
                                     date_to=p.get("to") or today_str(), unit_id=p.get("unit_id")),
    "ar-aging": lambda p: _aging(db.sales_invoices, "customer_name", p.get("as_of") or today_str(), True),
    "ap-aging": lambda p: _aging(db.purchase_invoices, "supplier_name", p.get("as_of") or today_str(), False),
}


@router.get("/export")
async def export_report(report: str, format: str = "csv", from_: str | None = None,
                        to: str | None = None, as_of: str | None = None,
                        account_code: str | None = None, unit_id: str | None = None,
                        user=Depends(require_perm("reports"))):
    params = {"from": from_, "to": to, "as_of": as_of, "account_code": account_code, "unit_id": unit_id}
    if format not in ("csv", "xlsx", "pdf"):
        raise AppError("Format ekspor tidak didukung (pilih CSV, Excel, atau PDF).")
    if report == "journal-register":
        data = await r_register(date_from=params["from"], date_to=params["to"], unit_id=unit_id)
    elif report in BUILDERS:
        data = await BUILDERS[report](params)
    else:
        raise AppError("Jenis laporan tidak dikenal.")
    content, mime, filename = build_file(data, format)
    import base64
    return {"filename": filename, "content": base64.b64encode(content).decode(), "mime": mime}
