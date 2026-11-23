#!/usr/bin/env python3
"""Opens the Portal's operator review screen in a real browser with a faked server, at 360px and 1280px.

No sign-in, no database and no network calls to Pip: every pip-portal request is answered here from a small fake
world, so this checks the page (public/portal.html), not the server. The server side is tested in
supabase/functions/pip-portal/operate-approval.test.mjs.

  python3 scripts/portal-check/operator_screen.py <base url> [out dir]
  e.g. http://localhost:8377   or a Vercel preview address (add ?_vercel_share=... as a third argument)
"""
import json, os, re, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/")
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/portal-operator"
SHARE = sys.argv[3] if len(sys.argv) > 3 else ""
os.makedirs(OUT, exist_ok=True)
BIZ, HALLIE, RAE, JUNE = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222221", "22222222-2222-4222-8222-222222222222", "22222222-2222-4222-8222-222222222223"
day = lambda n: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + n * 86400))

def world(role="owner", lane=True, paused=False):
    return {"role": role, "lane": lane, "next_id": 10, "paused": paused, "calls": [],
            "approvals": {HALLIE: [], RAE: []}}

def business(w):
    mate = lambda sid, name, mate, role, op, status="sandbox": {"spec_id": sid, "name": name, "teammate": mate, "role": role, "status": "paused" if (w["paused"] and sid == RAE) else status, "needs": [],
        "pauses": [{"reason": "owner", "detail": ""}] if (w["paused"] and sid == RAE) else [], **({"operator": op} if (op and w["lane"]) else {})}
    return {"role": w["role"], "business": {"id": BIZ, "name": "TEST Fork", "domain": "testfork.example", "industry": "restaurant", "state": "ID", "status": "active", "quote": None, "price_accepted_at": day(-3), "terms_accepted_at": day(-3), "alert_prefs": {}},
            "checklist": [], "agents": [mate(HALLIE, "Weekly Post Desk", "Hallie", "Social posts", "content_social"), mate(RAE, "Every Customer Ask", "Rae", "Review requests", "review_requests", "live"), mate(JUNE, "Front Desk", "June", "Answers", None, "live")],
            "people": [], "issues": [], "phone": None, "texting": None, "rules": [], "health_missing": [], "agreements": [], "extra_tools": [], "setup_unlocked": True, "terms_url": None, "terms_version": None,
            "vault_open": False, "connect_on": False, "fresh": True, "setup_on": False, "setups": [], "operate_on": w["lane"]}

WORDS = {
    HALLIE: {"what": ["Posts three times a week about what is new at TEST Fork.", "It posts to facebook, at most 3 posts a week."], "needsYou": ["Approve the brand voice and each account once, before anything is posted.", "Approve the first 5 posts, and any post that names a price, an offer, a guarantee, a customer or a customer's photo."], "stops": ["It never invents a review, a testimonial or a before-and-after claim.", "If you pause it, or take back an approval, it stops posting."]},
    RAE: {"what": ["Asks every customer for a review after their visit.", "It contacts customers by email, at most 2 times each, at least 3 days apart, and only in the hours the law allows.", "It asks every customer, with no filter on how happy they are.", "Emails go only to people with a record of a relationship with you."], "needsYou": [], "stops": ["The moment a customer says STOP it never contacts them again.", "When a customer replies it stops and hands the conversation to you.", "After 2 touches, or 14 days, it stops."]},
}
def view(w, sid):
    asks = {"brand_voice": True, "accounts": ["facebook_page"]} if sid == HALLIE else {"brand_voice": False, "accounts": []}
    rows = w["approvals"][sid]
    need = ([("brand_voice", "")] if asks["brand_voice"] else []) + [("account", a) for a in asks["accounts"]]
    def latest(k, sub):
        hits = [r for r in rows if r["kind"] == k and r["subject"] == sub]
        return hits[-1] if hits else None
    ok = all((latest(k, sub) or {}).get("status") == "approved" for k, sub in need)
    return {"ok": True, "process": "content_social" if sid == HALLIE else "review_requests", "words": WORDS[sid], "approvals": rows, "approved": ok, "asks": asks}
def cases(sid):
    if sid == HALLIE: return {"ok": True, "process": "content_social", "max_touches": None, "open": [], "closed": [], "more": False}
    op = [{"ref": f"a{i}b2c3d{i}", "stage": "visited", "touches": i % 2, "next_at": day(i), "status": "open", "closed_reason": None, "opened_at": day(-2 - i), "closed_at": None, "last_touch_at": day(-1) if i % 2 else None} for i in range(11)]
    cl = [{"ref": "c1d2e3f4", "stage": "visited", "touches": 1, "next_at": day(-1), "status": "done", "closed_reason": "replied", "opened_at": day(-6), "closed_at": day(-1), "last_touch_at": day(-3)},
          {"ref": "c5d6e7f8", "stage": "visited", "touches": 2, "next_at": day(-2), "status": "done", "closed_reason": "max_touches", "opened_at": day(-12), "closed_at": day(-2), "last_touch_at": day(-2)},
          {"ref": "c9d0e1f2", "stage": "visited", "touches": 1, "next_at": day(-3), "status": "stopped", "closed_reason": "opted_out", "opened_at": day(-5), "closed_at": day(-3), "last_touch_at": day(-4)}]
    return {"ok": True, "process": "review_requests", "max_touches": 2, "open": op, "closed": cl, "more": False}

