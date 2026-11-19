// Where Google (or any other sign-in provider) sends an owner back after they agree to connect a tool.
//
// Why this exists: the owner's sign-in is held by Composio, so the provider has to hand its one-time code to
// Composio. Sent there directly, Google shows "composio.dev wants access" on its screen and will not verify Pip's
// app, because Pip does not own that domain. Routed through hirepip.com first, the screen and the review are Pip's.
//
// What it does: forwards the browser to Composio with the same query string, untouched. It does not read, keep or
// log the code. Nothing here can see an owner's password, and the code is useless without Composio's own secret.
const COMPOSIO_CALLBACK = 'https://backend.composio.dev/api/v3/toolkits/auth/callback';

export const dynamic = 'force-dynamic';

export function GET(req: Request): Response {
  const from = new URL(req.url);
  const to = new URL(COMPOSIO_CALLBACK);
  to.search = from.search; // passed through whole; never parsed, never logged
  return new Response(null, {
    status: 302,
    headers: { location: to.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}
