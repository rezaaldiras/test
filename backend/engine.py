"""Arunika — Accounting Engine.

SATU pintu untuk seluruh dampak akuntansi:
    Transaksi -> Jurnal (Dr = Cr) -> General Ledger -> Trial Balance -> Laporan Keuangan

Semua modul (penjualan, pembelian, kas, jurnal manual, saldo awal) wajib memanggil
engine ini — tidak boleh membuat jurnal sendiri-sendiri. Aturan yang dapat berubah
(tarif pajak, akun default, metode penyusutan, penilaian persediaan) disimpan sebagai
konfigurasi, bukan hard-coded.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from bson import ObjectId
from pymongo import ReturnDocument

# ---------------------------------------------------------------------------
# Error & util umum
# ---------------------------------------------------------------------------

class AppError(Exception):
    """Error bisnis dengan pesan Bahasa Indonesia yang jelas untuk pengguna."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
             "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def today_str() -> str:
    return date.today().isoformat()


def round2(v) -> float:
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def fmt_rp(n: float) -> str:
    v = round2(n)
    sign = "-" if v < 0 else ""
    s = f"{abs(v):,.2f}".replace(",", "#").replace(".", ",").replace("#", ".")
    return f"{sign}Rp {s}"


def clean(value):
    """Konversi dokumen Mongo -> JSON aman: ObjectId -> str, datetime -> ISO, _id -> id."""
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            key = "id" if k == "_id" else k
            out[key] = clean(v)
        return out
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def oid(v: str) -> ObjectId:
    try:
        return ObjectId(v)
    except Exception:
        raise AppError("ID data tidak valid.", 400)


def valid_date(s: str, field: str = "Tanggal") -> str:
    try:
        datetime.strptime(s or "", "%Y-%m-%d")
    except (TypeError, ValueError):
        raise AppError(f"{field} tidak valid. Gunakan format TTTT-BB-HH.")
    return s


# ---------------------------------------------------------------------------
# Konfigurasi (aturan yang dapat berubah — TIDAK di-hard-code)
# ---------------------------------------------------------------------------

DEFAULT_SETTINGS = {
    "company_name": "",
    "tax_enabled": False,
    "tax_rate": 0.0,
    "tax_output_account": "2-1100",
    "tax_input_account": "2-1110",
    "default_revenue_account": "4-1000",
    "default_purchase_account": "1-1300",
    "default_ar_account": "1-1200",
    "default_ap_account": "2-1000",
    "default_opening_equity_account": "3-1000",
    "depreciation_method": "STRAIGHT_LINE",
    "inventory_method": "WEIGHTED_AVERAGE",
}

SETTINGS_EDITABLE = [
    "company_name", "tax_enabled", "tax_rate", "tax_output_account", "tax_input_account",
    "default_revenue_account", "default_purchase_account", "default_ar_account",
    "default_ap_account", "default_opening_equity_account",
    "depreciation_method", "inventory_method",
]

ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]
ACCOUNT_SUBTYPES = [
    "CASH", "BANK", "AR", "INVENTORY", "FIXED_ASSET", "ACCUM_DEPRECIATION",
    "AP", "TAX_PAYABLE", "TAX_INPUT", "EQUITY", "REVENUE", "OTHER_INCOME",
    "COGS", "EXPENSE", "LOAN", "OTHER",
]
TYPE_LABELS_ID = {
    "ASSET": "Aset", "LIABILITY": "Liabilitas", "EQUITY": "Ekuitas",
    "REVENUE": "Pendapatan", "EXPENSE": "Beban",
}
CASH_SUBTYPES = ("CASH", "BANK")

MODULES = ["dashboard", "sales", "purchases", "cash", "accounting", "reports",
           "settings", "users", "periods", "audit", "customers", "suppliers"]

ROLE_LABELS = {
    "super_admin": "Super Admin",
    "direktur": "Direktur / Kepala BUMKam",
    "admin_keuangan": "Admin Keuangan",
    "admin_penjualan": "Admin Penjualan",
    "admin_pembelian": "Admin Pembelian",
    "admin_gudang": "Admin Gudang",
    "auditor": "Auditor / Reviewer",
}

