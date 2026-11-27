"""Portal harness: serves a local portal.html as https://www.hirepip.com/portal.html with a fake backend.

Usage in a script:
    from h import run
    with run("live", "owner", 1280, 800) as (page, calls):
        page.screenshot(path="x.png")
"""
import json, re, time, contextlib, os, sys
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
import fx

REPO = os.environ.get("PORTAL_REPO", os.path.join(os.path.dirname(__file__), "..", "..", "public"))
V = os.environ.get("PORTAL_VENDOR", "/tmp/vendor")
FILES = {
    "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js": (V + "/three-0.170.0/build/three.module.min.js", "text/javascript"),
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js": (V + "/supabase-supabase-js-2.119.0/dist/umd/supabase.js", "text/javascript"),
}
SB = "https://qqaikvgjzzcdwumnyspb.supabase.co"
SESSION = {"access_token": "test-token", "refresh_token": "r", "token_type": "bearer", "expires_in": 3600 * 24 * 365,
           "expires_at": int(time.time()) + 3600 * 24 * 365,
           "user": {"id": "00000000-0000-4000-8000-000000000001", "email": "owner@example.test", "aud": "authenticated", "role": "authenticated"}}


@contextlib.contextmanager
def run(scn="live", role="owner", w=1280, h=800, path="/portal.html", signed_in=True, mobile=False, reduced=False, extra=None):
    calls = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile,
                            reduced_motion="reduce" if reduced else "no-preference")
        if signed_in:
            ctx.add_init_script("localStorage.setItem('sb-qqaikvgjzzcdwumnyspb-auth-token', %s)" % json.dumps(json.dumps(SESSION)))
        page = ctx.new_page()
        page.on("console", lambda m: calls.append(("console", m.type, m.text)) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: calls.append(("pageerror", str(e))))

        def handle(route):
            req = route.request; url = req.url; u = urlparse(url)
            if url in FILES:
                f, ct = FILES[url]; return route.fulfill(path=f, content_type=ct, headers={"access-control-allow-origin": "*"})
            if u.netloc == "www.hirepip.com":
                local = REPO + (u.path if u.path != "/" else "/index.html")
                if os.path.isfile(local):
                    ct = "text/html" if local.endswith(".html") else "text/javascript" if local.endswith(".js") else "image/webp" if local.endswith(".webp") else "application/octet-stream"
                    return route.fulfill(path=local, content_type=ct)
                return route.fulfill(status=404, body="nf")
            if "fonts.googleapis.com" in u.netloc or "fonts.gstatic.com" in u.netloc:
                return route.fulfill(status=200, body="", content_type="text/css")
            if u.netloc == "qqaikvgjzzcdwumnyspb.supabase.co":
                cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
                if req.method == "OPTIONS":
                    return route.fulfill(status=204, headers=cors)
                body = {}
                try: body = json.loads(req.post_data or "{}")
                except Exception: pass
                path = u.path
                calls.append(("api", req.method, path + ("?" + u.query if u.query else ""), body))
                out = api(scn, role, req.method, path, u.query, body)
                if extra: out = extra(req.method, path, body, out)
                st = 200
                if isinstance(out, tuple): st, out = out
                return route.fulfill(status=st, body=json.dumps(out), content_type="application/json", headers=cors)
            return route.fulfill(status=404, body="blocked in harness")

        page.route("**/*", handle)
        page.goto("https://www.hirepip.com" + path)
        try:
            yield page, calls
        finally:
            b.close()


def api(scn, role, method, path, query, body):
    fn = "/functions/v1/pip-portal"; ops = "/functions/v1/pip-portal-ops"
    if path.startswith("/auth/v1/"):
        if path.endswith("/user"): return SESSION["user"]
        if path.endswith("/otp"): return {}
        return {}
    if path.startswith(ops):
        rest = path[len(ops):]
        if rest == "/rpc/usage": return fx.usage()
        if rest == "/rpc/billing_status": return fx.billing_status(scn)
        if rest == "/billing/start": return {"ok": True, "url": "https://www.hirepip.com/portal.html?card=cs_test"}
        return {"ok": True}
    if path.startswith(fn):
        rest = path[len(fn):]
        if rest == "/me": return fx.me(role)
        if rest == "/config": return {"ok": True, "terms_url": "https://www.hirepip.com/terms"}
        if rest == "/signin": return {"ok": True}
        if rest == "/founder/businesses": return fx.founder_businesses()
        m = re.match(r"/business/([0-9a-f-]{36})(/.*)?$", rest)
        if m:
            sub = m.group(2) or ""
            if sub == "" and method == "GET": return fx.business(scn, "founder" if role == "founder" else role)
            if sub == "/activity": return {"items": fx.BASE["activity"]}
            if sub.startswith("/tools"): return {"tools": [{"toolkit": "square", "name": "Square", "about": "Payments and appointments"}, {"toolkit": "quickbooks", "name": "QuickBooks", "about": "Accounting"}]}
            if sub == "/connect" or sub == "/connect-tool": return {"ok": True, "url": "https://www.hirepip.com/portal.html?connected=x"}
            return {"ok": True}
        return {"ok": True}
    return {"ok": True}
