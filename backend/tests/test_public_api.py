"""Arunika - Public URL smoke tests via ingress (EXPO_PUBLIC_BACKEND_URL).

These tests hit the live preview backend to validate the ingress routing and
end-to-end critical flows (bootstrap/login/CoA/dashboard/report/export).
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://keuangan-bumkam.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

session = requests.Session()
state = {}


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health():
    r = session.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


def test_setup_status_and_login():
    r = session.get(f"{API}/setup/status", timeout=15)
    assert r.status_code == 200
    needs = r.json().get("needs_setup")
    if needs:
        r = session.post(f"{API}/setup/bootstrap", json={
            "company_name": "BUMKam Demo",
            "name": "Admin Demo",
            "email": "admin@bumkam.id",
            "password": "sandirahasia123",
        }, timeout=30)
        assert r.status_code == 201, r.text
        tokens = r.json()
        state["access"] = tokens["access_token"]
        state["refresh"] = tokens["refresh_token"]
        # seed CoA
        r2 = session.post(f"{API}/setup/seed-coa", headers=_auth_header(state["access"]), timeout=30)
        assert r2.status_code == 200
    else:
        r = session.post(f"{API}/auth/login", json={
            "email": "admin@bumkam.id", "password": "sandirahasia123"
        }, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"Preview DB already seeded with unknown admin: {r.status_code}")
        tokens = r.json()
        state["access"] = tokens["access_token"]
        state["refresh"] = tokens["refresh_token"]


def test_second_bootstrap_rejected():
    if "access" not in state:
        pytest.skip("no auth")
    r = session.post(f"{API}/setup/bootstrap", json={
        "company_name": "XX", "name": "XX", "email": "x@x.id", "password": "12345678"}, timeout=15)
    assert r.status_code == 403


def test_auth_me_and_refresh():
    if "access" not in state:
        pytest.skip("no auth")
    r = session.get(f"{API}/auth/me", headers=_auth_header(state["access"]), timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == "admin@bumkam.id"

    r = session.post(f"{API}/auth/refresh", json={"refresh_token": state["refresh"]}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body and "refresh_token" in body
    state["access"] = body["access_token"]
    state["refresh"] = body["refresh_token"]


def test_wrong_login():
    r = session.post(f"{API}/auth/login", json={
        "email": "admin@bumkam.id", "password": "salahsalah"
    }, timeout=15)
    assert r.status_code == 401


def test_coa_seeded():
    if "access" not in state:
        pytest.skip("no auth")
    r = session.get(f"{API}/accounts", headers=_auth_header(state["access"]), timeout=15)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) >= 25


def test_dashboard_endpoint():
    if "access" not in state:
        pytest.skip("no auth")
    r = session.get(f"{API}/dashboard", params={"month": "2026-01"},
                    headers=_auth_header(state["access"]), timeout=15)
    assert r.status_code == 200
    data = r.json()
    for key in ("kpis", "series", "due_sales", "due_purchases", "top_customers"):
        assert key in data, f"missing key {key}"


def test_trial_balance_endpoint():
    if "access" not in state:
        pytest.skip("no auth")
    r = session.get(f"{API}/reports/trial-balance", params={"to": "2026-12-31"},
                    headers=_auth_header(state["access"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert abs(body["totals"]["debit"] - body["totals"]["credit"]) < 0.01


def test_export_endpoint_all_formats():
    if "access" not in state:
        pytest.skip("no auth")
    for fmt in ("csv", "xlsx", "pdf"):
        r = session.get(f"{API}/export", params={
            "report": "income-statement", "format": fmt,
            "from_": "2026-01-01", "to": "2026-12-31"
        }, headers=_auth_header(state["access"]), timeout=30)
        assert r.status_code == 200, f"{fmt}: {r.text}"
        body = r.json()
        assert body["content"] and body["filename"].endswith(fmt)


def test_rbac_auditor_can_read_but_not_write():
    if "access" not in state:
        pytest.skip("no auth")
    email = f"auditor+{uuid.uuid4().hex[:6]}@bumkam.id"
    r = session.post(f"{API}/users", json={
        "name": "Auditor Uji Public", "email": email,
        "password": "audit12345", "role": "auditor"
    }, headers=_auth_header(state["access"]), timeout=15)
    assert r.status_code in (200, 201), r.text
    r = session.post(f"{API}/auth/login", json={"email": email, "password": "audit12345"}, timeout=15)
    assert r.status_code == 200
    tok = r.json()["access_token"]
    ah = _auth_header(tok)

    r = session.get(f"{API}/reports/trial-balance", params={"to": "2026-12-31"}, headers=ah, timeout=15)
    assert r.status_code == 200

    r = session.post(f"{API}/sales-invoices", json={"date": "2026-01-01"}, headers=ah, timeout=15)
    assert r.status_code == 403


def test_audit_log_endpoint():
    if "access" not in state:
        pytest.skip("no auth")
    r = session.get(f"{API}/audit", headers=_auth_header(state["access"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
