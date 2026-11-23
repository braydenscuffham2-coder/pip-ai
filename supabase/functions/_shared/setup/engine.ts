// The Setup Agent's steps, one state at a time. Everything outside (the database, the cloud browser, the model,
// Composio) comes in as `deps`, so the whole flow runs in tests with fakes (engine.test.ts) and in setup-run for real.
//
//   queued → (composio | manual | blocked) or consent → opening → find_login → owner_control → verify → configuring
//          → testing → saving → done
//   failed, paused (the session died: only this tool waits for a re-sign-in), stopped (the owner or a switch)
//
// The model takes part only in find_login (when the page's own markup does not show the form), configuring and
// testing, and only through allowAction(). It never sees the page while the owner has control.
import { type Action, allowAction, canScreenshot, costOf, type FieldInfo, isCaptchaUrl, MASK_JS, SIGNED_IN_JS, siteOf, TAG_LOGIN_JS } from "./guards.ts";

export interface SetupRow {
  id: string; business_id: string; tool: string; tool_key: string; login_url: string | null; mode: "browser" | "composio" | "manual";
  state: string; reason: string | null; step: number; plan: Record<string, any>; browser_session_id: string | null; browser_context_id: string | null;
  consent_at: string | null; composio_done: boolean; cost_usd: number; cost_cap_usd: number; owner_taps: number; result: string | null; log: any[];
  created_at: string; ended_at?: string | null;
}
export interface Page {
  goto(url: string): Promise<void>;
  evaluate<T = any>(js: string): Promise<T>;
  screenshot(): Promise<string>; // base64 JPEG
  click(x: number, y: number): Promise<void>;
  type(text: string): Promise<void>;
  key(k: string): Promise<void>;
  scroll(dy: number): Promise<void>;
  focused(): Promise<FieldInfo | null>;
  viewport(): { w: number; h: number };
}
export interface Deps {
  paused(): Promise<boolean>;                         // global kill switch or setup_paused
  take(usd: number): Promise<string | null>;          // pip_take('setup_usd', usd): null = ok, else the reason
  terms(toolKey: string): Promise<"allowed" | "forbidden" | "unknown">;
  healthBlocked(businessId: string): Promise<boolean>; // a health-lane business without the vendor agreements
  steps(row: SetupRow): Promise<string[]>;            // what the manifest needs configured in this tool, plain words
  browser: { open(row: SetupRow): Promise<{ sessionId: string; contextId: string }>; page(sessionId: string): Promise<Page | null>; close(sessionId: string): Promise<void> };
  model(input: { system: string; text: string; image: string }, row: SetupRow): Promise<{ action: Action; usage: Record<string, number> }>;
  composioTest(row: SetupRow): Promise<boolean | null>; // null: this tool has no Composio connection to test
  done(row: SetupRow, ok: boolean): Promise<void>;     // business_connections + activity_log, plain words
  reSignIn(row: SetupRow): Promise<void>;              // one-tap link to the owner through portal_outbox
}
export type Outcome = { patch: Partial<SetupRow>; next: "again" | "wait" | "end" };

const MAX_STEPS = 40;
const end = (state: string, patch: Partial<SetupRow> = {}): Outcome => ({ patch: { state, ...patch }, next: "end" });
const go = (state: string, patch: Partial<SetupRow> = {}): Outcome => ({ patch: { state, ...patch }, next: "again" });
const wait = (state: string, patch: Partial<SetupRow> = {}): Outcome => ({ patch: { state, ...patch }, next: "wait" });
// The step log keeps what kind of thing happened, never what was typed.
const entry = (row: SetupRow, what: Record<string, unknown>) => [...(row.log ?? []).slice(-150), { at: new Date().toISOString(), step: row.step, ...what }];

