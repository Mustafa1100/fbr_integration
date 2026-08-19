"""End-to-end API tests in mock mode: admin bootstrap → create user →
user login → FBR settings → CSV upload → invoices submitted → receipt/QR →
soft deletes → deactivation."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DATABASE_URL"] = "sqlite:///./test_fbr.db"
os.environ["ADMIN_EMAIL"] = "admin@example.com"
os.environ["ADMIN_PASSWORD"] = "admin123"

import pytest
from fastapi.testclient import TestClient

if os.path.exists("test_fbr.db"):
    os.remove("test_fbr.db")

from app.main import app

client = TestClient(app)

CSV_OK = """pos_invoice_no,invoice_date,buyer_ntn_cnic,buyer_name,buyer_province,buyer_address,buyer_registration_type,product_description,hs_code,rate,uom,quantity,unit_price,sale_type,scenario_id
POS-1,2026-08-15,1234567,ABC Traders,Punjab,Lahore,Registered,Laptop,8471.3010,18%,"Numbers, pieces, units",2,150000,Goods at standard rate (default),SN001
POS-1,2026-08-15,1234567,ABC Traders,Punjab,Lahore,Registered,Mouse,8471.6020,18%,"Numbers, pieces, units",5,2500,Goods at standard rate (default),SN001
POS-2,2026-08-15,,Walk-in,Sindh,Karachi,Unregistered,Phone,8517.1219,18%,"Numbers, pieces, units",1,45000,Goods at standard rate (default),SN002
"""


@pytest.fixture(autouse=True, scope="module")
def cleanup():
    yield
    if os.path.exists("test_fbr.db"):
        os.remove("test_fbr.db")


def _login(email, password):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


@pytest.fixture(scope="module")
def admin_headers():
    return _login("admin@example.com", "admin123")


SHOP_TEMP_PASSWORD = "TempPass1"
SHOP_REAL_PASSWORD = "Str0ng!Passw0rd99"


@pytest.fixture(scope="module")
def user_headers(admin_headers):
    resp = client.post(
        "/api/admin/users",
        json={
            "email": "shop@example.com",
            "password": SHOP_TEMP_PASSWORD,
            "full_name": "Shop Owner",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    user_id = resp.json()["id"]
    # FBR settings are admin-managed only — configure them here so every
    # other test can assume a working seller profile is already in place.
    resp = client.put(
        f"/api/admin/users/{user_id}/fbr-settings",
        json={
            "fbr_env": "mock",
            "seller_ntn_cnic": "7654321",
            "seller_business_name": "Shop Owner Pvt Ltd",
            "seller_province": "Punjab",
            "seller_address": "Lahore",
            "default_scenario": "SN001",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text

    # Admin-issued passwords are temporary — first login must replace it
    # before the account can do real work (mirrors the actual product flow).
    login = client.post(
        "/api/auth/login",
        json={"email": "shop@example.com", "password": SHOP_TEMP_PASSWORD},
    )
    assert login.status_code == 200, login.text
    assert login.json()["must_change_password"] is True
    temp_headers = {"Authorization": f"Bearer {login.json()['token']}"}
    resp = client.post(
        "/api/auth/set-password",
        json={
            "new_password": SHOP_REAL_PASSWORD,
            "confirm_password": SHOP_REAL_PASSWORD,
        },
        headers=temp_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["must_change_password"] is False

    return _login("shop@example.com", SHOP_REAL_PASSWORD)


def test_password_strength_scoring():
    from app.auth import password_strength

    assert password_strength("short1!")["label"] == "weak"  # under 8 chars
    assert password_strength("abcdefgh")["label"] == "weak"  # len==8, lowercase only, score=1
    assert password_strength("alllowercase")["label"] == "medium"  # len>=12 bonus + lowercase
    assert password_strength("Lowerupper1")["label"] == "medium"
    assert password_strength("Str0ng!Passw0rd")["label"] == "strong"


def test_must_change_password_gates_real_actions(admin_headers):
    # A fresh admin-created user, never through the fixture's set-password step.
    resp = client.post(
        "/api/admin/users",
        json={"email": "temp@example.com", "password": "Temporary1", "full_name": "Temp User"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    user_id = resp.json()["id"]
    assert resp.json()["must_change_password"] is True

    login = client.post(
        "/api/auth/login", json={"email": "temp@example.com", "password": "Temporary1"}
    )
    assert login.status_code == 200
    assert login.json()["must_change_password"] is True
    temp_headers = {"Authorization": f"Bearer {login.json()['token']}"}

    # Real work is blocked until the password is replaced.
    resp = client.post(
        "/api/uploads",
        files={"file": ("x.csv", "a,b\n1,2\n", "text/csv")},
        headers=temp_headers,
    )
    assert resp.status_code == 403
    assert "set your own password" in resp.json()["detail"]

    # Weak password rejected server-side, regardless of the client meter.
    resp = client.post(
        "/api/auth/set-password",
        json={"new_password": "weak", "confirm_password": "weak"},
        headers=temp_headers,
    )
    assert resp.status_code == 400

    # Mismatched confirmation rejected.
    resp = client.post(
        "/api/auth/set-password",
        json={"new_password": "Str0ng!Passw0rd", "confirm_password": "Different1!"},
        headers=temp_headers,
    )
    assert resp.status_code == 400

    # Strong, matching password succeeds.
    resp = client.post(
        "/api/auth/set-password",
        json={"new_password": "Str0ng!Passw0rd", "confirm_password": "Str0ng!Passw0rd"},
        headers=temp_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is False
    fresh_headers = {"Authorization": f"Bearer {resp.json()['token']}"}

    # The OLD token (the one that made this very set-password call) is now
    # dead — token_version bumped, so it can't be reused to change the
    # password again or do anything else. Must use the fresh token above.
    resp = client.get("/api/auth/me", headers=temp_headers)
    assert resp.status_code == 401
    resp = client.post(
        "/api/auth/set-password",
        json={"new_password": "AnotherStrong1!", "confirm_password": "AnotherStrong1!"},
        headers=temp_headers,
    )
    assert resp.status_code == 401

    # Uploads no longer blocked by the password gate (fails for a different,
    # expected reason — bad CSV columns — proving the 403 gate is gone).
    resp = client.post(
        "/api/uploads",
        files={"file": ("x.csv", "a,b\n1,2\n", "text/csv")},
        headers=fresh_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "failed"

    # Re-login with the new password succeeds and no longer flags the account.
    relogin = client.post(
        "/api/auth/login", json={"email": "temp@example.com", "password": "Str0ng!Passw0rd"}
    )
    assert relogin.status_code == 200
    assert relogin.json()["must_change_password"] is False

    # Old temp password no longer works.
    old_login = client.post(
        "/api/auth/login", json={"email": "temp@example.com", "password": "Temporary1"}
    )
    assert old_login.status_code == 401

    client.delete(f"/api/admin/users/{user_id}", headers=admin_headers)


def test_admin_with_temp_password_blocked_from_admin_routes(admin_headers):
    # A freshly created SECOND admin, still on their temp password, must not
    # get admin power for free — otherwise the whole gate is pointless for
    # admin accounts specifically.
    resp = client.post(
        "/api/admin/users",
        json={
            "email": "newadmin@example.com",
            "password": "TempAdmin1",
            "full_name": "New Admin",
            "role": "admin",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    new_admin_id = resp.json()["id"]

    login = client.post(
        "/api/auth/login", json={"email": "newadmin@example.com", "password": "TempAdmin1"}
    )
    assert login.status_code == 200
    assert login.json()["must_change_password"] is True
    temp_admin_headers = {"Authorization": f"Bearer {login.json()['token']}"}

    # Admin-role check passes (it IS an admin) but the password gate blocks
    # every admin action until they set their own password.
    assert client.get("/api/admin/users", headers=temp_admin_headers).status_code == 403
    assert (
        client.post(
            "/api/admin/users",
            json={"email": "x@example.com", "password": "Whatever1", "full_name": "X"},
            headers=temp_admin_headers,
        ).status_code
        == 403
    )

    resp = client.post(
        "/api/auth/set-password",
        json={"new_password": "Str0ng!AdminPass", "confirm_password": "Str0ng!AdminPass"},
        headers=temp_admin_headers,
    )
    assert resp.status_code == 200
    fresh_admin_headers = {"Authorization": f"Bearer {resp.json()['token']}"}

    # Now admin routes work normally.
    assert client.get("/api/admin/users", headers=fresh_admin_headers).status_code == 200

    client.delete(f"/api/admin/users/{new_admin_id}", headers=admin_headers)


def test_password_strength_endpoint(user_headers):
    resp = client.post("/api/auth/password-strength", json={"password": "Str0ng!Passw0rd"})
    assert resp.status_code == 200
    assert resp.json()["label"] == "strong"

    resp = client.post("/api/auth/password-strength", json={"password": "weak"})
    assert resp.json()["label"] == "weak"


def test_call_handles_malformed_json_response_without_crashing(monkeypatch):
    # Regression test: FBR returning 200 OK with a non-JSON/malformed body
    # (a real incident hit live) must not let json.JSONDecodeError propagate
    # uncaught past _call() — it should retry, then raise a clean FBRError.
    import httpx as httpx_module

    from app.fbr import client
    from app.models import FbrSettings

    calls = {"n": 0}

    class FakeResponse:
        status_code = 200
        text = '{"validationResponse": {"statusCode": "00" "error": "}'  # malformed

        def raise_for_status(self):
            pass

        def json(self):
            import json as json_module

            return json_module.loads(self.text)  # raises JSONDecodeError

    def fake_post(url, headers, json, timeout):
        calls["n"] += 1
        return FakeResponse()

    monkeypatch.setattr(httpx_module, "post", fake_post)
    monkeypatch.setattr(client.time, "sleep", lambda _: None)  # skip real backoff

    fbr = FbrSettings(fbr_env="sandbox", fbr_token="test-token")
    with pytest.raises(client.FBRError, match="failed to parse as JSON"):
        client._call("https://example.invalid/x", {}, fbr)

    # Retried the configured number of times (default retries=2 -> 3 attempts).
    assert calls["n"] == 3


def test_is_valid_checks_item_level_statuses():
    # Spec v1.12 §4.1.5: outer statusCode can be "00" while items fail.
    from app.fbr.client import is_valid

    assert is_valid(
        {"validationResponse": {"statusCode": "00", "invoiceStatuses": [{"statusCode": "00"}]}}
    )
    assert not is_valid(
        {
            "validationResponse": {
                "statusCode": "00",
                "status": "invalid",
                "invoiceStatuses": [{"statusCode": "00"}, {"statusCode": "01"}],
            }
        }
    )
    assert not is_valid({"validationResponse": {"statusCode": "01"}})
    # invoiceStatuses may be null (spec §4.1.4)
    assert is_valid({"validationResponse": {"statusCode": "00", "invoiceStatuses": None}})


def test_applicable_scenarios_matrix():
    from app.fbr.scenarios import applicable_scenarios

    assert applicable_scenarios("Manufacturer", "Steel") == ["SN003", "SN004", "SN011"]
    assert "SN025" not in applicable_scenarios("Manufacturer", "Pharmaceuticals")
    assert "SN025" in applicable_scenarios("Importer", "Pharmaceuticals")
    assert applicable_scenarios("Service Provider", "Services") == ["SN018", "SN019"]
    retailer_fmcg = applicable_scenarios("Retailer", "FMCG")
    assert retailer_fmcg == ["SN008", "SN026", "SN027", "SN028"]


def test_error_code_guidance_appended():
    from app.fbr.client import error_text

    text = error_text(
        {
            "validationResponse": {
                "statusCode": "01",
                "errorCode": "0019",
                "error": "HS Code is either not provided or invalid",
            }
        }
    )
    # Original FBR message preserved, plus PRAL's published remediation.
    assert "HS Code is either not provided or invalid" in text
    assert "reference API" in text

    # Unrecognized code: message passes through unchanged, no crash.
    text2 = error_text(
        {"validationResponse": {"statusCode": "01", "errorCode": "9999", "error": "Some new error"}}
    )
    assert text2 == "Some new error"


def test_scenario_sample_data_covers_all_28():
    from app.fbr.scenario_samples import SCENARIO_SAMPLE_ITEMS

    assert len(SCENARIO_SAMPLE_ITEMS) == 28
    for code in (f"SN{n:03d}" for n in range(1, 29)):
        item = SCENARIO_SAMPLE_ITEMS[code]
        assert item["hsCode"]
        assert item["saleType"]
        assert item["quantity"] > 0
        # 3rd Schedule / retail-reduced-rate goods (SN008, SN027, SN028) are
        # priced via fixedNotifiedValueOrRetailPrice instead —
        # valueSalesExcludingST is legitimately 0 for those, not missing data.
        assert item["valueSalesExcludingST"] > 0 or item["fixedNotifiedValueOrRetailPrice"] > 0


def test_third_schedule_scenarios_price_off_fixed_value():
    from app.fbr.scenario_samples import SCENARIO_SAMPLE_ITEMS

    for code in ("SN008", "SN027", "SN028"):
        item = SCENARIO_SAMPLE_ITEMS[code]
        assert item["valueSalesExcludingST"] == 0
        assert item["fixedNotifiedValueOrRetailPrice"] > 0

    # SN028's official sample also requires an SRO schedule reference.
    sn028 = SCENARIO_SAMPLE_ITEMS["SN028"]
    assert sn028["sroScheduleNo"]
    assert sn028["sroItemSerialNo"]




def test_scenario_aware_csv_template(user_headers):
    resp = client.get("/api/uploads/template?scenario=SN015", headers=user_headers)
    assert resp.status_code == 200
    rows = resp.text.strip().splitlines()
    assert len(rows) == 2  # header + one official-sample row
    assert "SN015" in rows[1]

    # Unknown scenario -> 404, not a silent empty file.
    resp = client.get("/api/uploads/template?scenario=SN999", headers=user_headers)
    assert resp.status_code == 404


def test_scenario_catalog(user_headers):
    resp = client.get("/api/uploads/scenario-catalog", headers=user_headers)
    assert resp.status_code == 200
    codes = {s["code"] for s in resp.json()}
    assert codes == {f"SN{n:03d}" for n in range(1, 29)}


def test_every_scenario_csv_template_parses_cleanly(user_headers):
    # Each of the 28 official-sample templates must itself pass our own CSV
    # pipeline — otherwise "download the sample for this scenario" would
    # hand the customer a file our own uploader rejects. Parse-only (not a
    # live upload) so this doesn't disturb invoice counts other tests assert.
    from app.services.csv_processor import _parse_rows

    for n in range(1, 29):
        code = f"SN{n:03d}"
        resp = client.get(f"/api/uploads/template?scenario={code}", headers=user_headers)
        assert resp.status_code == 200, code
        rows = _parse_rows(resp.text)  # raises CsvError if malformed
        assert len(rows) == 1 and rows[0]["scenario_id"] == code


def test_login_rejects_bad_password():
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "wrong"},
    )
    assert resp.status_code == 401


def test_auth_required():
    assert client.get("/api/invoices").status_code == 401
    assert client.get("/api/admin/users").status_code == 401


def test_admin_only(user_headers):
    assert client.get("/api/admin/users", headers=user_headers).status_code == 403


def test_fbr_settings_read_only_for_user(user_headers):
    # GET still works — users can view the settings an admin configured.
    data = client.get("/api/settings/fbr", headers=user_headers).json()
    assert data["seller_business_name"] == "Shop Owner Pvt Ltd"
    assert data["has_token"] is False

    # PUT is retired for regular users — 403, not a silent no-op.
    resp = client.put(
        "/api/settings/fbr",
        json={"fbr_env": "sandbox", "seller_business_name": "Hacked Name"},
        headers=user_headers,
    )
    assert resp.status_code == 403

    # An unauthenticated caller gets 401 (auth checked first), not the
    # admin-specific 403 message, which would be misleading with no token.
    resp = client.put(
        "/api/settings/fbr", json={"fbr_env": "sandbox"}
    )
    assert resp.status_code == 401

    # Confirm nothing changed.
    data2 = client.get("/api/settings/fbr", headers=user_headers).json()
    assert data2["seller_business_name"] == "Shop Owner Pvt Ltd"
    assert data2["fbr_env"] == "mock"


def test_admin_manages_user_fbr_settings(admin_headers, user_headers):
    users = client.get("/api/admin/users", headers=admin_headers).json()
    shop = next(u for u in users if u["email"] == "shop@example.com")
    ORIGINAL_PROFILE = {
        "fbr_env": "mock",
        "seller_ntn_cnic": "7654321",
        "seller_business_name": "Shop Owner Pvt Ltd",
        "seller_province": "Punjab",
        "seller_address": "Lahore",
        "default_scenario": "SN001",
    }

    try:
        # A non-admin (even for their own account) cannot reach the admin route.
        resp = client.put(
            f"/api/admin/users/{shop['id']}/fbr-settings",
            json={"fbr_env": "sandbox"},
            headers=user_headers,
        )
        assert resp.status_code == 403

        resp = client.get(
            f"/api/admin/users/{shop['id']}/fbr-settings", headers=user_headers
        )
        assert resp.status_code == 403

        # Admin can read and update it.
        resp = client.get(
            f"/api/admin/users/{shop['id']}/fbr-settings", headers=admin_headers
        )
        assert resp.status_code == 200
        assert resp.json()["seller_business_name"] == "Shop Owner Pvt Ltd"

        resp = client.put(
            f"/api/admin/users/{shop['id']}/fbr-settings",
            json={
                "fbr_env": "mock",
                "seller_ntn_cnic": "9999999",
                "seller_business_name": "Renamed By Admin",
                "seller_province": "Sindh",
                "seller_address": "Karachi",
                "default_scenario": "SN002",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["seller_business_name"] == "Renamed By Admin"

        # The user sees the admin's change but still cannot edit it themselves.
        seen = client.get("/api/settings/fbr", headers=user_headers).json()
        assert seen["seller_business_name"] == "Renamed By Admin"
    finally:
        # Always restore the shared profile, even if an assertion above
        # failed — later tests (e.g. test_csv_upload_and_receipts) hard-code
        # this exact seller profile, and a skipped restore would corrupt
        # module-scoped state and mask the real failure in an unrelated test.
        resp = client.put(
            f"/api/admin/users/{shop['id']}/fbr-settings",
            json=ORIGINAL_PROFILE,
            headers=admin_headers,
        )
        assert resp.status_code == 200


def test_csv_template(user_headers):
    resp = client.get("/api/uploads/template")
    assert resp.status_code == 200
    assert "pos_invoice_no" in resp.text


def test_csv_upload_and_receipts(user_headers):
    resp = client.post(
        "/api/uploads",
        files={"file": ("sales.csv", CSV_OK, "text/csv")},
        headers=user_headers,
    )
    assert resp.status_code == 201, resp.text
    upload = resp.json()
    assert upload["status"] == "completed"
    assert upload["total_rows"] == 3
    assert upload["invoices_created"] == 2  # POS-1 (2 items) + POS-2 (1 item)
    assert upload["invoices_submitted"] == 2

    invoices = client.get("/api/invoices", headers=user_headers).json()
    assert len(invoices) == 2
    assert all(i["status"] == "submitted" for i in invoices)
    assert all(i["fbr_invoice_number"].startswith("MOCK") for i in invoices)

    # POS-1: 2×150000 + 5×2500 = 312500 excl; 18% tax = 56250
    pos1 = next(i for i in invoices if i["pos_invoice_no"] == "POS-1")
    assert pos1["total_excl"] == 312500.0
    assert pos1["total_tax"] == 56250.0

    detail = client.get(f"/api/invoices/{pos1['id']}", headers=user_headers).json()
    assert detail["qr"].startswith("data:image/png;base64")
    assert detail["payload"]["sellerNTNCNIC"] == "7654321"
    assert detail["payload"]["scenarioId"] == "SN001"
    assert len(detail["items"]) == 2
    assert detail["fbr_response"]["validationResponse"]["statusCode"] == "00"
    # Spec v1.12: extraTax is numeric; mock returns per-item statuses
    assert isinstance(detail["payload"]["items"][0]["extraTax"], (int, float))
    item_statuses = detail["fbr_response"]["validationResponse"]["invoiceStatuses"]
    assert len(item_statuses) == 2
    assert all(s["statusCode"] == "00" for s in item_statuses)


def test_csv_upload_bad_format(user_headers):
    resp = client.post(
        "/api/uploads",
        files={"file": ("bad.csv", "foo,bar\n1,2\n", "text/csv")},
        headers=user_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "failed"
    assert "Missing required columns" in resp.json()["error"]


def test_submitted_invoice_cannot_be_deleted(user_headers):
    invoices = client.get("/api/invoices", headers=user_headers).json()
    resp = client.delete(f"/api/invoices/{invoices[0]['id']}", headers=user_headers)
    assert resp.status_code == 400


def test_upload_soft_delete(user_headers):
    uploads = client.get("/api/uploads", headers=user_headers).json()
    assert client.delete(
        f"/api/uploads/{uploads[0]['id']}", headers=user_headers
    ).json() == {"ok": True}
    remaining = client.get("/api/uploads", headers=user_headers).json()
    assert all(u["id"] != uploads[0]["id"] for u in remaining)


def test_admin_stats(admin_headers):
    stats = client.get("/api/admin/stats", headers=admin_headers).json()
    assert stats["total_users"] == 2
    assert stats["total_invoices"] == 2
    assert stats["submitted_invoices"] == 2


def test_user_isolation(admin_headers):
    client.post(
        "/api/admin/users",
        json={"email": "other@example.com", "password": "secret1", "full_name": "Other"},
        headers=admin_headers,
    )
    other = _login("other@example.com", "secret1")
    assert client.get("/api/invoices", headers=other).json() == []


def test_deactivate_blocks_login(admin_headers):
    users = client.get("/api/admin/users", headers=admin_headers).json()
    other = next(u for u in users if u["email"] == "other@example.com")
    resp = client.patch(
        f"/api/admin/users/{other['id']}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    resp = client.post(
        "/api/auth/login",
        json={"email": "other@example.com", "password": "secret1"},
    )
    assert resp.status_code == 403


def test_soft_delete_user(admin_headers):
    users = client.get("/api/admin/users", headers=admin_headers).json()
    other = next(u for u in users if u["email"] == "other@example.com")
    assert client.delete(
        f"/api/admin/users/{other['id']}", headers=admin_headers
    ).json() == {"ok": True}
    users = client.get("/api/admin/users", headers=admin_headers).json()
    assert all(u["email"] != "other@example.com" for u in users)


def test_recreate_soft_deleted_email_restores_account(admin_headers):
    # The email of a soft-deleted user must be reusable: creating it again
    # restores the account (same row — users.email is UNIQUE in the DB).
    resp = client.post(
        "/api/admin/users",
        json={
            "email": "other@example.com",
            "password": "newpass1",
            "full_name": "Other Restored",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["is_active"] is True
    assert _login("other@example.com", "newpass1")


def test_third_schedule_csv_upload_prices_and_taxes_off_fixed_value(user_headers):
    # SN008's official sample: fixedNotifiedValueOrRetailPrice=1000, rate=18%.
    # Placed at the end of the file — it adds an extra invoice for the shop
    # user, which would throw off earlier tests' exact invoice-count asserts.
    csv_text = (
        "pos_invoice_no,invoice_date,buyer_ntn_cnic,buyer_name,buyer_province,"
        "buyer_address,buyer_registration_type,product_description,hs_code,"
        "rate,uom,quantity,unit_price,sale_type,scenario_id,fixed_notified_value\n"
        "POS-3SCH,2026-08-17,,Walk-in Customer,Sindh,Karachi,Unregistered,"
        "Test 3rd Schedule Item,0101.2100,18%,\"Numbers, pieces, units\",1,0,"
        "3rd Schedule Goods,SN008,1000\n"
    )
    resp = client.post(
        "/api/uploads",
        files={"file": ("sn008.csv", csv_text, "text/csv")},
        headers=user_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["invoices_submitted"] == 1

    invoices = client.get(
        "/api/invoices?upload_id=" + str(resp.json()["id"]), headers=user_headers
    ).json()
    detail = client.get(f"/api/invoices/{invoices[0]['id']}", headers=user_headers).json()
    item = detail["payload"]["items"][0]
    # FBR's live sandbox rejects a literal 0 here as "invalid" (error 0300)
    # even though it's what PRAL's own spec sample sends — a negligible
    # non-zero placeholder works around that validator quirk.
    assert item["valueSalesExcludingST"] == 0.01
    assert item["fixedNotifiedValueOrRetailPrice"] == 1000
    # Tax must still be computed off the fixed value (1000 × 18% = 180), not
    # the placeholder sale value.
    assert item["salesTaxApplicable"] == 180

    # Our own item serialization (not the FBR payload) also exposes
    # fixed_notified_value, so the receipt can display the real pricing
    # basis instead of the 0.01 placeholder in value_excl_st.
    own_item = detail["items"][0]
    assert own_item["value_excl_st"] == 0.01
    assert own_item["fixed_notified_value"] == 1000


def test_reduced_rate_goods_send_empty_extra_tax_and_tax_off_sale_value(user_headers):
    # "Goods at Reduced Rate" (SN028) has two FBR quirks confirmed live
    # against the real sandbox:
    #  1. extraTax: 0 is rejected as "extra tax provided" (error 0091,
    #     2026-08-17) — must send "" instead, unlike other sale types.
    #  2. Unlike "3rd Schedule Goods" (SN008/SN027), it is NOT taxed off
    #     fixedNotifiedValueOrRetailPrice — FBR rejects salesTaxApplicable
    #     computed that way (2026-08-18: "Provided sales tax amount does
    #     not match the calculated sales tax amount... the provided Sale
    #     Value is used to calculate the Sales Tax"). Tax must be computed
    #     off valueSalesExcludingST instead, matching PRAL's own SN028
    #     sample (salesTaxApplicable: 0, matching valueSalesExcludingST: 0,
    #     even though fixedNotifiedValueOrRetailPrice there is 100).
    csv_text = (
        "pos_invoice_no,invoice_date,buyer_ntn_cnic,buyer_name,buyer_province,"
        "buyer_address,buyer_registration_type,product_description,hs_code,"
        "rate,uom,quantity,unit_price,sale_type,scenario_id,fixed_notified_value,"
        "sro_schedule_no,sro_item_serial_no\n"
        "POS-REDUCED,2026-08-17,1234567,Test Buyer,Sindh,Karachi,Registered,"
        "Reduced Rate Item,0101.2100,1%,\"Numbers, pieces, units\",1,0,"
        "Goods at Reduced Rate,SN028,100,EIGHTH SCHEDULE Table 1,70\n"
    )
    resp = client.post(
        "/api/uploads",
        files={"file": ("sn028.csv", csv_text, "text/csv")},
        headers=user_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["invoices_submitted"] == 1

    invoices = client.get(
        "/api/invoices?upload_id=" + str(resp.json()["id"]), headers=user_headers
    ).json()
    detail = client.get(f"/api/invoices/{invoices[0]['id']}", headers=user_headers).json()
    item = detail["payload"]["items"][0]
    assert item["extraTax"] == ""
    # value_excl (0.01 placeholder, since unit_price=0) must be the tax
    # basis, NOT fixedNotifiedValueOrRetailPrice (100) — 0.01 * 1% rounds
    # to 0.0, matching PRAL's own SN028 sample's salesTaxApplicable of 0.
    assert item["valueSalesExcludingST"] == 0.01
    assert item["fixedNotifiedValueOrRetailPrice"] == 100.0
    assert item["salesTaxApplicable"] == 0.0

    # A standard-rate item (unaffected sale type) must still send numeric 0,
    # matching what's already confirmed working against the live sandbox.
    standard_csv = (
        "pos_invoice_no,invoice_date,buyer_ntn_cnic,buyer_name,buyer_province,"
        "buyer_address,buyer_registration_type,product_description,hs_code,"
        "rate,uom,quantity,unit_price,sale_type,scenario_id\n"
        "POS-STD,2026-08-17,1234567,Test Buyer,Sindh,Karachi,Registered,"
        "Standard Item,0101.2100,18%,\"Numbers, pieces, units\",1,100,"
        "Goods at standard rate (default),SN001\n"
    )
    resp2 = client.post(
        "/api/uploads",
        files={"file": ("sn001.csv", standard_csv, "text/csv")},
        headers=user_headers,
    )
    invoices2 = client.get(
        "/api/invoices?upload_id=" + str(resp2.json()["id"]), headers=user_headers
    ).json()
    detail2 = client.get(f"/api/invoices/{invoices2[0]['id']}", headers=user_headers).json()
    assert detail2["payload"]["items"][0]["extraTax"] == 0.0


def test_admin_views_user_uploads_and_invoices(admin_headers, user_headers):
    users = client.get("/api/admin/users", headers=admin_headers).json()
    shop = next(u for u in users if u["email"] == "shop@example.com")

    own_uploads = client.get("/api/uploads", headers=user_headers).json()
    admin_view_uploads = client.get(
        f"/api/admin/users/{shop['id']}/uploads", headers=admin_headers
    ).json()
    assert admin_view_uploads == own_uploads
    assert len(admin_view_uploads) > 0

    own_invoices = client.get("/api/invoices", headers=user_headers).json()
    admin_view_invoices = client.get(
        f"/api/admin/users/{shop['id']}/invoices", headers=admin_headers
    ).json()
    assert admin_view_invoices == own_invoices
    assert len(admin_view_invoices) > 0

    inv_id = own_invoices[0]["id"]
    own_detail = client.get(f"/api/invoices/{inv_id}", headers=user_headers).json()
    admin_detail = client.get(
        f"/api/admin/users/{shop['id']}/invoices/{inv_id}", headers=admin_headers
    ).json()
    assert admin_detail == own_detail

    # upload_id filter behaves the same as the user's own endpoint.
    upload_id = own_uploads[0]["id"]
    filtered_own = client.get(
        f"/api/invoices?upload_id={upload_id}", headers=user_headers
    ).json()
    filtered_admin = client.get(
        f"/api/admin/users/{shop['id']}/invoices?upload_id={upload_id}",
        headers=admin_headers,
    ).json()
    assert filtered_admin == filtered_own


def test_admin_views_reject_nonexistent_user(admin_headers):
    assert client.get("/api/admin/users/999999/uploads", headers=admin_headers).status_code == 404
    assert client.get("/api/admin/users/999999/invoices", headers=admin_headers).status_code == 404
    assert client.get("/api/admin/users/999999/invoices/1", headers=admin_headers).status_code == 404


def test_admin_invoice_detail_checks_ownership(admin_headers, user_headers):
    # An invoice ID that belongs to a different user must 404 under the
    # wrong user_id in the path — not just "any invoice by ID".
    users = client.get("/api/admin/users", headers=admin_headers).json()
    admin_self = next(u for u in users if u["email"] == "admin@example.com")
    invoices = client.get("/api/invoices", headers=user_headers).json()
    resp = client.get(
        f"/api/admin/users/{admin_self['id']}/invoices/{invoices[0]['id']}",
        headers=admin_headers,
    )
    assert resp.status_code == 404


def test_non_admin_cannot_view_admin_user_views(user_headers):
    assert client.get("/api/admin/users/1/uploads", headers=user_headers).status_code == 403
    assert client.get("/api/admin/users/1/invoices", headers=user_headers).status_code == 403


def test_admin_stats_extended_fields(admin_headers):
    stats = client.get("/api/admin/stats", headers=admin_headers).json()
    assert stats["total_admins"] >= 1
    assert stats["total_regular_users"] >= 1
    assert stats["total_admins"] + stats["total_regular_users"] == stats["total_users"]
    assert "draft_invoices" in stats
    assert len(stats["invoices_by_day"]) == 14
    for bucket in stats["invoices_by_day"]:
        assert set(bucket) == {"date", "total", "submitted", "failed"}
    # Invoices created earlier in this test run must show up in today's bucket.
    assert stats["invoices_by_day"][-1]["total"] >= 1


def test_create_admin_via_admin_users_endpoint(admin_headers):
    resp = client.post(
        "/api/admin/users",
        json={
            "email": "second-admin@example.com",
            "password": "secret1",
            "full_name": "Second Admin",
            "role": "admin",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["role"] == "admin"
    users = client.get("/api/admin/users", headers=admin_headers).json()
    created = next(u for u in users if u["email"] == "second-admin@example.com")
    assert created["role"] == "admin"


def test_users_list_role_filter(admin_headers):
    resp = client.get("/api/admin/users?role=admin", headers=admin_headers)
    assert resp.status_code == 200
    assert all(u["role"] == "admin" for u in resp.json())
    assert len(resp.json()) >= 1

    resp = client.get("/api/admin/users?role=user", headers=admin_headers)
    assert all(u["role"] == "user" for u in resp.json())

    assert client.get("/api/admin/users?role=bogus", headers=admin_headers).status_code == 400


def test_users_list_search_filter(admin_headers):
    resp = client.get("/api/admin/users?q=shop@example.com", headers=admin_headers)
    emails = [u["email"] for u in resp.json()]
    assert emails == ["shop@example.com"]

    resp = client.get("/api/admin/users?q=Shop Owner", headers=admin_headers)
    assert "shop@example.com" in [u["email"] for u in resp.json()]

    resp = client.get("/api/admin/users?q=no-such-person-xyz", headers=admin_headers)
    assert resp.json() == []


def test_users_list_active_filter(admin_headers):
    resp = client.get("/api/admin/users?is_active=true", headers=admin_headers)
    assert all(u["is_active"] for u in resp.json())
    resp = client.get("/api/admin/users?is_active=false", headers=admin_headers)
    assert all(not u["is_active"] for u in resp.json())


def test_users_list_pagination(admin_headers):
    full = client.get("/api/admin/users", headers=admin_headers)
    total = int(full.headers["x-total-count"])
    all_users = full.json()
    assert total == len(all_users)
    assert total >= 3  # admin + shop owner + second-admin created above

    resp = client.get("/api/admin/users?page=1&page_size=2", headers=admin_headers)
    assert int(resp.headers["x-total-count"]) == total
    page1 = resp.json()
    assert len(page1) == 2
    assert page1 == all_users[0:2]  # same default order (created_at desc)

    resp2 = client.get("/api/admin/users?page=2&page_size=2", headers=admin_headers)
    page2 = resp2.json()
    assert page2 == all_users[2:4]
    # No overlap between pages.
    assert {u["id"] for u in page1}.isdisjoint({u["id"] for u in page2})

    assert client.get("/api/admin/users?page=0", headers=admin_headers).status_code == 400
    assert client.get("/api/admin/users?page_size=0", headers=admin_headers).status_code == 400
    assert client.get("/api/admin/users?page_size=1001", headers=admin_headers).status_code == 400


def test_uploads_list_pagination_and_filters(admin_headers, user_headers):
    full = client.get("/api/uploads", headers=user_headers)
    total = int(full.headers["x-total-count"])
    all_uploads = full.json()
    assert total == len(all_uploads)
    assert total >= 4

    resp = client.get("/api/uploads?page=1&page_size=2", headers=user_headers)
    assert int(resp.headers["x-total-count"]) == total
    page1 = resp.json()
    assert len(page1) == 2
    assert page1 == all_uploads[0:2]  # same default order (id desc)

    resp2 = client.get("/api/uploads?page=2&page_size=2", headers=user_headers)
    assert resp2.json() == all_uploads[2:4]

    # Create our own guaranteed-failed upload — an earlier test's malformed
    # upload may since have been soft-deleted by test_upload_soft_delete.
    client.post(
        "/api/uploads",
        files={"file": ("malformed.csv", "foo,bar\n1,2\n", "text/csv")},
        headers=user_headers,
    )

    failed = client.get("/api/uploads?status=failed", headers=user_headers).json()
    assert len(failed) >= 1
    assert all(u["status"] == "failed" for u in failed)
    assert any(u["filename"] == "malformed.csv" for u in failed)

    named = client.get("/api/uploads?q=malformed.csv", headers=user_headers).json()
    assert len(named) == 1

    assert client.get("/api/uploads?status=bogus", headers=user_headers).status_code == 400
    assert client.get("/api/uploads?page_size=0", headers=user_headers).status_code == 400

    # The admin read-only mirror returns byte-identical data, same filters.
    users = client.get("/api/admin/users", headers=admin_headers).json()
    shop = next(u for u in users if u["email"] == "shop@example.com")
    admin_full = client.get(f"/api/admin/users/{shop['id']}/uploads", headers=admin_headers)
    assert int(admin_full.headers["x-total-count"]) == total + 1
    admin_failed = client.get(
        f"/api/admin/users/{shop['id']}/uploads?status=failed", headers=admin_headers
    ).json()
    assert admin_failed == failed


def test_invoices_list_pagination_and_filters(admin_headers, user_headers):
    full = client.get("/api/invoices", headers=user_headers)
    total = int(full.headers["x-total-count"])
    all_invoices = full.json()
    assert total == len(all_invoices)
    assert total >= 5

    resp = client.get("/api/invoices?page=2&page_size=3", headers=user_headers)
    assert int(resp.headers["x-total-count"]) == total
    assert resp.json() == all_invoices[3:6]

    # Manufacture a failed invoice (quantity 0 trips the mock validator) so
    # the status filter has something real to find.
    bad_csv = (
        "pos_invoice_no,invoice_date,buyer_ntn_cnic,buyer_name,buyer_province,"
        "buyer_address,buyer_registration_type,product_description,hs_code,"
        "rate,uom,quantity,unit_price,sale_type,scenario_id\n"
        "POS-BADQTY,2026-08-17,1234567,Test Buyer,Sindh,Karachi,Registered,"
        "Zero Qty Item,0101.2100,18%,\"Numbers, pieces, units\",0,100,"
        "Goods at standard rate (default),SN001\n"
    )
    upload_resp = client.post(
        "/api/uploads",
        files={"file": ("badqty.csv", bad_csv, "text/csv")},
        headers=user_headers,
    )
    assert upload_resp.json()["invoices_failed"] == 1

    failed = client.get("/api/invoices?status=failed", headers=user_headers).json()
    assert len(failed) == 1
    assert failed[0]["pos_invoice_no"] == "POS-BADQTY"

    by_buyer = client.get("/api/invoices?q=ABC Traders", headers=user_headers).json()
    assert len(by_buyer) >= 1
    assert all(i["buyer_name"] == "ABC Traders" for i in by_buyer)

    by_pos_no = client.get("/api/invoices?q=POS-BADQTY", headers=user_headers).json()
    assert len(by_pos_no) == 1

    assert client.get("/api/invoices?status=bogus", headers=user_headers).status_code == 400

    # Admin mirror matches exactly, including the status filter.
    users = client.get("/api/admin/users", headers=admin_headers).json()
    shop = next(u for u in users if u["email"] == "shop@example.com")
    admin_failed = client.get(
        f"/api/admin/users/{shop['id']}/invoices?status=failed", headers=admin_headers
    ).json()
    assert admin_failed == failed


def test_my_stats_scoped_to_current_user(admin_headers, user_headers):
    own_uploads = client.get("/api/uploads", headers=user_headers)
    own_uploads_total = int(own_uploads.headers["x-total-count"])
    own_invoices = client.get("/api/invoices", headers=user_headers)
    own_invoices_total = int(own_invoices.headers["x-total-count"])
    submitted = [i for i in own_invoices.json() if i["status"] == "submitted"]
    failed = [i for i in own_invoices.json() if i["status"] == "failed"]

    stats = client.get("/api/stats", headers=user_headers).json()
    assert stats["total_uploads"] == own_uploads_total
    assert stats["total_invoices"] == own_invoices_total
    assert stats["submitted_invoices"] == len(submitted)
    assert stats["failed_invoices"] == len(failed)
    assert stats["total_sales_value"] == round(sum(i["grand_total"] for i in submitted), 2)
    assert stats["total_tax_collected"] == round(sum(i["total_tax"] for i in submitted), 2)
    assert len(stats["invoices_by_day"]) == 14
    for bucket in stats["invoices_by_day"]:
        assert set(bucket) == {"date", "total", "submitted", "failed"}
    assert stats["invoices_by_day"][-1]["total"] >= 1

    # A second, brand-new user with zero activity sees all zeros — not the
    # first user's data.
    resp = client.post(
        "/api/admin/users",
        json={"email": "quiet@example.com", "password": "secret1", "full_name": "Quiet One"},
        headers=admin_headers,
    )
    login = client.post(
        "/api/auth/login", json={"email": "quiet@example.com", "password": "secret1"}
    )
    quiet_headers = {"Authorization": f"Bearer {login.json()['token']}"}
    quiet_resp = client.post(
        "/api/auth/set-password",
        json={"new_password": "Str0ng!Passw0rd99", "confirm_password": "Str0ng!Passw0rd99"},
        headers=quiet_headers,
    )
    assert quiet_resp.status_code == 200
    quiet_headers = {
        "Authorization": "Bearer "
        + client.post(
            "/api/auth/login",
            json={"email": "quiet@example.com", "password": "Str0ng!Passw0rd99"},
        ).json()["token"]
    }
    quiet_stats = client.get("/api/stats", headers=quiet_headers).json()
    assert quiet_stats["total_uploads"] == 0
    assert quiet_stats["total_invoices"] == 0
    assert quiet_stats["submitted_invoices"] == 0
    assert quiet_stats["total_sales_value"] == 0
    assert all(b["total"] == 0 for b in quiet_stats["invoices_by_day"])

    assert client.get("/api/stats").status_code == 401
