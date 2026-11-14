// Pip Reader: a tiny remote MCP server so the Pip artifact can read websites
// from any Claude app (phone, web, desktop), and send an owner's Lock it in order.
// pip_read only forwards to Pip's own scan endpoints and returns their JSON as text.
// pip_order forwards one order to Pip's own intake (pip-forge/intake), which validates it.
// Stateless Streamable HTTP (JSON responses, no SSE stream).

const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const ALLOW = new Set([
  `${SB_URL}/functions/v1/site-kit`,
  `${SB_URL}/functions/v1/rival-read`,
  "https://pip-ai-drab.vercel.app/api/gather",
]);
const INTAKE = `${SB_URL}/functions/v1/pip-forge/intake`;
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_CHARS = 2_000_000;
const UPSTREAM_MS = 115_000;

const TOOL = {
  name: "pip_read",
  title: "Read for Pip",
  description:
    "Fetches one of Pip's own scan endpoints (site-kit, rival-read or gather) and returns its JSON response as text. Only Pip's endpoints are allowed.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Full https URL of a Pip scan endpoint, with its query string." },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
};

const ORDER_TOOL = {
  name: "pip_order",
  title: "Send a Pip order",
  description:
    "Sends an owner's Lock it in order (the business, the AI teammates they chose, their name and contact) to Pip's own intake. Returns the order code. Pip validates every field; nothing goes live from this call.",
  inputSchema: {
    type: "object",
    properties: {
      order: { type: "object", description: "business, domain, industry, rivals and the chosen agents, as Pip imagined them." },
      owner: { type: "object", description: "name, email or phone, best (times), message." },
      consent: { type: "object", description: "ai_disclosure_ack and tos_version." },
      plan: { type: "object", description: "Optional plan summary: estimate, unit, problems, have, perk." },
      lid: { type: "string", description: "The page's id for this send, so a double tap files one order." },
    },
    required: ["order", "owner", "consent"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function allowed(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > 4000) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const base = (u.origin + u.pathname).replace(/\/+$/, "");
    return ALLOW.has(base) ? u : null;
  } catch {
    return null;
  }
}

async function read(args: Record<string, unknown>) {
  const u = allowed(args?.url);
  if (!u) {
    return { isError: true, content: [{ type: "text", text: "That address isn't one of Pip's scan endpoints." }] };
  }
  try {
    const r = await fetch(u.toString(), {
      headers: { Accept: "application/json", "User-Agent": "pip-reader/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_MS),
    });
    let text = await r.text();
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
    if (!r.ok && !text.trim().startsWith("{")) {
      return { isError: true, content: [{ type: "text", text: `Pip's endpoint answered ${r.status}.` }] };
    }
    return { content: [{ type: "text", text }] };
  } catch (e) {
    const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      isError: true,
      content: [{ type: "text", text: timedOut ? "Pip's endpoint took too long to answer." : "Pip's endpoint couldn't be reached." }],
    };
  }
}

async function order(args: Record<string, unknown>) {
  const body = JSON.stringify({ ...args, source: "pip-reader" });
  if (body.length > 400_000) return { isError: true, content: [{ type: "text", text: "That order is too large." }] };
  try {
    const r = await fetch(INTAKE, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(60_000) });
    const text = await r.text();
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(text); } catch { /* not json */ }
    if (!r.ok || j.ok !== true) {
      return { isError: true, content: [{ type: "text", text: String(j.error || `Pip's intake answered ${r.status}.`) + (Array.isArray(j.errors) ? `: ${(j.errors as string[]).slice(0, 4).join("; ")}` : "") }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, code: j.code, orderId: j.orderId, again: j.again === true }) }], structuredContent: { ok: true, code: j.code, orderId: j.orderId, again: j.again === true } };
  } catch {
    return { isError: true, content: [{ type: "text", text: "Pip's intake couldn't be reached." }] };
  }
}

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function handle(m: Msg): Promise<unknown | null> {
  const isNote = m.id === undefined || m.id === null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id ?? null, error: { code, message } });
  if (!m || typeof m !== "object" || typeof m.method !== "string") return isNote ? null : err(-32600, "Invalid request");
  if (isNote) return null; // notifications/initialized, cancelled, etc.
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion || "");
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "pip-reader", title: "Pip Reader", version: "1.1.0" },
        instructions: "Reads Pip's own scan endpoints for the Pip page, and sends an owner's Lock it in order to Pip. Tools: pip_read, pip_order.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: [TOOL, ORDER_TOOL] });
    case "tools/call": {
      const name = m.params?.name;
      const args = (m.params?.arguments || {}) as Record<string, unknown>;
      if (name === TOOL.name) return ok(await read(args));
      if (name === ORDER_TOOL.name) return ok(await order(args));
      return err(-32602, `Unknown tool: ${String(name)}`);
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return err(-32601, `Method not found: ${m.method}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    const path = new URL(req.url).pathname;
    if (path.includes(".well-known")) return json({ error: "not_found" }, 404);
    return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed" } }, 405, { Allow: "POST, OPTIONS" });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m as Msg)))).filter((x) => x !== null);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handle(body as Msg);
  return out === null ? new Response(null, { status: 202, headers: CORS }) : json(out);
});
