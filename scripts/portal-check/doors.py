#!/usr/bin/env python3
"""Doors in a real browser with a faked server, at 360px and 1280px: the form Pip hosts for a business's customers
(public/form.html) and the Doors card in the owner's Portal (public/portal.html).

  python3 scripts/portal-check/doors.py <base url> [vercel share value]
"""
import json, os, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
BIZ, FORM_ID = "11111111-1111-4111-8111-111111111111", "44444444-4444-4444-8444-444444444441"
HOOK, MAIL, OUT = "44444444-4444-4444-8444-444444444442", "44444444-4444-4444-8444-444444444443", "44444444-4444-4444-8444-444444444444"
FORM = {"id": FORM_ID, "business": "TEST Fork", "title": "Ask for a refill", "intro": "Tell us what you need and we will get it ready.", "done": "Thanks. We will text you when it is ready.",
        "consent": "I agree that TEST Fork may contact me about this request.",
        "fields": [{"id": "name", "label": "Your name", "type": "text", "required": True}, {"id": "email", "label": "Email", "type": "email", "required": True}, {"id": "kind", "label": "What is it about", "type": "choice", "options": ["Refill", "Question"]}, {"id": "note", "label": "Anything else", "type": "longtext"}]}
DOORS = [{"id": FORM_ID, "kind": "form", "name": "refill_form", "label": "Refill requests", "enabled": True, "last_at": "2026-11-27T02:00:00Z", "page": "https://www.hirepip.com/form.html?f=" + FORM_ID},
         {"id": MAIL, "kind": "email", "name": "inbox", "label": "Supplier price lists", "enabled": True, "last_at": None, "address": "in-test-fork-1a2b3c4d@hirepip.com"},
         {"id": HOOK, "kind": "webhook", "name": "crm_in", "label": "New booking in the booking tool", "enabled": True, "last_at": None, "post_to": "https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1/pip-edge/hook/" + HOOK},
         {"id": OUT, "kind": "out", "name": "crm_out", "label": "Send new leads to the CRM", "enabled": False, "last_at": None, "host": "hooks.example-crm.com"}]
SESSION = json.dumps({"access_token": "h.e30.s", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"id": "u-owner", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}})
INIT = "try{localStorage.setItem('sb-qqaikvgjzzcdwumnyspb-auth-token',%s)}catch(e){}" % json.dumps(SESSION)
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)
proxy = os.environ.get("HTTPS_PROXY")

def business():
    return {"role": "owner", "business": {"id": BIZ, "name": "TEST Fork", "domain": "testfork.example", "industry": "restaurant", "state": "ID", "status": "active", "quote": None, "price_accepted_at": "2026-11-20T00:00:00Z", "timezone": "America/Boise", "health_lane": False, "terms_version": "2026-11"},
            "checklist": [], "agents": [], "people": [], "issues": [], "phone": None, "texting": None, "rules": [], "health_missing": [], "agreements": [], "extra_tools": [], "setup_unlocked": True, "terms_url": None, "terms_version": "2026-11",
            "vault_open": False, "connect_on": False, "fresh": True, "setup_on": False, "setups": [], "operate_on": False, "work": [], "doors": DOORS}