# Matriks izin default — dapat dioverride lewat configs.role_permissions.
DEFAULT_ROLE_MATRIX = {
    "super_admin": {m: "write" for m in MODULES},
    "direktur": {
        "dashboard": "read", "sales": "read", "purchases": "read", "cash": "read",
        "accounting": "read", "reports": "read", "settings": "read", "users": "read",
        "periods": "write", "audit": "read",
    },
    "admin_keuangan": {
        "dashboard": "read", "sales": "write", "purchases": "write", "cash": "write",
        "accounting": "write", "reports": "read", "settings": "read", "users": "read",
        "periods": "read", "audit": "read",
    },
    "admin_penjualan": {
        "dashboard": "read", "sales": "write", "customers": "write", "reports": "read",
    },
    "admin_pembelian": {
        "dashboard": "read", "purchases": "write", "suppliers": "write", "reports": "read",
    },
    "admin_gudang": {"dashboard": "read"},
    "auditor": {
        "dashboard": "read", "sales": "read", "purchases": "read", "cash": "read",
        "accounting": "read", "reports": "read", "audit": "read",
    },
}


async def get_settings(db) -> dict:
    doc = await db.configs.find_one({"key": "settings"})
    settings = dict(DEFAULT_SETTINGS)
    if doc and isinstance(doc.get("value"), dict):
        for k, v in doc["value"].items():
            if k in SETTINGS_EDITABLE:
                settings[k] = v
    return settings


async def save_settings(db, patch: dict) -> dict:
    current = await get_settings(db)
    for k, v in patch.items():
        if k in SETTINGS_EDITABLE:
            current[k] = v
    await db.configs.update_one(
        {"key": "settings"}, {"$set": {"value": current, "updated_at": utcnow()}}, upsert=True
    )
    return current


async def get_role_matrix(db) -> dict:
    doc = await db.configs.find_one({"key": "role_permissions"})
    matrix = {r: dict(perms) for r, perms in DEFAULT_ROLE_MATRIX.items()}
    if doc and isinstance(doc.get("value"), dict):
        for role, perms in doc["value"].items():
            if isinstance(perms, dict):
                matrix.setdefault(role, {}).update(perms)
    return matrix


# ---------------------------------------------------------------------------
# Chart of Accounts — templat standar (dapat dikustomisasi lewat modul Bagan Akun)
# ---------------------------------------------------------------------------

COA_TEMPLATE = [
    # (kode, nama, tipe, sub_tipe)
    ("1-1000", "Kas", "ASSET", "CASH"),
    ("1-1010", "Kas Kecil (Petty Cash)", "ASSET", "CASH"),
    ("1-1100", "Bank", "ASSET", "BANK"),
    ("1-1200", "Piutang Usaha", "ASSET", "AR"),
    ("1-1300", "Persediaan Barang", "ASSET", "INVENTORY"),
    ("1-1400", "Aset Tetap - Tanah", "ASSET", "FIXED_ASSET"),
    ("1-1410", "Aset Tetap - Bangunan", "ASSET", "FIXED_ASSET"),
    ("1-1420", "Aset Tetap - Kendaraan", "ASSET", "FIXED_ASSET"),
    ("1-1430", "Aset Tetap - Peralatan", "ASSET", "FIXED_ASSET"),
    ("1-1490", "Akumulasi Penyusutan", "ASSET", "ACCUM_DEPRECIATION"),
    ("2-1000", "Utang Usaha", "LIABILITY", "AP"),
    ("2-1100", "Utang Pajak (PPN Keluaran)", "LIABILITY", "TAX_PAYABLE"),
    ("2-1110", "Pajak Masukan (PPN)", "ASSET", "TAX_INPUT"),
    ("2-1200", "Utang Gaji", "LIABILITY", "OTHER"),
    ("2-1300", "Utang Bank", "LIABILITY", "LOAN"),
    ("3-1000", "Modal / Simpanan Pokok", "EQUITY", "EQUITY"),
    ("3-1100", "Saldo Laba", "EQUITY", "EQUITY"),
    ("4-1000", "Pendapatan Penjualan", "REVENUE", "REVENUE"),
    ("4-1100", "Pendapatan Jasa", "REVENUE", "REVENUE"),
    ("4-1200", "Pendapatan Lain-lain", "REVENUE", "OTHER_INCOME"),
    ("5-1000", "Harga Pokok Penjualan", "EXPENSE", "COGS"),
    ("5-2000", "Beban Gaji", "EXPENSE", "EXPENSE"),
    ("5-2100", "Beban Sewa", "EXPENSE", "EXPENSE"),
    ("5-2200", "Beban Listrik & Air", "EXPENSE", "EXPENSE"),
    ("5-2300", "Beban Transportasi", "EXPENSE", "EXPENSE"),
    ("5-2400", "Beban Perlengkapan", "EXPENSE", "EXPENSE"),
    ("5-2500", "Beban Penyusutan", "EXPENSE", "EXPENSE"),
    ("5-2600", "Beban Administrasi Lain", "EXPENSE", "EXPENSE"),
]


