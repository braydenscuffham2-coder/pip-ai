#!/usr/bin/env python3
"""The weekly notes card in the Portal (public/portal.html) in a real browser with a faked server, at 360px and 1280px:
what each teammate did, what went wrong, one suggestion, and two answers that change nothing by themselves.

  python3 scripts/portal-check/notes.py <base url> [vercel share value]
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

        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        t = text(pg)
        check("Notes from your team" in t and "Front Desk" in t and "Answered 41 messages" in t and "Week of November 16" in t, tag + "owner: each teammate's note shows with its week")
        check("What went wrong: 3 bookings stopped" in t, tag + "owner: what went wrong is said plainly")
        check("One suggestion:" in t and "<img src=x" in t and not pwned(pg), tag + "owner: a suggestion is shown as plain text and never runs")
        check("Nothing changes by itself" in t, tag + "owner: it says a suggestion changes nothing by itself")
        card = pg.locator('section[aria-label="Notes from your team"]')
        check(card.locator(f'[data-k="note-{N2}"] button').count() == 0, tag + "owner: a note with no suggestion has no buttons")
        check("You said: no thanks" in card.locator(f'[data-k="note-{N3}"]').inner_text() and card.locator(f'[data-k="note-{N3}"] button').count() == 0, tag + "owner: an answered suggestion shows the answer and no buttons")
        check(fits(pg), tag + "owner: the card fits the width")
        card.locator(f'[data-k="note-{N1}"] [data-k="note-yes"]').click(); pg.wait_for_timeout(2000)
        sent = [c for c in calls if c[1] == f"pip-portal/business/{BIZ}/note"]
        check(len(sent) == 1 and sent[0][2] == {"note": N1, "decision": "good_idea"}, tag + "owner: Good idea sends one answer for that note and nothing else")
        t = text(pg)
        check("You said: good idea. Nothing changes by itself." in t, tag + "owner: after answering, the card shows the answer")
        check(not any("/go" in c[1] or "golive" in c[1] or "spec" in c[1] for c in calls), tag + "owner: answering calls nothing that changes a teammate")
        check(not errs, tag + f"owner: console clean {errs[:2]}"); ctx.close()

        state["role"] = "staff"; calls.clear()
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        check("Notes from your team" not in text(pg), tag + "staff: the notes card is not shown")
        check(not errs, tag + f"staff: console clean {errs[:2]}"); ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
