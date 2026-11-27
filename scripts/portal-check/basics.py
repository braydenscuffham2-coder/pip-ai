#!/usr/bin/env python3
"""The "What your team knows" card on the Portal's Setup tab (public/portal.html) in a real browser with a faked server,
at 360px and 1280px: an owner types the basics once, they are saved through one route, and staff can read them only.

  python3 scripts/portal-check/basics.py <base url> [vercel share value]
"""
import json, os, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
SESSION = json.dumps({"access_token": "h.e30.s", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"id": "u-owner", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}})
INIT = "try{localStorage.setItem('sb-qqaikvgjzzcdwumnyspb-auth-token',%s)}catch(e){}" % json.dumps(SESSION)
BIZ = "11111111-1111-4111-8111-111111111111"
HOSTILE = '<img src=x onerror="window.__pwned=1"> Dogs welcome on the patio.'
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)
proxy = os.environ.get("HTTPS_PROXY")

def business(role, basics):
    return {"role": role, "business": {"id": BIZ, "name": "TEST Fork", "domain": "testfork.example", "industry": "restaurant", "state": "ID", "status": "active", "quote": None, "price_accepted_at": "2026-11-20T00:00:00Z", "timezone": "America/Boise", "basics": basics},
            "checklist": [], "agents": [], "people": [], "issues": [], "phone": None, "texting": None, "rules": [], "health_missing": [], "agreements": [], "extra_tools": [], "setup_unlocked": True, "terms_url": None, "terms_version": None,
            "vault_open": False, "connect_on": False, "fresh": True, "setup_on": False, "setups": [], "operate_on": False, "work": [], "doors": [], "pieces": [], "notes": []}

with sync_playwright() as p:
    b = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1"} if proxy else None)
    for width in (360, 1280):
        tag = f"[{width}px] "; calls = []; state = {"role": "owner", "basics": {}}
        def handle(route):
            req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
            try: body = json.loads(req.post_data or "{}")
            except Exception: pass
            calls.append((req.method, path, body)); out, status = {"ok": True}, 200
            if path == "pip-portal/me": out = {"email": "owner@example.test", "founder": False, "businesses": [{"id": BIZ, "name": "TEST Fork"}]}
            elif path == f"pip-portal/business/{BIZ}": out = business(state["role"], state["basics"])
            elif path == f"pip-portal/business/{BIZ}/basics": state["basics"] = body.get("basics") or {}; out = {"ok": True, "basics": state["basics"]}
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
        text = lambda pg: pg.evaluate("()=>document.body.innerText")
        pwned = lambda pg: pg.evaluate("()=>window.__pwned===1 || !!document.querySelector('img[src=\"x\"]')")
        def setup(pg):
            pg.locator('[role="tab"]:visible', has_text="Setup").first.click(); pg.wait_for_timeout(900)
        card_sel = 'section[aria-label="What your team knows"]'

        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}"); setup(pg)
        card = pg.locator(card_sel)
        check(card.count() == 1 and "Tell your team the basics" in card.inner_text(), tag + "owner: an empty card asks for the basics")
        check(card.locator("input, textarea").count() == 8, tag + "owner: eight boxes, one per fact")
        labelled = pg.evaluate("""(sel)=>[...document.querySelectorAll(sel+' input,'+sel+' textarea')].every(e=>e.id && document.querySelector('label[for="'+e.id+'"]') && e.maxLength>0)""", card_sel)
        check(labelled, tag + "owner: every box has a label and a length limit")
        check(fits(pg), tag + "owner: the page fits the width")
        lay = pg.evaluate("""(sel)=>{const c=document.querySelector(sel), cr=c.getBoundingClientRect(); let out=0, small=0; c.querySelectorAll('input,textarea,button,label').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width&&(r.left<cr.left-1||r.right>cr.right+1)) out++;}); c.querySelectorAll('input,textarea,button').forEach(e=>{const r=e.getBoundingClientRect(); if(r.height<40) small++;}); return {out, small};}""", card_sel)
        check(lay["out"] == 0, tag + "owner: nothing spills outside the card")
        check(lay["small"] == 0, tag + "owner: every box and the button is tall enough to tap")
        pg.fill("#kn-hours", "Tuesday to Sunday, 5 pm to 9 pm. Closed Monday."); pg.fill("#kn-parking", "Free lot behind the building."); pg.fill("#kn-notes", HOSTILE); pg.fill("#kn-website", "   ")
        card.locator('[data-k="kn-save"]').click(); pg.wait_for_timeout(2200)
        sent = [c for c in calls if c[1] == f"pip-portal/business/{BIZ}/basics"]
        check(len(sent) == 1 and sent[0][2] == {"basics": {"hours": "Tuesday to Sunday, 5 pm to 9 pm. Closed Monday.", "parking": "Free lot behind the building.", "notes": HOSTILE}}, tag + "owner: Save sends only the boxes that were filled, once")
        card = pg.locator(card_sel)
        check("The basics your team answers from" in card.inner_text() and "3 of 8" in card.inner_text(), tag + "owner: after saving, the card says how much the team knows")
        check(pg.input_value("#kn-hours").startswith("Tuesday to Sunday") and pg.input_value("#kn-notes") == HOSTILE and not pwned(pg), tag + "owner: what was typed comes back as plain text and never runs")
        check(not errs, tag + f"owner: console clean {errs[:2]}"); ctx.close()

        state["role"] = "staff"; calls.clear()
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}"); setup(pg)
        t = text(pg)
        check("Tuesday to Sunday, 5 pm to 9 pm" in t and pg.locator("#kn-hours").count() == 0 and pg.locator('[data-k="kn-save"]').count() == 0, tag + "staff: can read the basics and cannot change them")
        check("<img src=x" in t and not pwned(pg), tag + "staff: a note is shown as plain text and never runs")
        check(fits(pg), tag + "staff: the page fits the width")
        check(not errs, tag + f"staff: console clean {errs[:2]}"); ctx.close()

        state["basics"] = {}; calls.clear()
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}"); setup(pg)
        check(pg.locator('[data-k="knows"]').count() == 0, tag + "staff: with nothing typed yet there is no card")
        ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
