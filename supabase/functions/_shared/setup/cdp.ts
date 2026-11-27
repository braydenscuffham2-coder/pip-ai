// A small Chrome DevTools Protocol client over a WebSocket: enough to drive one page in the cloud browser.
// No Playwright (it does not run in an edge function). Used by setup-run (the model's actions) and vault-writer (typing
// the owner's username and password into the login form, which no model ever sees).
import type { FieldInfo } from "./guards.ts";
import type { Page } from "./engine.ts";

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class Cdp {
  private ws: WebSocket; private n = 0; private pending = new Map<number, Pending>();
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      let m: any; try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (typeof m.id !== "number") return;
      const p = this.pending.get(m.id); if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(`cdp ${m.error.code}: ${String(m.error.message).slice(0, 120)}`)); else p.resolve(m.result ?? {});
    };
    ws.onclose = () => { for (const p of this.pending.values()) p.reject(new Error("cdp closed")); this.pending.clear(); };
  }
  static connect(url: string, ms = 15000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const t = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error("cdp connect timeout")); }, ms);
      ws.onopen = () => { clearTimeout(t); resolve(new Cdp(ws)); };
      ws.onerror = () => { clearTimeout(t); reject(new Error("cdp connect failed")); };
    });
  }
  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string, ms = 30000): Promise<T> {
    const id = ++this.n;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`cdp ${method} timeout`)); }, ms);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

/** Attaches to the browser's first page and returns a Page the engine can drive. */
export async function openPage(cdp: Cdp, viewport = { w: 1280, h: 800 }): Promise<Page> {
  const { targetInfos } = await cdp.send<{ targetInfos: { targetId: string; type: string }[] }>("Target.getTargets");
  let target = targetInfos.find((t) => t.type === "page")?.targetId;
  if (!target) target = (await cdp.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" })).targetId;
  const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId: target, flatten: true });
  const s = (method: string, params: Record<string, unknown> = {}) => cdp.send(method, params, sessionId);
  await s("Page.enable").catch(() => {});
  await s("Emulation.setDeviceMetricsOverride", { width: viewport.w, height: viewport.h, deviceScaleFactor: 1, mobile: false }).catch(() => {});
  const evaluate = async <T>(expression: string): Promise<T> => {
    const r = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("page script failed");
    return r.result?.value as T;
  };
  const settle = async () => {
    for (let i = 0; i < 40; i++) { if ((await evaluate<string>("document.readyState").catch(() => "")) === "complete") return; await new Promise((r) => setTimeout(r, 250)); }
  };
  const mouse = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) => s("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
  const KEYS: Record<string, [string, number]> = { Enter: ["Enter", 13], Tab: ["Tab", 9], Escape: ["Escape", 27], ArrowDown: ["ArrowDown", 40], ArrowUp: ["ArrowUp", 38], Backspace: ["Backspace", 8] };
  return {
    async goto(url) { await s("Page.navigate", { url }); await settle(); },
    evaluate,
    async screenshot() { const r = await s("Page.captureScreenshot", { format: "jpeg", quality: 60 }); return r.data as string; },
    async click(x, y) { await mouse("mouseMoved", x, y, { button: "none" }); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await settle(); },
    async type(text) { await s("Input.insertText", { text }); },
    async key(k) {
      const [key, code] = KEYS[k] ?? [k, 0];
      await s("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code, ...(k === "Enter" ? { text: "\r" } : {}) });
      await s("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code });
      await settle();
    },
    async scroll(dy) { await s("Input.dispatchMouseEvent", { type: "mouseWheel", x: viewport.w / 2, y: viewport.h / 2, deltaX: 0, deltaY: dy }); },
    async focused() {
      return await evaluate<FieldInfo | null>(`(() => { const el = document.activeElement; if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return null;
        return { tag: el.tagName.toLowerCase(), type: el.type || "", autocomplete: el.autocomplete || "", name: el.name || "", id: el.id || "", label: el.getAttribute("aria-label") || el.placeholder || "", filled: el.dataset.pipFilled === "1" }; })()`);
    },
    viewport: () => viewport,
  };
}

/**
 * vault-writer's one job in the page: put the owner's username and password into the fields the login step tagged,
 * mark them so every later screenshot blurs them, and submit. The values go straight into the browser over this
 * socket. They are not logged, returned or kept.
 */
export async function fillLogin(page: Page, username: string, password: string): Promise<{ user: boolean; pass: boolean; submitted: boolean }> {
  const focus = (attr: string) => page.evaluate<boolean>(`(() => { const el = document.querySelector("[${attr}]"); if (!el) return false; el.dataset.pipFilled = "1"; el.style.setProperty("filter", "blur(10px)", "important"); el.focus(); el.value = ""; return document.activeElement === el; })()`);
  const user = await focus("data-pip-user");
  if (user) await page.type(username);
  const pass = await focus("data-pip-pass");
  if (pass) await page.type(password);
  const submitted = await page.evaluate<boolean>(`(() => { const b = document.querySelector("[data-pip-submit]"); const p = document.querySelector("[data-pip-pass]") || document.querySelector("[data-pip-user]");
    if (b) { b.click(); return true; } const f = p && p.form; if (f) { f.requestSubmit ? f.requestSubmit() : f.submit(); return true; } return false; })()`);
  return { user, pass, submitted };
}

/**
 * Types a one-time code into the code field the page shows, marks it so later screenshots blur it, and submits.
 * The field is found by the page's own markup. The code goes straight into the browser; it is not logged or returned.
 */
export async function fillCode(page: Page, code: string): Promise<{ field: boolean; submitted: boolean }> {
  const field = await page.evaluate<boolean>(`(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const CODE = /(otp|one[-_ ]?time|2fa|mfa|totp|verification|security[-_ ]?code|auth(enticator)?[-_ ]?code|passcode)/i;
    const el = [...document.querySelectorAll("input")].find((el) => vis(el) && el.type !== "password" && (/one-time-code/i.test(el.autocomplete || "") || CODE.test((el.name || "") + " " + (el.id || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.placeholder || ""))));
    if (!el) return false;
    el.setAttribute("data-pip-code", "1"); el.dataset.pipFilled = "1"; el.style.setProperty("filter", "blur(10px)", "important"); el.focus(); el.value = "";
    return true; })()`);
  if (!field) return { field: false, submitted: false };
  await page.type(code);
  const submitted = await page.evaluate<boolean>(`(() => { const el = document.querySelector("[data-pip-code]"); const f = el && el.form;
    const b = f && [...f.querySelectorAll("button, input[type=submit]")].find((x) => x.type === "submit" || /(verify|continue|submit|sign ?in|log ?in|next)/i.test(x.innerText || x.value || ""));
    if (b) { b.click(); return true; } if (f) { f.requestSubmit ? f.requestSubmit() : f.submit(); return true; } return false; })()`);
  return { field: true, submitted };
}
