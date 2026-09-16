"""Arunika — Autentikasi (JWT + refresh token berotasi) & kontrol akses berbasis peran."""
from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
import time
from datetime import timedelta

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import db
from engine import AppError, clean, get_role_matrix, utcnow

JWT_SECRET = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET wajib diatur di backend/.env")

ALG = "HS256"
ACCESS_MINUTES = 60
REFRESH_DAYS = 30

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    if len(password.encode()) > 72:
        raise AppError("Kata sandi terlalu panjang (maksimal 72 karakter).")
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, stored: str) -> bool:
    if len(password.encode()) > 72:
        return False
    try:
        return bcrypt.checkpw(password.encode(), stored.encode())
    except ValueError:
        return False


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def public_user(user: dict) -> dict:
    return {"id": str(user["_id"]), "name": user.get("name", ""), "email": user.get("email", ""),
            "role": user.get("role", ""), "company_name": user.get("company_name", "")}


def create_access_token(user: dict) -> str:
    now = utcnow()
    claims = {
        "sub": str(user["_id"]), "role": user.get("role", ""),
        "iat": now, "exp": now + timedelta(minutes=ACCESS_MINUTES),
        "jti": secrets.token_urlsafe(12),
    }
    return jwt.encode(claims, JWT_SECRET, algorithm=ALG)


async def issue_tokens(db, user: dict) -> dict:
    refresh = secrets.token_urlsafe(48)
    await db.sessions.insert_one({
        "token_hash": _digest(refresh), "user_id": str(user["_id"]),
        "expires_at": utcnow() + timedelta(days=REFRESH_DAYS),
        "created_at": utcnow(), "revoked": False,
    })
    return {"access_token": create_access_token(user), "refresh_token": refresh,
            "token_type": "bearer", "user": public_user(user)}


async def current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise AppError("Sesi tidak ditemukan. Silakan login terlebih dahulu.", 401)
    try:
        claims = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALG])
        uid = ObjectId(claims["sub"])
    except jwt.ExpiredSignatureError:
        raise AppError("Sesi Anda telah berakhir. Silakan login kembali.", 401)
    except Exception:
        raise AppError("Sesi tidak valid. Silakan login kembali.", 401)
    user = await db.users.find_one({"_id": uid})
    if not user or not user.get("is_active", True):
        raise AppError("Akun tidak aktif atau tidak ditemukan. Hubungi administrator Anda.", 401)
    return user


def require_perm(module: str, level: str = "read"):
    """Dependency RBAC: membaca matriks peran terkini dari database (perubahan peran langsung berlaku)."""
    async def dep(user: dict = Depends(current_user)) -> dict:
        matrix = await get_role_matrix(db)
        lvl = matrix.get(user.get("role", ""), {}).get(module, "none")
        if level == "write" and lvl != "write":
            raise AppError("Anda tidak memiliki izin untuk melakukan tindakan ini pada modul ini.", 403)
        if lvl not in ("read", "write"):
            raise AppError("Peran Anda tidak memiliki akses ke modul ini.", 403)
        return user
    return dep


# Batas laju sederhana untuk endpoint sensitif (login): 10 percobaan / menit / IP
_attempts: dict[str, list[float]] = {}


def check_rate_limit(ip: str) -> None:
    now = time.time()
    window = [t for t in _attempts.get(ip, []) if now - t < 60]
    if len(window) >= 10:
        raise AppError("Terlalu banyak percobaan login. Silakan coba lagi dalam satu menit.", 429)
    window.append(now)
    _attempts[ip] = window


def hash_token_async(value: str) -> str:
    return _digest(value)


async def hash_pw_async(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


async def verify_pw_async(password: str, stored: str) -> bool:
    return await asyncio.to_thread(verify_password, password, stored)
