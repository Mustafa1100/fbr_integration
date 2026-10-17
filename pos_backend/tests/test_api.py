import os
import tempfile
from datetime import timedelta

# Point the app at a throwaway database before anything imports it: a fresh
# SQLite file, or an empty Postgres database given as TEST_DATABASE_URL.
_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_db}"
os.environ["ADMIN_EMAIL"] = "admin@test.pk"
os.environ["ADMIN_PASSWORD"] = "admin-pass"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import generate_password  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Subscription, utcnow  # noqa: E402
from app.serializers import add_months  # noqa: E402

http = TestClient(app)


@pytest.fixture(scope="module")
def admin():
    token = http.post(
        "/api/admin/login", json={"email": "admin@test.pk", "password": "admin-pass"}
    ).json()["token"]
    return {"Authorization": f"Bearer {token}"}


_counter = iter(range(1000))


def new_client(admin, **config):
    name = f"clinic{next(_counter)}"
    resp = http.post("/api/admin/clients", headers=admin, json={"name": name, "config": config})
    assert resp.status_code == 201, resp.text
    return resp.json()


def pos_login(username, password):
    return http.post("/api/pos/login", json={"username": username, "password": password})


def plan(admin, months):
    plans = http.get("/api/admin/plans", headers=admin).json()
    return next(p for p in plans if p["months"] == months)


def test_admin_login_rejects_bad_password_and_unknown_email():
    assert http.post("/api/admin/login", json={"email": "admin@test.pk", "password": "x"}).status_code == 401
    assert http.post("/api/admin/login", json={"email": "nobody@test.pk", "password": "x"}).status_code == 401


def test_admin_endpoints_need_an_admin_token(admin):
    assert http.get("/api/admin/clients").status_code == 401
    created = new_client(admin)
    device = pos_login(created["client"]["username"], created["password"]).json()["token"]
    # A desktop token must not open the admin portal.
    assert http.get("/api/admin/clients", headers={"Authorization": f"Bearer {device}"}).status_code == 401
    # ...and an admin token must not pass as a desktop login.
    assert http.get("/api/pos/sync", headers=admin).status_code == 401


def test_four_plans_exist_and_prices_can_be_changed(admin):
    plans = http.get("/api/admin/plans", headers=admin).json()
    assert [p["months"] for p in plans] == [1, 3, 6, 12]

    yearly = plans[-1]
    resp = http.put(f"/api/admin/plans/{yearly['id']}", headers=admin, json={"name": "Yearly", "price": 24000})
    assert resp.json()["price"] == 24000
    assert http.put(f"/api/admin/plans/{yearly['id']}", headers=admin, json={"name": "Yearly", "price": -1}).status_code == 422


def test_generated_passwords_are_strong():
    for _ in range(50):
        password = generate_password()
        assert len(password) == 16
        assert any(c.isupper() for c in password)
        assert any(c.islower() for c in password)
        assert any(c.isdigit() for c in password)
        assert any(not c.isalnum() for c in password)


def test_creating_a_client_issues_a_login(admin):
    created = new_client(admin, business_name="KASHIF CLINIC", ntn="1694266-3")
    username = created["client"]["username"]
    assert username.endswith("@pos.compliance.pk")

    login = pos_login(username, created["password"])
    assert login.status_code == 200
    body = login.json()
    assert body["config"]["business_name"] == "KASHIF CLINIC"
    assert body["config"]["mode"] == "demo"
    assert body["subscription"] == {"status": "none", "plan_name": "", "expires_at": None}

    assert pos_login(username, "wrong").status_code == 401
    assert pos_login("nobody@pos.compliance.pk", created["password"]).status_code == 401
    # The password is never readable again.
    detail = http.get(f"/api/admin/clients/{created['client']['id']}", headers=admin).json()
    assert "password" not in detail


def test_usernames_are_validated_and_unique(admin):
    for bad in ["", "a", "Has Space", "-dash", "x" * 41, "name@domain"]:
        assert http.post("/api/admin/clients", headers=admin, json={"name": bad}).status_code == 422
    assert http.post("/api/admin/clients", headers=admin, json={"name": "taken"}).status_code == 201
    assert http.post("/api/admin/clients", headers=admin, json={"name": "TAKEN"}).status_code == 409


def test_fbr_settings_are_validated(admin):
    client_id = new_client(admin)["client"]["id"]
    url = f"/api/admin/clients/{client_id}"

    assert http.put(url, headers=admin, json={"config": {"mode": "fbr"}}).status_code == 422
    assert http.put(url, headers=admin, json={"config": {"pos_id": "12ab"}}).status_code == 422
    assert http.put(url, headers=admin, json={"config": {"default_pct_code": "123456789"}}).status_code == 422
    assert http.put(url, headers=admin, json={"config": {"service_url": "localhost"}}).status_code == 422

    ok = http.put(
        url,
        headers=admin,
        json={"config": {"mode": "fbr", "environment": "test", "pos_id": "822992", "default_pct_code": "98151000"}},
    )
    assert ok.status_code == 200
    assert ok.json()["config"]["pos_id"] == "822992"


