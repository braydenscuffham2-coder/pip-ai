// Background work, one step at a time. Everything outside (the database, the cloud browser, the vault) comes in as
// `deps`, so the whole flow runs in tests with fakes (engine.test.ts) and in pip-work for real.
//
// Every job that touches a tool starts the same way: make sure Pip is signed in.
//
//   start → check → (signed in) → the job's own work
//                 → (signed out) → the vault types the saved login, on the tool's own site only → check again
//                 → (a code is asked for) → the vault types the authenticator code, if the owner set one up → check again
//                 → anything a person must do (captcha, new-device check, changed password) → the owner is told, once
//
// No model takes part in signing in. The vault service fills the fields; this file only reads what kind of page it is.
import { siteOf } from "../setup/guards.ts";
import type { Page } from "../setup/engine.ts";

export interface WorkJob {
  id: string; business_id: string; spec_id: string | null; identity_id: string | null; kind: string; title: string;
  plan: Record<string, any>; status: string; state: string; step: number; max_steps: number;
  cost_usd: number; cost_cap_usd: number; browser_session_id: string | null;
}
export interface Identity {
  id: string; business_id: string; tool: string; tool_key: string; login_url: string; site: string;
  browser_context_id: string | null; vault_item_id: string | null; totp: boolean; state: string; silent_signins: number;
}
/** What the vault service answered. Codes only: it never returns a value. */
export type FillCode = "submitted" | "filled" | "wrong_site" | "no_form" | "no_login" | "no_code" | "vault_failed" | "unavailable";
export interface WorkDeps {
  identity(id: string): Promise<Identity | null>;
  saveIdentity(id: string, patch: Partial<Identity> & Record<string, unknown>): Promise<void>;
  browser: { open(contextId: string | null): Promise<{ sessionId: string; contextId: string }>; page(sessionId: string): Promise<Page | null>; close(sessionId: string): Promise<void> };
  vaultFill(identityId: string, sessionId: string): Promise<FillCode>;
  vaultCode(identityId: string, sessionId: string): Promise<FillCode>;
  log(job: WorkJob, did: string, detail?: Record<string, unknown>, extra?: { shot?: string; cost?: number }): Promise<void>;
  /** The job's own work once Pip is signed in. Absent for a plain sign-in check. */
  work?(job: WorkJob, identity: Identity, page: Page, deps: WorkDeps): Promise<Out>;
  now?(): number;
}
export type Out = {
  patch: Partial<WorkJob>;
  next: "again" | "owner" | "approval" | "done" | "failed";
  /** Plain words for the owner (done, owner, approval) or for the founder (failed). */
  summary?: string; reason?: string; outcome?: "ok" | "nothing_to_do";
  /** For "again": come back after this many seconds instead of at once. */
  waitSeconds?: number;
  /** For "owner": false when the owner was already told about this tool, so they are not emailed again. */
  alert?: boolean;
};

/**
 * Runs in the tool's page. Says what kind of page this is for sign-in purposes, by the page's own markup.
 * It reads no values: only whether a visible password field, a username-only field, a one-time-code field or a
 * captcha frame is there.
 */
