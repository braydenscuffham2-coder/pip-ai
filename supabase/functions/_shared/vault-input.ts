// What the Portal's vault step refuses before anything is stored: a field named like a secret, a value that looks
// like one (a password, card number or code typed into the wrong box), or a sign-in link that carries a username or
// password. Pure, so it is tested on its own (vault-input.test.ts).
import { redact } from "./redact.ts";

export type VaultRefusal = { code: "vault_closed" | "bad_link"; message: string };
const CLOSED: VaultRefusal = { code: "vault_closed", message: "The vault is not open yet, so do not send a password." };

export function vaultRefusal(body: Record<string, unknown> | null | undefined): VaultRefusal | null {
  for (const k of Object.keys(body || {})) if (/pass|secret|token|code|otp|pin/i.test(k)) return CLOSED;
  for (const v of Object.values(body || {})) if (typeof v === "string" && redact(v).kinds.length) return CLOSED;
  const raw = body?.login_url;
  if (typeof raw === "string" && raw) {
    let link: URL | null = null;
    try { link = new URL(raw); } catch { /* not a link */ }
    if (!link || !/^https?:$/.test(link.protocol)) return { code: "bad_link", message: "That link doesn't look like a sign-in page." };
    if (link.username || link.password) return { code: "vault_closed", message: "Send the sign-in page's link without your username or password in it." };
  }
  return null;
}
