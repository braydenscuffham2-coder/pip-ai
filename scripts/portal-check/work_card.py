#!/usr/bin/env python3
"""Opens the Portal's background-work card in a real browser with a faked server, at 360px and 1280px.

No sign-in, no database and no network calls to Pip: every pip-portal request is answered here, so this checks the
page (public/portal.html), not the server.

  python3 scripts/portal-check/work_card.py <base url> [vercel share value]
"""
import json, os, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
BIZ = "11111111-1111-4111-8111-111111111111"
ASK, SIGNIN, DONE = "33333333-3333-4333-8333-333333333331", "33333333-3333-4333-8333-333333333332", "33333333-3333-4333-8333-333333333333"
PIXEL = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

def business(w):
    work = [] if w["role"] == "staff" else [
        {"id": ASK, "kind": "screen", "title": "Add a refill request for Pickle", "status": w["ask"], "outcome": "needs_owner", "summary": "Pip is ready to press Add refill request.", "created_at": "2026-11-27T02:00:00Z", "finished_at": None,
         "pending": {"label": "Add refill request", "form": {"patient": "Pickle", "medication": "Heartgard Plus", "quantity": "6"}} if w["ask"] == "waiting_approval" else None},
        {"id": SIGNIN, "kind": "signin_check", "title": "Check the sign-in to Maple Street Vet", "status": w["signin"], "outcome": "needs_owner", "summary": "The saved login for Maple Street Vet did not work. The password may have changed. Open your Portal and sign in to Maple Street Vet again.", "created_at": "2026-11-27T01:00:00Z", "finished_at": None, "pending": None},
        {"id": DONE, "kind": "screen", "title": "Read Juniper's record", "status": "done", "outcome": "ok", "summary": "Species: Cat. Owner: Marcus Oyelaran. Reminders: on. I changed nothing.", "created_at": "2026-11-27T00:30:00Z", "finished_at": "2026-11-27T00:30:08Z", "pending": None}]
    return {"role": w["role"], "business": {"id": BIZ, "name": "TEST Fork", "domain": "testfork.example", "industry": "restaurant", "state": "ID", "status": "active", "quote": None, "price_accepted_at": "2026-11-20T00:00:00Z", "timezone": "America/Boise", "health_lane": False, "terms_version": "2026-11"},
            "checklist": [], "agents": [], "people": [], "issues": [], "phone": None, "texting": None, "rules": [], "health_missing": [], "agreements": [], "extra_tools": [], "setup_unlocked": True, "terms_url": None, "terms_version": "2026-11",
            "vault_open": False, "connect_on": False, "fresh": True, "setup_on": False, "setups": [], "operate_on": False, "work": work}

def serve(w):
    def handle(route):
        req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
        try: body = json.loads(req.post_data or "{}")
        except Exception: pass
        w["calls"].append((req.method, path, body)); out, status = {"ok": True}, 200
        if path == "pip-portal/me": out = {"email": "owner@example.test", "founder": False, "businesses": [{"id": BIZ, "name": "TEST Fork"}]}
        elif path == f"pip-portal/business/{BIZ}": out = business(w)
        elif path == f"pip-portal/business/{BIZ}/work":
            a = body.get("action")
            if a == "approve": w["ask"] = "queued"
            elif a == "decline": w["ask"] = "stopped"
            elif a == "resume": w["signin"] = "queued"
            elif a == "shot": out = {"ok": True, "shot": PIXEL}
        elif path.startswith("pip-portal-ops/"): out = {}
        route.fulfill(status=status, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(out))
    return handle

SESSION = json.dumps({"access_token": "h.e30.s", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"id": "u-owner", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}})
INIT = "try{localStorage.setItem('sb-qqaikvgjzzcdwumnyspb-auth-token',%s)}catch(e){}" % json.dumps(SESSION)
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)
proxy = os.environ.get("HTTPS_PROXY")

