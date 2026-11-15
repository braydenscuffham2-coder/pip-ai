/* Pip on the web: the stand-in for the Claude app's runtime.
 *
 * public/app.html is the same Pip page that runs as an artifact in the Claude app. There, the app gives the page
 * three capabilities through window.claude.use(name). Here, nobody needs a Claude account, so this file gives the
 * page the same three, backed by Pip's own servers:
 *
 *   mcp     PIP Reader's pip_read: a direct read of Pip's own scan endpoints (they all allow any origin), so each
 *           visitor's own address is what the spend guard counts. The email gate's pass and pip_order go to the
 *           pip-reader function itself, exactly as the connector does. host:claude_browser isn't here.
 *   sample  model calls, through /api/sample on this site (Pip's API key, behind the spend guard).
 *   db      this browser's own storage. In the Claude app it is shared; here a business scanned again in the same
 *           browser opens from what was saved, and a new browser scans afresh.
 *
 * Everything else resolves null, as the app does for a capability a page doesn't have.
 */
(function () {
  "use strict";
  var SB = "https://qqaikvgjzzcdwumnyspb.supabase.co/functions/v1";
  var READER = SB + "/pip-reader";
  var READS = [SB + "/site-kit", SB + "/rival-read", "https://pip-ai-drab.vercel.app/api/gather"];
  var PASS = SB + "/pip-pass";

  function err(code, message, extra) {
    var e = new Error(message || code);
    e.code = code;
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }
  function textResult(text, structured) {
    var r = { content: [{ type: "text", text: text }] };
    if (structured !== undefined) r.structuredContent = structured;
    var p = structured;
    if (p === undefined) { try { p = JSON.parse(text); } catch (_) { p = text; } }
    r.payload = p;
    return r;
  }

  /* ---------- mcp ---------- */
  function readAllowed(url) {
    if (typeof url !== "string" || url.length > 4000) return null;
    try {
      var u = new URL(url);
      if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
      var base = (u.origin + u.pathname).replace(/\/+$/, "");
      if (READS.indexOf(base) < 0) return null;
      /* this site's own read is same-origin wherever the page is served from */
      if (base === READS[2] && location.hostname !== "pip-ai-drab.vercel.app") return location.origin + u.pathname + u.search;
      return u.toString();
    } catch (_) { return null; }
  }
  async function viaReader(tool, args, signal) {
    var r;
    try {
      r = await fetch(READER, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }),
        signal: signal,
      });
    } catch (e) {
      throw err("server_unavailable", "Pip couldn't be reached.", { retryable: true, retryAfterMs: 1500 });
    }
    var j = null;
    try { j = await r.json(); } catch (_) {}
    if (!r.ok || !j || j.error) throw err("upstream_error", (j && j.error && j.error.message) || ("Pip answered " + r.status), { retryable: r.status >= 500 });
    var res = j.result || {};
    var text = (res.content || []).map(function (b) { return b && typeof b.text === "string" ? b.text : ""; }).join("");
    if (res.isError) throw err("tool_error", text || "Pip's tool failed", { result: res });
    return textResult(text, res.structuredContent);
  }
  async function pipRead(args, signal) {
    var url = args && args.url;
    if (typeof url === "string" && url.indexOf(PASS + "?") === 0) return viaReader("pip_read", { url: url }, signal);
    var go = readAllowed(url);
    if (!go) throw err("tool_error", "That address isn't one of Pip's scan endpoints.");
    var r;
    try {
      r = await fetch(go, { headers: { accept: "application/json" }, cache: "no-store", signal: signal });
    } catch (e) {
      if (signal && signal.aborted) throw err("cancelled", "Stopped.");
      throw err("tool_error", "Pip's endpoint couldn't be reached.");
    }
    var text = await r.text();
    if (text.length > 2000000) text = text.slice(0, 2000000);
    if (!r.ok && text.trim().charAt(0) !== "{") throw err("tool_error", "Pip's endpoint answered " + r.status + ".");
    return textResult(text);
  }
  var mcp = Object.freeze({
    callTool: function (server, tool, args, opts) {
      var signal = opts && opts.signal;
      return Promise.resolve().then(function () {
        if (server === "PIP Reader" && tool === "pip_read") return pipRead(args || {}, signal);
        if (server === "PIP Reader" && tool === "pip_order") return viaReader("pip_order", args || {}, signal);
        throw err("server_not_connected", server + " isn't available on the web.");
      });
    },
    listTools: function () { return Promise.resolve({ tools: [{ name: "pip_read" }, { name: "pip_order" }] }); },
  });

  /* ---------- sample ---------- */
  async function sample(input, opts) {
    opts = opts || {};
    var body = { input: input, modelTier: opts.modelTier, model: opts.model, effort: opts.effort };
    var r;
    try {
      r = await fetch("/api/sample", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: opts.signal });
    } catch (e) {
      if (opts.signal && opts.signal.aborted) throw err("cancelled", "Stopped.");
      throw err("upstream_error", "Couldn't reach Pip's model.");
    }
    if (!r.body) throw err("upstream_error", "No answer.");
    var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", text = "", end = null, bad = null;
    function take(l) {
      if (!l.trim()) return;
      var o; try { o = JSON.parse(l); } catch (_) { return; }
      if (o.t === "d") {
        text += o.d;
        if (typeof opts.onText === "function") { try { opts.onText({ text: text, delta: o.d }); } catch (_) {} }
      } else if (o.t === "end") end = o;
      else if (o.t === "err") bad = o.code || "upstream_error";
    }
    try {
      for (;;) {
        var c = await reader.read();
        if (c.done) break;
        buf += dec.decode(c.value, { stream: true });
        var i;
        while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
      }
      take(buf + dec.decode());
    } catch (e) {
      if (opts.signal && opts.signal.aborted) throw err("cancelled", "Stopped.", { text: text });
      throw err("upstream_error", "The answer was cut off.", { text: text });
    }
    if (bad) throw err(bad, bad, { text: text });
    if (!end || !text.trim()) throw err("empty_completion", "No answer.", { text: text });
    var out = { text: text, truncated: !!end.truncated, modelTierApplied: end.tier || opts.modelTier || "default" };
    if (end.model) out.modelApplied = end.model;
    return out;
  }
  sample.json = function (input, opts) {
    return sample(input, opts).then(function (r) {
      var t = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      try { return JSON.parse(t); } catch (_) { throw err("invalid_json", "That answer wasn't JSON.", { text: r.text }); }
    });
  };
  sample.limits = function () { return Promise.resolve({ images: false }); };
  var sampleFn = Object.freeze(sample);

  /* ---------- db ---------- */
  var NS = "pip.db:";
  function readDoc(path) {
    try { var s = localStorage.getItem(NS + path); return s == null ? null : JSON.parse(s); } catch (_) { return null; }
  }
  function writeDoc(path, val) {
    var s = JSON.stringify(val);
    try { localStorage.setItem(NS + path, s); return; } catch (_) {}
    /* storage full: drop the oldest saved businesses, then try once more */
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(NS + "dossiers/") === 0) keys.push(k); }
      keys.slice(0, Math.max(1, Math.ceil(keys.length / 2))).forEach(function (k) { localStorage.removeItem(k); });
      localStorage.setItem(NS + path, s);
    } catch (_) {}
  }
  function snap(path) {
    var v = readDoc(path);
    return { id: path.split("/").pop(), exists: v != null, data: function () { return v == null ? undefined : JSON.parse(JSON.stringify(v)); } };
  }
  function docRef(path) {
    return Object.freeze({
      id: path.split("/").pop(),
      path: path,
      get: function () { return Promise.resolve(snap(path)); },
      set: function (v) { writeDoc(path, v); return Promise.resolve(); },
      update: function (v) { var cur = readDoc(path) || {}; for (var k in v) cur[k] = v[k]; writeDoc(path, cur); return Promise.resolve(); },
      delete: function () { try { localStorage.removeItem(NS + path); } catch (_) {} return Promise.resolve(); },
    });
  }
  var db = Object.freeze({
    doc: function (path) { return docRef(String(path)); },
    collection: function (name) {
      name = String(name);
      return Object.freeze({
        doc: function (id) { return docRef(name + "/" + id); },
        /* the page's usage log: kept nowhere on the web (Google Analytics covers visits) */
        add: function () { return Promise.resolve(docRef(name + "/" + Math.random().toString(36).slice(2))); },
      });
    },
  });

  var caps = { mcp: mcp, sample: sampleFn, db: db };
  var claude = Object.freeze({
    use: function (name) { return Promise.resolve(Object.prototype.hasOwnProperty.call(caps, name) ? caps[name] : null); },
  });
  try { Object.defineProperty(window, "claude", { value: claude, writable: false, configurable: false }); } catch (_) { window.claude = claude; }
})();
