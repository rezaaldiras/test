# Arunika — aplikasi keuangan & akuntansi BUMKam (FastAPI)
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from db import client, db
from engine import AppError
from routes_auth_setup import router as setup_router
from routes_master import router as master_router
from routes_reports import router as reports_router
from routes_transactions import router as txn_router

app = FastAPI(title="Arunika API", description="Sistem keuangan & akuntansi BUMKam")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router_prefix = "/api"
app.include_router(setup_router, prefix=api_router_prefix)
app.include_router(master_router, prefix=api_router_prefix)
app.include_router(txn_router, prefix=api_router_prefix)
app.include_router(reports_router, prefix=api_router_prefix)

logger = logging.getLogger("arunika")


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Terjadi kesalahan tak terduga di server. Coba beberapa saat lagi atau hubungi administrator."},
    )


@app.get("/api/health")
async def health():
    await db.command("ping")
    return {"status": "ok", "app": "Arunika"}


@app.on_event("startup")
async def startup_indexes():
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index("token_hash", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.accounts.create_index("code", unique=True)
    for coll in ("journal_entries", "sales_invoices", "purchase_invoices", "payments", "cash_transactions"):
        await db[coll].create_index("number", unique=True)
    await db.ledger_lines.create_index([("account_code", 1), ("date", 1)])
    await db.ledger_lines.create_index("journal_id")
    await db.fiscal_periods.create_index([("year", 1), ("month", 1)], unique=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