def serve(w):
    def handle(route):
        req = route.request; path = urlparse(req.url).path.split("/functions/v1/")[-1]; body = {}
        try: body = json.loads(req.post_data or "{}")
        except Exception: pass
        w["calls"].append((req.method, path, body))
        out, status = {"ok": True}, 200
        if path == "pip-portal/me": out = {"email": "owner@example.test", "founder": False, "businesses": [{"id": BIZ, "name": "TEST Fork"}]}
        elif path == f"pip-portal/business/{BIZ}": out = business(w)
        elif path.endswith("/operator") or path.endswith("/operator-cases"):
            sid = path.split("/agents/")[1].split("/")[0]
            if not w["lane"]: out, status = {"error": "not_found"}, 404
            else: out = view(w, sid) if path.endswith("/operator") else cases(sid)
        elif path.endswith("/operator-approval"):
            sid = path.split("/agents/")[1].split("/")[0]; rows = w["approvals"][sid]
            if body.get("do") == "request":
                if w["role"] != "owner": out, status = {"error": "owner_only"}, 403
                else:
                    w["next_id"] += 1; rows.append({"id": w["next_id"], "kind": body["kind"], "subject": body.get("subject", ""), "status": "requested", "version": 1, "voice": body.get("voice"), "approved_at": None, "revoked_at": None}); out = {"ok": True, "id": w["next_id"]}
            else:
                r = next((x for x in rows if x["id"] == body.get("id")), None)
                if not r: out, status = {"error": "not_found"}, 404
                elif body["do"] == "approve":
                    if w["role"] != "owner": out, status = {"error": "owner_only", "message": "Only the owner can approve this."}, 403
                    else: r["status"] = "approved"; r["approved_at"] = day(0)
                else: r["status"] = "revoked"; r["revoked_at"] = day(0)
        elif path.endswith("/pause"): w["paused"] = True
        elif path.endswith("/resume"): w["paused"] = False
        elif path.startswith("pip-portal-ops/"): out = {}
        route.fulfill(status=status, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(out))
    return handle

SESSION = json.dumps({"access_token": "h.e30.s", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "user": {"id": "u-owner", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}})
INIT = "try{for(const k of ['sb-qqaikvgjzzcdwumnyspb-auth-token']){localStorage.setItem(k,%s)}}catch(e){}" % json.dumps(SESSION)
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)

