import type { NextConfig } from 'next';
import { withBotId } from 'botid/next/config';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The home page is the Pip page from the Claude app (public/app.html, with public/pip-web-runtime.js standing in
  // for the app's runtime). The earlier web flow stays at /classic.
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/app.html' }], afterFiles: [], fallback: [] };
  },
};

// BotID: the invisible bot check on new scans and chat (see instrumentation-client.ts and lib/server/guard.ts).
export default withBotId(nextConfig);
