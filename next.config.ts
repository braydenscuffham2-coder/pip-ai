import type { NextConfig } from 'next';
import { withBotId } from 'botid/next/config';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

// BotID: the invisible bot check on new scans and chat (see instrumentation-client.ts and lib/server/guard.ts).
export default withBotId(nextConfig);