def normal_balance_for(acc_type: str, subtype: str) -> str:
    if subtype == "ACCUM_DEPRECIATION":
        return "C"
    return "D" if acc_type in ("ASSET", "EXPENSE") else "C"


def fs_mapping_for(acc_type: str, subtype: str) -> str:
    if acc_type == "ASSET":
        return "BS-ASET"
    if acc_type == "LIABILITY":
        return "BS-LIABILITAS"
    if acc_type == "EQUITY":
        return "BS-EKUITAS"
    if subtype == "COGS":
        return "IS-HPP"
    if acc_type == "REVENUE":
        return "IS-PENDAPATAN"
    return "IS-BEBAN"


# ---------------------------------------------------------------------------
# Penomoran dokumen otomatis (format dapat diubah lewat konfigurasi)
# ---------------------------------------------------------------------------

async def next_number(db, prefix: str, date_str: str) -> str:
    year = (date_str or today_str())[:4]
    doc = await db.counters.find_one_and_update(
        {"_id": f"{prefix}-{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"{prefix}-{year}-{int(doc['seq']):06d}"


# ---------------------------------------------------------------------------
# Periode akuntansi
# ---------------------------------------------------------------------------

async def ensure_fiscal_years(db, years: list[int]) -> int:
    created = 0
    for y in years:
        for m in range(1, 13):
            exists = await db.fiscal_periods.find_one({"year": y, "month": m})
            if exists:
                continue
            await db.fiscal_periods.insert_one({
                "year": y, "month": m, "label": f"{MONTHS_ID[m - 1]} {y}",
                "status": "OPEN", "created_at": utcnow(),
            })
            created += 1
    return created


async def check_period_open(db, date_str: str) -> None:
    try:
        y, m = int(date_str[:4]), int(date_str[5:7])
    except (TypeError, ValueError):
        raise AppError("Tanggal transaksi tidak valid.")
    p = await db.fiscal_periods.find_one({"year": y, "month": m})
    if not p:
        await ensure_fiscal_years(db, [y])
        return
    if p.get("status") != "OPEN":
        status_id = "ditutup" if p.get("status") == "CLOSED" else "dikunci"
        raise AppError(
            f"Periode {p.get('label')} sudah {status_id}. Transaksi pada periode yang ditutup "
            "tidak dapat dibuat atau diubah. Buka kembali periode melalui menu Periode Akuntansi."
        )


# ---------------------------------------------------------------------------
# JURNAL — inti engine akuntansi
# ---------------------------------------------------------------------------

async def get_account(db, code: str):
    if not code:
        return None
    return await db.accounts.find_one({"code": code.strip()})


async def create_journal(
    db, *, date_str: str, description: str, source_type: str, lines: list[dict],
    user: dict, source_id: str | None = None, status: str = "POSTED",
) -> dict:
    """Membuat jurnal. Menjamin Total Debit = Total Kredit untuk setiap jurnal POSTED."""
    valid_date(date_str)
    norm: list[dict] = []
    for l in lines:
        code = (l.get("account_code") or "").strip()
        if not code:
            raise AppError("Setiap baris jurnal wajib memilih akun.")
        debit = round2(l.get("debit"))
        credit = round2(l.get("credit"))
        if debit == 0 and credit == 0:
            continue
        if debit > 0 and credit > 0:
            raise AppError(f"Akun {code}: satu baris jurnal hanya boleh berisi debit ATAU kredit, bukan keduanya.")
        acct = await get_account(db, code)
        if not acct:
            raise AppError(f"Akun dengan kode {code} tidak ditemukan. Periksa Bagan Akun.")
        if not acct.get("is_active", True):
            raise AppError(f"Akun {acct['name']} berstatus tidak aktif.")
        norm.append({
            "account_code": acct["code"], "account_name": acct["name"],
            "account_type": acct["type"], "subtype": acct.get("subtype", "OTHER"),
            "debit": debit, "credit": credit,
            "description": l.get("description") or description,
            "business_unit_id": l.get("business_unit_id"),
            "cost_center_id": l.get("cost_center_id"),
        })
    if not norm:
        raise AppError("Jurnal harus memiliki minimal satu baris dengan nilai.")

    td = round2(sum(l["debit"] for l in norm))
    tc = round2(sum(l["credit"] for l in norm))
    if status == "POSTED" and abs(td - tc) > 0.009:
        raise AppError(
            f"Transaksi tidak dapat diposting karena total debit dan kredit tidak seimbang "
            f"(Debit {fmt_rp(td)} ≠ Kredit {fmt_rp(tc)})."
        )

    if status == "POSTED":
        await check_period_open(db, date_str)

    number = await next_number(db, "JRN", date_str)
    doc = {
        "number": number, "date": date_str, "description": description,
        "source_type": source_type, "source_id": source_id, "status": status,
        "lines": norm, "total": td if td >= tc else tc,
        "created_by": user.get("email", ""), "created_at": utcnow(),
        "void_reason": None, "voided_by": None, "voided_at": None, "reversal_journal_id": None,
    }
    res = await db.journal_entries.insert_one(doc)
    doc["_id"] = res.inserted_id
    if status == "POSTED":
        await insert_ledger_lines(db, doc)
    await audit_log(db, user, "CREATE", "journal_entries", doc["_id"], None,
                    {"number": number, "status": status, "source_type": source_type, "total": doc["total"]})
    return doc


async def insert_ledger_lines(db, journal: dict) -> None:
    rows = []
    for l in journal["lines"]:
        rows.append({
            "journal_id": journal["_id"], "number": journal["number"], "date": journal["date"],
            "account_code": l["account_code"], "account_name": l["account_name"],
            "account_type": l["account_type"], "subtype": l["subtype"],
            "debit": l["debit"], "credit": l["credit"], "description": l["description"],
            "business_unit_id": l.get("business_unit_id"),
            "cost_center_id": l.get("cost_center_id"),
            "source_type": journal["source_type"], "status": "POSTED",
        })
    if rows:
        await db.ledger_lines.insert_many(rows)


async def void_journal(db, journal: dict, reason: str, user: dict) -> dict:
    """Pembatalan melalui jurnal penyeimbang (reverse). Jurnal asli tidak pernah dihapus."""
    if journal.get("status") != "POSTED":
        raise AppError("Hanya jurnal berstatus POSTED yang dapat dibatalkan.")
    reason = (reason or "").strip()
    if not reason:
        raise AppError("Alasan pembatalan wajib diisi untuk keperluan audit trail.")

    rev_lines = [{
        "account_code": l["account_code"],
        "debit": l["credit"], "credit": l["debit"],
        "description": f"Pembatalan {journal['number']}: {reason}",
        "business_unit_id": l.get("business_unit_id"),
        "cost_center_id": l.get("cost_center_id"),
    } for l in journal["lines"]]

    rev = await create_journal(
        db, date_str=today_str(),
        description=f"Pembatalan jurnal {journal['number']} — {reason}",
        source_type="VOID", lines=rev_lines, user=user, source_id=str(journal["_id"]),
    )
    await db.journal_entries.update_one(
        {"_id": journal["_id"]},
        {"$set": {"status": "VOID", "void_reason": reason, "voided_by": user.get("email", ""),
                  "voided_at": utcnow(), "reversal_journal_id": rev["_id"]}},
    )
    await db.ledger_lines.update_many({"journal_id": journal["_id"]}, {"$set": {"status": "VOID"}})
    await audit_log(db, user, "VOID", "journal_entries", journal["_id"],
                    {"number": journal["number"], "status": "POSTED"},
                    {"status": "VOID", "reason": reason, "reversal": rev["number"]})
    return rev


# ---------------------------------------------------------------------------
# Agregasi ledger
# ---------------------------------------------------------------------------

def _range_filter(date_from: str | None, date_to: str | None) -> dict:
    f = {}
    if date_from and date_to:
        f = {"$gte": date_from, "$lte": date_to}
    elif date_from:
        f = {"$gte": date_from}
    elif date_to:
        f = {"$lte": date_to}
    return f


async def ledger_balances(db, *, date_from: str | None = None, date_to: str | None = None,
                          unit_id: str | None = None, subtypes: tuple | None = None,
                          types: tuple | None = None) -> dict:
    match: dict = {"status": "POSTED"}
    rng = _range_filter(date_from, date_to)
    if rng:
        match["date"] = rng
    if unit_id:
        match["business_unit_id"] = unit_id
    if subtypes:
        match["subtype"] = {"$in": list(subtypes)}
    if types:
        match["account_type"] = {"$in": list(types)}
    rows = await db.ledger_lines.aggregate([
        {"$match": match},
        {"$group": {"_id": "$account_code", "debit": {"$sum": "$debit"}, "credit": {"$sum": "$credit"}}},
    ]).to_list(None)
    return {r["_id"]: (round2(r["debit"]), round2(r["credit"])) for r in rows}


async def account_map(db) -> dict:
    return {a["code"]: a async for a in db.accounts.find({})}


# ---------------------------------------------------------------------------
# Laporan keuangan — selalu dihitung dari ledger
# ---------------------------------------------------------------------------

async def trial_balance(db, *, date_to: str, unit_id: str | None = None) -> dict:
    balances = await ledger_balances(db, date_to=date_to, unit_id=unit_id)
    amap = await account_map(db)
    rows, td, tc = [], 0.0, 0.0
    for code in sorted(balances):
        acct = amap.get(code)
        if not acct:
            continue
        d, c = balances[code]
        if abs(d - c) < 0.009 and d == 0:
            continue
        td, tc = round2(td + d), round2(tc + c)
        rows.append([code, acct["name"], d if d else "", c if c else ""])
    return {
        "title": "Neraca Saldo (Trial Balance)",
        "meta": [f"Per {date_to}"],
        "columns": ["Kode", "Nama Akun", "Debit", "Kredit"],
        "sections": [{"title": None, "rows": rows, "footers": [["", "TOTAL", td, tc]]}],
        "totals": {"debit": td, "credit": tc},
    }


async def general_ledger(db, *, account_code: str, date_from: str, date_to: str,
                         unit_id: str | None = None) -> dict:
    acct = await get_account(db, account_code)
    if not acct:
        raise AppError("Akun tidak ditemukan. Pilih akun terlebih dahulu.")
    query: dict = {"account_code": acct["code"], "status": "POSTED"}
    rng = _range_filter(None, date_to)
    if rng:
        query["date"] = rng
    if unit_id:
        query["business_unit_id"] = unit_id
    cursor = db.ledger_lines.find(query).sort([("date", 1), ("created_at", 1)])
    lines = await cursor.to_list(None)

    normal = acct["normal_balance"]
    opening = 0.0
    rows = []
    balance = 0.0
    for l in lines:
        delta = (l["debit"] - l["credit"]) if normal == "D" else (l["credit"] - l["debit"])
        if l["date"] < date_from:
            opening = round2(opening + delta)
            continue
        balance = round2(balance + delta)
        rows.append([
            l["date"], l["number"], l["description"],
            l["debit"] if l["debit"] else "", l["credit"] if l["credit"] else "", balance,
        ])
    closing = round2(opening + balance)
    cols = ["Tanggal", "No. Jurnal", "Keterangan", "Debit", "Kredit", "Saldo"]
    return {
        "title": f"Buku Besar — {acct['code']} {acct['name']}",
        "meta": [f"Periode {date_from} s.d. {date_to}"],
        "columns": cols,
        "sections": [{
            "title": None, "rows": rows,
            "footers": [["", "", "Saldo Awal Periode", "", "", opening],
                        ["", "", "Saldo Akhir Periode", "", "", closing]],
        }],
        "account": {"code": acct["code"], "name": acct["name"], "normal_balance": normal},
        "opening": opening, "closing": closing,
    }


async def income_statement(db, *, date_from: str, date_to: str, unit_id: str | None = None) -> dict:
    balances = await ledger_balances(db, date_from=date_from, date_to=date_to, unit_id=unit_id)
    amap = await account_map(db)

    rev_rows, exp_rows, cogs_rows = [], [], []
    total_rev = total_exp = total_cogs = 0.0
    for code in sorted(balances):
        acct = amap.get(code)
        if not acct:
            continue
        d, c = balances[code]
        if acct["type"] == "REVENUE":
            amt = round2(c - d)
            total_rev = round2(total_rev + amt)
            rev_rows.append([code, acct["name"], amt])
        elif acct["type"] == "EXPENSE":
            amt = round2(d - c)
            if acct.get("subtype") == "COGS":
                total_cogs = round2(total_cogs + amt)
                cogs_rows.append([code, acct["name"], amt])
            else:
                total_exp = round2(total_exp + amt)
                exp_rows.append([code, acct["name"], amt])

    gross = round2(total_rev - total_cogs)
    net = round2(gross - total_exp)
    return {
        "title": "Laporan Laba Rugi",
        "meta": [f"Periode {date_from} s.d. {date_to}"],
        "columns": ["Kode", "Nama Akun", "Jumlah"],
        "sections": [
            {"title": "PENDAPATAN", "rows": rev_rows, "footers": [["", "Total Pendapatan", total_rev]]},
            {"title": "HARGA POKOK PENJUALAN", "rows": cogs_rows, "footers": [["", "Total HPP", total_cogs]]},
            {"title": None, "rows": [["", "LABA KOTOR", gross]], "footers": []},
            {"title": "BEBAN OPERASIONAL", "rows": exp_rows, "footers": [["", "Total Beban Operasional", total_exp]]},
            {"title": None, "rows": [["", "LABA (RUGI) BERSIH", net]], "footers": []},
        ],
        "totals": {"revenue": total_rev, "cogs": total_cogs, "gross_profit": gross,
                   "operating_expense": total_exp, "net_profit": net},
    }


async def balance_sheet(db, *, as_of: str, unit_id: str | None = None) -> dict:
    balances = await ledger_balances(db, date_to=as_of, unit_id=unit_id)
    amap = await account_map(db)

    asset_rows, liab_rows, eq_rows = [], [], []
    total_asset = total_liab = total_eq = 0.0
    total_rev = total_exp = 0.0
    for code in sorted(balances):
        acct = amap.get(code)
        if not acct:
            continue
        d, c = balances[code]
        if acct["type"] == "ASSET":
            amt = round2(d - c)
            total_asset = round2(total_asset + amt)
            asset_rows.append([code, acct["name"], amt])
        elif acct["type"] == "LIABILITY":
            amt = round2(c - d)
            total_liab = round2(total_liab + amt)
            liab_rows.append([code, acct["name"], amt])
        elif acct["type"] == "EQUITY":
            amt = round2(c - d)
            total_eq = round2(total_eq + amt)
            eq_rows.append([code, acct["name"], amt])
        elif acct["type"] == "REVENUE":
            total_rev = round2(total_rev + (c - d))
        elif acct["type"] == "EXPENSE":
            total_exp = round2(total_exp + (d - c))

    earnings = round2(total_rev - total_exp)  # laba (rugi) berjalan sejak awal
    total_le = round2(total_liab + total_eq + earnings)
    return {
        "title": "Laporan Posisi Keuangan (Neraca)",
        "meta": [f"Per {as_of}"],
        "columns": ["Kode", "Nama Akun", "Jumlah"],
        "sections": [
            {"title": "ASET", "rows": asset_rows, "footers": [["", "TOTAL ASET", total_asset]]},
            {"title": "LIABILITAS", "rows": liab_rows, "footers": [["", "Total Liabilitas", total_liab]]},
            {"title": "EKUITAS", "rows": eq_rows, "footers": [
                ["", "Laba (Rugi) Berjalan", earnings],
                ["", "TOTAL LIABILITAS & EKUITAS", total_le],
            ]},
        ],
        "totals": {"assets": total_asset, "liabilities": total_liab,
                   "equity": round2(total_eq + earnings), "balanced": abs(total_asset - total_le) < 0.01},
    }


def _cash_category(account_type: str, subtype: str) -> str:
    if account_type == "EQUITY" or subtype == "LOAN":
        return "pendanaan"
    if subtype in ("FIXED_ASSET", "ACCUM_DEPRECIATION"):
        return "investasi"
    if account_type == "ASSET" and subtype not in ("AR", "INVENTORY", "TAX_INPUT"):
        return "investasi"
    return "operasi"


async def cash_flow(db, *, date_from: str, date_to: str, unit_id: str | None = None) -> dict:
    match: dict = {"status": "POSTED"}
    rng = _range_filter(date_from, date_to)
    if rng:
        match["date"] = rng
    cats = {
        "operasi": {"label": "Aktivitas Operasi", "in": 0.0, "out": 0.0},
        "investasi": {"label": "Aktivitas Investasi", "in": 0.0, "out": 0.0},
        "pendanaan": {"label": "Aktivitas Pendanaan", "in": 0.0, "out": 0.0},
    }
    async for j in db.journal_entries.find(match):
        if unit_id and not any((l.get("business_unit_id") or None) == unit_id for l in j.get("lines", [])):
            continue
        cash_lines = [l for l in j["lines"] if l.get("subtype") in CASH_SUBTYPES]
        others = [l for l in j["lines"] if l.get("subtype") not in CASH_SUBTYPES]
        if not cash_lines or not others:
            continue  # transfer antar kas: tidak mengubah total kas
        for l in others:
            net = round2(l["credit"] - l["debit"])  # positif = kas masuk
            if abs(net) < 0.009:
                continue
            cat = cats[_cash_category(l.get("account_type", ""), l.get("subtype", ""))]
            if net > 0:
                cat["in"] = round2(cat["in"] + net)
            else:
                cat["out"] = round2(cat["out"] + (-net))

    pre = await ledger_balances(db, date_to=_day_before(date_from), unit_id=unit_id, subtypes=CASH_SUBTYPES)
    post = await ledger_balances(db, date_to=date_to, unit_id=unit_id, subtypes=CASH_SUBTYPES)
    opening = round2(sum(d - c for d, c in pre.values()))
    closing = round2(sum(d - c for d, c in post.values()))

    sections = []
    for key in ("operasi", "investasi", "pendanaan"):
        c = cats[key]
        netto = round2(c["in"] - c["out"])
        sections.append({
            "title": c["label"].upper(),
            "rows": [[f"Penerimaan {c['label']}", c["in"]],
                     [f"Pengeluaran {c['label']}", -c["out"]]],
            "footers": [[f"Kas Neto dari {c['label']}", netto]],
        })
    net_change = round2(closing - opening)
    sections.append({
        "title": None,
        "rows": [["Kas Neto", net_change], ["Saldo Kas Awal Periode", opening]],
        "footers": [["Saldo Kas Akhir Periode", closing]],
    })
    return {
        "title": "Laporan Arus Kas",
        "meta": [f"Periode {date_from} s.d. {date_to}"],
        "columns": ["Keterangan", "Jumlah"],
        "sections": sections,
        "totals": {"opening": opening, "closing": closing,
                   "operasi": round2(cats["operasi"]["in"] - cats["operasi"]["out"])},
    }


def _day_before(date_str: str) -> str:
    d = date.fromisoformat(date_str)
    return date.fromordinal(d.toordinal() - 1).isoformat()


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------

async def audit_log(db, user, action: str, collection: str, doc_id, before, after) -> None:
    await db.audit_logs.insert_one({
        "user_email": (user or {}).get("email", "system"),
        "user_name": (user or {}).get("name", ""),
        "action": action, "collection": collection,
        "doc_id": str(doc_id) if doc_id else None,
        "before": before, "after": after,
        "created_at": utcnow(),
    })
