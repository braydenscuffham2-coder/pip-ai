#!/usr/bin/env python3
"""The Marketplace's corner menu: Terms of Service and Privacy Policy open the current pages (/terms, /privacy) in a
new tab, at 360px and 1280px, and a #privacy address goes straight there.

  python3 scripts/portal-check/legal_menu.py <base url> [vercel share value]
"""
import os, sys
from playwright.sync_api import sync_playwright
BASE = sys.argv[1].rstrip("/"); SHARE = sys.argv[2] if len(sys.argv) > 2 else ""
HOME = "/app.html" if "localhost" in BASE or "127.0.0.1" in BASE else "/"
problems = []
def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond: problems.append(what)
proxy = os.environ.get("HTTPS_PROXY")
with sync_playwright() as p:
    b = p.chromium.launch(proxy={"server": proxy, "bypass": "localhost,127.0.0.1"} if proxy else None)
    for width in (360, 1280):
        tag = f"[{width}px] "
        ctx = b.new_context(viewport={"width": width, "height": 800}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        if SHARE: pg.goto(f"{BASE}/?_vercel_share={SHARE}", wait_until="domcontentloaded")
        pg.goto(BASE + HOME, wait_until="load"); pg.wait_for_timeout(3500)
        pg.click(".ph-menu-btn"); pg.wait_for_timeout(500)
        names = pg.evaluate("()=>[...document.querySelectorAll('.ph-menu button')].map(e=>e.innerText.replace(/\\s+/g,' ').trim())")
        check(any("Terms of Service" in n for n in names) and any("Privacy Policy" in n for n in names), tag + "the corner menu lists Terms of Service and Privacy Policy")
        for name, path in (("Privacy Policy", "/privacy"), ("Terms of Service", "/terms")):
            if not pg.locator(".ph-menu").is_visible(): pg.click(".ph-menu-btn"); pg.wait_for_timeout(400)
            try:
                with ctx.expect_page(timeout=6000) as fresh: pg.locator(".ph-menu button", has_text=name).click()
                q = fresh.value; q.wait_for_load_state("domcontentloaded")
                check(q.url.split("?")[0].rstrip("/").endswith(path), tag + f"{name} opens {path} in a new tab ({q.url[-40:]})")
                if "localhost" not in BASE: check("Effective date" in q.evaluate("()=>document.body.innerText"), tag + f"{path} shows the current document")
                q.close()
            except Exception as e: check(False, tag + f"{name} opened nothing ({str(e)[:60]})")
        check(pg.locator("dialog[open]").count() == 0, tag + "the old built-in reader does not open")
        check(pg.url.rstrip("/").endswith(HOME.rstrip("/")) or pg.url.rstrip("/") == BASE, tag + "the visitor keeps their place on the Marketplace")
        check(not errs, tag + f"no page errors {errs[:1]}")
        pg2 = ctx.new_page(); pg2.goto(BASE + HOME + "#privacy", wait_until="load"); pg2.wait_for_timeout(1500)
        check(pg2.url.split("?")[0].rstrip("/").endswith("/privacy"), tag + "an address ending in #privacy goes to /privacy")
        ctx.close()
    b.close()
print(f"{'PASS' if not problems else 'FAIL'}: {len(problems)} problem(s)")
sys.exit(1 if problems else 0)
