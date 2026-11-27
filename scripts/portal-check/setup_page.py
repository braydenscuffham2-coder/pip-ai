#!/usr/bin/env python3
"""Opens the Setup Agent's owner page (public/setup.html) with a faked server at 360px and 1280px and walks the
states an owner can land in: before the yes, the browser opening, their turn, and the browser having closed.

  python3 scripts/portal-check/setup_page.py <base url> [vercel share value]
"""
import json, os, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
BIZ, SID = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
CLOSED = "The secure browser closed before the sign-in was finished. Nothing was saved and no password was kept. Tap Open it again to pick up where you were."
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
        tag = f"[{width}px] "
        w = {"state": "consent", "reason": "Waiting for your yes before Pip opens anything.", "calls": []}
        def handle(route):
            body = {}
            try: body = json.loads(route.request.post_data or "{}")
            except Exception: pass
            a = body.get("action"); w["calls"].append(a)
            if a == "consent": w.update(state="opening", reason=None)
            if a == "resume": w.update(state="opening", reason=None)
            out = {"ok": True, "setup": {"id": SID, "tool": "Practice Vet (TEST)", "state": w["state"], "reason": w["reason"], "result": None, "keybox": w["state"] == "owner_control", "live": None, "interactive": w["state"] == "owner_control"}}
            route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(out))
        ctx = b.new_context(viewport={"width": width, "height": 800}); ctx.add_init_script(INIT); pg = ctx.new_page(); errs = []
        pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append("pageerror " + str(e)[:200]))
        pg.route("**/functions/v1/**", handle); pg.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
        if SHARE: pg.goto(f"{BASE}/?_vercel_share={SHARE}", wait_until="domcontentloaded")
        pg.goto(f"{BASE}/setup.html?b={BIZ}&s={SID}", wait_until="load"); pg.wait_for_timeout(2500)
        text = lambda: pg.evaluate("()=>document.body.innerText")
        fits = lambda: not pg.evaluate("()=>document.documentElement.scrollWidth>window.innerWidth+1")
        now = lambda: pg.evaluate("()=>{const e=document.querySelector('ol.steps li.now');return e?e.innerText.replace(/\\s+/g,' ').trim():''}")
        t = text()
        check("Say yes" in t and "Sign in yourself" in t and "Pip tests it" in t, tag + "the three steps are shown before anything starts")
        check(now().endswith("Say yes"), tag + "step 1 is marked as where they are"); check(fits(), tag + "the yes screen fits the width")
        pg.get_by_text("Yes, I'll sign in while Pip watches").click(); pg.wait_for_timeout(2600)
        t = text()
        check("Opening Practice Vet (TEST)'s sign-in page" in t and "Your turn comes next" in t, tag + "while the browser opens it says so and says what comes next")
        check(now().endswith("Sign in yourself"), tag + "step 2 is marked while it opens")
        w.update(state="owner_control", reason="Your turn: type your login in the key box, then tap I'm signed in."); pg.wait_for_timeout(2600)
        t = text()
        check("Your turn: type your login in the key box" in t and "key box" in t.lower(), tag + "their turn is said in plain words, with the key box")
        check("the owner" not in t.lower(), tag + "nothing talks about 'the owner' to the owner"); check(fits(), tag + "the sign-in screen fits the width")
        w.update(state="paused", reason=CLOSED); pg.wait_for_timeout(3600)
        t = text()
        check("Nothing was saved and no password was kept" in t and "not finished yet" in t.lower(), tag + "a closed browser says what happened and that nothing was kept")
        check("What happens when you tap" in t and pg.locator('[data-k="again"]').inner_text() == "Open it again", tag + "one button, and it says what tapping it does")
        check(now().endswith("Sign in yourself"), tag + "the steps still show where they are"); check(fits(), tag + "the closed screen fits the width")
        pg.locator('[data-k="again"]').click(); pg.wait_for_timeout(2600)
        check("resume" in w["calls"] and "Opening Practice Vet (TEST)'s sign-in page" in text(), tag + "the button reopens the browser")
        check(not errs, tag + f"console clean {errs[:2]}"); ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
