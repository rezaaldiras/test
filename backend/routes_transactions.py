"""Arunika — Modul transaksi: Penjualan, Pembelian, Piutang/Utang, Kas & Bank, Jurnal.

Semua transaksi memanggil accounting engine (engine.create_journal) — dilarang
membuat jurnal di luar engine. Dokumen POSTED tidak pernah dihapus: hanya Void
melalui jurnal penyeimbang dengan audit trail.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import require_perm
from db import db
from engine import (AppError, audit_log, check_period_open, clean, create_journal,
                    fmt_rp, get_account, get_settings, next_number, oid, round2,
                    today_str, utcnow, valid_date, void_journal)

router = APIRouter()

SOURCE_LABELS = {
    "SALES": "Penjualan", "PURCHASE": "Pembelian", "RECEIVE": "Penerimaan Piutang",
    "PAY": "Pembayaran Utang", "CASH_IN": "Kas Masuk", "CASH_OUT": "Kas Keluar",
    "TRANSFER": "Transfer Kas", "MANUAL": "Jurnal Manual", "OPENING": "Saldo Awal",
    "VOID": "Pembatalan",
}


# --------------------------------------------------------------------------
# Skema request
# --------------------------------------------------------------------------
class LineIn(BaseModel):
    description: str = ""
    qty: float = 1
    price: float = 0
    account_code: str | None = None


class SalesInvoiceIn(BaseModel):
    date: str
    due_date: str | None = None
    customer_id: str
    payment_type: str  # CASH | CREDIT
    cash_account_id: str | None = None
    lines: list[LineIn]
    unit_id: str | None = None
    cost_center_id: str | None = None
    notes: str | None = None


class PurchaseInvoiceIn(BaseModel):
    date: str
    due_date: str | None = None
    supplier_id: str
    payment_type: str  # CASH | CREDIT
    cash_account_id: str | None = None
    lines: list[LineIn]
    unit_id: str | None = None
    cost_center_id: str | None = None
    notes: str | None = None


class PaymentIn(BaseModel):
    type: str  # RECEIVE | PAY
    invoice_id: str
    date: str
    cash_account_id: str
    amount: float
    notes: str | None = None


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class CashTxnIn(BaseModel):
    kind: str  # IN | OUT
    date: str
    cash_account_id: str
    amount: float
    account_code: str
    description: str = Field(min_length=3, max_length=200)
    unit_id: str | None = None
    cost_center_id: str | None = None


class TransferIn(BaseModel):
    date: str
    from_cash_account_id: str
    to_cash_account_id: str
    amount: float
    notes: str | None = None


class JournalLineIn(BaseModel):
    account_code: str
    debit: float = 0
    credit: float = 0
    description: str | None = None


class ManualJournalIn(BaseModel):
    date: str
    description: str = Field(min_length=3, max_length=200)
    lines: list[JournalLineIn]
    auto_balance_account_code: str | None = None
    source_type: str = "MANUAL"  # MANUAL | OPENING
    action: str = "post"  # post | draft


# --------------------------------------------------------------------------
# Util bersama
# --------------------------------------------------------------------------
async def _party(coll, party_id: str, label: str):
    doc = await coll.find_one({"_id": oid(party_id)})
    if not doc:
        raise AppError(f"{label} tidak ditemukan.")
    return doc


async def _active_cash(cash_account_id: str | None):
    if not cash_account_id:
        return None
    cash = await db.cash_accounts.find_one({"_id": oid(cash_account_id), "is_active": True})
    if not cash:
        raise AppError("Akun kas/bank tidak ditemukan atau tidak aktif.")
    return cash


def _default_due(d: str) -> str:
    dd = date.fromisoformat(d) + timedelta(days=30)
    return dd.isoformat()


# --------------------------------------------------------------------------
# FAKTUR PENJUALAN
# --------------------------------------------------------------------------
async def _list_invoices(coll, q, status, date_from, date_to, unit_id, page, limit):
    query: dict = {}
    if q:
        query["$or"] = [{"number": {"$regex": q, "$options": "i"}},
                        {"customer_name": {"$regex": q, "$options": "i"}},
                        {"supplier_name": {"$regex": q, "$options": "i"}}]
    if status and status != "ALL":
        query["status"] = status
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["date"] = rng
    if unit_id:
        query["unit_id"] = unit_id
    total = await coll.count_documents(query)
    items = await coll.find(query).sort([("date", -1), ("created_at", -1)]) \
        .skip((max(page, 1) - 1) * limit).limit(limit).to_list(limit)
    return {"items": [clean(i) for i in items], "total": total, "page": page, "limit": limit}


@router.get("/sales-invoices")
async def list_sales(q: str | None = None, status: str | None = None, date_from: str | None = None,
                     date_to: str | None = None, unit_id: str | None = None, page: int = 1, limit: int = 20,
                     user=Depends(require_perm("sales"))):
    return await _list_invoices(db.sales_invoices, q, status, date_from, date_to, unit_id, page, min(limit, 100))


@router.get("/sales-invoices/{invoice_id}")
async def get_sales(invoice_id: str, user=Depends(require_perm("sales"))):
    inv = await db.sales_invoices.find_one({"_id": oid(invoice_id)})
    if not inv:
        raise AppError("Faktur penjualan tidak ditemukan.", 404)
    pays = await db.payments.find({"invoice_id": str(inv["_id"])}).sort("created_at", -1).to_list(None)
    return {**clean(inv), "payments": [clean(p) for p in pays]}


async def _create_invoice(coll, prefix, body, party_id, is_sales: bool, user):
    valid_date(body.date, "Tanggal faktur")
    if not body.lines:
        raise AppError("Faktur harus memiliki minimal satu baris barang/jasa.")
    party = await _party(db.customers if is_sales else db.suppliers, party_id,
                         "Pelanggan" if is_sales else "Pemasok")
    party_id_field = "customer_id" if is_sales else "supplier_id"
    party_name_field = "customer_name" if is_sales else "supplier_name"

    settings = await get_settings(db)
    subtotal = round2(sum(round2(l.qty * l.price) for l in body.lines))
    if subtotal <= 0:
        raise AppError("Total faktur harus lebih dari nol. Periksa jumlah dan harga barang/jasa.")

    tax_amount = round2(subtotal * float(settings.get("tax_rate", 0)) / 100) if settings.get("tax_enabled") else 0.0
    total = round2(subtotal + tax_amount)

    jlines, inv_lines = [], []
    for l in body.lines:
        amount = round2(l.qty * l.price)
        code = (l.account_code or "").strip() or (
            settings["default_revenue_account"] if is_sales else settings["default_purchase_account"])
        acct = await get_account(db, code)
        if not acct:
            raise AppError("Akun untuk salah satu baris tidak ditemukan. Periksa Bagan Akun.")
        if is_sales and acct["type"] != "REVENUE":
            raise AppError(f"Akun {acct['name']} bukan akun pendapatan. Baris penjualan harus memakai akun pendapatan.")
        if not is_sales and acct["type"] not in ("ASSET", "EXPENSE"):
            raise AppError(f"Akun {acct['name']} tidak valid untuk pembelian. Gunakan akun persediaan atau beban.")
        inv_lines.append({"description": l.description or "-", "qty": round2(l.qty), "price": round2(l.price),
                          "amount": amount, "account_code": acct["code"], "account_name": acct["name"]})
        # Penjualan: pendapatan di KREDIT. Pembelian: persediaan/beban di DEBIT.
        jlines.append({"account_code": acct["code"],
                       "credit": amount if is_sales else 0,
                       "debit": 0 if is_sales else amount,
                       "description": l.description or ("Penjualan" if is_sales else "Pembelian"),
                       "business_unit_id": body.unit_id, "cost_center_id": body.cost_center_id})

    if tax_amount > 0:
        tax_code = settings["tax_output_account"] if is_sales else settings["tax_input_account"]
        tax_acct = await get_account(db, tax_code)
        if not tax_acct:
            raise AppError("Akun pajak belum dikonfigurasi. Atur di menu Pengaturan > Konfigurasi.")
        jlines.append({"account_code": tax_acct["code"], "credit": tax_amount,
                       "description": "Pajak Keluaran" if is_sales else "Pajak Masukan",
                       "business_unit_id": body.unit_id, "cost_center_id": body.cost_center_id})

    cash = None
    if body.payment_type == "CASH":
        cash = await _active_cash(body.cash_account_id)
        if not cash:
            raise AppError("Pilih kas/bank penerimaan untuk transaksi tunai.")
        # Penjualan tunai: kas di DEBIT. Pembelian tunai: kas di KREDIT.
        jlines.insert(0, {"account_code": cash["account_code"],
                          "debit": total if is_sales else 0,
                          "credit": 0 if is_sales else total,
                          "description": f"{'Penjualan tunai' if is_sales else 'Pembelian tunai'} — {party['name']}",
                          "business_unit_id": body.unit_id, "cost_center_id": body.cost_center_id})
    elif body.payment_type == "CREDIT":
        code = settings["default_ar_account"] if is_sales else settings["default_ap_account"]
        acct = await get_account(db, code)
        if not acct:
            raise AppError("Akun Piutang/Utang Usaha belum dikonfigurasi. Atur di menu Konfigurasi.")
        # Penjualan kredit: Piutang (AR) di DEBIT. Pembelian kredit: Utang (AP) di KREDIT.
        jlines.insert(0, {"account_code": acct["code"],
                          "debit": total if is_sales else 0,
                          "credit": 0 if is_sales else total,
                          "description": f"{'Piutang' if is_sales else 'Utang'} — {party['name']}",
                          "business_unit_id": body.unit_id, "cost_center_id": body.cost_center_id})
    else:
        raise AppError("Tipe pembayaran tidak valid (pilih Tunai atau Kredit).")

    source = "SALES" if is_sales else "PURCHASE"
    journal = await create_journal(db, date_str=body.date,
                                   description=f"{'Penjualan' if is_sales else 'Pembelian'} — {party['name']}",
                                   source_type=source, lines=jlines, user=user)

    number = await next_number(db, prefix, body.date)
    doc = {
        "number": number, "date": body.date,
        "due_date": body.due_date or (_default_due(body.date) if body.payment_type == "CREDIT" else body.date),
        party_id_field: str(party["_id"]),
        party_name_field: party["name"],
        "payment_type": body.payment_type,
        "cash_account_id": str(cash["_id"]) if cash else None,
        "cash_account_name": cash["name"] if cash else None,
        "lines": inv_lines, "subtotal": subtotal, "tax_rate": float(settings.get("tax_rate", 0)),
        "tax_enabled": bool(settings.get("tax_enabled")), "tax_amount": tax_amount,
        "total": total, "paid_amount": 0.0, "status": "UNPAID",
        "unit_id": body.unit_id, "cost_center_id": body.cost_center_id, "notes": body.notes,
        "journal_id": journal["_id"], "journal_number": journal["number"],
        "created_by": user["email"], "created_at": utcnow(),
    }
    res = await coll.insert_one(doc)
    doc["_id"] = res.inserted_id
    await db.journal_entries.update_one({"_id": journal["_id"]}, {"$set": {"source_id": str(res.inserted_id)}})
    await audit_log(db, user, "CREATE", coll.name, res.inserted_id, None,
                    {"number": number, "total": total, "journal": journal["number"]})
    return clean(doc)


@router.post("/sales-invoices", status_code=201)
async def create_sales(body: SalesInvoiceIn, user=Depends(require_perm("sales", "write"))):
    return await _create_invoice(db.sales_invoices, "INV", body, body.customer_id, True, user)


@router.post("/sales-invoices/{invoice_id}/void")
async def void_sales(invoice_id: str, body: VoidIn, user=Depends(require_perm("sales", "write"))):
    return await _void_invoice(db.sales_invoices, invoice_id, body.reason, user,
                               "Faktur penjualan tidak dapat dibatalkan karena sudah memiliki pembayaran. "
                               "Batalkan pembayarannya terlebih dahulu.")


# --------------------------------------------------------------------------
# FAKTUR PEMBELIAN
# --------------------------------------------------------------------------
@router.get("/purchase-invoices")
async def list_purchases(q: str | None = None, status: str | None = None, date_from: str | None = None,
                         date_to: str | None = None, unit_id: str | None = None, page: int = 1, limit: int = 20,
                         user=Depends(require_perm("purchases"))):
    return await _list_invoices(db.purchase_invoices, q, status, date_from, date_to, unit_id, page, min(limit, 100))


@router.get("/purchase-invoices/{invoice_id}")
async def get_purchase(invoice_id: str, user=Depends(require_perm("purchases"))):
    inv = await db.purchase_invoices.find_one({"_id": oid(invoice_id)})
    if not inv:
        raise AppError("Faktur pembelian tidak ditemukan.", 404)
    pays = await db.payments.find({"invoice_id": str(inv["_id"])}).sort("created_at", -1).to_list(None)
    return {**clean(inv), "payments": [clean(p) for p in pays]}


@router.post("/purchase-invoices", status_code=201)
async def create_purchase(body: PurchaseInvoiceIn, user=Depends(require_perm("purchases", "write"))):
    return await _create_invoice(db.purchase_invoices, "PUR", body, body.supplier_id, False, user)


@router.post("/purchase-invoices/{invoice_id}/void")
async def void_purchase(invoice_id: str, body: VoidIn, user=Depends(require_perm("purchases", "write"))):
    return await _void_invoice(db.purchase_invoices, invoice_id, body.reason, user,
                               "Faktur pembelian tidak dapat dibatalkan karena sudah memiliki pembayaran. "
                               "Batalkan pembayarannya terlebih dahulu.")


async def _void_invoice(coll, invoice_id, reason, user, paid_error):
    inv = await coll.find_one({"_id": oid(invoice_id)})
    if not inv:
        raise AppError("Faktur tidak ditemukan.", 404)
    if inv.get("status") == "VOID":
        raise AppError("Faktur ini sudah dibatalkan sebelumnya.")
    if round2(inv.get("paid_amount", 0)) > 0.009:
        raise AppError(paid_error)
    if inv.get("journal_id"):
        journal = await db.journal_entries.find_one({"_id": oid(inv["journal_id"])})
        if journal and journal.get("status") == "POSTED":
            await void_journal(db, journal, f"Void {inv['number']}: {reason}", user)
    await coll.update_one({"_id": inv["_id"]}, {"$set": {"status": "VOID", "void_reason": reason,
                                                         "voided_by": user["email"], "voided_at": utcnow()}})
    await audit_log(db, user, "VOID", coll.name, inv["_id"],
                    {"number": inv["number"], "status": inv["status"]}, {"status": "VOID", "reason": reason})
    return {"ok": True, "message": f"Faktur {inv['number']} dibatalkan. Jurnal penyeimbang telah dibuat."}


# --------------------------------------------------------------------------
# PEMBAYARAN (Penerimaan Piutang & Pembayaran Utang)
# --------------------------------------------------------------------------
@router.get("/payments")
async def list_payments(type: str | None = None, q: str | None = None, page: int = 1, limit: int = 20,
                        user=Depends(require_perm("cash"))):
    query: dict = {}
    if type in ("RECEIVE", "PAY"):
        query["type"] = type
    if q:
        query["$or"] = [{"number": {"$regex": q, "$options": "i"}},
                        {"invoice_number": {"$regex": q, "$options": "i"}},
                        {"party_name": {"$regex": q, "$options": "i"}}]
    total = await db.payments.count_documents(query)
    items = await db.payments.find(query).sort([("date", -1), ("created_at", -1)]) \
        .skip((max(page, 1) - 1) * limit).limit(min(limit, 100)).to_list(min(limit, 100))
    return {"items": [clean(i) for i in items], "total": total, "page": page, "limit": limit}


@router.post("/payments", status_code=201)
async def create_payment(body: PaymentIn, user=Depends(require_perm("cash", "write"))):
    valid_date(body.date, "Tanggal pembayaran")
    amount = round2(body.amount)
    if amount <= 0:
        raise AppError("Nominal pembayaran harus lebih dari nol.")
    if body.type not in ("RECEIVE", "PAY"):
        raise AppError("Tipe pembayaran tidak valid.")

    coll = db.sales_invoices if body.type == "RECEIVE" else db.purchase_invoices
    inv = await coll.find_one({"_id": oid(body.invoice_id)})
    if not inv or inv.get("status") == "VOID":
        raise AppError("Faktur tidak ditemukan atau sudah dibatalkan.")
    remaining = round2(inv["total"] - inv.get("paid_amount", 0))
    if remaining <= 0.009:
        raise AppError(f"Faktur {inv['number']} sudah lunas dan tidak dapat menerima pembayaran lagi.")
    if amount > remaining + 0.009:
        raise AppError(f"Nominal melebihi sisa tagihan (sisa tagihan: {fmt_rp(remaining)}). "
                       "Untuk kelebihan pembayaran, gunakan mekanisme kredit nota.")

    dup = await db.payments.find_one({"invoice_id": str(inv["_id"]), "amount": amount,
                                      "date": body.date, "status": {"$ne": "VOID"}})
    if dup:
        raise AppError("Terdeteksi pembayaran dengan nominal dan tanggal yang sama pada faktur ini. "
                       "Periksa kembali untuk mencegah input ganda.")

    cash = await _active_cash(body.cash_account_id)
    settings = await get_settings(db)
    party_name = inv.get("customer_name") or inv.get("supplier_name") or "-"
    if body.type == "RECEIVE":
        ar = await get_account(db, settings["default_ar_account"])
        if not ar:
            raise AppError("Akun Piutang Usaha belum dikonfigurasi.")
        jlines = [{"account_code": cash["account_code"], "debit": amount,
                   "description": f"Penerimaan {inv['number']} — {party_name}"},
                  {"account_code": ar["code"], "credit": amount,
                   "description": f"Pelunasan piutang {inv['number']}"}]
        source = "RECEIVE"
    else:
        ap = await get_account(db, settings["default_ap_account"])
        if not ap:
            raise AppError("Akun Utang Usaha belum dikonfigurasi.")
        jlines = [{"account_code": ap["code"], "debit": amount,
                   "description": f"Pelunasan utang {inv['number']}"},
                  {"account_code": cash["account_code"], "credit": amount,
                   "description": f"Pembayaran {inv['number']} — {party_name}"}]
        source = "PAY"

    journal = await create_journal(db, date_str=body.date, description=source and (
        f"Penerimaan pembayaran {inv['number']}" if source == "RECEIVE" else f"Pembayaran utang {inv['number']}"),
        source_type=source, lines=jlines, user=user)
    number = await next_number(db, "RCV" if source == "RECEIVE" else "PAY", body.date)

    for _ in range(3):
        fresh = await coll.find_one({"_id": inv["_id"]})
        if not fresh or fresh.get("status") == "VOID":
            raise AppError("Faktur tidak tersedia. Muat ulang halaman.")
        old_paid = round2(fresh.get("paid_amount", 0))
        new_paid = round2(old_paid + amount)
        new_status = "PAID" if abs(new_paid - fresh["total"]) < 0.009 else "PARTIAL"
        r = await coll.update_one({"_id": inv["_id"], "paid_amount": old_paid,
                                   "status": {"$in": ["UNPAID", "PARTIAL"]}},
                                  {"$set": {"paid_amount": new_paid, "status": new_status}})
        if r.modified_count == 1:
            break
    else:
        raise AppError("Data faktur berubah saat pemrosesan. Silakan coba lagi.", 409)

    doc = {
        "number": number, "type": body.type, "date": body.date, "invoice_id": str(inv["_id"]),
        "invoice_number": inv["number"], "party_name": party_name,
        "cash_account_id": str(cash["_id"]), "cash_account_name": cash["name"],
        "amount": amount, "notes": body.notes, "journal_id": journal["_id"],
        "journal_number": journal["number"], "status": "POSTED",
        "created_by": user["email"], "created_at": utcnow(),
    }
    res = await db.payments.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(db, user, "CREATE", "payments", res.inserted_id, None,
                    {"number": number, "invoice": inv["number"], "amount": amount})
    return clean(doc)


@router.post("/payments/{payment_id}/void")
async def void_payment(payment_id: str, body: VoidIn, user=Depends(require_perm("cash", "write"))):
    pay = await db.payments.find_one({"_id": oid(payment_id)})
    if not pay:
        raise AppError("Pembayaran tidak ditemukan.", 404)
    if pay.get("status") == "VOID":
        raise AppError("Pembayaran ini sudah dibatalkan sebelumnya.")
    if pay.get("journal_id"):
        journal = await db.journal_entries.find_one({"_id": oid(pay["journal_id"])})
        if journal and journal.get("status") == "POSTED":
            await void_journal(db, journal, f"Void {pay['number']}: {body.reason}", user)
    await db.payments.update_one({"_id": pay["_id"]}, {"$set": {"status": "VOID", "void_reason": body.reason,
                                                                "voided_by": user["email"], "voided_at": utcnow()}})
    coll = db.sales_invoices if pay["type"] == "RECEIVE" else db.purchase_invoices
    try:
        inv_oid = oid(pay["invoice_id"])
    except AppError:
        inv_oid = None
    if inv_oid:
        for _ in range(3):
            fresh = await coll.find_one({"_id": inv_oid})
            if not fresh:
                break
            old_paid = round2(fresh.get("paid_amount", 0))
            new_paid = round2(max(0.0, old_paid - pay["amount"]))
            new_status = "UNPAID" if new_paid <= 0.009 else "PARTIAL"
            r = await coll.update_one({"_id": inv_oid, "paid_amount": old_paid},
                                      {"$set": {"paid_amount": new_paid, "status": new_status}})
            if r.modified_count == 1:
                break
    await audit_log(db, user, "VOID", "payments", pay["_id"],
                    {"number": pay["number"], "status": "POSTED"}, {"status": "VOID", "reason": body.reason})
    return {"ok": True, "message": f"Pembayaran {pay['number']} dibatalkan. Saldo faktur dikembalikan."}


# --------------------------------------------------------------------------
# KAS & BANK
# --------------------------------------------------------------------------
@router.get("/cash-transactions")
async def list_cash(kind: str | None = None, q: str | None = None, date_from: str | None = None,
                    date_to: str | None = None, page: int = 1, limit: int = 20,
                    user=Depends(require_perm("cash"))):
    query: dict = {}
    if kind in ("IN", "OUT", "TRANSFER"):
        query["kind"] = kind
    if q:
        query["$or"] = [{"number": {"$regex": q, "$options": "i"}},
                        {"description": {"$regex": q, "$options": "i"}}]
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["date"] = rng
    total = await db.cash_transactions.count_documents(query)
    items = await db.cash_transactions.find(query).sort([("date", -1), ("created_at", -1)]) \
        .skip((max(page, 1) - 1) * limit).limit(min(limit, 100)).to_list(min(limit, 100))
    return {"items": [clean(i) for i in items], "total": total, "page": page, "limit": limit}


@router.post("/cash-transactions", status_code=201)
async def create_cash_txn(body: CashTxnIn, user=Depends(require_perm("cash", "write"))):
    valid_date(body.date, "Tanggal transaksi")
    if body.kind not in ("IN", "OUT"):
        raise AppError("Jenis transaksi kas tidak valid.")
    amount = round2(body.amount)
    if amount <= 0:
        raise AppError("Nominal transaksi harus lebih dari nol.")
    cash = await _active_cash(body.cash_account_id)
    counter = await get_account(db, body.account_code)
    if not counter:
        raise AppError("Akun lawan tidak ditemukan. Pilih akun dari Bagan Akun.")
    if counter.get("subtype") in ("CASH", "BANK"):
        raise AppError("Akun lawan tidak boleh akun kas/bank. Untuk memindahkan dana gunakan Transfer Antar Kas.")

    if body.kind == "IN":
        if counter["type"] not in ("REVENUE", "EQUITY"):
            raise AppError("Kas masuk harus memakai akun lawan Pendapatan atau Ekuitas (setoran modal).")
        jlines = [{"account_code": cash["account_code"], "debit": amount,
                   "description": body.description, "business_unit_id": body.unit_id,
                   "cost_center_id": body.cost_center_id},
                  {"account_code": counter["code"], "credit": amount,
                   "description": body.description, "business_unit_id": body.unit_id,
                   "cost_center_id": body.cost_center_id}]
        desc, prefix = f"Kas masuk — {body.description}", "KM"
        source = "CASH_IN"
    else:
        if counter["type"] != "EXPENSE":
            raise AppError("Kas keluar operasional harus memakai akun lawan Beban. "
                           "Pembelian barang gunakan modul Pembelian; pengadaan aset menyusul di modul Aset Tetap.")
        jlines = [{"account_code": counter["code"], "debit": amount,
                   "description": body.description, "business_unit_id": body.unit_id,
                   "cost_center_id": body.cost_center_id},
                  {"account_code": cash["account_code"], "credit": amount,
                   "description": body.description, "business_unit_id": body.unit_id,
                   "cost_center_id": body.cost_center_id}]
        desc, prefix = f"Kas keluar — {body.description}", "KK"
        source = "CASH_OUT"

    journal = await create_journal(db, date_str=body.date, description=desc, source_type=source,
                                   lines=jlines, user=user)
    number = await next_number(db, prefix, body.date)
    doc = {
        "number": number, "kind": body.kind, "date": body.date,
        "cash_account_id": str(cash["_id"]), "cash_account_name": cash["name"],
        "counter_account_code": counter["code"], "counter_account_name": counter["name"],
        "amount": amount, "description": body.description,
        "unit_id": body.unit_id, "cost_center_id": body.cost_center_id,
        "journal_id": journal["_id"], "journal_number": journal["number"], "status": "POSTED",
        "created_by": user["email"], "created_at": utcnow(),
    }
    res = await db.cash_transactions.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(db, user, "CREATE", "cash_transactions", res.inserted_id, None,
                    {"number": number, "amount": amount, "kind": body.kind})
    return clean(doc)


@router.post("/cash-transfers", status_code=201)
async def create_transfer(body: TransferIn, user=Depends(require_perm("cash", "write"))):
    valid_date(body.date, "Tanggal transfer")
    amount = round2(body.amount)
    if amount <= 0:
        raise AppError("Nominal transfer harus lebih dari nol.")
    src = await _active_cash(body.from_cash_account_id)
    dst = await _active_cash(body.to_cash_account_id)
    if src["_id"] == dst["_id"]:
        raise AppError("Rekening asal dan tujuan transfer tidak boleh sama.")
    journal = await create_journal(
        db, date_str=body.date,
        description=f"Transfer {src['name']} → {dst['name']}" + (f": {body.notes}" if body.notes else ""),
        source_type="TRANSFER",
        lines=[{"account_code": dst["account_code"], "debit": amount, "description": body.notes or "Transfer masuk"},
               {"account_code": src["account_code"], "credit": amount, "description": body.notes or "Transfer keluar"}],
        user=user)
    number = await next_number(db, "TRF", body.date)
    doc = {
        "number": number, "kind": "TRANSFER", "date": body.date,
        "from_cash_account_id": str(src["_id"]), "from_cash_account_name": src["name"],
        "to_cash_account_id": str(dst["_id"]), "to_cash_account_name": dst["name"],
        "cash_account_id": str(src["_id"]), "cash_account_name": src["name"],
        "counter_account_code": dst["account_code"], "counter_account_name": dst["name"],
        "amount": amount, "description": body.notes or f"Transfer {src['name']} ke {dst['name']}",
        "journal_id": journal["_id"], "journal_number": journal["number"], "status": "POSTED",
        "created_by": user["email"], "created_at": utcnow(),
    }
    res = await db.cash_transactions.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(db, user, "CREATE", "cash_transactions", res.inserted_id, None,
                    {"number": number, "amount": amount, "kind": "TRANSFER"})
    return clean(doc)


@router.post("/cash-transactions/{txn_id}/void")
async def void_cash_txn(txn_id: str, body: VoidIn, user=Depends(require_perm("cash", "write"))):
    txn = await db.cash_transactions.find_one({"_id": oid(txn_id)})
    if not txn:
        raise AppError("Transaksi kas tidak ditemukan.", 404)
    if txn.get("status") == "VOID":
        raise AppError("Transaksi kas ini sudah dibatalkan sebelumnya.")
    if txn.get("journal_id"):
        journal = await db.journal_entries.find_one({"_id": oid(txn["journal_id"])})
        if journal and journal.get("status") == "POSTED":
            await void_journal(db, journal, f"Void {txn['number']}: {body.reason}", user)
    await db.cash_transactions.update_one({"_id": txn["_id"]}, {"$set": {"status": "VOID", "void_reason": body.reason,
                                                                         "voided_by": user["email"], "voided_at": utcnow()}})
    await audit_log(db, user, "VOID", "cash_transactions", txn["_id"],
                    {"number": txn["number"], "status": "POSTED"}, {"status": "VOID", "reason": body.reason})
    return {"ok": True, "message": f"Transaksi {txn['number']} dibatalkan dengan jurnal penyeimbang."}


# --------------------------------------------------------------------------
# JURNAL MANUAL & SALDO AWAL
# --------------------------------------------------------------------------
@router.get("/journals")
async def list_journals(q: str | None = None, source_type: str | None = None, status: str | None = None,
                        date_from: str | None = None, date_to: str | None = None, page: int = 1, limit: int = 25,
                        user=Depends(require_perm("accounting"))):
    query: dict = {}
    if q:
        query["$or"] = [{"number": {"$regex": q, "$options": "i"}},
                        {"description": {"$regex": q, "$options": "i"}}]
    if source_type:
        query["source_type"] = source_type
    if status:
        query["status"] = status
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        query["date"] = rng
    total = await db.journal_entries.count_documents(query)
    items = await db.journal_entries.find(query).sort([("date", -1), ("created_at", -1)]) \
        .skip((max(page, 1) - 1) * limit).limit(min(limit, 100)).to_list(min(limit, 100))
    return {"items": [clean(i) for i in items], "total": total, "page": page, "limit": limit}


@router.get("/journals/{journal_id}")
async def get_journal(journal_id: str, user=Depends(require_perm("accounting"))):
    j = await db.journal_entries.find_one({"_id": oid(journal_id)})
    if not j:
        raise AppError("Jurnal tidak ditemukan.", 404)
    return clean(j)


@router.post("/journals", status_code=201)
async def create_manual_journal(body: ManualJournalIn, user=Depends(require_perm("accounting", "write"))):
    valid_date(body.date, "Tanggal jurnal")
    if body.source_type not in ("MANUAL", "OPENING"):
        raise AppError("Jenis jurnal tidak valid.")
    lines = [l.dict() for l in body.lines]
    if body.auto_balance_account_code:
        diff = round2(sum(round2(l.get("debit") or 0) for l in lines) -
                      sum(round2(l.get("credit") or 0) for l in lines))
        if abs(diff) > 0.009:
            acct = await get_account(db, body.auto_balance_account_code)
            if not acct:
                raise AppError("Akun penyeimbang (saldo awal/modal) tidak ditemukan.")
            if diff > 0:
                lines.append({"account_code": acct["code"], "credit": diff,
                              "description": "Selisih disesuaikan otomatis ke akun modal"})
            else:
                lines.append({"account_code": acct["code"], "debit": -diff,
                              "description": "Selisih disesuaikan otomatis ke akun modal"})
    journal = await create_journal(db, date_str=body.date, description=body.description.strip(),
                                   source_type=body.source_type, lines=lines, user=user,
                                   status="POSTED" if body.action == "post" else "DRAFT")
    return clean(journal)


@router.post("/journals/{journal_id}/post")
async def post_journal(journal_id: str, user=Depends(require_perm("accounting", "write"))):
    j = await db.journal_entries.find_one({"_id": oid(journal_id)})
    if not j:
        raise AppError("Jurnal tidak ditemukan.", 404)
    if j["status"] != "DRAFT":
        raise AppError("Hanya jurnal berstatus DRAF yang dapat diposting.")
    await check_period_open(db, j["date"])
    td = round2(sum(l["debit"] for l in j["lines"]))
    tc = round2(sum(l["credit"] for l in j["lines"]))
    if abs(td - tc) > 0.009:
        raise AppError(f"Jurnal tidak dapat diposting karena tidak seimbang (Debit {fmt_rp(td)} ≠ Kredit {fmt_rp(tc)}).")
    await db.journal_entries.update_one({"_id": j["_id"]}, {"$set": {"status": "POSTED", "posted_at": utcnow()}})
    j["status"] = "POSTED"
    await db.ledger_lines.delete_many({"journal_id": j["_id"]})
    await insert_ledger_lines_wrapper(db, j)
    await audit_log(db, user, "POST", "journal_entries", j["_id"], {"status": "DRAFT"}, {"status": "POSTED"})
    return clean(await db.journal_entries.find_one({"_id": j["_id"]}))


async def insert_ledger_lines_wrapper(db, journal):
    from engine import insert_ledger_lines
    await insert_ledger_lines(db, journal)


@router.patch("/journals/{journal_id}")
async def patch_journal(journal_id: str, body: ManualJournalIn, user=Depends(require_perm("accounting", "write"))):
    j = await db.journal_entries.find_one({"_id": oid(journal_id)})
    if not j:
        raise AppError("Jurnal tidak ditemukan.", 404)
    if j["status"] != "DRAFT":
        raise AppError("Jurnal yang sudah diposting tidak dapat diubah. Batalkan (void) dan buat jurnal baru.")
    valid_date(body.date, "Tanggal jurnal")
    norm = []
    for l in body.lines:
        code = (l.account_code or "").strip()
        debit, credit = round2(l.debit), round2(l.credit)
        if debit == 0 and credit == 0:
            continue
        acct = await get_account(db, code)
        if not acct:
            raise AppError(f"Akun {code} tidak ditemukan.")
        norm.append({"account_code": acct["code"], "account_name": acct["name"], "account_type": acct["type"],
                     "subtype": acct.get("subtype", "OTHER"), "debit": debit, "credit": credit,
                     "description": l.description or body.description,
                     "business_unit_id": None, "cost_center_id": None})
    if not norm:
        raise AppError("Jurnal harus memiliki minimal satu baris dengan nilai.")
    await db.journal_entries.update_one({"_id": j["_id"]}, {"$set": {
        "date": body.date, "description": body.description.strip(), "lines": norm,
        "total": round2(sum(l["debit"] for l in norm)), "updated_at": utcnow()}})
    await audit_log(db, user, "UPDATE", "journal_entries", j["_id"], {"number": j["number"]}, {"lines": len(norm)})
    return clean(await db.journal_entries.find_one({"_id": j["_id"]}))


@router.delete("/journals/{journal_id}")
async def delete_journal(journal_id: str, user=Depends(require_perm("accounting", "write"))):
    j = await db.journal_entries.find_one({"_id": oid(journal_id)})
    if not j:
        raise AppError("Jurnal tidak ditemukan.", 404)
    if j["status"] != "DRAFT":
        raise AppError("Jurnal yang sudah diposting tidak dapat dihapus. Gunakan pembatalan (void).")
    await db.journal_entries.update_one({"_id": j["_id"]}, {"$set": {"status": "DELETED", "deleted_at": utcnow()}})
    await audit_log(db, user, "DELETE", "journal_entries", j["_id"], {"number": j["number"], "status": "DRAFT"},
                    {"status": "DELETED"})
    return {"ok": True}


@router.post("/journals/{journal_id}/void")
async def void_manual_journal(journal_id: str, body: VoidIn, user=Depends(require_perm("accounting", "write"))):
    j = await db.journal_entries.find_one({"_id": oid(journal_id)})
    if not j:
        raise AppError("Jurnal tidak ditemukan.", 404)
    if j.get("source_type") not in ("MANUAL", "OPENING"):
        raise AppError("Jurnal otomatis dari dokumen sumber hanya dapat dibatalkan melalui dokumen asalnya "
                       "(faktur, pembayaran, atau transaksi kas).")
    await void_journal(db, j, body.reason, user)
    return {"ok": True, "message": f"Jurnal {j['number']} dibatalkan dengan jurnal penyeimbang."}
