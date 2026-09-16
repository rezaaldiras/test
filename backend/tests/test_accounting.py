"""Arunika — Uji integritas akuntansi (Phase 1 & 2).

Menjalankan alur: Setup -> CoA -> Saldo Awal -> Penjualan/Kredit -> Penerimaan ->
Pembelian Tunai/Kredit -> Pembayaran Utang -> Beban Kas -> Trial Balance ->
Laba Rugi -> Neraca -> Arus Kas -> Period Closing -> Void.

Aturan yang diuji:
  * Total Debit = Total Kredit di setiap jurnal (jurnal timpang ditolak).
  * Neraca: Aset = Liabilitas + Ekuitas.
  * Piutang (GL) konsisten dengan faktur & pembayaran.
  * Period closing memblokir transaksi pada periode yang ditutup.
Jalankan: cd /app/backend && DB_NAME=arunika_test_db pytest tests/test_accounting.py -q
"""
import os

os.environ["DB_NAME"] = "arunika_test_db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BASE = "/api"
ids: dict = {}


@pytest.fixture(scope="module")
def client():
    from server import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    import os as _os
    import pymongo
    _c = pymongo.MongoClient(_os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    _c.drop_database("arunika_test_db")
    _c.close()

    from db import db as _db
    _db.users.create_index("email", unique=True)
    _db.accounts.create_index("code", unique=True)

    r = client.post(f"{BASE}/setup/bootstrap", json={
        "company_name": "BUMKam Uji", "name": "Admin Uji",
        "email": "admin@uji.id", "password": "sandirahasia123"})
    assert r.status_code == 201, r.text
    tokens = r.json()
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.post(f"{BASE}/setup/seed-coa", headers=h).status_code == 200
    return h


def _post(client, h, url, **kwargs):
    r = client.post(url, headers=h, **kwargs)
    assert r.status_code in (200, 201), f"{url}: {r.status_code} {r.text}"
    return r.json()


def test_bootstrap_and_coa(client, auth):
    h = auth
    items = client.get(f"{BASE}/accounts", headers=h).json()["items"]
    assert len(items) >= 25
    r = client.post(f"{BASE}/setup/bootstrap", json={
        "company_name": "XX", "name": "XX", "email": "x@x.id", "password": "12345678"})
    assert r.status_code == 403


def test_masters(client, auth):
    h = auth
    unit = _post(client, h, f"{BASE}/business-units", json={"name": "Unit Perdagangan"})
    _post(client, h, f"{BASE}/business-units", json={"name": "Unit Jasa"})
    kas = _post(client, h, f"{BASE}/cash-accounts", json={"name": "Kas Utama", "type": "CASH", "account_code": "1-1000"})
    bank = _post(client, h, f"{BASE}/cash-accounts", json={"name": "Bank BRI", "type": "BANK", "account_code": "1-1100"})
    cust = _post(client, h, f"{BASE}/customers", json={"name": "Toko Makmur"})
    sup = _post(client, h, f"{BASE}/suppliers", json={"name": "UD Sumber Rejeki"})
    ids.update({"unit": unit["id"], "kas": kas["id"], "bank": bank["id"],
                "cust": cust["id"], "sup": sup["id"]})


def test_opening_balance_and_trial_balance(client, auth):
    h = auth
    j = _post(client, h, f"{BASE}/journals", json={
        "date": "2026-01-05", "description": "Saldo awal BUMKam", "source_type": "OPENING",
        "action": "post",
        "lines": [
            {"account_code": "1-1000", "debit": 10000000},
            {"account_code": "1-1100", "debit": 50000000},
            {"account_code": "1-1200", "debit": 5000000},
            {"account_code": "3-1000", "credit": 65000000},
        ]})
    assert j["status"] == "POSTED"

    tb = client.get(f"{BASE}/reports/trial-balance", headers=h, params={"to": "2026-12-31"}).json()
    assert abs(tb["totals"]["debit"] - tb["totals"]["credit"]) < 0.01
    assert tb["totals"]["debit"] > 0


def test_imbalanced_journal_rejected(client, auth):
    h = auth
    r = client.post(f"{BASE}/journals", headers=h, json={
        "date": "2026-01-06", "description": "Jurnal tidak seimbang", "action": "post",
        "lines": [{"account_code": "1-1000", "debit": 100000},
                  {"account_code": "4-1000", "credit": 90000}]})
    assert r.status_code == 400
    assert "tidak seimbang" in r.json()["detail"].lower()


def test_credit_sale_flow(client, auth):
    h = auth
    inv = _post(client, h, f"{BASE}/sales-invoices", json={
        "date": "2026-02-10", "due_date": "2026-03-10", "customer_id": ids["cust"],
        "payment_type": "CREDIT", "unit_id": ids["unit"],
        "lines": [
            {"description": "Beras Premium 25kg", "qty": 10, "price": 150000},
            {"description": "Gula Pasir 1kg", "qty": 20, "price": 18000},
        ]})
    ids["inv"] = inv["id"]
    assert inv["total"] == 1860000
    assert inv["status"] == "UNPAID"

    gl = client.get(f"{BASE}/reports/general-ledger", headers=h,
                    params={"account_code": "1-1200", "date_from": "2026-01-01", "date_to": "2026-12-31"}).json()
    # saldo awal 5jt + faktur 1,86jt
    assert abs(gl["closing"] - 6860000) < 0.01, gl["closing"]

    pay = _post(client, h, f"{BASE}/payments", json={
        "type": "RECEIVE", "invoice_id": inv["id"], "date": "2026-02-20",
        "cash_account_id": ids["bank"], "amount": 1000000})
    assert pay["status"] == "POSTED"
    detail = client.get(f"{BASE}/sales-invoices/{inv['id']}", headers=h).json()
    assert detail["status"] == "PARTIAL" and detail["paid_amount"] == 1000000

    r = client.post(f"{BASE}/payments", headers=h, json={
        "type": "RECEIVE", "invoice_id": inv["id"], "date": "2026-02-21",
        "cash_account_id": ids["bank"], "amount": 999999999})
    assert r.status_code == 400

    r = client.post(f"{BASE}/payments", headers=h, json={
        "type": "RECEIVE", "invoice_id": inv["id"], "date": "2026-02-20",
        "cash_account_id": ids["bank"], "amount": 1000000})
    assert r.status_code == 400


def test_purchase_and_payment(client, auth):
    h = auth
    pur = _post(client, h, f"{BASE}/purchase-invoices", json={
        "date": "2026-02-05", "supplier_id": ids["sup"], "payment_type": "CASH",
        "cash_account_id": ids["kas"],
        "lines": [{"description": "Beras 500kg", "qty": 500, "price": 13000}]})
    assert pur["total"] == 6500000

    pur2 = _post(client, h, f"{BASE}/purchase-invoices", json={
        "date": "2026-02-07", "due_date": "2026-03-07", "supplier_id": ids["sup"],
        "payment_type": "CREDIT",
        "lines": [{"description": "Minyak Goreng 100L", "qty": 100, "price": 17000}]})
    assert pur2["total"] == 1700000
    ids["pur2"] = pur2["id"]

    _post(client, h, f"{BASE}/payments", json={
        "type": "PAY", "invoice_id": pur2["id"], "date": "2026-02-25",
        "cash_account_id": ids["bank"], "amount": 1700000})
    detail = client.get(f"{BASE}/purchase-invoices/{pur2['id']}", headers=h).json()
    assert detail["status"] == "PAID"


def test_cash_expense_and_transfer(client, auth):
    h = auth
    _post(client, h, f"{BASE}/cash-transactions", json={
        "kind": "OUT", "date": "2026-02-15", "cash_account_id": ids["kas"],
        "amount": 350000, "account_code": "5-2200", "description": "Bayar listrik kantor"})
    _post(client, h, f"{BASE}/cash-transfers", json={
        "date": "2026-02-16", "from_cash_account_id": ids["bank"],
        "to_cash_account_id": ids["kas"], "amount": 2000000, "notes": "Setoran operasional"})
    r = client.post(f"{BASE}/cash-transactions", headers=h, json={
        "kind": "IN", "date": "2026-02-15", "cash_account_id": ids["kas"],
        "amount": 50000, "account_code": "1-1100", "description": "Salah akun"})
    assert r.status_code == 400


def test_financial_statements(client, auth):
    h = auth
    is_r = client.get(f"{BASE}/reports/income-statement", headers=h,
                      params={"date_from": "2026-01-01", "date_to": "2026-12-31"}).json()
    assert is_r["totals"]["revenue"] == 1860000
    assert is_r["totals"]["net_profit"] == 1510000

    bs = client.get(f"{BASE}/reports/balance-sheet", headers=h, params={"as_of": "2026-12-31"}).json()
    assert bs["totals"]["balanced"] is True, bs["totals"]

    cf = client.get(f"{BASE}/reports/cash-flow", headers=h,
                    params={"date_from": "2026-01-01", "date_to": "2026-12-31"}).json()
    # Kas 10jt - 6,5jt + 1jt - 1,7jt - 350rb = 2,45jt; Bank 50jt + 1jt - 1,7jt = 49,3jt -> total 51,75jt? lihat catatan
    # rinci: Kas: 10 - 6,5 - 0,35 = 3,15; Bank: 50 + 1 - 1,7 = 49,3 -> total 52,45jt (transfer internal netral)
    assert abs(cf["totals"]["closing"] - 52450000) < 0.01, cf["totals"]

    tb = client.get(f"{BASE}/reports/trial-balance", headers=h, params={"to": "2026-12-31"}).json()
    assert abs(tb["totals"]["debit"] - tb["totals"]["credit"]) < 0.01


def test_void_flow(client, auth):
    h = auth
    r = client.post(f"{BASE}/sales-invoices/{ids['inv']}/void", headers=h,
                    json={"reason": "coba void"})
    assert r.status_code == 400
    assert "pembayaran" in r.json()["detail"].lower()

    pays = [p for p in client.get(f"{BASE}/payments", headers=h, params={"type": "RECEIVE"}).json()["items"]
            if p["invoice_id"] == ids["inv"] and p["status"] == "POSTED"]
    assert len(pays) == 1
    _post(client, h, f"{BASE}/payments/{pays[0]['id']}/void", json={"reason": "Salah tujuan transfer"})
    detail = client.get(f"{BASE}/sales-invoices/{ids['inv']}", headers=h).json()
    assert detail["status"] == "UNPAID" and detail["paid_amount"] == 0

    _post(client, h, f"{BASE}/sales-invoices/{ids['inv']}/void", json={"reason": "Faktur keliru"})
    bs = client.get(f"{BASE}/reports/balance-sheet", headers=h, params={"as_of": "2026-12-31"}).json()
    assert bs["totals"]["balanced"] is True


def test_period_closing(client, auth):
    h = auth
    periods = client.get(f"{BASE}/periods", headers=h).json()["items"]
    feb = next(p for p in periods if p["year"] == 2026 and p["month"] == 2)
    client.post(f"{BASE}/periods/{feb['id']}/close", headers=h)

    r = client.post(f"{BASE}/cash-transactions", headers=h, json={
        "kind": "OUT", "date": "2026-02-28", "cash_account_id": ids["kas"],
        "amount": 50000, "account_code": "5-2400", "description": "Beli tinta"})
    assert r.status_code == 400
    assert "ditutup" in r.json()["detail"].lower()

    client.post(f"{BASE}/periods/{feb['id']}/reopen", headers=h)
    r = client.post(f"{BASE}/cash-transactions", headers=h, json={
        "kind": "OUT", "date": "2026-02-28", "cash_account_id": ids["kas"],
        "amount": 50000, "account_code": "5-2400", "description": "Beli tinta"})
    assert r.status_code == 201


def test_dashboard_and_rbac(client, auth):
    h = auth
    dash = client.get(f"{BASE}/dashboard", headers=h, params={"month": "2026-02"}).json()
    assert dash["kpis"]["cash_total"] > 0
    _post(client, h, f"{BASE}/users", json={
        "name": "Auditor Uji", "email": "auditor@uji.id", "password": "audit12345", "role": "auditor"})
    r = client.post(f"{BASE}/auth/login", json={"email": "auditor@uji.id", "password": "audit12345"})
    ah = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get(f"{BASE}/reports/trial-balance", headers=ah).status_code == 200
    r = client.post(f"{BASE}/sales-invoices", headers=ah, json={})
    assert r.status_code == 403


def test_export_reports(client, auth):
    h = auth
    for fmt in ("csv", "xlsx", "pdf"):
        r = client.get(f"{BASE}/export", headers=h,
                       params={"report": "income-statement", "format": fmt,
                               "from_": "2026-01-01", "to": "2026-12-31"})
        assert r.status_code == 200, f"{fmt}: {r.text}"
        body = r.json()
        assert body["content"] and body["filename"].endswith(fmt)