u = urlparse(os.environ.get("HTTPS_PROXY", "")); proxy = None
if u.hostname:
    proxy = {"server": f"{u.scheme}://{u.hostname}:{u.port}", "bypass": "localhost,127.0.0.1"}
    if u.username: proxy.update(username=u.username, password=u.password or "")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), headless=True, proxy=proxy, args=["--no-sandbox", "--enable-unsafe-swiftshader"])
    for width in (360, 1280):
        def page(w):
            ctx = b.new_context(viewport={"width": width, "height": 800}); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
            pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)[:200]))
            pg.route("**/functions/v1/**", serve(w)); pg.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
            if SHARE: pg.goto(f"{BASE}/?_vercel_share={SHARE}", wait_until="domcontentloaded")
            pg.goto(f"{BASE}/portal.html?b={BIZ}", wait_until="load"); pg.wait_for_timeout(2500)
            return ctx, pg, errs
        fits = lambda pg: not pg.evaluate("()=>document.documentElement.scrollWidth>window.innerWidth+1")
        shot = lambda pg, name: pg.screenshot(path=f"{OUT}/{name}-{width}.png", full_page=True)
        text = lambda pg: pg.evaluate("()=>document.body.innerText")
        tag = f"[{width}px] "

        # 1. lane off: nothing about operators shows
        w = world(lane=False); ctx, pg, errs = page(w)
        check("Hallie" in text(pg), tag + "the team loads with the lane off")
        check(pg.locator('[data-k^="op-"]').count() == 0, tag + "lane off: no way into the review screen")
        check(not any("/operator" in c[1] for c in w["calls"]), tag + "lane off: the page never asks the server about operators")
        check(not errs, tag + f"lane off: console clean {errs[:2]}"); ctx.close()

        # 2. owner approves the voice and the account, then takes one back
        w = world(); ctx, pg, errs = page(w)
        check(pg.locator(f'[data-k="op-{HALLIE}"]').count() == 1 and pg.locator(f'[data-k="op-{JUNE}"]').count() == 0, tag + "only operator teammates get a 'See their work' button")
        pg.locator(f'[data-k="op-{HALLIE}"]').click(); pg.wait_for_timeout(1500)
        t = text(pg); check("Needs you" in t.replace("NEEDS YOU", "Needs you") and "Waiting for your approval" in t, tag + "an unapproved operator says it is waiting on the owner")
        check("posts nothing until" in t, tag + "it says plainly that nothing is posted before approval"); check(fits(pg), tag + "needs-you screen fits the width"); shot(pg, "1-needs-you")
        pg.locator('[data-k="voice-approve"]').click(); pg.wait_for_timeout(600)
        check(not any(c[1].endswith("/operator-approval") for c in w["calls"]), tag + "an empty voice is not sent")
        pg.locator("#op-voice").fill("Warm and plain. Short sentences, never salesy. We say folks, not customers.")
        pg.locator('[data-k="voice-approve"]').click(); pg.wait_for_timeout(2500)
        check([r["status"] for r in w["approvals"][HALLIE]] == ["approved"], tag + "approving the voice records one approved row")
        pg.locator('[data-k="allow-facebook_page"]').click(); pg.wait_for_timeout(2500)
        t = text(pg); check(view(w, HALLIE)["approved"] and "Waiting for your approval" not in t, tag + "after both approvals it no longer waits on the owner"); shot(pg, "2-approved")
        pg.locator('[data-k^="revoke-"]').first.click(); pg.wait_for_timeout(500); check(pg.locator("dialog[open]").count() == 1, tag + "taking an approval back asks first")
        pg.locator("dialog[open] .btn.danger").click(); pg.wait_for_timeout(2500)
        check(any(r["status"] == "revoked" for r in w["approvals"][HALLIE]) and "Taken back" in text(pg), tag + "taking it back is recorded and shown")
        check(not re.search(r"\$\s?\d", text(pg)), tag + "no prices on the operator screen"); check(not errs, tag + f"owner flow: console clean {errs[:2]}"); ctx.close()

        # 3. this week, one item, pause and resume
        w = world(); ctx, pg, errs = page(w)
        pg.locator(f'[data-k="op-{RAE}"]').click(); pg.wait_for_timeout(1500); t = text(pg)
        check("11" in t and "finished in the last 7 days" in t, tag + "this week shows what is open and what finished")
        check("with no filter on how happy they are" in t, tag + "review requests say they go to every customer")
        check(pg.locator('[data-k^="case-"]').count() == 8 + 3 and "And 3 more" in t, tag + "long lists are cut with a count of the rest"); check(fits(pg), tag + "this-week screen fits the width"); shot(pg, "3-this-week")
        pg.locator('[data-k^="case-"]').first.click(); pg.wait_for_timeout(600)
        st = pg.locator("dialog[open]").inner_text() if pg.locator("dialog[open]").count() else ""
        check("Next step" in st and "stays in your own tools" in st, tag + "one item shows progress and says who the customer is stays private"); shot(pg, "4-one-item")
        pg.locator("dialog[open] .btn.ghost").click(); pg.wait_for_timeout(400)
        pg.locator(f'[data-k="pau-{RAE}"]').click(); pg.wait_for_timeout(2500); t = text(pg)
        check(w["paused"] and "is not sending or posting anything" in t, tag + "pausing stops it and the screen says so"); shot(pg, "5-paused")
        pg.locator(f'[data-k="res-{RAE}"]').click(); pg.wait_for_timeout(2500); check(not w["paused"], tag + "an owner can resume")
        pg.locator('[data-k="op-back"]').click(); pg.wait_for_timeout(800); check("Hallie" in text(pg) and pg.locator('[data-k="op-week"]').count() == 0, tag + "back returns to the team")
        check(not errs, tag + f"week flow: console clean {errs[:2]}"); ctx.close()

        # 4. staff can look and take back, never approve
        w = world(role="staff"); w["approvals"][HALLIE] = [{"id": 5, "kind": "brand_voice", "subject": "", "status": "requested", "version": 1, "voice": {"text": "Warm and plain, short sentences."}, "approved_at": None, "revoked_at": None}]
        ctx, pg, errs = page(w); pg.locator(f'[data-k="op-{HALLIE}"]').click(); pg.wait_for_timeout(1500); t = text(pg)
        check(pg.locator('[data-k^="approve-"], [data-k^="allow-"], [data-k="voice-approve"]').count() == 0 and "Only an owner" in t, tag + "staff see the approvals and cannot give them"); shot(pg, "6-staff")
        check(fits(pg), tag + "staff screen fits the width"); check(not errs, tag + f"staff: console clean {errs[:2]}"); ctx.close()
    b.close()
print("RESULT", "all checks passed" if not problems else f"{len(problems)} failed")
sys.exit(1 if problems else 0)
