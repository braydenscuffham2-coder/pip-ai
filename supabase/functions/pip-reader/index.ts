// Pip Reader: a tiny remote MCP server so the Pip artifact can read websites
// from any Claude app (phone, web, desktop). It does no reading itself: it only
// forwards to Pip's own scan endpoints and returns their JSON as text.
// Stateless Streamable HTTP (JSON responses, no SSE stream).

const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const ALLOW = new Set([
  `${SB_URL}/functions/v1/site-kit`,
  `${SB_URL}/functions/v1/rival-read`,
  "https://pip-ai-drab.vercel.app/api/gather",
]);
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
        serverInfo: { name: "pip-reader", title: "Pip Reader", version: "1.0.0" },
        instructions: "Reads Pip's own scan endpoints for the Pip page. One tool: pip_read.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: [TOOL] });
    case "tools/call": {
      if (m.params?.name !== TOOL.name) return err(-32602, `Unknown tool: ${String(m.params?.name)}`);
      return ok(await read((m.params?.arguments || {}) as Record<string, unknown>));
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
