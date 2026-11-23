// The Setup Agent's hard limits, in code. Pure functions and one page script, so they are tested on their own
// (guards.test.ts) and the same rules hold in setup-run and vault-writer.
//
// The rule behind all of it (handbook, rule 2): no model ever sees, stores or enters a client credential.
// So: no screenshot while the owner has control, every secret field masked before any screenshot, the model may
// never type into a secret field, and a captcha is always the owner's.

/** States in which the model may be shown the page. Everything else is the owner's or no one's. */
export const MODEL_STATES = new Set(["find_login", "verify", "configuring", "testing"]);
export const canScreenshot = (state: string) => MODEL_STATES.has(state);

/** Captcha and bot-check frames. The agent never clicks inside one; control goes to the owner. */
export const CAPTCHA_URL = /(google\.com\/recaptcha|recaptcha\.net|gstatic\.com\/recaptcha|hcaptcha\.com|challenges\.cloudflare\.com|turnstile|arkoselabs\.com|funcaptcha|geo\.captcha-delivery\.com|captcha)/i;
export const isCaptchaUrl = (url: string) => CAPTCHA_URL.test(url || "");

/** A form field that holds or asks for a secret. */
export interface FieldInfo { tag?: string; type?: string; autocomplete?: string; name?: string; id?: string; label?: string; filled?: boolean }
const SECRET_WORDS = /(pass(word|code|phrase)?|pwd|secret|otp|one[-_ ]?time|2fa|mfa|totp|verification|security[-_ ]?code|pin\b|cvv|cvc|card[-_ ]?number|ssn|api[-_ ]?key|token)/i;
export function isSecretField(f: FieldInfo): boolean {
  if (f.filled) return true;
  const type = (f.type || "").toLowerCase(), ac = (f.autocomplete || "").toLowerCase();
  if (type === "password") return true;
  if (/(current-password|new-password|one-time-code|cc-number|cc-csc)/.test(ac)) return true;
  return SECRET_WORDS.test(`${f.name || ""} ${f.id || ""} ${f.label || ""}`);
}

/** The host a setup is allowed to move around in: the login page's registrable domain (last two labels, or three for
 *  a two-letter country code under a short second level such as co.uk). */
export function siteOf(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const parts = h.split(".");
    if (parts.length <= 2) return h;
    const tail = parts.slice(-2);
    return tail[1].length === 2 && tail[0].length <= 3 ? parts.slice(-3).join(".") : tail.join(".");
  } catch { return null; }
}

export type Action =
  | { type: "click"; x: number; y: number; label?: string }
  | { type: "type"; text: string; field?: FieldInfo }
  | { type: "key"; key: "Enter" | "Tab" | "Escape" | "ArrowDown" | "ArrowUp" | "Backspace" }
  | { type: "scroll"; dy: number }
  | { type: "navigate"; url: string }
  | { type: "wait" }
  | { type: "done"; summary?: string }
  | { type: "need_owner"; reason: string };

// Words on a button or link the agent may never press: money, deletion, plan changes, giving access away.
const FORBIDDEN_LABEL = /\b(delete|remove (account|user|business)|close account|cancel (subscription|plan|account)|upgrade|downgrade|buy|purchase|pay( now)?|checkout|place order|subscribe|start (paid|trial)|add (card|payment)|billing|transfer ownership|invite (owner|admin)|reset password|change password|sign out of all)\b/i;

/** Whether the model may take this action now. Refusals say why in words the model and the log can use. */
export function allowAction(a: Action, ctx: { state: string; site: string | null; viewport?: { w: number; h: number } }): { ok: true } | { ok: false; why: string } {
  if (!canScreenshot(ctx.state)) return { ok: false, why: "The owner has control right now." };
  switch (a.type) {
    case "click": {
      const w = ctx.viewport?.w ?? 1280, h = ctx.viewport?.h ?? 800;
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || a.x < 0 || a.y < 0 || a.x > w || a.y > h) return { ok: false, why: "That point is off the page." };
      if (a.label && FORBIDDEN_LABEL.test(a.label)) return { ok: false, why: `Pip never presses "${a.label.slice(0, 60)}". Ask the owner if it is needed.` };
      return { ok: true };
    }
    case "type":
      if (typeof a.text !== "string" || a.text.length > 500) return { ok: false, why: "Text must be under 500 characters." };
      if (a.field && isSecretField(a.field)) return { ok: false, why: "That field is for a secret. Only the owner or the vault fills it." };
      return { ok: true };
    case "navigate": {
      const to = siteOf(a.url);
      if (!/^https:\/\//i.test(a.url) || !to || !ctx.site || to !== ctx.site) return { ok: false, why: "Pip only moves around inside the tool's own site." };
      return { ok: true };
    }
    case "key": case "scroll": case "wait": case "done": case "need_owner":
      return { ok: true };
    default:
      return { ok: false, why: "Unknown action." };
  }
}

/**
 * Runs in the page before every screenshot the model sees (Runtime.evaluate). Blurs every secret field and anything the
 * vault filled, keeps watching for a "show password" toggle, and reports what it found: if a secret could still be on
 * screen, or a captcha is present, setup-run takes no screenshot and hands control to the owner.
 */
