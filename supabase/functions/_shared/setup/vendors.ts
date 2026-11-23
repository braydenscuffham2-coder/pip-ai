// The two outside services the Setup Agent uses: Browserbase (the sandboxed cloud browser) and 1Password (the vault).
// Thin wrappers so setup-run and vault-writer stay readable and tests can swap them for fakes.

const BB = "https://api.browserbase.com/v1";

export interface BrowserbaseCfg { apiKey: string; projectId?: string }
async function bb(cfg: BrowserbaseCfg, path: string, init: RequestInit = {}) {
  const r = await fetch(`${BB}${path}`, { ...init, headers: { "X-BB-API-Key": cfg.apiKey, "content-type": "application/json", ...((init.headers as Record<string, string>) || {}) }, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`browserbase ${r.status}: ${String((j as any)?.message || (j as any)?.error || "").slice(0, 120)}`);
  return j as any;
}

export const browserbase = (cfg: BrowserbaseCfg) => ({
  /** A context keeps one business's sign-in to one tool between sessions (cookies, local storage). */
  async context(): Promise<string> { return (await bb(cfg, "/contexts", { method: "POST", body: JSON.stringify(cfg.projectId ? { projectId: cfg.projectId } : {}) })).id; },
  /**
   * A new session. Captcha solving and recording are ON by default at Browserbase, so both are turned off here on
   * purpose: Pip never defeats a captcha, and no recording of a sign-in is kept anywhere.
   */
  async session(contextId: string, minutes = 20): Promise<{ id: string; connectUrl: string }> {
    const j = await bb(cfg, "/sessions", { method: "POST", body: JSON.stringify({
      ...(cfg.projectId ? { projectId: cfg.projectId } : {}),
      browserSettings: { context: { id: contextId, persist: true }, solveCaptchas: false, recordSession: false, viewport: { width: 1280, height: 800 } },
      timeout: Math.max(60, Math.min(minutes * 60, 3600)), region: "us-west-2",
    }) });
    return { id: j.id, connectUrl: j.connectUrl };
  },
  async connectUrl(sessionId: string): Promise<string | null> {
    const j = await bb(cfg, `/sessions/${encodeURIComponent(sessionId)}`).catch(() => null);
    return j && j.status === "RUNNING" && j.connectUrl ? j.connectUrl : null;
  },
  /** The live view for the owner's page. Anyone holding it can watch and click, so it goes only to the signed-in owner. */
  async liveView(sessionId: string): Promise<string | null> {
    const j = await bb(cfg, `/sessions/${encodeURIComponent(sessionId)}/debug`).catch(() => null);
    return j?.debuggerFullscreenUrl ?? null;
  },
  async release(sessionId: string): Promise<void> {
    await bb(cfg, `/sessions/${encodeURIComponent(sessionId)}`, { method: "POST", body: JSON.stringify({ ...(cfg.projectId ? { projectId: cfg.projectId } : {}), status: "REQUEST_RELEASE" }) }).catch(() => {});
  },
});

// ---------- 1Password ----------
export interface Vault {
  /** The client's own vault, made the first time ("Pip · <business id>"). One vault per client. */
  vaultFor(businessId: string, name: string): Promise<string>;
  /** Saves a login. Returns its reference (op://vault/item), which is all Pip's database ever holds. */
  putLogin(vaultId: string, item: { title: string; url: string; username: string; password: string }): Promise<{ itemId: string; ref: string }>;
}

/** 1Password through a Service Account created with --can-create-vaults. The token lives only in vault-writer. */
export async function onePassword(token: string): Promise<Vault> {
  // @ts-ignore: an npm specifier, resolved by the edge runtime
  const sdk = (await import("npm:@1password/sdk@0")).default;
  const client = await sdk.createClient({ auth: token, integrationName: "Pip Setup Agent", integrationVersion: "1.0.0" });
  const title = (businessId: string) => `Pip · ${businessId}`;
  return {
    async vaultFor(businessId) {
      const all = await client.vaults.list();
      const have = all.find((v: any) => v.title === title(businessId));
      if (have) return have.id;
      return (await client.vaults.create({ title: title(businessId), description: "Logins this business gave Pip's agents. Managed by Pip; one vault per client." })).id;
    },
    async putLogin(vaultId, it) {
      const made = await client.items.create({
        title: it.title, category: sdk.ItemCategory.Login, vaultId,
        fields: [
          { id: "username", title: "username", fieldType: sdk.ItemFieldType.Text, value: it.username },
          { id: "password", title: "password", fieldType: sdk.ItemFieldType.Concealed, value: it.password },
        ],
        websites: [{ url: it.url, label: "sign-in page", autofillBehavior: sdk.AutofillBehavior.AnywhereOnWebsite }],
        tags: ["pip"],
      });
      return { itemId: made.id, ref: `op://${vaultId}/${made.id}` };
    },
  };
}
