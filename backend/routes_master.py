"""Arunika — Master data: Bagan Akun, Pelanggan, Pemasok, Unit Usaha, Pusat Biaya, Kas & Bank."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import require_perm
from db import db
from engine import (ACCOUNT_SUBTYPES, ACCOUNT_TYPES, AppError, TYPE_LABELS_ID, audit_log,
                    clean, fs_mapping_for, ledger_balances, next_number, normal_balance_for,
                    oid, today_str, utcnow)

router = APIRouter()


class AccountIn(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=80)
    type: str
    subtype: str | None = None
    parent_code: str | None = None


class AccountPatch(BaseModel):
    name: str | None = None
    parent_code: str | None = None
    is_active: bool | None = None


class PartyIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    unit_id: str | None = None
    notes: str | None = None


class PartyPatch(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    unit_id: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class UnitIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = None


class CostCenterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    unit_id: str | None = None


class CashAccountIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    type: str  # CASH | BANK
    account_code: str
    bank_name: str | None = None
    account_number: str | None = None


class CashAccountPatch(BaseModel):
    name: str | None = None
    bank_name: str | None = None
    account_number: str | None = None
    is_active: bool | None = None


# --------------------------------------------------------------------------
# Bagan Akun (Chart of Accounts)
# --------------------------------------------------------------------------
@router.get("/accounts")
async def list_accounts(q: str | None = None, type: str | None = None,
                        user=Depends(require_perm("accounting"))):
    query: dict = {}
    if q:
        query = {"$or": [{"code": {"$regex": q, "$options": "i"}}, {"name": {"$regex": q, "$options": "i"}}]}
    if type:
        query["type"] = type
    items = await db.accounts.find(query).sort("code", 1).to_list(None)
    balances = await ledger_balances(db, date_to=today_str())
    rows = []
    for a in items:
        d, c = balances.get(a["code"], (0.0, 0.0))
        bal = round(d - c, 2) if a["normal_balance"] == "D" else round(c - d, 2)
        rows.append({**clean(a), "balance": bal})
    return {"items": rows, "types": ACCOUNT_TYPES, "subtypes": ACCOUNT_SUBTYPES,
            "type_labels": TYPE_LABELS_ID}


@router.post("/accounts", status_code=201)
async def create_account(body: AccountIn, user=Depends(require_perm("accounting", "write"))):
    code = body.code.strip()
    if body.type not in ACCOUNT_TYPES:
        raise AppError("Tipe akun tidak valid.")
    subtype = body.subtype or ("EXPENSE" if body.type == "EXPENSE" else body.type)
    if subtype not in ACCOUNT_SUBTYPES:
        raise AppError("Sub-tipe akun tidak valid.")
    if await db.accounts.find_one({"code": code}):
        raise AppError(f"Kode akun {code} sudah digunakan. Gunakan kode lain.")
    if await db.accounts.find_one({"name": body.name.strip()}):
        raise AppError(f"Nama akun \"{body.name.strip()}\" sudah digunakan.")
    doc = {
        "code": code, "name": body.name.strip(), "type": body.type, "subtype": subtype,
        "normal_balance": normal_balance_for(body.type, subtype),
        "fs_mapping": fs_mapping_for(body.type, subtype),
        "parent_code": body.parent_code or None, "is_active": True,
        "created_at": utcnow(), "created_by": user["email"],
    }
    res = await db.accounts.insert_one(doc)
    await audit_log(db, user, "CREATE", "accounts", res.inserted_id, None,
                    {"code": code, "name": doc["name"], "type": body.type})
    return clean(await db.accounts.find_one({"_id": res.inserted_id}))


@router.patch("/accounts/{account_id}")
async def patch_account(account_id: str, body: AccountPatch, user=Depends(require_perm("accounting", "write"))):
    acct = await db.accounts.find_one({"_id": oid(account_id)})
    if not acct:
        raise AppError("Akun tidak ditemukan.", 404)
    patch: dict = {}
    if body.name is not None:
        patch["name"] = body.name.strip()
    if body.parent_code is not None:
        patch["parent_code"] = body.parent_code or None
    if body.is_active is not None:
        patch["is_active"] = body.is_active
    if not patch:
        raise AppError("Tidak ada perubahan yang dikirim.")
    await db.accounts.update_one({"_id": acct["_id"]}, {"$set": patch})
    await audit_log(db, user, "UPDATE", "accounts", acct["_id"],
                    {"name": acct["name"], "is_active": acct["is_active"]}, patch)
    return clean(await db.accounts.find_one({"_id": acct["_id"]}))


# --------------------------------------------------------------------------
# Pelanggan & Pemasok
# --------------------------------------------------------------------------
async def _list_parties(coll, q, unit_id):
    query: dict = {}
    if q:
        query = {"$or": [{"name": {"$regex": q, "$options": "i"}},
                         {"code": {"$regex": q, "$options": "i"}},
                         {"phone": {"$regex": q, "$options": "i"}}]}
    if unit_id:
        query["unit_id"] = unit_id
    items = await coll.find(query).sort("name", 1).limit(500).to_list(None)
    return {"items": [clean(i) for i in items]}


@router.get("/customers")
async def list_customers(q: str | None = None, unit_id: str | None = None, user=Depends(require_perm("dashboard"))):
    return await _list_parties(db.customers, q, unit_id)


@router.post("/customers", status_code=201)
async def create_customer(body: PartyIn, user=Depends(require_perm("customers", "write"))):
    doc = {"code": await next_number(db, "CUS", today_str()), "name": body.name.strip(),
           "phone": body.phone, "email": body.email, "address": body.address,
           "unit_id": body.unit_id, "notes": body.notes, "is_active": True,
           "created_at": utcnow(), "created_by": user["email"]}
    res = await db.customers.insert_one(doc)
    await audit_log(db, user, "CREATE", "customers", res.inserted_id, None, {"name": doc["name"]})
    return clean(await db.customers.find_one({"_id": res.inserted_id}))


@router.patch("/customers/{party_id}")
async def patch_customer(party_id: str, body: PartyPatch, user=Depends(require_perm("customers", "write"))):
    return await _patch_party(db.customers, party_id, body, user, "customers")


@router.get("/suppliers")
async def list_suppliers(q: str | None = None, unit_id: str | None = None, user=Depends(require_perm("dashboard"))):
    return await _list_parties(db.suppliers, q, unit_id)


@router.post("/suppliers", status_code=201)
async def create_supplier(body: PartyIn, user=Depends(require_perm("suppliers", "write"))):
    doc = {"code": await next_number(db, "SUP", today_str()), "name": body.name.strip(),
           "phone": body.phone, "email": body.email, "address": body.address,
           "unit_id": body.unit_id, "notes": body.notes, "is_active": True,
           "created_at": utcnow(), "created_by": user["email"]}
    res = await db.suppliers.insert_one(doc)
    await audit_log(db, user, "CREATE", "suppliers", res.inserted_id, None, {"name": doc["name"]})
    return clean(await db.suppliers.find_one({"_id": res.inserted_id}))


@router.patch("/suppliers/{party_id}")
async def patch_supplier(party_id: str, body: PartyPatch, user=Depends(require_perm("suppliers", "write"))):
    return await _patch_party(db.suppliers, party_id, body, user, "suppliers")


async def _patch_party(coll, party_id, body: PartyPatch, user, name):
    doc = await coll.find_one({"_id": oid(party_id)})
    if not doc:
        raise AppError("Data tidak ditemukan.", 404)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise AppError("Tidak ada perubahan yang dikirim.")
    await coll.update_one({"_id": doc["_id"]}, {"$set": patch})
    await audit_log(db, user, "UPDATE", name, doc["_id"], {"name": doc["name"]}, patch)
    return clean(await coll.find_one({"_id": doc["_id"]}))


# --------------------------------------------------------------------------
# Unit Usaha & Pusat Biaya
# --------------------------------------------------------------------------
@router.get("/business-units")
async def list_units(user=Depends(require_perm("dashboard"))):
    items = await db.business_units.find({}).sort("created_at", 1).to_list(None)
    return {"items": [clean(i) for i in items]}


@router.post("/business-units", status_code=201)
async def create_unit(body: UnitIn, user=Depends(require_perm("settings", "write"))):
    doc = {"name": body.name.strip(), "description": body.description,
           "is_active": True, "created_at": utcnow(), "created_by": user["email"]}
    res = await db.business_units.insert_one(doc)
    await audit_log(db, user, "CREATE", "business_units", res.inserted_id, None, {"name": doc["name"]})
    return clean(await db.business_units.find_one({"_id": res.inserted_id}))


@router.patch("/business-units/{unit_id}")
async def patch_unit(unit_id: str, body: UnitIn, user=Depends(require_perm("settings", "write"))):
    doc = await db.business_units.find_one({"_id": oid(unit_id)})
    if not doc:
        raise AppError("Unit usaha tidak ditemukan.", 404)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    await db.business_units.update_one({"_id": doc["_id"]}, {"$set": patch})
    await audit_log(db, user, "UPDATE", "business_units", doc["_id"], {"name": doc["name"]}, patch)
    return clean(await db.business_units.find_one({"_id": doc["_id"]}))


@router.get("/cost-centers")
async def list_cost_centers(user=Depends(require_perm("dashboard"))):
    items = await db.cost_centers.find({}).sort("created_at", 1).to_list(None)
    return {"items": [clean(i) for i in items]}


@router.post("/cost-centers", status_code=201)
async def create_cost_center(body: CostCenterIn, user=Depends(require_perm("settings", "write"))):
    doc = {"name": body.name.strip(), "unit_id": body.unit_id, "is_active": True,
           "created_at": utcnow(), "created_by": user["email"]}
    res = await db.cost_centers.insert_one(doc)
    await audit_log(db, user, "CREATE", "cost_centers", res.inserted_id, None, {"name": doc["name"]})
    return clean(await db.cost_centers.find_one({"_id": res.inserted_id}))


# --------------------------------------------------------------------------
# Kas & Bank
# --------------------------------------------------------------------------
@router.get("/cash-accounts")
async def list_cash_accounts(user=Depends(require_perm("dashboard"))):
    items = await db.cash_accounts.find({}).sort("created_at", 1).to_list(None)
    balances = await ledger_balances(db, date_to=today_str())
    rows = []
    for a in items:
        d, c = balances.get(a["account_code"], (0.0, 0.0))
        rows.append({**clean(a), "balance": round(d - c, 2)})
    return {"items": rows}


@router.post("/cash-accounts", status_code=201)
async def create_cash_account(body: CashAccountIn, user=Depends(require_perm("cash", "write"))):
    if body.type not in ("CASH", "BANK"):
        raise AppError("Jenis akun kas/bank tidak valid (pilih Kas atau Bank).")
    acct = await db.accounts.find_one({"code": body.account_code.strip()})
    if not acct:
        raise AppError(f"Akun buku besar {body.account_code} tidak ditemukan. Buat akunnya di Bagan Akun terlebih dahulu.")
    if acct["type"] != "ASSET":
        raise AppError("Akun kas/bank harus tertaut ke akun buku besar bertipe Aset.")
    doc = {"name": body.name.strip(), "type": body.type, "account_code": acct["code"],
           "bank_name": body.bank_name, "account_number": body.account_number,
           "is_active": True, "created_at": utcnow(), "created_by": user["email"]}
    res = await db.cash_accounts.insert_one(doc)
    await audit_log(db, user, "CREATE", "cash_accounts", res.inserted_id, None,
                    {"name": doc["name"], "account_code": acct["code"]})
    return clean(await db.cash_accounts.find_one({"_id": res.inserted_id}))


@router.patch("/cash-accounts/{account_id}")
async def patch_cash_account(account_id: str, body: CashAccountPatch, user=Depends(require_perm("cash", "write"))):
    doc = await db.cash_accounts.find_one({"_id": oid(account_id)})
    if not doc:
        raise AppError("Akun kas/bank tidak ditemukan.", 404)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise AppError("Tidak ada perubahan yang dikirim.")
    await db.cash_accounts.update_one({"_id": doc["_id"]}, {"$set": patch})
    await audit_log(db, user, "UPDATE", "cash_accounts", doc["_id"], {"name": doc["name"]}, patch)
    return clean(await db.cash_accounts.find_one({"_id": doc["_id"]}))