export const MASK_JS = String.raw`(() => {
  const SECRET = /(pass(word|code|phrase)?|pwd|secret|otp|one[-_ ]?time|2fa|mfa|totp|verification|security[-_ ]?code|pin\b|cvv|cvc|card[-_ ]?number|ssn|api[-_ ]?key|token)/i;
  const isSecret = (el) => el.dataset.pipFilled === "1" || el.type === "password" || /(current-password|new-password|one-time-code|cc-number|cc-csc)/i.test(el.autocomplete || "") || SECRET.test((el.name || "") + " " + (el.id || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.placeholder || ""));
  const mask = (el) => { el.dataset.pipSecret = "1"; el.style.setProperty("filter", "blur(10px)", "important"); el.style.setProperty("-webkit-text-security", "disc", "important"); };
  let masked = 0;
  for (const el of document.querySelectorAll("input, textarea")) if (isSecret(el)) { mask(el); masked++; }
  if (!window.__pipMaskObserver) {
    window.__pipMaskObserver = new MutationObserver((ms) => { for (const m of ms) { const el = m.target; if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA") && (el.dataset.pipSecret === "1" || isSecret(el))) mask(el); } });
    window.__pipMaskObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["type", "value", "data-pip-filled"] });
  }
  // A secret that was masked but now shows as plain text (a "show password" toggle) still counts as visible.
  const exposed = [...document.querySelectorAll("[data-pip-secret='1']")].filter((el) => el.type !== "password" && el.value && getComputedStyle(el).filter.indexOf("blur") < 0).length;
  const captcha = [...document.querySelectorAll("iframe")].some((f) => /(recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|captcha)/i.test(f.src || ""));
  return { masked, exposed, captcha, url: location.href, title: document.title.slice(0, 120) };
})()`;

/**
 * Runs in the login page once it loads. Finds the username field, the password field and the submit button by the
 * page's own markup and tags them, so vault-writer can fill them by tag without any model. Returns what it found.
 */
export const TAG_LOGIN_JS = String.raw`(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const pass = [...document.querySelectorAll("input[type=password]")].find(vis) || null;
  const scope = (pass && (pass.form || pass.closest("form,div"))) || document;
  const userSel = "input[type=email], input[autocomplete=username], input[autocomplete=email], input[name*=user i], input[name*=email i], input[id*=user i], input[id*=email i], input[type=text]";
  const user = [...scope.querySelectorAll(userSel)].find((el) => vis(el) && el !== pass) || [...document.querySelectorAll(userSel)].find(vis) || null;
  const btnSel = "button[type=submit], input[type=submit], button";
  const words = /(sign ?in|log ?in|continue|next|submit)/i;
  const button = [...scope.querySelectorAll(btnSel)].find((b) => vis(b) && (b.type === "submit" || words.test(b.innerText || b.value || ""))) || null;
  for (const el of document.querySelectorAll("[data-pip-user],[data-pip-pass],[data-pip-submit]")) { el.removeAttribute("data-pip-user"); el.removeAttribute("data-pip-pass"); el.removeAttribute("data-pip-submit"); }
  if (user) user.setAttribute("data-pip-user", "1");
  if (pass) pass.setAttribute("data-pip-pass", "1");
  if (button) button.setAttribute("data-pip-submit", "1");
  return { user: !!user, pass: !!pass, submit: !!button, twoStep: !!user && !pass };
})()`;

/** After the owner says they are signed in: still on a login form? */
export const SIGNED_IN_JS = String.raw`(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const pass = [...document.querySelectorAll("input[type=password]")].some(vis);
  return { url: location.href, passwordShowing: pass };
})()`;

/** Model prices per million tokens, for the per-setup cap. Sonnet 5.5 list prices (Nov 2026). */
export const MODEL_PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
export function costOf(u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }): number {
  return ((u.input_tokens ?? 0) * MODEL_PRICE.input + (u.output_tokens ?? 0) * MODEL_PRICE.output
    + (u.cache_read_input_tokens ?? 0) * MODEL_PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * MODEL_PRICE.cacheWrite) / 1_000_000;
}

// ---------- the leak check used by the test run ----------
// The test run proves no credential reached a log, prompt or screenshot without anyone seeing the credential: vault-writer
// keeps SHA-256 hashes of every 8-character slice of each test secret, and the scanner hashes every 8-character slice of
// what it checks. A match is a leak. The hashes are deleted when the run ends.
async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const SLICE = 8;
export async function sliceHashes(secret: string): Promise<string[]> {
  const out = new Set<string>();
  for (let i = 0; i + SLICE <= secret.length; i++) out.add(await sha(secret.slice(i, i + SLICE)));
  return [...out];
}
export async function leaks(text: string, hashes: Set<string>): Promise<number> {
  let hits = 0;
  for (let i = 0; i + SLICE <= text.length; i++) if (hashes.has(await sha(text.slice(i, i + SLICE)))) hits++;
  return hits;
}
