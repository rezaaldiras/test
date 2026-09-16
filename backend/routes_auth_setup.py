"""Arunika — Setup awal, autentikasi, pengguna, peran, periode, audit, konfigurasi."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from datetime import date

from auth import (check_rate_limit, hash_pw_async, issue_tokens, public_user,
                  require_perm, verify_pw_async, _digest)
from db import db
from engine import (AppError, DEFAULT_ROLE_MATRIX, ROLE_LABELS, audit_log, clean,
                    ensure_fiscal_years, get_role_matrix, get_settings, next_number,
                    oid, save_settings, utcnow)

router = APIRouter()


# --------------------------------------------------------------------------
# Skema request
# --------------------------------------------------------------------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class RefreshIn(BaseModel):
    refresh_token: str


class BootstrapIn(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class UserIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: str


class UserPatch(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)


class SettingsPatch(BaseModel):
    values: dict


# --------------------------------------------------------------------------
# Setup awal aplikasi
# --------------------------------------------------------------------------
@router.get("/setup/status")
async def setup_status():
    count = await db.users.count_documents({})
    company = await db.company.find_one({})
    return {"needs_setup": count == 0, "company_name": (company or {}).get("name", "")}


@router.post("/setup/bootstrap", status_code=201)
async def setup_bootstrap(body: BootstrapIn):
    if await db.users.count_documents({}) > 0:
        raise AppError("Setup awal sudah pernah dilakukan. Silakan login dengan akun Anda.", 403)

    admin = {
        "name": body.name.strip(), "email": body.email.lower().strip(),
        "password_hash": await hash_pw_async(body.password), "role": "super_admin",
        "is_active": True, "created_at": utcnow(), "created_by": "setup",
    }
    res = await db.users.insert_one(admin)
    admin["_id"] = res.inserted_id

    await db.company.update_one({}, {"$set": {"name": body.company_name.strip(), "updated_at": utcnow()}},
                                upsert=True)
    settings = dict(await get_settings(db))
    settings["company_name"] = body.company_name.strip()
    await save_settings(db, settings)
    await db.configs.update_one({"key": "role_permissions"},
                                {"$set": {"value": DEFAULT_ROLE_MATRIX, "updated_at": utcnow()}}, upsert=True)
    this_year = date.today().year
    await ensure_fiscal_years(db, [this_year, this_year + 1])
    return await issue_tokens(db, admin)


@router.post("/setup/seed-coa")
async def seed_coa(user=Depends(require_perm("accounting", "write"))):
    from engine import COA_TEMPLATE, fs_mapping_for, normal_balance_for
    existing = {a["code"] async for a in db.accounts.find({}, {"code": 1})}
    inserted = 0
    for code, name, acc_type, subtype in COA_TEMPLATE:
        if code in existing:
            continue
        await db.accounts.insert_one({
            "code": code, "name": name, "type": acc_type, "subtype": subtype,
            "normal_balance": normal_balance_for(acc_type, subtype),
            "fs_mapping": fs_mapping_for(acc_type, subtype),
            "parent_code": None, "is_active": True,
            "created_at": utcnow(), "created_by": user["email"],
        })
        inserted += 1
    await audit_log(db, user, "SEED", "accounts", None, None, {"template_inserted": inserted})
    return {"inserted": inserted}


# --------------------------------------------------------------------------
# Autentikasi
# --------------------------------------------------------------------------
@router.post("/auth/login")
async def login(body: LoginIn, request: Request):
    ip = request.client.host if request.client else "unknown"
    check_rate_limit(ip)
    user = await db.users.find_one({"email": body.email.lower().strip()})
    valid = user is not None and user.get("is_active", True) and await verify_pw_async(body.password, user["password_hash"])
    if not valid:
        raise AppError("Email atau kata sandi salah. Silakan periksa kembali.", 401)
    return await issue_tokens(db, user)


@router.post("/auth/refresh")
async def refresh(body: RefreshIn):
    session = await db.sessions.find_one({"token_hash": _digest(body.refresh_token), "revoked": False})
    now = utcnow()
    expires_at = session.get("expires_at") if session else None
    if expires_at is not None and expires_at.tzinfo is None:
        from datetime import timezone as _tz
        expires_at = expires_at.replace(tzinfo=_tz.utc)
    if not session or expires_at <= now:
        raise AppError("Sesi telah berakhir. Silakan login kembali.", 401)
    changed = await db.sessions.update_one({"_id": session["_id"], "revoked": False},
                                           {"$set": {"revoked": True}})
    if changed.modified_count != 1:
        raise AppError("Sesi tidak valid. Silakan login kembali.", 401)
    from bson import ObjectId
    try:
        user = await db.users.find_one({"_id": ObjectId(session["user_id"])})
    except Exception:
        user = None
    if not user or not user.get("is_active", True):
        raise AppError("Akun tidak aktif. Hubungi administrator Anda.", 401)
    return await issue_tokens(db, user)


@router.post("/auth/logout", status_code=204)
async def logout(body: RefreshIn):
    await db.sessions.update_one({"token_hash": _digest(body.refresh_token)}, {"$set": {"revoked": True}})
    return None


@router.get("/auth/me")
async def me(user=Depends(require_perm("dashboard"))):
    company = await db.company.find_one({})
    info = public_user(user)
    info["company_name"] = (company or {}).get("name", "")
    return info


# --------------------------------------------------------------------------
# Pengguna & Peran
# --------------------------------------------------------------------------
VALID_ROLES = list(ROLE_LABELS.keys())


@router.get("/users")
async def list_users(user=Depends(require_perm("users"))):
    items = await db.users.find({}, {"password_hash": 0}).sort("created_at", 1).to_list(None)
    return {"items": [clean(u) for u in items], "roles": [{"value": k, "label": v} for k, v in ROLE_LABELS.items()]}


@router.post("/users", status_code=201)
async def create_user(body: UserIn, user=Depends(require_perm("users", "write"))):
    if body.role not in VALID_ROLES:
        raise AppError("Peran pengguna tidak valid.")
    exists = await db.users.find_one({"email": body.email.lower().strip()})
    if exists:
        raise AppError("Email sudah terdaftar. Gunakan email lain.")
    doc = {
        "name": body.name.strip(), "email": body.email.lower().strip(),
        "password_hash": await hash_pw_async(body.password), "role": body.role,
        "is_active": True, "created_at": utcnow(), "created_by": user["email"],
    }
    res = await db.users.insert_one(doc)
    await audit_log(db, user, "CREATE", "users", res.inserted_id, None,
                    {"email": doc["email"], "role": doc["role"]})
    return clean(await db.users.find_one({"_id": res.inserted_id}, {"password_hash": 0}))


@router.patch("/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch, user=Depends(require_perm("users", "write"))):
    target = await db.users.find_one({"_id": oid(user_id)})
    if not target:
        raise AppError("Pengguna tidak ditemukan.", 404)
    if target["_id"] == user["_id"] and (body.role is not None or body.is_active is False):
        raise AppError("Anda tidak dapat menonaktifkan atau mengubah peran akun Anda sendiri.")
    patch = {}
    if body.name is not None:
        patch["name"] = body.name.strip()
    if body.role is not None:
        if body.role not in VALID_ROLES:
            raise AppError("Peran pengguna tidak valid.")
        patch["role"] = body.role
    if body.is_active is not None:
        patch["is_active"] = body.is_active
    if body.password is not None:
        patch["password_hash"] = await hash_pw_async(body.password)
    if not patch:
        raise AppError("Tidak ada perubahan yang dikirim.")
    await db.users.update_one({"_id": target["_id"]}, {"$set": patch})
    await audit_log(db, user, "UPDATE", "users", target["_id"],
                    {"role": target.get("role"), "is_active": target.get("is_active")}, patch)
    return clean(await db.users.find_one({"_id": target["_id"]}, {"password_hash": 0}))


@router.get("/roles")
async def get_roles(user=Depends(require_perm("dashboard"))):
    matrix = await get_role_matrix(db)
    return {"modules": sorted(set(matrix.get("super_admin", {}).keys())), "matrix": matrix,
            "role_labels": ROLE_LABELS}


# --------------------------------------------------------------------------
# Periode akuntansi
# --------------------------------------------------------------------------
@router.get("/periods")
async def list_periods(user=Depends(require_perm("accounting"))):
    this_year = date.today().year
    await ensure_fiscal_years(db, [this_year, this_year + 1])
    items = await db.fiscal_periods.find({}).sort([("year", -1), ("month", 1)]).to_list(None)
    return {"items": [clean(p) for p in items]}


@router.post("/periods/{period_id}/close")
async def close_period(period_id: str, user=Depends(require_perm("periods", "write"))):
    p = await db.fiscal_periods.find_one({"_id": oid(period_id)})
    if not p:
        raise AppError("Periode tidak ditemukan.", 404)
    if p["status"] != "OPEN":
        raise AppError(f"Periode {p['label']} tidak dalam status terbuka sehingga tidak dapat ditutup.")
    await db.fiscal_periods.update_one({"_id": p["_id"]}, {"$set": {"status": "CLOSED", "closed_by": user["email"], "closed_at": utcnow()}})
    await audit_log(db, user, "CLOSE", "fiscal_periods", p["_id"], {"status": "OPEN"}, {"status": "CLOSED"})
    return clean(await db.fiscal_periods.find_one({"_id": p["_id"]}))


@router.post("/periods/{period_id}/reopen")
async def reopen_period(period_id: str, user=Depends(require_perm("periods", "write"))):
    p = await db.fiscal_periods.find_one({"_id": oid(period_id)})
    if not p:
        raise AppError("Periode tidak ditemukan.", 404)
    if p["status"] != "CLOSED":
        raise AppError(f"Periode {p['label']} tidak sedang ditutup sehingga tidak dapat dibuka kembali.")
    await db.fiscal_periods.update_one({"_id": p["_id"]}, {"$set": {"status": "OPEN", "reopened_by": user["email"], "reopened_at": utcnow()}})
    await audit_log(db, user, "REOPEN", "fiscal_periods", p["_id"], {"status": "CLOSED"}, {"status": "OPEN"})
    return clean(await db.fiscal_periods.find_one({"_id": p["_id"]}))


# --------------------------------------------------------------------------
# Konfigurasi & Audit trail
# --------------------------------------------------------------------------
@router.get("/settings")
async def read_settings(user=Depends(require_perm("dashboard"))):
    settings = await get_settings(db)
    company = await db.company.find_one({})
    if company and not settings.get("company_name"):
        settings["company_name"] = company.get("name", "")
    return {"values": settings}


@router.patch("/settings")
async def patch_settings(body: SettingsPatch, user=Depends(require_perm("settings", "write"))):
    before = await get_settings(db)
    values = {k: v for k, v in (body.values or {}).items() if k in
              ("company_name", "tax_enabled", "tax_rate", "tax_output_account", "tax_input_account",
               "default_revenue_account", "default_purchase_account", "default_ar_account",
               "default_ap_account", "default_opening_equity_account", "depreciation_method",
               "inventory_method")}
    if "tax_rate" in values:
        try:
            values["tax_rate"] = max(0.0, min(100.0, float(values["tax_rate"] or 0)))
        except (TypeError, ValueError):
            raise AppError("Tarif pajak harus berupa angka.")
    after = await save_settings(db, {**before, **values})
    if values.get("company_name"):
        await db.company.update_one({}, {"$set": {"name": values["company_name"], "updated_at": utcnow()}}, upsert=True)
    await audit_log(db, user, "UPDATE", "configs", None, before, after)
    return {"values": after}


@router.get("/audit")
async def list_audit(q: str | None = None, limit: int = 100, user=Depends(require_perm("audit"))):
    query = {}
    if q:
        query = {"$or": [{"user_email": {"$regex": q, "$options": "i"}},
                         {"action": {"$regex": q, "$options": "i"}},
                         {"collection": {"$regex": q, "$options": "i"}}]}
    items = await db.audit_logs.find(query).sort("created_at", -1).limit(min(limit, 200)).to_list(limit)
    return {"items": [clean(a) for a in items]}
