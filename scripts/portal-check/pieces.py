#!/usr/bin/env python3
"""Pieces in a real browser with a faked server, at 360px and 1280px: the public page of a piece Pip built
(public/piece.html) and the "Built for you by Pip" card in the Portal (public/portal.html).

  python3 scripts/portal-check/pieces.py <base url> [vercel share value]
"""
import json, os, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
BIZ, PID, R1, R2 = "11111111-1111-4111-8111-111111111111", "55555555-5555-4555-8555-555555555551", "66666666-6666-4666-8666-666666666661", "66666666-6666-4666-8666-666666666662"
HOSTILE = '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=1</script> A house with tides in it.'
FORM = {"title": "Send in a staff pick", "intro": "Copy the note from your shelf card.", "done": "Thanks. It goes on the page once it is approved.",
        "fields": [{"id": "title", "label": "Book title", "type": "text", "required": True}, {"id": "picked_by", "label": "Picked by (first name)", "type": "text", "required": True}, {"id": "note", "label": "Why you love it", "type": "longtext", "required": True}, {"id": "shelf", "label": "Shelf", "type": "choice", "options": ["Fiction", "Kids"]}]}
PAGE = {"title": "Staff picks", "intro": "What we are reading.", "empty": "New picks are on the way.", "fields": [{"id": "title", "label": "Book title"}, {"id": "picked_by", "label": "Picked by (first name)"}, {"id": "note", "label": "Why you love it"}],
        "items": [{"title": "Piranesi", "picked_by": "Ana", "note": HOSTILE}, {"title": "The Overstory", "picked_by": "Marcus", "note": "Trees, and the people who notice them."}]}
PIECE = {"id": PID, "label": "Staff picks", "does": "Staff send in the books they are recommending, and the approved ones show on a public picks page.", "status": "staged", "stages": ["sent in", "on the page", "retired"],
         "fields": [{"id": "title", "label": "Book title", "type": "text"}, {"id": "picked_by", "label": "Picked by (first name)", "type": "text"}, {"id": "note", "label": "Why you love it", "type": "longtext"}, {"id": "shelf", "label": "Shelf", "type": "choice", "options": ["Fiction", "Kids"]}],
         "by_stage": {"sent in": 1, "on the page": 1}, "has_form": True, "has_page": True, "public_stages": ["on the page"], "report": {"every": "week", "at": "08:00"}, "page": "https://www.hirepip.com/piece.html?p=" + PID}
RECORDS = [{"id": R1, "ref": "K7M2QX", "stage": "sent in", "data": {"title": "Piranesi", "picked_by": "Ana", "note": HOSTILE}, "source": "form", "updated_at": "2026-11-27T04:00:00Z"},
           {"id": R2, "ref": "B3T9WD", "stage": "on the page", "data": {"title": "The Overstory", "picked_by": "Marcus", "note": "Trees."}, "source": "owner", "updated_at": "2026-11-27T03:00:00Z"}]
SESSION = json.dumps({"access_token": "h.e30.s", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"id": "u-owner", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}})
INIT = "try{localStorage.setItem('sb-qqaikvgjzzcdwumnyspb-auth-token',%s)}catch(e){}" % json.dumps(SESSION)
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)
proxy = os.environ.get("HTTPS_PROXY")

def business(role):
    return {"role": role, "business": {"id": BIZ, "name": "TEST Books", "domain": "testbooks.example", "industry": "bookstore", "state": "AZ", "status": "active", "quote": None, "price_accepted_at": "2026-11-20T00:00:00Z", "timezone": "America/Phoenix", "health_lane": False, "terms_version": "2026-11"},
            "checklist": [], "agents": [], "people": [], "issues": [], "phone": None, "texting": None, "rules": [], "health_missing": [], "agreements": [], "extra_tools": [], "setup_unlocked": True, "terms_url": None, "terms_version": "2026-11",
            "vault_open": False, "connect_on": False, "fresh": True, "setup_on": False, "setups": [], "operate_on": False, "work": [], "doors": [], "pieces": [PIECE]}