with sync_playwright() as p:
    b = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1"} if proxy else None)
    for width in (360, 1280):
        def page(w):
            ctx = b.new_context(viewport={"width": width, "height": 800}); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
            pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)[:200]))
            pg.route("**/functions/v1/**", serve(w)); pg.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
            if SHARE: pg.goto(f"{BASE}/?_vercel_share={SHARE}", wait_until="domcontentloaded")
            pg.goto(f"{BASE}/portal.html?b={BIZ}", wait_until="load"); pg.wait_for_timeout(2500)
            return ctx, pg, errs
        fits = lambda pg: not pg.evaluate("()=>document.documentElement.scrollWidth>window.innerWidth+1")
        text = lambda pg: pg.evaluate("()=>document.body.innerText")
        tag = f"[{width}px] "

        # 1. the owner lands on the team tab and sees what needs them first
        w = {"role": "owner", "ask": "waiting_approval", "signin": "waiting_owner", "calls": []}; ctx, pg, errs = page(w)
        t = text(pg)
        check("Pip needs you for this" in t, tag + "a job that needs the owner is shown where they land")
        check("Heartgard Plus" in t and "Pickle" in t and "Add refill request" in t, tag + "the yes shows the button and every value Pip filled in")
        check("Nothing is saved until you say yes" in t, tag + "it says nothing is saved before the yes")
        check("Read Juniper" not in t, tag + "finished work is not mixed into what needs them")
        check(fits(pg), tag + "the card fits the width")
        pg.locator('[data-k="work-shot"]').click(); pg.wait_for_timeout(1200)
        check(pg.locator('img[alt^="The screen as Pip saw it"]').count() == 1, tag + "the owner can look at the screen Pip saw")
        pg.locator('[data-k="work-yes"]').click(); pg.wait_for_timeout(2500)
        check(("POST", f"pip-portal/business/{BIZ}/work", {"job": ASK, "action": "approve"}) in w["calls"], tag + "yes sends exactly one approval for that job")
        check("Nothing is saved until you say yes" not in text(pg), tag + "after the yes it no longer asks")
        pg.locator('[data-k="work-resume"]').click(); pg.wait_for_timeout(2500)
        check(("POST", f"pip-portal/business/{BIZ}/work", {"job": SIGNIN, "action": "resume"}) in w["calls"], tag + "carry on is sent for the sign-in job")
        check(not errs, tag + f"owner flow: console clean {errs[:2]}"); ctx.close()

        # 2. no
        w = {"role": "owner", "ask": "waiting_approval", "signin": "queued", "calls": []}; ctx, pg, errs = page(w)
        pg.locator('[data-k="work-no"]').click(); pg.wait_for_timeout(2500)
        check(("POST", f"pip-portal/business/{BIZ}/work", {"job": ASK, "action": "decline"}) in w["calls"], tag + "no sends a decline, not an approval")
        check(not any(c[2].get("action") == "approve" for c in w["calls"]), tag + "no never approves"); ctx.close()

        # 3. the full list sits in the setup tab, and staff see none of it
        w = {"role": "owner", "ask": "queued", "signin": "queued", "calls": []}; ctx, pg, errs = page(w)
        check("Pip needs you for this" not in text(pg), tag + "nothing waiting: nothing is pushed at the owner")
        pg.locator('[data-k$="-setup"]:visible').first.click(); pg.wait_for_timeout(1500)
        t = text(pg); check("What Pip did while you were away" in t and "Species: Cat" in t, tag + "finished work is listed in plain words")
        check(fits(pg), tag + "the list fits the width"); check(not errs, tag + f"list: console clean {errs[:2]}"); ctx.close()
        w = {"role": "staff", "ask": "waiting_approval", "signin": "waiting_owner", "calls": []}; ctx, pg, errs = page(w)
        check("Pip needs you for this" not in text(pg) and pg.locator('[data-k="work-yes"]').count() == 0, tag + "staff cannot approve"); ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
