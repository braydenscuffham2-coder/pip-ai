#!/usr/bin/env python3
"""Accessibility checks (axe-core, WCAG 2 A and AA) (public/portal.html) in a real browser with a faked server, at 360px and 1280px:
the signed-in Portal with a faked server, and every public page as it first loads. Fails on a serious or critical finding.

  python3 scripts/portal-check/axe.py <base url> [vercel share value]
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
        tag = f"[{width}px] "; calls = []; state = {"role": "owner", "notes": json.loads(json.dumps(NOTES))}
        def handle(route):
            req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
            try: body = json.loads(req.post_data or "{}")
            except Exception: pass
            calls.append((req.method, path, body)); out, status = {"ok": True}, 200
            if path == "pip-portal/me": out = {"email": "owner@example.test", "founder": False, "businesses": [{"id": BIZ, "name": "TEST Fork"}]}
            elif path == f"pip-portal/business/{BIZ}": out = business(state["role"], [] if state["role"] == "staff" else state["notes"])
            elif path == f"pip-portal/business/{BIZ}/note":
                for n in state["notes"]:
                    if n["id"] == body.get("note"): n["decision"] = body.get("decision")
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

        AXE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "node_modules", "axe-core", "axe.min.js")).read()
        def axe(pg, name):
            pg.add_script_tag(content=AXE)
            r = pg.evaluate("async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }); return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, where: v.nodes.slice(0, 2).map(x => x.target.join(' ')).join(' | ') })); }")
            bad = [v for v in r if v["impact"] in ("serious", "critical")]
            for v in r: print(f"     {tag}{name}: {v['impact']} {v['id']} x{v['n']}  {v['where'][:110]}")
            check(not bad, f"{tag}{name}: no serious or critical accessibility finding ({len(r)} lesser)")
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        axe(pg, "Portal, signed in (team tab)"); ctx.close()
        for path, name in [("/app.html", "Marketplace home"), ("/lock.html", "Lock it in"), ("/setup.html", "Setup page"), ("/talk.html", "Talk page"), ("/form.html", "Form page, empty"), ("/piece.html", "Piece page, empty")]:
            ctx = b.new_context(viewport={"width": width, "height": 800}); pg = ctx.new_page()
            pg.route("**/functions/v1/**", lambda r: r.fulfill(status=404, content_type="application/json", body="{}")); pg.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
            if SHARE: pg.goto(f"{BASE}/?_vercel_share={SHARE}", wait_until="domcontentloaded")
            try:
                pg.goto(BASE + path, wait_until="load"); pg.wait_for_timeout(2500); axe(pg, name)
            except Exception as e: check(False, f"{tag}{name}: could not be checked ({str(e)[:80]})")
            ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