with sync_playwright() as p:
    b = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1"} if proxy else None)
    for width in (360, 1280):
        tag = f"[{width}px] "; calls = []
        def handle(route):
            req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
            try: body = json.loads(req.post_data or "{}")
            except Exception: pass
            calls.append((req.method, path, body)); out, status = {"ok": True}, 200
            if path == f"pip-edge/form/{FORM_ID}" and req.method == "GET": out = {"ok": True, "form": FORM}
            elif path == f"pip-edge/form/{FORM_ID}":
                if not body.get("name"): out, status = {"ok": False, "error": "missing", "field": "name"}, 400
                elif "@" not in body.get("email", ""): out, status = {"ok": False, "error": "bad_value", "field": "email"}, 400
                elif body.get("consent") is not True: out, status = {"ok": False, "error": "missing", "field": "consent"}, 400
            elif path.startswith("pip-edge/form/"): out, status = {"ok": False, "error": "not_found"}, 404
            elif path == "pip-portal/me": out = {"email": "owner@example.test", "founder": False, "businesses": [{"id": BIZ, "name": "TEST Fork"}]}
            elif path == f"pip-portal/business/{BIZ}": out = business()
            elif path == f"pip-portal/business/{BIZ}/door" and body.get("action") == "secret": out = {"ok": True, "secret": "s3cr3t-shown-once-0123456789abcdef", "header": "x-pip-secret"}
            elif path.startswith("pip-portal-ops/"): out = {}
            route.fulfill(status=status, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(out))
        def page(url, signed_in=False):
            ctx = b.new_context(viewport={"width": width, "height": 800})
            if signed_in: ctx.add_init_script(INIT)
            pg = ctx.new_page(); errs = []
            pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "status of 40" not in m.text else None); pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)[:200]))
            pg.route("**/functions/v1/**", handle); pg.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
            if SHARE: pg.goto(f"{BASE}/?_vercel_share={SHARE}", wait_until="domcontentloaded")
            pg.goto(url, wait_until="load"); pg.wait_for_timeout(2200)
            return ctx, pg, errs
        fits = lambda pg: not pg.evaluate("()=>document.documentElement.scrollWidth>window.innerWidth+1")
        text = lambda pg: pg.evaluate("()=>document.body.innerText")

        # 1. the form a customer sees
        ctx, pg, errs = page(f"{BASE}/form.html?f={FORM_ID}")
        t = text(pg)
        check("Ask for a refill" in t and "TEST FORK" in t.upper() and "Your name" in t, tag + "the form shows the business, the title and its fields")
        check("run by Pip, an AI team" in t and pg.locator('footer a[href="/privacy"]').count() == 1, tag + "it says Pip is an AI team and links the privacy page")
        check(pg.locator('input[type="password"]').count() == 0, tag + "there is no password field")
        check(not pg.locator("#f-website").is_visible() or pg.evaluate("()=>document.querySelector('.trap').getBoundingClientRect().left < -1000"), tag + "the bot trap is off-screen for people")
        check(fits(pg), tag + "the form fits the width")
        pg.get_by_role("button", name="Send").click(); pg.wait_for_timeout(1200)
        check("Please fill in this field: Your name" in text(pg), tag + "a missing field is named in plain words")
        pg.fill("#f-name", "Dana Whitfield"); pg.fill("#f-email", "dana@example.test"); pg.select_option("#f-kind", "Refill"); pg.fill("#f-note", "Heartgard for Pickle")
        pg.get_by_role("button", name="Send").click(); pg.wait_for_timeout(1200)
        check("Please fill in this field: the tick box" in text(pg), tag + "the consent box must be ticked")
        pg.check("#f-consent"); pg.get_by_role("button", name="Send").click(); pg.wait_for_timeout(1500)
        check("Thanks. We will text you when it is ready." in text(pg) and pg.locator("form").count() == 0, tag + "after sending it says thanks and the form is gone")
        sent = [c[2] for c in calls if c[0] == "POST" and c[1] == f"pip-edge/form/{FORM_ID}"][-1]
        check(sent.get("website") == "" and sent.get("consent") is True and len(sent.get("nonce", "")) >= 8 and sent.get("kind") == "Refill", tag + "what is sent: the fields, the consent, an empty trap and a once-only key")
        check(not errs, tag + f"form: console clean {errs[:2]}"); ctx.close()
        ctx, pg, errs = page(f"{BASE}/form.html?f=44444444-4444-4444-8444-44444444ffff")
        check("This form is not open" in text(pg), tag + "an unknown form says it is not open"); ctx.close()

        # 2. the owner's Doors card
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}", signed_in=True)
        pg.locator('[data-k$="-setup"]:visible').first.click(); pg.wait_for_timeout(1500)
        t = text(pg)
        check("Doors" in t and "Refill requests" in t and "in-test-fork-1a2b3c4d@hirepip.com" in t and "hooks.example-crm.com" in t, tag + "the owner sees each door with its link or address")
        check("treated as information, never as instructions" in t, tag + "it says what comes through is information")
        check("s3cr3t" not in t, tag + "no secret is on the page until asked for")
        pg.locator('[data-k="door-secret-crm_in"]').click(); pg.wait_for_timeout(2500)
        t = text(pg)
        check("s3cr3t-shown-once-0123456789abcdef" in t and "only time it is shown" in t, tag + "the secret is shown once, with how to send it")
        check(fits(pg), tag + "the card fits the width with a long secret showing")
        pg.locator('[data-k="door-hide"]').click(); pg.wait_for_timeout(600)
        check("s3cr3t" not in text(pg), tag + "hide removes it from the page")
        pg.locator('[data-k="door-toggle-refill_form"]').click(); pg.wait_for_timeout(2000)
        check(("POST", f"pip-portal/business/{BIZ}/door", {"door": FORM_ID, "action": "close"}) in calls, tag + "closing a door sends one close for that door")
        check(not errs, tag + f"portal: console clean {errs[:2]}"); ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