with sync_playwright() as p:
    b = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1"} if proxy else None)
    for width in (360, 1280):
        tag = f"[{width}px] "; calls = []; state = {"role": "owner"}
        def handle(route):
            req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
            try: body = json.loads(req.post_data or "{}")
            except Exception: pass
            calls.append((req.method, path, body)); out, status = {"ok": True}, 200
            if path == f"pip-piece/p/{PID}" and req.method == "GET": out = {"ok": True, "piece": {"id": PID, "business": "TEST Books", "label": "Staff picks", "test": True, "form": FORM, "page": PAGE}}
            elif path == f"pip-piece/p/{PID}":
                if not body.get("title"): out, status = {"ok": False, "error": "missing", "field": "title"}, 400
                else: out = {"ok": True, "ref": "N4P8RC"}
            elif path.startswith("pip-piece/p/"): out, status = {"ok": False, "error": "not_found"}, 404
            elif path == "pip-portal/me": out = {"email": "owner@example.test", "founder": False, "businesses": [{"id": BIZ, "name": "TEST Books"}]}
            elif path == f"pip-portal/business/{BIZ}": out = business(state["role"])
            elif path == f"pip-portal/business/{BIZ}/piece" and body.get("action") == "list": out = {"ok": True, "records": RECORDS}
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
        pwned = lambda pg: pg.evaluate("()=>window.__pwned===1 || !!document.querySelector('img[src=\"x\"]')")

        # 1. the public page of a piece
        ctx, pg, errs = page(f"{BASE}/piece.html?p={PID}")
        t = text(pg)
        check("Staff picks" in t and "Piranesi" in t and "The Overstory" in t and "TEST BOOKS" in t.upper(), tag + "the public page shows the business and its approved records")
        check("<img src=x" in t and not pwned(pg), tag + "markup a person typed is shown as plain text and never runs")
        check("[object" not in t and "A house with tides in it." in t and "WHY YOU LOVE IT" in t.upper(), tag + "every listed field of a record is shown with its label")
        check(pg.locator("#test").is_visible(), tag + "a piece that is not live says Test")
        check("run by Pip, an AI team" in t and pg.locator('footer a[href="/privacy"]').count() == 1, tag + "it says Pip is an AI team and links the privacy page")
        check(fits(pg), tag + "the public page fits the width")
        pg.get_by_role("button", name="Send").click(); pg.wait_for_timeout(1000)
        check("Please fill in this field: Book title" in text(pg), tag + "the form names a missing field")
        pg.fill("#f-title", "Braiding Sweetgrass"); pg.fill("#f-picked_by", "Dana"); pg.fill("#f-note", "Read it slowly."); pg.select_option("#f-shelf", "Fiction")
        pg.get_by_role("button", name="Send").click(); pg.wait_for_timeout(1200)
        check("It goes on the page once it is approved. Your reference is N4P8RC." in text(pg), tag + "after sending: thanks, and a reference to keep")
        check("Braiding Sweetgrass" not in pg.locator("ul.items").inner_text(), tag + "what was just sent is not on the public list")
        check(not errs, tag + f"public page: console clean {errs[:2]}"); ctx.close()
        ctx, pg, errs = page(f"{BASE}/piece.html?p=55555555-5555-4555-8555-55555555ffff")
        check("This page is not open" in text(pg), tag + "an unknown piece says it is not open"); ctx.close()

        # 2. the Portal card, as an owner and as staff
        for role in ("owner", "staff"):
            state["role"] = role; calls.clear()
            ctx, pg, errs = page(f"{BASE}/portal.html?b={BIZ}", signed_in=True)
            t = text(pg)
            check("Built for you by Pip" in t and "Staff picks" in t and "1 sent in" in t, tag + f"{role}: the piece and its counts show on the team tab")
            pg.locator(f'[data-k="piece-open-{PID}"]').click(); pg.wait_for_timeout(1800)
            t = text(pg)
            check("K7M2QX" in t and "from the form" in t and "Nothing is ever deleted" in t, tag + f"{role}: the list shows each record with its reference")
            check("<img src=x" in t and not pwned(pg), tag + f"{role}: hostile markup in a record is plain text here too")
            check(fits(pg), tag + f"{role}: the list fits the width")
            pg.locator('[data-k="stage-K7M2QX"]').select_option("on the page"); pg.wait_for_timeout(1800)
            check(("POST", f"pip-portal/business/{BIZ}/piece", {"piece": PID, "action": "update", "record": R1, "stage": "on the page"}) in calls, tag + f"{role}: moving a stage sends one update for that record")
            pg.locator('[data-k="piece-add"]').click(); pg.wait_for_timeout(500)
            pg.fill("#pa-title", "Small Things Like These"); pg.fill("#pa-picked_by", "Priya"); pg.locator('[data-k="piece-add-save"]').click(); pg.wait_for_timeout(1800)
            adds = [c[2] for c in calls if c[2].get("action") == "add"]
            check(len(adds) == 1 and adds[0]["fields"]["title"] == "Small Things Like These" and adds[0]["stage"] == "sent in", tag + f"{role}: adding sends the fields once, at the first stage")
            check(not any(c[2].get("action") in ("delete", "remove") for c in calls) and "Delete" not in text(pg), tag + f"{role}: there is no delete anywhere")
            check(not errs, tag + f"{role}: console clean {errs[:2]}"); ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
