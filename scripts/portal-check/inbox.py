#!/usr/bin/env python3
"""The "Messages from your team" card on the Portal's Team tab (public/portal.html) in a real browser with a faked server,
at 360px and 1280px: what a teammate passed to the owner is listed, new first; "Got it" marks one as seen and deletes
nothing; staff do not see it.

  python3 scripts/portal-check/inbox.py <base url> [vercel share value]
"""
import json, os, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
SESSION = json.dumps({"access_token": "h.e30.s", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"id": "u-owner", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}})
INIT = "try{localStorage.setItem('sb-qqaikvgjzzcdwumnyspb-auth-token',%s)}catch(e){}" % json.dumps(SESSION)
BIZ = "11111111-1111-4111-8111-111111111111"
HOSTILE = '<img src=x onerror="window.__pwned=1"> Caller asked about bringing a cake for twelve. Dana, 208-555-0142.'
NOW = time.time()
iso = lambda secs: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - secs))
INBOX = [
  {"id": 41, "kind": "notify_owner", "at": iso(120), "teammate": "Hallie", "channel": "voice", "said": {"summary": HOSTILE}, "urgent": False, "waiting": False, "seen": False},
  {"id": 40, "kind": "capture_lead", "at": iso(4000), "teammate": "Hallie", "channel": "web_chat", "said": {"name": "Sam Rivera", "phone": "208-555-0188", "email": "sam@customer.example", "need": "Rehearsal dinner for 30 on June 14 " + "x" * 60}, "urgent": False, "waiting": False, "seen": False},
  {"id": 39, "kind": "request_booking", "at": iso(90000), "teammate": "Hallie", "channel": "sms", "said": {"when": "Saturday at 7", "need": "Table for six", "contact": "208-555-0101"}, "urgent": True, "waiting": True, "seen": False},
  {"id": 38, "kind": "draft_for_approval", "at": iso(200000), "teammate": "Hallie", "channel": "email", "said": {"what": "Reply to Priya about the tasting", "text": "Hi Priya,\nWe would love to host your tasting."}, "urgent": False, "waiting": True, "seen": True},
]
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)
proxy = os.environ.get("HTTPS_PROXY")

def business(role, inbox):
    return {"role": role, "business": {"id": BIZ, "name": "TEST Fork", "domain": "testfork.example", "industry": "restaurant", "state": "ID", "status": "active", "quote": None, "price_accepted_at": "2026-11-20T00:00:00Z", "timezone": "America/Boise", "basics": {}},
            "checklist": [], "agents": [], "people": [], "issues": [], "phone": None, "texting": None, "rules": [], "health_missing": [], "agreements": [], "extra_tools": [], "setup_unlocked": True, "terms_url": None, "terms_version": None,
            "vault_open": False, "connect_on": False, "fresh": True, "setup_on": False, "setups": [], "operate_on": False, "work": [], "doors": [], "pieces": [], "notes": [], "inbox": inbox}

with sync_playwright() as p:
    b = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1"} if proxy else None)
    for width in (360, 1280):
        tag = f"[{width}px] "; calls = []; state = {"role": "owner", "inbox": json.loads(json.dumps(INBOX))}
        def handle(route):
            req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
            try: body = json.loads(req.post_data or "{}")
            except Exception: pass
            calls.append((req.method, path, body)); out, status = {"ok": True}, 200
            if path == "pip-portal/me": out = {"email": "owner@example.test", "founder": False, "businesses": [{"id": BIZ, "name": "TEST Fork"}]}
            elif path == f"pip-portal/business/{BIZ}": out = business(state["role"], [] if state["role"] == "staff" else state["inbox"])
            elif path == f"pip-portal/business/{BIZ}/inbox":
                for m in state["inbox"]:
                    if body.get("all") or m["id"] == body.get("id"): m["seen"] = body.get("seen", True) is not False
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
        sel = 'section[aria-label="Messages from your team"]'

        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        card = pg.locator(sel); t = card.inner_text() if card.count() else ""
        check(card.count() == 1 and "3 NEW" in t.upper() and "Messages from your team" in t, tag + "owner: the card is on the Team tab and says how many are new")
        check("Caller asked about bringing a cake" in t and "on a call" in t and "min ago" in t, tag + "owner: a message shows what was said, how it came in and when")
        check("<img src=x" in t and not pwned(pg), tag + "owner: a customer's words are shown as plain text and never run")
        check("Sam Rivera" in t and "208-555-0188" in t and "in website chat" in t, tag + "owner: a lead shows the name, the number and what they want")
        check("Hallie did not confirm this. It is yours to confirm with the customer." in t and "Urgent" in t, tag + "owner: a booking request says plainly that it was not confirmed")
        check(card.locator('[data-k="inbox-old"]').count() == 1 and not card.locator('[data-k="inbox-38"]').is_visible(), tag + "owner: one already seen is folded under Earlier")
        check(fits(pg), tag + "owner: the page fits the width")
        lay = pg.evaluate("""(sel)=>{const c=document.querySelector(sel), cr=c.getBoundingClientRect(); let out=0, small=0; c.querySelectorAll('p,dd,dt,button,span').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width&&(r.left<cr.left-1||r.right>cr.right+1)) out++;}); c.querySelectorAll('button').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width&&r.height<40) small++;}); return {out, small};}""", sel)
        check(lay["out"] == 0, tag + "owner: nothing spills outside the card, even a long unbroken line")
        check(lay["small"] == 0, tag + "owner: every button is tall enough to tap")
        card.locator('[data-k="inbox-41"] [data-k="inbox-seen"]').click(); pg.wait_for_timeout(2200)
        sent = [c for c in calls if c[1] == f"pip-portal/business/{BIZ}/inbox"]
        check(len(sent) == 1 and sent[0][2] == {"id": 41, "seen": True}, tag + "owner: Got it sends one mark for that message and nothing else")
        check(not any(c[0] == "DELETE" for c in calls), tag + "owner: nothing is deleted")
        t = pg.locator(sel).inner_text()
        check("2 NEW" in t.upper() and "Earlier (2)" in t, tag + "owner: after Got it the message moves under Earlier")
        pg.locator(sel + ' [data-k="inbox-all"]').click(); pg.wait_for_timeout(2200)
        t = pg.locator(sel).inner_text()
        check("ALL CAUGHT UP" in t.upper() and "Earlier (4)" in t, tag + "owner: Mark all as seen clears the new list")
        check(not errs, tag + f"owner: console clean {errs[:2]}"); ctx.close()

        state["role"] = "staff"; calls.clear()
        ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}")
        check(pg.locator(sel).count() == 0 and "Sam Rivera" not in text(pg), tag + "staff: the messages card is not shown")
        check(not errs, tag + f"staff: console clean {errs[:2]}"); ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