export const SIGN_STATE_JS = String.raw`(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const inputs = [...document.querySelectorAll("input")].filter(vis);
  const pass = inputs.some((el) => el.type === "password");
  const CODE = /(otp|one[-_ ]?time|2fa|mfa|totp|verification|security[-_ ]?code|auth(enticator)?[-_ ]?code|passcode)/i;
  const code = inputs.some((el) => el.type !== "password" && (/one-time-code/i.test(el.autocomplete || "") || CODE.test((el.name || "") + " " + (el.id || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.placeholder || ""))));
  // A username-first sign-in screen. Deliberately narrow, because an ordinary record form can also hold an email field
  // and Pip must never mistake one for a sign-in: few fields, a field marked as the username, and either the page's
  // address or its main button says this is a sign-in.
  const texty = inputs.filter((el) => !/^(hidden|submit|button|checkbox|radio|search)$/i.test(el.type));
  const named = texty.some((el) => /^(username|email)$/i.test(el.autocomplete || "") || el.type === "email" || /(user|email|login)/i.test((el.name || "") + " " + (el.id || "")));
  const signInAddress = /(log[-_]?in|sign[-_]?in|signin|auth|sso|session|account\/start)/i.test(location.pathname + location.hostname.split(".")[0]);
  const signInButton = [...document.querySelectorAll("button, input[type=submit]")].some((b) => vis(b) && /^(sign ?in|log ?in|next|continue)$/i.test((b.innerText || b.value || "").trim()));
  const user = !pass && !code && texty.length <= 2 && named && (signInAddress || signInButton);
  const captcha = [...document.querySelectorAll("iframe")].some((f) => /(recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|captcha)/i.test(f.src || ""));
  return { url: location.href, host: location.hostname, pass, user, code, captcha };
})()`;
export type SignState = { url: string; host: string; pass: boolean; user: boolean; code: boolean; captcha: boolean };

const again = (state: string, patch: Partial<WorkJob> = {}, waitSeconds?: number): Out => ({ patch: { state, ...patch }, next: "again", waitSeconds });

/** The owner is needed. The identity remembers why, so every other job for this tool waits too instead of retrying. */
async function needOwner(job: WorkJob, id: Identity, deps: WorkDeps, why: string, did: string): Promise<Out> {
  await deps.saveIdentity(id.id, { state: "needs_owner", reason: why, checked_at: new Date(deps.now?.() ?? Date.now()).toISOString() });
  await deps.log(job, did, { tool: id.tool_key });
  if (job.browser_session_id) await deps.browser.close(job.browser_session_id).catch(() => {});
  return { patch: { state: "check", browser_session_id: null }, next: "owner", summary: why, reason: did };
}

