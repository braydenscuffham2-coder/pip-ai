"""Fixtures for the Portal harness, built from TEST Fork's real rows (read-only SQL, Nov 26)."""
import copy, json

BID = "38794f73-3586-475b-b428-da75f29e6a27"
BIZ2 = "56ed6ab3-1c77-4ab4-9759-beb0b84f17c8"
BIZ3 = "9a1d2c3b-0000-4000-8000-00000000b157"

BASE = json.load(open(__file__.replace("fx.py", "fx_base.json")))

QUOTE = {
    "monthly_usd": 480, "setup_usd": 150, "included_usd": 190,
    "rates": {"conversation": 0.15, "sms": 0.04, "voice_minute": 0.25},
    "summary": "Three teammates: private dining, floor flow and guest reviews.",
}


def business(scn: str, role: str):
    d = copy.deepcopy(BASE)
    b = d["business"]
    agents = d["agents"]
    cl = d["checklist"]
    issues = []
    if scn == "building":
        b["status"] = "building"
    if scn in ("priced", "setup", "live", "mixed"):
        b["quote"] = QUOTE
        b["status"] = "priced"
    if scn in ("setup", "live", "mixed"):
        b["price_accepted_at"] = "2026-11-20T18:00:00+00:00"
        b["terms_version"] = "2026-11-19"
        b["terms_accepted_at"] = "2026-11-20T18:00:00+00:00"
        b["status"] = "setup"
    if scn == "big":  # a full floor: twelve teammates, all live
        import uuid
        base = agents[:]; names = ["Nora", "Maya", "Ellie", "Theo", "Ruby", "Owen", "Iris", "Jude", "Lena"]
        for i, nm in enumerate(names):
            a = copy.deepcopy(base[i % len(base)]); a["spec_id"] = str(uuid.UUID(int=i + 1000)); a["teammate"] = nm; a["name"] = nm + " " + a["name"].split(" ", 1)[-1] if " " in a["name"] else nm
            agents.append(a)
        scn = "live"
    if scn in ("live", "mixed"):
        for s in cl:
            s["status"] = "active"; s["waiting_on"] = "nobody"
        for a in agents:
            a["status"] = "live"
        b["status"] = "live"
    if scn == "mixed":
        # one paused, one with a broken tool, one problem reported
        agents[1]["status"] = "paused"
        agents[1]["pauses"] = [{"reason": "owner", "detail": None, "at": "2026-11-25T16:00:00+00:00", "job": None}]
        cl[0]["status"] = "failed"; cl[0]["waiting_on"] = "you"
        issues = [{"id": 41, "body": "Cal sent a reply twice to one guest.", "status": "open", "created_at": "2026-11-26T15:00:00+00:00", "opened_by": "owner@example.test"}]
    for a in agents:
        a.setdefault("can", ["Answer private dining questions", "Hold a date on your calendar"])
        a.setdefault("cannot", ["Take deposits", "Change your menu or prices"])
    return {
        "role": role, "business": b, "checklist": cl, "agents": agents, "operate_on": False,
        "people": d["people"] if role != "staff" else [], "issues": issues,
        "phone": None, "texting": None, "rules": d["rules"], "health_missing": [], "agreements": [],
        "extra_tools": [], "setup_unlocked": bool(b["price_accepted_at"]),
        "terms_url": "https://www.hirepip.com/terms", "terms_version": "2026-11-19",
        "vault_open": False, "connect_on": True, "fresh": True, "setup_on": True, "setups": [],
    }


def me(role: str):
    if role == "founder":
        return {"email": "founder@example.test", "founder": True, "businesses": [
            {"id": BIZ2, "name": "Boise River Dental", "status": "building", "role": "owner"}]}
    return {"email": "owner@example.test", "founder": False, "businesses": [
        {"id": BID, "name": "TEST Fork (Pip end-to-end check)", "status": "live", "role": role}]}


def founder_businesses():
    return {"businesses": [
        {"id": BID, "name": "TEST Fork (Pip end-to-end check)", "domain": "boisefork.com", "industry": "restaurant", "state": "ID", "status": "live", "health_lane": False, "price_accepted_at": None, "quote": None, "created_at": "2026-11-16T04:24:46Z"},
        {"id": BIZ2, "name": "Boise River Dental", "domain": "boiseriverdental.com", "industry": "dental", "state": "ID", "status": "building", "health_lane": True, "price_accepted_at": None, "quote": None, "created_at": "2026-11-15T04:24:46Z"},
        {"id": BIZ3, "name": "Harbor Light Bistro", "domain": "harborlightbistro.com", "industry": "restaurant", "state": "ID", "status": "building", "health_lane": False, "price_accepted_at": None, "quote": None, "created_at": "2026-11-14T04:24:46Z"}],
        "settings": {"portal_invites": False, "portal_golive_gate": True}, "vendor_agreements": [],
        "issues": [{"id": 7, "business_id": BID, "body": "Marcus stopped a job (daily_line) and needs a person.", "status": "open", "created_at": "2026-11-18T17:49:52Z", "opened_by": "supervisor"}]}


def usage():
    return {"ok": True, "billing_status": "active", "monthly_usd": 480, "included_usd": 190,
            "rates": QUOTE["rates"], "started": "2026-11-16", "period_start": "2026-11-16", "period_end": "2026-12-16",
            "lines": [{"unit": "conversation", "qty": 612, "rate_usd": 0.15, "value_usd": 91.8},
                      {"unit": "sms", "qty": 455, "rate_usd": 0.04, "value_usd": 18.2},
                      {"unit": "voice_minute", "qty": 32, "rate_usd": 0.25, "value_usd": 8.0}],
            "value_usd": 118.0, "beyond_plan_usd": 0, "past_due_since": None}


def billing_status(scn):
    on = scn in ("live", "mixed")
    return {"ok": True, "card_on_file_at": "2026-11-20T18:05:00Z" if on else None, "card_hint": "Visa ending 4242" if on else None,
            "price_accepted": scn in ("setup", "live", "mixed"), "billing_status": "active" if on else "none"}
