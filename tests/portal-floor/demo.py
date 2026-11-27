"""Builds a click-through copy of the Portal for a Claude artifact: the real page and parts, with the harness's fake
backend answered inside the page, so nothing signs in and nothing reaches Supabase. Test data only (TEST Fork).

    python3 demo.py /tmp/portal-demo [scenario] [role]

Then publish every file in that folder as one artifact (index.html is the page).
"""
import json, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(__file__))
import fx

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/portal-demo"
SCN = sys.argv[2] if len(sys.argv) > 2 else "mixed"
ROLE = sys.argv[3] if len(sys.argv) > 3 else "owner"
PUB = os.path.join(os.path.dirname(__file__), "..", "..", "public")

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT + "/portal-art/sc")

DATA = {
    "me": fx.me(ROLE), "business": fx.business(SCN, ROLE), "usage": fx.usage(), "billing": fx.billing_status(SCN),
    "activity": fx.BASE["activity"], "founder": fx.founder_businesses(),
}

SHIM = """<script>
/* Demo only: the Portal's backend, answered inside the page from test data. Nothing leaves the page. */
(() => {
  const D = %s;
  const SESSION = { access_token: "demo", user: { id: "demo", email: D.me.email } };
  const ok = (j, st) => Promise.resolve(new Response(JSON.stringify(j), { status: st || 200, headers: { "content-type": "application/json" } }));
  const real = window.fetch.bind(window);
  window.fetch = (url, init) => {
    url = String(url && url.url || url);
    if (!/supabase\\.co/.test(url)) return real(url, init);
    const u = new URL(url), p = u.pathname, fn = "/functions/v1/pip-portal", ops = "/functions/v1/pip-portal-ops";
    if (p.startsWith(ops)) { const r = p.slice(ops.length); return ok(r === "/rpc/usage" ? D.usage : r === "/rpc/billing_status" ? D.billing : r === "/billing/start" ? { ok: true, url: "#card" } : { ok: true }); }
    if (p.startsWith(fn)) {
      const r = p.slice(fn.length);
      if (r === "/me") return ok(D.me);
      if (r === "/config") return ok({ ok: true, terms_url: "#terms" });
      if (r === "/founder/businesses") return ok(D.founder);
      const m = r.match(/^\\/business\\/[0-9a-f-]{36}(\\/.*)?$/);
      if (m) { const sub = m[1] || "";
        if (!sub && !(init && init.method === "POST")) return ok(D.business);
        if (sub === "/activity") return ok({ items: D.activity });
        if (sub.startsWith("/tools")) return ok({ tools: [{ toolkit: "square", name: "Square", about: "Payments and appointments" }, { toolkit: "quickbooks", name: "QuickBooks", about: "Accounting" }] });
        if (sub === "/connect" || sub === "/connect-tool") return ok({ ok: true, url: "#connected" });
      }
      return ok({ ok: true });
    }
    return ok({});
  };
  window.supabase = { createClient: () => ({ auth: {
    getSession: async () => ({ data: { session: SESSION } }), getUser: async () => ({ data: { user: SESSION.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({}), signInWithOtp: async () => ({}), verifyOtp: async () => ({ data: { session: SESSION } }),
  } }) };
})();
</script>
""" % json.dumps(DATA)

html = open(PUB + "/portal.html").read()
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', "", html)  # the artifact has its own policy
html = re.sub(r'<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js[^>]*></script>\n?', "", html)
html = html.replace("<script>", SHIM + "<script>", 1) if "<script>" in html else html
html = html.replace('"/portal-art/', '"portal-art/').replace("url(/portal-art/", "url(portal-art/")
html = html.replace('sc.src = "/" + name + ".js?v=" + PART_V', 'sc.src = name + ".js?v=" + PART_V')
html = html.replace("<title>", "<title>Pip Portal · click-through · ", 1)
assert 'sc.src = name + ".js' in html, "loadPart path not found"
open(OUT + "/index.html", "w").write(html)

off = open(PUB + "/portal-office.js").read().replace('"/portal-art/', '"portal-art/').replace("url(/portal-art/", "url(portal-art/")
open(OUT + "/portal-office.js", "w").write(off)
shutil.copy(PUB + "/portal-pip.js", OUT + "/portal-pip.js")
for f in os.listdir(PUB + "/portal-art"):
    if f.endswith(".webp") or f.endswith(".glb"): shutil.copy(PUB + "/portal-art/" + f, OUT + "/portal-art/" + f)
for f in os.listdir(PUB + "/portal-art/sc"):
    if f.endswith(".webp") and not f.startswith("agent-"): shutil.copy(PUB + "/portal-art/sc/" + f, OUT + "/portal-art/sc/" + f)
print(OUT, len(os.listdir(OUT + "/portal-art/sc")), "scene files")