def test_settings_changes_reach_the_desktop_on_sync(admin):
    created = new_client(admin, business_name="Old name")
    token = pos_login(created["client"]["username"], created["password"]).json()["token"]
    device = {"Authorization": f"Bearer {token}"}

    http.put(
        f"/api/admin/clients/{created['client']['id']}",
        headers=admin,
        json={"config": {"business_name": "New name", "mode": "fbr", "pos_id": "201826", "environment": "live"}},
    )
    config = http.get("/api/pos/sync", headers=device).json()["config"]
    assert config["business_name"] == "New name"
    assert (config["mode"], config["environment"], config["pos_id"]) == ("fbr", "live", "201826")


def test_only_one_plan_is_in_force_at_a_time(admin):
    created = new_client(admin)
    url = f"/api/admin/clients/{created['client']['id']}/subscriptions"

    first = http.post(url, headers=admin, json={"plan_id": plan(admin, 1)["id"]}).json()
    assert (first["subscription_status"], first["plan_name"]) == ("active", "Monthly")

    # Another plan is refused while this one runs; it has to be cancelled first.
    refused = http.post(url, headers=admin, json={"plan_id": plan(admin, 12)["id"]})
    assert refused.status_code == 409
    assert "Cancel it first" in refused.json()["detail"]
    detail = http.get(f"/api/admin/clients/{created['client']['id']}", headers=admin).json()
    assert (detail["plan_name"], len(detail["subscriptions"])) == ("Monthly", 1)

    http.post(f"{url}/cancel", headers=admin)
    second = http.post(url, headers=admin, json={"plan_id": plan(admin, 12)["id"]}).json()
    newest, older = second["subscriptions"]
    assert (newest["plan_name"], newest["end_reason"]) == ("Yearly", "")
    assert older["end_reason"] == "cancelled"
    assert second["plan_name"] == "Yearly"
    running = [s for s in second["subscriptions"] if not s["end_reason"]]
    assert len(running) == 1


def test_a_plan_can_be_chosen_when_the_client_is_created(admin):
    resp = http.post("/api/admin/clients", headers=admin, json={"name": "withplan", "plan_id": plan(admin, 3)["id"]})
    assert resp.status_code == 201
    body = resp.json()
    assert (body["client"]["subscription_status"], body["client"]["plan_name"]) == ("active", "Quarterly")
    login = pos_login(body["client"]["username"], body["password"]).json()
    assert login["subscription"]["plan_name"] == "Quarterly"
    assert http.post("/api/admin/clients", headers=admin, json={"name": "badplan", "plan_id": 99999}).status_code == 404


