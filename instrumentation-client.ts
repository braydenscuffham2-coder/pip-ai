// The invisible bot check (Vercel BotID). It runs in the visitor's browser and vouches for the requests below;
// the server side is isBot() in lib/server/guard.ts. Only requests the Pip page itself makes are listed.
// /api/gather is left out on purpose: site-kit and the Pip Reader call it server to server.
import { initBotId } from 'botid/client/core';

const basic = { checkLevel: 'basic' as const };
initBotId({
  protect: [
    { path: '/api/scan', method: 'POST', advancedOptions: basic },
    { path: '/api/chat', method: 'POST', advancedOptions: basic },
    { path: '/api/demo', method: 'POST', advancedOptions: basic },
  ],
});
