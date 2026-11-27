#!/usr/bin/env python3
"""The founder's pricing draft in the Portal (public/portal.html) in a real browser with a faked server, at 360px and 1280px:
one press fills the price card from the price book, nothing is saved until Save price, and owners never see the card.

  python3 scripts/portal-check/pricing_draft.py <base url> [vercel share value]
"""
import json, os, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
SESSION = json.dumps({"access_token": "h.e30.s", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"id": "u-owner", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}})
INIT = "try{localStorage.setItem('sb-qqaikvgjzzcdwumnyspb-auth-token',%s)}catch(e){}" % json.dumps(SESSION)
BIZ, N1, N2, N3 = "11111111-1111-4111-8111-111111111111", "77777777-7777-4777-8777-777777777771", "77777777-7777-4777-8777-777777777772", "77777777-7777-4777-8777-777777777773"
HOSTILE = '<img src=x onerror="window.__pwned=1"> Move the reminder text to 9am.'
NOTES = [{"id": N1, "week_start": "2026-11-16", "teammate": "Front Desk", "did": "Answered 41 messages and booked 12 tables.", "wrong": "3 bookings stopped because the calendar did not answer.",
          "proposal": {"change": HOSTILE, "why": "Three of the four stops happened before 9am."}, "decision": None},
         {"id": N2, "week_start": "2026-11-16", "teammate": "Review Asker", "did": "Sent 18 review requests, one to every customer who paid.", "wrong": None, "proposal": None, "decision": None},
         {"id": N3, "week_start": "2026-11-16", "teammate": "Night Host", "did": "Took 6 messages after closing.", "wrong": None, "proposal": {"change": "Ask for a phone number first.", "why": "Two people left none."}, "decision": "no_thanks"}]
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)
proxy = os.environ.get("HTTPS_PROXY")

def business(role, notes):
    return {"role": role, "business": {"id": BIZ, "name": "TEST Fork", "domain": "testfork.example", "industry": "restaurant", "state": "ID", "status": "active", "quote": None, "price_accepted_at": "2026-11-20T00:00:00Z", "timezone": "America/Boise"},
            "checklist": [], "agents": [], "people": [], "issues": [], "phone": None, "texting": None, "rules": [], "health_missing": [], "agreements": [], "extra_tools": [], "setup_unlocked": True, "terms_url": None, "terms_version": None,
            "vault_open": False, "connect_on": False, "fresh": True, "setup_on": False, "setups": [], "operate_on": False, "work": [], "doors": [], "pieces": [], "notes": notes}

with sync_playwright() as p:
    b = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1"} if proxy else None)
    for width in (360, 1280):
        tag = f"[{width}px] "; calls = []; state = {"founder": True, "fail": False}
        def handle(route):
            req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
            try: body = json.loads(req.post_data or "{}")
            except Exception: pass
            calls.append((req.method, path, body)); out, status = {"ok": True}, 200
            if path == "pip-portal/me": out = {"email": "owner@example.test", "founder": state["founder"], "businesses": [{"id": BIZ, "name": "TEST Fork"}]}
            elif path == f"pip-portal/business/{BIZ}": out = business("founder" if state["founder"] else "owner", []); out["business"]["price_accepted_at"] = None
            elif path == "pip-portal/founder/quote_draft":
                if state["fail"]: out, status = {"error": "no_teammates", "say": "This business has no teammates to price yet."}, 409
                else: out = {"ok": True, "monthly_usd": 124, "setup_usd": 0, "summary": "Hallie: website chat, $27.55 a month. Marcus: calendar booking, $46.55 a month. Pip base: $49 a month.", "flags": ["placeholder_costs"], "quote_id": "99999999-9999-4999-8999-999999999999", "teammates": 2}
            elif path.startswith("pip-portal-ops/"): out = {}
            route.fulfill(status=status, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(out))
        def page(url):
            ctx = b.new_context(viewport={"width": width, "height": 800}); ctx.add_init_script(INIT)
            pg = ctx.new_page(); errs = []
            pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "status of 40" not in m.text else None); pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)[:200]))
            pg.route("**/functions/v1/**", handle); pg.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
            if SHARE: pg.goto(f"{BASE}/?_vercel_share={SHARE}", wait_until="domcontentloaded")
            pg.goto(url, wait_until="load"); pg.wait_for_timeout(2200)
            return ctx, pg, errs
        fits = lambda pg: not pg.evaluate("()=>document.documentElement.scrollWidth>window.innerWidth+1")

        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        card = pg.locator('section[aria-label="Founder"]')
        check(card.count() == 1 and card.locator('[data-k="f-draft"]').count() == 1, tag + "founder: the price card has a Draft from the price book button")
        card.locator('[data-k="f-draft"]').click(); pg.wait_for_timeout(900)
        check(pg.input_value("#f-mo") == "124" and pg.input_value("#f-su") == "" and "Hallie: website chat" in pg.input_value("#f-sum"), tag + "founder: one press fills monthly, setup and what is included")
        note = card.locator('[data-k="f-draft-note"]').inner_text()
        check("2 teammates" in note and "Nothing is saved until you press Save price" in note and "placeholders" in note, tag + "founder: it says nothing is saved yet and that the costs are placeholders")
        check(not any(c[1] == "pip-portal/founder/quote" for c in calls), tag + "founder: drafting saved nothing")
        check(fits(pg), tag + "founder: the card fits the width")
        pg.fill("#f-mo", "129"); card.locator('[data-k="f-quote"]').click(); pg.wait_for_timeout(1500)
        saved = [c for c in calls if c[1] == "pip-portal/founder/quote"]
        check(len(saved) == 1 and saved[0][2]["quote"]["monthly_usd"] == 129 and saved[0][2]["quote"]["quote_id"] == "99999999-9999-4999-8999-999999999999" and "Hallie" in saved[0][2]["quote"]["summary"], tag + "founder: Save price sends the edited number, the words and which draft it came from")
        check(not errs, tag + f"founder: console clean {errs[:2]}"); ctx.close()

        state["fail"] = True; calls.clear()
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        pg.locator('[data-k="f-draft"]').click(); pg.wait_for_timeout(900)
        check("no teammates to price yet" in pg.locator('[data-k="f-draft-note"]').inner_text() and pg.input_value("#f-mo") == "", tag + "founder: a draft that cannot be made says why and leaves the boxes alone")
        ctx.close()

        state["founder"] = False; state["fail"] = False; calls.clear()
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        check(pg.locator('[data-k="f-draft"]').count() == 0 and pg.locator('section[aria-label="Founder"]').count() == 0, tag + "owner: no price card and no draft button")
        check(not any("quote_draft" in c[1] for c in calls), tag + "owner: the page never asks for a draft")
        check(not errs, tag + f"owner: console clean {errs[:2]}"); ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