def test_cancelling_stops_the_subscription_at_the_next_sync(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    http.post(f"/api/admin/clients/{client_id}/subscriptions", headers=admin, json={"plan_id": plan(admin, 1)["id"]})
    device = device_for(created)
    assert http.get("/api/pos/sync", headers=device).json()["subscription"]["status"] == "active"

    cancelled = http.post(f"/api/admin/clients/{client_id}/subscriptions/cancel", headers=admin)
    assert cancelled.status_code == 200
    assert cancelled.json()["subscription_status"] == "cancelled"
    assert cancelled.json()["subscriptions"][0]["end_reason"] == "cancelled"
    sub = http.get("/api/pos/sync", headers=device).json()["subscription"]
    assert sub["status"] == "cancelled"
    assert sub["expires_at"] <= utcnow().isoformat(timespec="seconds") + "Z"
    # Nothing left to cancel; a new plan brings the client back.
    assert http.post(f"/api/admin/clients/{client_id}/subscriptions/cancel", headers=admin).status_code == 400
    http.post(f"/api/admin/clients/{client_id}/subscriptions", headers=admin, json={"plan_id": plan(admin, 1)["id"]})
    assert http.get("/api/pos/sync", headers=device).json()["subscription"]["status"] == "active"

def test_price_charged_is_frozen_on_the_subscription(admin):
    quarterly = plan(admin, 3)
    http.put(f"/api/admin/plans/{quarterly['id']}", headers=admin, json={"name": "Quarterly", "price": 7000})
    created = new_client(admin)
    url = f"/api/admin/clients/{created['client']['id']}/subscriptions"
    http.post(url, headers=admin, json={"plan_id": quarterly["id"]})

    http.put(f"/api/admin/plans/{quarterly['id']}", headers=admin, json={"name": "Quarterly", "price": 9000})
    detail = http.get(f"/api/admin/clients/{created['client']['id']}", headers=admin).json()
    assert detail["subscriptions"][0]["price"] == 7000


def test_expired_and_expiring_subscriptions_are_reported(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    token = pos_login(created["client"]["username"], created["password"]).json()["token"]
    device = {"Authorization": f"Bearer {token}"}

    def set_expiry(delta):
        db = SessionLocal()
        db.query(Subscription).filter(Subscription.client_id == client_id).delete()
        now = utcnow()
        db.add(
            Subscription(
                client_id=client_id, plan_months=1, plan_name="Monthly", price=0,
                starts_at=now - timedelta(days=40), expires_at=now + delta,
            )
        )
        db.commit()
        db.close()

    set_expiry(timedelta(days=-1))
    assert http.get("/api/pos/sync", headers=device).json()["subscription"]["status"] == "expired"

    set_expiry(timedelta(days=3))
    assert http.get("/api/pos/sync", headers=device).json()["subscription"]["status"] == "expiring"
    stats = http.get("/api/admin/stats", headers=admin).json()
    assert client_id in [c["id"] for c in stats["expiring_clients"]]

    # A lapsed client who renews starts a fresh period from today, not from
    # the old expiry date.
    set_expiry(timedelta(days=-30))
    renewed = http.post(
        f"/api/admin/clients/{client_id}/subscriptions", headers=admin, json={"plan_id": plan(admin, 1)["id"]}
    ).json()
    assert renewed["subscription_status"] == "active"


def test_reset_password_signs_the_desktop_out(admin):
    created = new_client(admin)
    username = created["client"]["username"]
    token = pos_login(username, created["password"]).json()["token"]
    device = {"Authorization": f"Bearer {token}"}
    assert http.get("/api/pos/sync", headers=device).status_code == 200

    reset = http.post(f"/api/admin/clients/{created['client']['id']}/reset-password", headers=admin).json()
    assert reset["password"] != created["password"]
    assert http.get("/api/pos/sync", headers=device).status_code == 401
    assert pos_login(username, created["password"]).status_code == 401
    assert pos_login(username, reset["password"]).status_code == 200


def test_deactivated_client_is_locked_out(admin):
    created = new_client(admin)
    username = created["client"]["username"]
    token = pos_login(username, created["password"]).json()["token"]

    http.put(
        f"/api/admin/clients/{created['client']['id']}", headers=admin, json={"is_active": False, "config": {}}
    )
    assert http.get("/api/pos/sync", headers={"Authorization": f"Bearer {token}"}).status_code == 403
    assert pos_login(username, created["password"]).status_code == 403


def device_for(created):
    token = pos_login(created["client"]["username"], created["password"]).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def data_sync(device, usin_seq=0, requests=(), changes=()):
    body = {"usin_seq": usin_seq, "requests": list(requests), "changes": list(changes)}
    resp = http.post("/api/pos/data/sync", headers=device, json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def pending_requests(admin, client_id):
    return http.get(f"/api/admin/item-requests?client_id={client_id}", headers=admin).json()


def decide(admin, request_id, action, note=""):
    return http.post(f"/api/admin/item-requests/{request_id}/{action}", headers=admin, json={"note": note})


def admin_item(admin, client_id, code, name, price, **extra):
    resp = http.post(f"/api/admin/clients/{client_id}/items", headers=admin, json={"code": code, "name": name, "price": price, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


_uid = iter(range(100000))


def ask(action, code, name="", price=0):
    return {"uid": f"u{next(_uid)}", "code": code, "action": action, "name": name, "price": price}


# ── Every change to items from the computer is a request ─────────────────


def test_the_computer_cannot_add_or_change_items_directly(admin):
    created = new_client(admin)
    device = device_for(created)
    admin_item(admin, created["client"]["id"], "ECG", "ECG", 1500)

    # Direct uploads (an older app, or a tampered one) change nothing.
    result = data_sync(device, changes=[{"code": "NEW", "name": "Sneaked in", "price": 1}, {"code": "ECG", "name": "Renamed", "price": 1}])
    assert [(i["code"], i["name"], i["price"]) for i in result["items"]] == [("ECG", "ECG", 1500)]


def test_an_add_request_creates_the_item_only_when_approved(admin):
    created = new_client(admin, default_tax_rate=5, default_pct_code="98151000")
    client_id = created["client"]["id"]
    device = device_for(created)

    # No tax suggested: the item gets the client's defaults on approval.
    result = data_sync(device, requests=[ask("add", "CONS", "General consultation", 2000)])
    assert result["items"] == []
    assert [(r["action"], r["status"]) for r in result["requests"]] == [("add", "pending")]

    queue = pending_requests(admin, client_id)
    assert [(r["action"], r["code"], r["name"], r["price"]) for r in queue] == [("add", "CONS", "General consultation", 2000)]
    assert decide(admin, queue[0]["id"], "approve").status_code == 200

    item = data_sync(device)["items"][0]
    assert (item["code"], item["name"], item["price"], item["tax_rate"], item["pct_code"]) == (
        "CONS", "General consultation", 2000, 5, "98151000",
    )
    # A replacement computer signs in and gets it back.
    assert [i["code"] for i in data_sync(device_for(created))["items"]] == ["CONS"]


def test_approving_sets_the_tax_rate_and_pct_code(admin):
    created = new_client(admin, default_tax_rate=0, default_pct_code="98151000")
    client_id = created["client"]["id"]
    device = device_for(created)

    data_sync(device, requests=[ask("add", "XR", "X-ray", 3000)])
    [request] = pending_requests(admin, client_id)
    # The approve form starts from the client's defaults for a new item...
    assert (request["suggested_tax_rate"], request["suggested_pct_code"]) == (0, "98151000")
    assert decide_with(admin, request["id"], tax_rate=15, pct_code="98170000", third_schedule=True).status_code == 200
    item = data_sync(device)["items"][0]
    assert (item["tax_rate"], item["pct_code"], item["third_schedule"]) == (15, "98170000", True)

    # ...and from the item's current values for a change.
    data_sync(device, requests=[ask("edit", "XR", "X-ray (chest)", 3500)])
    [request] = pending_requests(admin, client_id)
    assert (request["suggested_tax_rate"], request["suggested_pct_code"]) == (15, "98170000")
    assert decide_with(admin, request["id"], tax_rate=16, pct_code="98170001").status_code == 200
    item = data_sync(device)["items"][0]
    assert (item["name"], item["tax_rate"], item["pct_code"], item["third_schedule"]) == ("X-ray (chest)", 16, "98170001", True)

    # Approving without them leaves the tax treatment as it is; bad values are refused.
    data_sync(device, requests=[ask("edit", "XR", "X-ray", 3500)])
    [request] = pending_requests(admin, client_id)
    assert decide_with(admin, request["id"], pct_code="123456789").status_code == 422
    assert decide_with(admin, request["id"], tax_rate=101).status_code == 422
    assert decide(admin, request["id"], "approve").status_code == 200
    assert data_sync(device)["items"][0]["tax_rate"] == 16


def test_the_client_can_suggest_tax_rate_and_pct_code(admin):
    created = new_client(admin, default_tax_rate=0, default_pct_code="98151000")
    client_id = created["client"]["id"]
    device = device_for(created)

    sent = data_sync(device, requests=[{**ask("add", "LAB", "Lab test", 800), "tax_rate": 15, "pct_code": "98160000"}])
    assert (sent["requests"][0]["proposed_tax_rate"], sent["requests"][0]["proposed_pct_code"]) == (15, "98160000")
    [request] = pending_requests(admin, client_id)
    # The approve form starts from the suggestion, not the defaults.
    assert (request["suggested_tax_rate"], request["suggested_pct_code"]) == (15, "98160000")
    # Approved as suggested...
    decide(admin, request["id"], "approve")
    item = data_sync(device)["items"][0]
    assert (item["tax_rate"], item["pct_code"]) == (15, "98160000")

    # ...or the admin overrides it.
    data_sync(device, requests=[{**ask("edit", "LAB", "Lab test", 900), "tax_rate": 0, "pct_code": "11111111"}])
    [request] = pending_requests(admin, client_id)
    decide_with(admin, request["id"], tax_rate=16, pct_code="98160000")
    item = data_sync(device)["items"][0]
    assert (item["price"], item["tax_rate"], item["pct_code"]) == (900, 16, "98160000")

    bad = http.post("/api/pos/data/sync", headers=device, json={"requests": [{**ask("add", "X", "X", 1), "pct_code": "123456789"}]})
    assert bad.status_code == 422


def decide_with(admin, request_id, **fields):
    return http.post(f"/api/admin/item-requests/{request_id}/approve", headers=admin, json=fields)


def test_an_add_for_a_code_in_use_is_turned_down(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    device = device_for(created)
    admin_item(admin, client_id, "ECG", "ECG", 1500)

    refused = data_sync(device, requests=[ask("add", "ECG", "Another ECG", 1)])["requests"][0]
    assert (refused["status"], refused["admin_note"]) == ("rejected", 'An item with the code "ECG" already exists.')

    # Two clinics asking for the same new code: the second approval is refused.
    data_sync(device, requests=[ask("add", "XR", "X-ray", 3000)])
    first = pending_requests(admin, client_id)[0]["id"]
    admin_item(admin, client_id, "XR", "X-ray (added by admin)", 3000)
    assert decide(admin, first, "approve").status_code == 409


def test_an_edit_request_applies_only_when_approved(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    device = device_for(created)
    admin_item(admin, client_id, "ECG", "ECG", 1500, tax_rate=15, pct_code="98170000")

    result = data_sync(device, requests=[ask("edit", "ECG", "ECG (12 lead)", 1800)])
    assert [(i["name"], i["price"]) for i in result["items"]] == [("ECG", 1500)]
    assert [(r["status"], r["current_name"]) for r in result["requests"]] == [("pending", "ECG")]

    queue = pending_requests(admin, client_id)
    assert [(r["action"], r["name"], r["price"], r["current_price"], r["client_username"]) for r in queue] == [
        ("edit", "ECG (12 lead)", 1800, 1500, created["client"]["username"])
    ]
    assert http.get("/api/admin/stats", headers=admin).json()["pending_item_requests"] >= 1
    approved = decide(admin, queue[0]["id"], "approve")
    assert approved.json()["decided_by"] == "admin@test.pk"
    assert decide(admin, queue[0]["id"], "approve").status_code == 409

    after = data_sync(device)
    item = after["items"][0]
    # Name and price changed; the admin's tax settings did not.
    assert (item["name"], item["price"], item["tax_rate"], item["pct_code"]) == ("ECG (12 lead)", 1800, 15, "98170000")
    assert after["requests"][0]["status"] == "approved"
    assert pending_requests(admin, client_id) == []


def test_a_delete_request_can_be_rejected_with_a_reason(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    device = device_for(created)
    admin_item(admin, client_id, "LAB", "Lab test", 500)

    data_sync(device, requests=[ask("delete", "LAB")])
    decide(admin, pending_requests(admin, client_id)[0]["id"], "reject", "Still offered at the clinic")
    result = data_sync(device)
    assert [i["code"] for i in result["items"]] == ["LAB"]
    assert (result["requests"][0]["status"], result["requests"][0]["admin_note"]) == ("rejected", "Still offered at the clinic")

    data_sync(device, requests=[ask("delete", "LAB")])
    decide(admin, pending_requests(admin, client_id)[0]["id"], "approve")
    assert data_sync(device)["items"] == []
    # Asking to add it back restores it, tax settings and all, once approved.
    data_sync(device, requests=[ask("add", "LAB", "Lab test", 600)])
    decide(admin, pending_requests(admin, client_id)[0]["id"], "approve")
    assert [(i["code"], i["price"]) for i in data_sync(device)["items"]] == [("LAB", 600)]


def test_requests_are_not_duplicated_and_the_newest_one_counts(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    device = device_for(created)
    admin_item(admin, client_id, "FUP", "Follow-up", 1000)

    first = ask("edit", "FUP", "Follow-up visit", 1100)
    data_sync(device, requests=[first])
    data_sync(device, requests=[first])  # re-sent after a lost answer
    assert len(pending_requests(admin, client_id)) == 1

    second = {**first, "uid": "newer", "price": 1200}
    statuses = {r["uid"]: r["status"] for r in data_sync(device, requests=[second])["requests"]}
    assert statuses == {first["uid"]: "withdrawn", "newer": "pending"}
    assert [r["price"] for r in pending_requests(admin, client_id)] == [1200]


def test_requests_for_items_that_are_gone_are_closed(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    device = device_for(created)

    unknown = data_sync(device, requests=[ask("delete", "NOPE")])["requests"][0]
    assert (unknown["status"], unknown["admin_note"]) == ("rejected", "This item no longer exists.")

    old = admin_item(admin, client_id, "OLD", "Old", 1)
    data_sync(device, requests=[ask("edit", "OLD", "Older", 2)])
    http.delete(f"/api/admin/clients/{client_id}/items/{old['id']}", headers=admin)
    assert decide(admin, pending_requests(admin, client_id)[0]["id"], "approve").status_code == 409
    assert pending_requests(admin, client_id) == []
    assert http.post("/api/admin/item-requests/1/approve", json={}).status_code == 401


def test_admin_can_manage_a_clients_items(admin):
    created = new_client(admin)
    items_url = f"/api/admin/clients/{created['client']['id']}/items"
    body = {"code": "XRAY", "name": "X-ray", "price": 3000, "tax_rate": 15, "pct_code": "98170000"}

    item = http.post(items_url, headers=admin, json=body)
    assert item.status_code == 201
    assert http.post(items_url, headers=admin, json=body).status_code == 409
    assert http.post(items_url, headers=admin, json={**body, "code": "", "name": ""}).status_code == 422
    assert http.post(items_url, headers=admin, json={**body, "code": "B", "pct_code": "123456789"}).status_code == 422

    # It reaches the desktop at its next sync, tax fields included.
    synced = data_sync(device_for(created))["items"]
    assert [(i["code"], i["tax_rate"], i["pct_code"]) for i in synced] == [("XRAY", 15, "98170000")]

    assert http.delete(f"{items_url}/{item.json()['id']}", headers=admin).json() == []
    assert data_sync(device_for(created))["items"] == []
    assert http.post(items_url, headers=admin, json=body).status_code == 201


def test_invoice_counter_only_moves_forward(admin):
    created = new_client(admin)
    device = device_for(created)
    assert data_sync(device, usin_seq=0)["usin_seq"] == 0
    assert data_sync(device, usin_seq=7)["usin_seq"] == 7
    # A fresh computer reports 0 and is told to continue from 7.
    assert data_sync(device_for(created), usin_seq=0)["usin_seq"] == 7
    assert data_sync(device, usin_seq=3)["usin_seq"] == 7
    detail = http.get(f"/api/admin/clients/{created['client']['id']}", headers=admin).json()
    assert detail["usin_seq"] == 7


def test_clients_never_see_each_others_items_or_requests(admin):
    first, second = new_client(admin), new_client(admin)
    admin_item(admin, first["client"]["id"], "A", "Only mine", 1)
    data_sync(device_for(first), usin_seq=40, requests=[ask("add", "B", "Mine too", 2)])
    other = data_sync(device_for(second))
    assert (other["items"], other["requests"], other["usin_seq"]) == ([], [], 0)
    # The same code can exist for both.
    admin_item(admin, second["client"]["id"], "A", "Theirs", 2)
    assert data_sync(device_for(first))["items"][0]["name"] == "Only mine"
    assert http.post("/api/pos/data/sync", headers=admin, json={}).status_code == 401

# ── Signed licence and live updates ──────────────────────────────────────


def _licence(token):
    import jwt
    from cryptography.hazmat.primitives import serialization

    from app.licence import public_key_pem

    key = serialization.load_pem_public_key(public_key_pem().encode())
    return jwt.decode(token, key, algorithms=["EdDSA"])


def test_every_sync_carries_a_signed_licence(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    http.post(f"/api/admin/clients/{client_id}/subscriptions", headers=admin, json={"plan_id": plan(admin, 12)["id"]})
    body = http.get("/api/pos/sync", headers=device_for(created)).json()
    licence = _licence(body["licence"])
    assert (licence["usr"], licence["status"], licence["plan"], licence["active"]) == (
        created["client"]["username"], "active", "Yearly", True,
    )
    # A yearly plan, but the licence only covers 30 days without contact.
    from datetime import datetime, timedelta

    issued = datetime.fromisoformat(licence["issued_at"].rstrip("Z"))
    valid = datetime.fromisoformat(licence["valid_until"].rstrip("Z"))
    plan_end = datetime.fromisoformat(licence["plan_ends_at"].rstrip("Z"))
    assert valid - issued == timedelta(days=30)
    assert plan_end - issued > timedelta(days=300)

    # Any change to the licence breaks the signature.
    head, payload, sig = body["licence"].split(".")
    import base64
    import json as _json

    data = _json.loads(base64.urlsafe_b64decode(payload + "=="))
    data["valid_until"] = "2099-01-01T00:00:00Z"
    forged = base64.urlsafe_b64encode(_json.dumps(data).encode()).decode().rstrip("=")
    import jwt
    import pytest as _pytest

    with _pytest.raises(jwt.InvalidSignatureError):
        _licence(f"{head}.{forged}.{sig}")


def test_licence_ends_with_the_plan_and_reports_cancellation(admin):
    created = new_client(admin)
    client_id = created["client"]["id"]
    device = device_for(created)
    http.post(f"/api/admin/clients/{client_id}/subscriptions", headers=admin, json={"plan_id": plan(admin, 1)["id"]})
    licence = _licence(http.get("/api/pos/sync", headers=device).json()["licence"])
    assert licence["valid_until"] == licence["plan_ends_at"] or licence["valid_until"] < licence["plan_ends_at"]

    http.post(f"/api/admin/clients/{client_id}/subscriptions/cancel", headers=admin)
    licence = _licence(http.get("/api/pos/sync", headers=device).json()["licence"])
    assert licence["status"] == "cancelled"
    assert licence["valid_until"] <= licence["issued_at"]

    no_plan = new_client(admin)
    licence = _licence(pos_login(no_plan["client"]["username"], no_plan["password"]).json()["licence"])
    assert (licence["status"], licence["plan_ends_at"]) == ("none", None)


def test_admin_changes_are_announced_to_the_clients_open_connections(admin):
    import asyncio

    from app import live

    created = new_client(admin)
    client_id = created["client"]["id"]
    other = new_client(admin)

    async def scenario():
        queue, unsubscribe = live.subscribe(client_id)
        other_queue, unsubscribe_other = live.subscribe(other["client"]["id"])
        try:
            assert live.connections(client_id) == 1
            changes = [
                lambda: http.post(f"/api/admin/clients/{client_id}/subscriptions", headers=admin, json={"plan_id": plan(admin, 1)["id"]}),
                lambda: http.post(f"/api/admin/clients/{client_id}/subscriptions/cancel", headers=admin),
                lambda: http.put(f"/api/admin/clients/{client_id}", headers=admin, json={"config": {"business_name": "Renamed"}}),
                lambda: http.post(f"/api/admin/clients/{client_id}/items", headers=admin, json={"code": "N", "name": "New", "price": 1}),
                lambda: http.post(f"/api/admin/clients/{client_id}/reset-password", headers=admin),
            ]
            for change in changes:
                await asyncio.to_thread(change)
                assert await asyncio.wait_for(queue.get(), timeout=5) == "changed"
            # Another client's PC hears nothing.
            assert other_queue.empty()
        finally:
            unsubscribe()
            unsubscribe_other()
        assert live.connections(client_id) == 0

    asyncio.run(scenario())


def test_add_months_clamps_to_month_end():
    from datetime import datetime

    assert add_months(datetime(2026, 1, 31), 1) == datetime(2026, 2, 28)
    assert add_months(datetime(2026, 10, 13), 3) == datetime(2027, 1, 13)
    assert add_months(datetime(2024, 2, 29), 12) == datetime(2025, 2, 28)
    # 30 Jan 20:00 UTC is already 31 Jan in Pakistan, so it ends on 28 Feb there.
    assert add_months(datetime(2026, 1, 30, 20, 0), 1) == datetime(2026, 2, 27, 20, 0)


# ── Production settings ─────────────────────────────────────────────────────


def test_production_refuses_development_defaults():
    from app.config import Settings

    with pytest.raises(ValueError) as err:
        Settings(_env_file=None, environment="production", database_url="sqlite:///./x.db")
    message = str(err.value)
    for problem in ("JWT_SECRET", "ADMIN_PASSWORD", "DATABASE_URL", "LICENCE_PRIVATE_KEY", "CORS_ORIGINS"):
        assert problem in message

    ok = Settings(
        _env_file=None,
        environment="production",
        jwt_secret="x" * 40,
        admin_password="A-strong-password-1",
        database_url="postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/pos?sslmode=require",
        licence_private_key="-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
        cors_origins="https://admin.compliance.pk",
    )
    assert ok.is_production


def test_neon_urls_use_the_bundled_driver():
    from app.database import _normalise

    assert _normalise("postgresql://u:p@host/db?sslmode=require") == "postgresql+psycopg://u:p@host/db?sslmode=require"
    assert _normalise("postgres://u:p@host/db") == "postgresql+psycopg://u:p@host/db"
    assert _normalise("sqlite:///./x.db") == "sqlite:///./x.db"


def test_a_one_line_licence_key_is_accepted(monkeypatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from app import licence
    from app.config import get_settings

    pem = Ed25519PrivateKey.generate().private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    monkeypatch.setattr(get_settings(), "licence_private_key", pem.strip().replace("\n", "\\n"))
    licence._private_key.cache_clear()
    try:
        assert licence.public_key_pem().startswith("-----BEGIN PUBLIC KEY-----")
    finally:
        monkeypatch.undo()
        licence._private_key.cache_clear()


# ── Invoice backup ──────────────────────────────────────────────────────────


def sample_invoice(usin, status="fiscalized", **fields):
    invoice = {
        "usin": usin,
        "invoice_type": 1,
        "created_at": "2026-10-15 03:08:36",
        "payment_mode": 1,
        "total_quantity": 1,
        "total_sale_value": 2000,
        "total_bill": 2000,
        "status": status,
        "fbr_invoice_number": f"822992FJ{usin}*test*" if status == "fiscalized" else "",
        "fbr_code": "100" if status == "fiscalized" else "",
        "fiscalized_at": "2026-10-15 03:08:37" if status == "fiscalized" else "",
        "pos_id": "822992",
        "mode": "fbr",
        "environment": "test",
        "attempts": 1,
        "items": [
            {
                "item_code": "CONS", "item_name": "Consultation", "pct_code": "98151000",
                "quantity": 1, "unit_price": 2000, "tax_rate": 0, "sale_value": 2000,
                "tax_charged": 0, "total_amount": 2000, "invoice_type": 1,
            }
        ],
    }
    invoice.update(fields)
    return invoice


def billing_device(admin):
    created = new_client(admin, usin_prefix="KC")
    token = pos_login(created["client"]["username"], created["password"]).json()["token"]
    return created["client"]["id"], {"Authorization": f"Bearer {token}"}


def upload(device, invoices, usin_seq=0):
    resp = http.post("/api/pos/data/sync", headers=device, json={"usin_seq": usin_seq, "invoices": invoices})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_invoices_are_backed_up_and_restored_on_a_new_computer(admin):
    client_id, device = billing_device(admin)
    result = upload(device, [sample_invoice("KC000001"), sample_invoice("KC000002", "queued")], usin_seq=2)
    assert result["invoices_saved"] == ["KC000001", "KC000002"]
    assert result["invoice_errors"] == []
    # Sending the same invoices again (lost answer) changes nothing.
    assert upload(device, [sample_invoice("KC000001")])["invoices_saved"] == ["KC000001"]

    restored = http.get("/api/pos/invoices", headers=device).json()
    assert [i["usin"] for i in restored["invoices"]] == ["KC000001", "KC000002"]
    assert restored["next_after_id"] is None
    first = restored["invoices"][0]
    assert first["fbr_invoice_number"] == "822992FJKC000001*test*"
    assert first["items"][0]["pct_code"] == "98151000"

    # Pages: one at a time.
    page = http.get("/api/pos/invoices?limit=1", headers=device).json()
    assert len(page["invoices"]) == 1 and page["next_after_id"] is not None
    rest = http.get(f"/api/pos/invoices?after_id={page['next_after_id']}", headers=device).json()
    assert [i["usin"] for i in rest["invoices"]] == ["KC000002"]

    detail = http.get(f"/api/admin/clients/{client_id}", headers=admin).json()
    assert detail["last_backup_at"] is not None


def test_an_accepted_invoice_is_never_turned_back(admin):
    _, device = billing_device(admin)
    upload(device, [sample_invoice("KC000001", "queued")])
    upload(device, [sample_invoice("KC000001")])  # FBR accepted it
    upload(device, [sample_invoice("KC000001", "unconfirmed", last_error="late copy")])
    invoice = http.get("/api/pos/invoices", headers=device).json()["invoices"][0]
    assert invoice["status"] == "fiscalized"
    assert invoice["fbr_invoice_number"] == "822992FJKC000001*test*"
    # Lines are replaced, not added to, when an invoice is sent again.
    assert len(invoice["items"]) == 1


def test_one_bad_invoice_does_not_block_the_others(admin):
    _, device = billing_device(admin)
    result = upload(device, [sample_invoice("KC000001", created_at="yesterday"), sample_invoice("KC000002")])
    assert result["invoices_saved"] == ["KC000002"]
    assert [e["usin"] for e in result["invoice_errors"]] == ["KC000001"]


def test_clients_never_see_each_others_invoices(admin):
    a_id, a = billing_device(admin)
    b_id, b = billing_device(admin)
    upload(a, [sample_invoice("KC000001", buyer_name="Patient A")])
    upload(b, [sample_invoice("KC000001", buyer_name="Patient B")])  # same number, other client
    assert [i["buyer_name"] for i in http.get("/api/pos/invoices", headers=a).json()["invoices"]] == ["Patient A"]
    assert [i["buyer_name"] for i in http.get("/api/pos/invoices", headers=b).json()["invoices"]] == ["Patient B"]
    a_rows = http.get(f"/api/admin/clients/{a_id}/invoices", headers=admin).json()["rows"]
    assert [r["buyer_name"] for r in a_rows] == ["Patient A"]
    # An invoice of client A is not reachable under client B.
    assert http.get(f"/api/admin/clients/{b_id}/invoices/{a_rows[0]['id']}", headers=admin).status_code == 404
    # The desktop's restore needs a desktop login.
    assert http.get("/api/pos/invoices", headers=admin).status_code == 401


def test_portal_lists_filters_and_summarises_invoices(admin):
    from app.serializers import PKT_OFFSET

    client_id, device = billing_device(admin)
    today = (utcnow() + PKT_OFFSET).strftime("%Y-%m-%d")
    upload(device, [
        sample_invoice("KC000001", created_at=f"{today} 09:00:00"),
        sample_invoice("KC000002", created_at=f"{today} 10:00:00", buyer_name="Ali"),
        sample_invoice("KC000003", created_at=f"{today} 11:00:00", invoice_type=3, ref_usin="KC000001"),
        sample_invoice("KC000004", "queued", created_at=f"{today} 12:00:00"),
    ])
    url = f"/api/admin/clients/{client_id}/invoices"
    body = http.get(url, headers=admin).json()
    assert body["total"] == 4
    assert [r["usin"] for r in body["rows"]] == ["KC000004", "KC000003", "KC000002", "KC000001"]
    assert "fbr_response" not in body["rows"][0] and "items" not in body["rows"][0]
    summary = body["summary"]
    assert summary["today"] == {"sales": 2, "returns": 1, "net": 2000.0}
    assert summary["by_status"] == {"fiscalized": 3, "queued": 1}
    assert summary["last_invoice_at"] == f"{today} 12:00:00"

    assert http.get(f"{url}?status=queued", headers=admin).json()["total"] == 1
    assert [r["usin"] for r in http.get(f"{url}?search=ali", headers=admin).json()["rows"]] == ["KC000002"]
    paged = http.get(f"{url}?limit=2&offset=2", headers=admin).json()
    assert [r["usin"] for r in paged["rows"]] == ["KC000002", "KC000001"]

    one = http.get(f"{url}/{body['rows'][1]['id']}", headers=admin).json()
    assert one["ref_usin"] == "KC000001" and one["items"][0]["item_code"] == "CONS"