export const SYSTEM = `You are Pip's Setup Agent. You are connecting one business tool for its owner inside a secure cloud browser.
The owner has already signed in. You never see, type, read back or ask for a password, code or key: those fields are blurred and you may not type into them.
Do only what the task lists. Never press anything about money, deleting, cancelling, upgrading, billing or giving access away.
If something needs the owner (a code, a choice only they can make, a captcha), answer need_owner with the reason.
Answer with exactly one action as JSON: {"type":"click","x":..,"y":..,"label":"<the words on what you click>"} | {"type":"type","text":"..."} | {"type":"key","key":"Enter"|"Tab"|"Escape"|"ArrowDown"|"ArrowUp"|"Backspace"} | {"type":"scroll","dy":..} | {"type":"navigate","url":"https://..."} | {"type":"wait"} | {"type":"done","summary":"..."} | {"type":"need_owner","reason":"..."}`;

export async function step(row: SetupRow, deps: Deps): Promise<Outcome> {
  if (["done", "failed", "manual", "blocked", "stopped"].includes(row.state)) return { patch: {}, next: "end" };
  if (await deps.paused()) return end("stopped", { reason: "Setups are paused." });
  if (row.cost_usd >= row.cost_cap_usd) return end("failed", { reason: `Stopped at this setup's $${row.cost_cap_usd} cap.` });
  if (row.step >= MAX_STEPS && ["configuring", "testing"].includes(row.state)) return end("failed", { reason: `Stopped after ${MAX_STEPS} steps.` });

  switch (row.state) {
    case "queued": {
      const terms = await deps.terms(row.tool_key);
      if (terms === "forbidden") return end("manual", { reason: `${row.tool}'s terms do not allow automated sign-in. The owner gets a short checklist instead.` });
      if (row.mode === "manual") return end("manual", { reason: "This tool is set up by hand." });
      if (await deps.healthBlocked(row.business_id)) return end("blocked", { reason: "A health business needs the vendor agreements on file before a browser may see its tools." });
      if (row.mode === "composio") return wait("composio", { reason: "Waiting for the owner's one-tap sign-in on the tool's own page." });
      if (!row.login_url) return end("failed", { reason: "No sign-in page for this tool." });
      return row.consent_at ? go("opening") : wait("consent", { reason: "Waiting for the owner to agree to a watched sign-in." });
    }
    case "consent":
      return row.consent_at ? go("opening") : wait("consent");
    case "composio":
      return row.composio_done ? go("testing") : wait("composio");

    case "opening": {
      const { sessionId, contextId } = await deps.browser.open(row);
      const page = await deps.browser.page(sessionId);
      if (!page) return end("failed", { reason: "The secure browser did not start.", browser_session_id: sessionId });
      await page.goto(row.login_url!);
      return go("find_login", { browser_session_id: sessionId, browser_context_id: contextId, log: entry(row, { did: "opened" }) });
    }

    case "find_login": {
      const page = await deps.browser.page(row.browser_session_id!);
      if (!page) return lost(row, deps);
      // The page's own markup first: no model, no cost.
      const found = await page.evaluate<{ user: boolean; pass: boolean; submit: boolean; twoStep: boolean }>(TAG_LOGIN_JS);
      const keybox = found.pass && found.user;
      return wait("owner_control", { plan: { ...row.plan, keybox, twoStep: found.twoStep }, reason: keybox ? "Waiting for the owner to sign in with the key box." : "Waiting for the owner to sign in on the page.", log: entry(row, { did: "login_form", keybox }) });
    }

    case "owner_control":
      return wait("owner_control"); // only the owner's "I'm signed in" (pip-portal) moves this on, to verify

    case "verify": {
      const page = await deps.browser.page(row.browser_session_id!);
      if (!page) return lost(row, deps);
      const s = await page.evaluate<{ url: string; passwordShowing: boolean }>(SIGNED_IN_JS);
      if (s.passwordShowing) return wait("owner_control", { reason: "Still on the sign-in page. Finish signing in, then tap I'm signed in.", log: entry(row, { did: "still_signing_in" }) });
      return go("configuring", { step: 0, log: entry(row, { did: "signed_in" }) });
    }

    case "configuring":
    case "testing": {
      if (row.state === "testing") {
        const viaApi = await deps.composioTest(row);
        if (viaApi !== null) return go("saving", { result: viaApi ? "passed" : "failed", log: entry(row, { did: "test_action", via: "composio", ok: viaApi }) });
        if (!row.browser_session_id) return go("saving", { result: "failed", reason: "Nothing to test the connection with." });
      }
      const page = await deps.browser.page(row.browser_session_id!);
      if (!page) return lost(row, deps);
      if (!canScreenshot(row.state)) return wait("owner_control");
      const seen = await page.evaluate<{ masked: number; exposed: number; captcha: boolean; url: string }>(MASK_JS);
      if (seen.captcha || isCaptchaUrl(seen.url)) return wait("owner_control", { reason: "A captcha appeared. Only the owner answers those.", log: entry(row, { did: "captcha" }) });
      if (seen.exposed > 0) return wait("owner_control", { reason: "A secret is showing on the page, so Pip will not look. Hide it, then tap I'm signed in.", log: entry(row, { did: "secret_showing" }) });
      const steps = row.state === "testing" ? ["Run the test: open one existing record in this tool and confirm you can read it. Do not change anything."] : await deps.steps(row);
      const image = await page.screenshot();
      const { action, usage } = await deps.model({ system: SYSTEM, image, text: `Tool: ${row.tool}\nTask:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nSteps taken so far: ${row.step}.${recent(row)}\nWhat is the next single action?` }, row);
      const usd = costOf(usage);
      const why = await deps.take(usd);
      const cost = Math.round((row.cost_usd + usd) * 10000) / 10000;
      if (why) return end("failed", { cost_usd: cost, reason: `Stopped: the setup budget said ${why}.` });
      const base = { step: row.step + 1, cost_usd: cost };
      if (action.type === "need_owner") return wait("owner_control", { ...base, reason: action.reason.slice(0, 280), log: entry(row, { did: "need_owner" }) });
      if (action.type === "done") {
        if (row.state === "testing") return go("saving", { ...base, result: "passed", log: entry(row, { did: "test_action", via: "browser", ok: true }) });
        return go("testing", { ...base, step: 0, log: entry(row, { did: "configured" }) });
      }
      const field = action.type === "type" ? await page.focused() : undefined;
      const ok = allowAction(action.type === "type" ? { ...action, field: field ?? undefined } : action, { state: row.state, site: siteOf(row.login_url || ""), viewport: page.viewport() });
      if (!ok.ok) return go(row.state, { ...base, log: entry(row, { did: "refused", action: action.type, why: ok.why }) });
      await act(page, action);
      return go(row.state, { ...base, log: entry(row, { did: action.type, ...(action.type === "click" ? { label: (action.label || "").slice(0, 60) } : {}) }) });
    }

    case "saving": {
      if (row.browser_session_id) await deps.browser.close(row.browser_session_id).catch(() => {});
      const ok = row.result === "passed";
      await deps.done(row, ok);
      return end(ok ? "done" : "failed", { ended_at: new Date().toISOString(), browser_session_id: null });
    }

    case "paused":
      return wait("paused");
    default:
      return end("failed", { reason: `Unknown state ${row.state}.` });
  }
}

// The last few things that happened, so a refused action is not tried again. Kinds and reasons only, never typed text.
function recent(row: SetupRow) {
  const last = (row.log ?? []).slice(-3).map((e: any) => `- ${e.did}${e.why ? `: ${e.why}` : ""}${e.label ? ` (${e.label})` : ""}`);
  return last.length ? `\nLast actions:\n${last.join("\n")}` : "";
}

async function act(page: Page, a: Action) {
  if (a.type === "click") await page.click(a.x, a.y);
  else if (a.type === "type") await page.type(a.text);
  else if (a.type === "key") await page.key(a.key);
  else if (a.type === "scroll") await page.scroll(a.dy);
  else if (a.type === "navigate") await page.goto(a.url);
}

/** The browser session is gone. Only this tool waits; the owner gets a one-tap re-sign-in. */
async function lost(row: SetupRow, deps: Deps): Promise<Outcome> {
  await deps.reSignIn(row).catch(() => {});
  return wait("paused", { reason: "The secure browser closed. The owner was sent a one-tap link to sign in again.", browser_session_id: null, log: entry(row, { did: "session_lost" }) });
}