export async function step(job: WorkJob, deps: WorkDeps): Promise<Out> {
  if (job.step >= job.max_steps) return { patch: {}, next: "failed", reason: `Stopped after ${job.max_steps} steps.`, summary: "Pip stopped this job because it was taking too many steps. Nothing more was changed." };
  if (!job.identity_id) return { patch: {}, next: "failed", reason: "This job names no tool.", summary: "Pip could not start this job." };
  const id = await deps.identity(job.identity_id);
  if (!id || id.state === "retired") return { patch: {}, next: "failed", reason: "The tool this job uses is no longer connected.", summary: "This tool is no longer connected, so Pip did not run the job." };
  const base = { step: job.step + 1 };

  if (job.state === "start") {
    // The owner already knows this tool needs them: wait quietly, with no browser and no second email.
    if (id.state === "needs_owner") return { patch: {}, next: "owner", alert: false, summary: `Waiting for you to sign in to ${id.tool} again.`, reason: "tool_needs_owner" };
    const { sessionId, contextId } = await deps.browser.open(id.browser_context_id);
    if (contextId !== id.browser_context_id) await deps.saveIdentity(id.id, { browser_context_id: contextId });
    const page = await deps.browser.page(sessionId);
    if (!page) return { patch: { browser_session_id: sessionId }, next: "failed", reason: "The cloud browser did not start.", summary: "Pip's browser did not start. Pip will try again on the next run." };
    await page.goto(id.login_url);
    await deps.log(job, "opened", { tool: id.tool_key });
    return again("check", { ...base, browser_session_id: sessionId, plan: { ...job.plan, fills: 0, codes: 0 } });
  }

  const page = job.browser_session_id ? await deps.browser.page(job.browser_session_id) : null;
  if (!page) {
    // The browser closed under us (a session limit, a restart). Start again from the saved sign-in state, once.
    if ((job.plan?.reopened ?? 0) >= 2) return { patch: { browser_session_id: null }, next: "failed", reason: "The cloud browser closed three times.", summary: "Pip's browser kept closing, so this job stopped. Nothing more was changed." };
    await deps.log(job, "browser_closed");
    return again("start", { ...base, browser_session_id: null, plan: { ...job.plan, reopened: (job.plan?.reopened ?? 0) + 1 } });
  }

  if (job.state === "check") {
    const s = await page.evaluate<SignState>(SIGN_STATE_JS);
    const here = siteOf(s.url);
    if (s.captcha) return needOwner(job, id, deps, `${id.tool} is showing a captcha. Only you can answer those. Open your Portal and sign in to ${id.tool} again.`, "captcha");
    const fills = job.plan?.fills ?? 0, codes = job.plan?.codes ?? 0;
    if (s.pass || s.user) {
      if (here !== id.site) return needOwner(job, id, deps, `${id.tool} sent Pip to a different site to sign in. Pip only uses your saved login on ${id.site}, so it stopped. Open your Portal and sign in to ${id.tool} again.`, "wrong_site");
      if (!id.vault_item_id) return needOwner(job, id, deps, `Pip was signed out of ${id.tool} and has no saved login for it. Open your Portal and sign in to ${id.tool} again.`, "signed_out");
      if (fills >= 1) return needOwner(job, id, deps, `The saved login for ${id.tool} did not work. The password may have changed. Open your Portal and sign in to ${id.tool} again.`, "login_refused");
      const code = await deps.vaultFill(id.id, job.browser_session_id!);
      await deps.log(job, "vault_fill", { code });
      if (code === "wrong_site") return needOwner(job, id, deps, `${id.tool}'s sign-in page is not on ${id.site}. Pip did not use your saved login. Open your Portal and sign in to ${id.tool} again.`, "wrong_site");
      if (code !== "submitted" && code !== "filled") return needOwner(job, id, deps, `Pip was signed out of ${id.tool} and could not sign in again on its own. Open your Portal and sign in to ${id.tool} again.`, "fill_failed");
      return again("check", { ...base, plan: { ...job.plan, fills: fills + 1 } }, 4);
    }
    if (s.code) {
      if (!id.totp || codes >= 1) return needOwner(job, id, deps, id.totp ? `${id.tool} did not accept Pip's sign-in code. Open your Portal and sign in to ${id.tool} again.` : `${id.tool} asked for a code, which usually means it is checking a new device. Open your Portal and sign in to ${id.tool} again.`, "code_needed");
      if (here !== id.site) return needOwner(job, id, deps, `${id.tool} asked for a code on a different site. Pip only signs in on ${id.site}. Open your Portal and sign in to ${id.tool} again.`, "wrong_site");
      const code = await deps.vaultCode(id.id, job.browser_session_id!);
      await deps.log(job, "vault_code", { code });
      if (code !== "submitted" && code !== "filled") return needOwner(job, id, deps, `${id.tool} asked for a code and Pip could not enter it. Open your Portal and sign in to ${id.tool} again.`, "code_needed");
      return again("check", { ...base, plan: { ...job.plan, codes: codes + 1 } }, 4);
    }
    // No sign-in form of any kind: Pip is in.
    const t = new Date(deps.now?.() ?? Date.now()).toISOString();
    await deps.saveIdentity(id.id, { state: "signed_in", reason: null, checked_at: t, ...(fills > 0 ? { signed_in_at: t, silent_signins: (id.silent_signins ?? 0) + 1 } : {}) });
    await deps.log(job, "signed_in", { silent: fills > 0 });
    if (job.kind === "signin_check" || !deps.work) {
      await deps.browser.close(job.browser_session_id!).catch(() => {});
      return { patch: { ...base, state: "done", browser_session_id: null }, next: "done", outcome: "ok", summary: fills > 0 ? `Pip had been signed out of ${id.tool} and signed back in on its own.` : `Pip is still signed in to ${id.tool}.` };
    }
    return again("work", base);
  }

  if (job.state === "work" && deps.work) return await deps.work(job, id, page, deps);
  return { patch: {}, next: "failed", reason: `Unknown state ${job.state}.`, summary: "Pip could not continue this job." };
}
